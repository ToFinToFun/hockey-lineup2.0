/**
 * Datamigreringar som körs efter schemamigreringarna (en gång var).
 *
 * players_v1 – bygger spelarregistret:
 *  1. Nuvarande trupp och uppställning → aktiva medlemmar.
 *  2. Spelare som bara finns i gamla matcher/sparade uppställningar →
 *     inaktiva, "ej medlem". Hade samma person fått ett nytt ID senare
 *     (samma namn som exakt en nuvarande spelare) slås de ihop.
 *  3. Tidigare namn och "Namn #nr" sparas som alias.
 *  4. Mål och assist i gamla matcher får scorerId/assistId (kopplas via
 *     matchens egen uppställning, annars via unika alias).
 *  5. PIR-justeringar (sparade per namn) flyttas till spelar-ID.
 *
 * Allt görs i en transaktion. Körs den igen händer ingenting.
 */

const DONE_KEY = "data_migrations";

const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const labelOf = (p) => (p.number ? `${p.name} #${p.number}` : p.name);

function parse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return v;
}

function playersIn(lineupJson) {
  const l = parse(lineupJson, null);
  if (!l) return [];
  // Matcher sparar { lineup: {slot: player} }, lineup_state/sparade sparar {slot: player} direkt.
  const slots = l.lineup && typeof l.lineup === "object" ? l.lineup : l;
  return Object.values(slots).filter((p) => p && typeof p === "object" && p.id && p.name);
}

async function getDone(conn) {
  const [rows] = await conn.query("SELECT `value` FROM app_config WHERE `key` = ?", [DONE_KEY]);
  return new Set(rows.length ? parse(rows[0].value, []) : []);
}

async function markDone(conn, done, name) {
  done.add(name);
  const value = JSON.stringify([...done]);
  await conn.query(
    "INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [DONE_KEY, value]
  );
}

export async function migratePlayersV1(conn, log) {
  // ── Läs allt ───────────────────────────────────────────────────────────────
  const [stateRows] = await conn.query("SELECT players, lineup FROM lineup_state WHERE id = 1");
  const state = stateRows[0] ?? {};
  const currentPlayers = [...parse(state.players, []), ...Object.values(parse(state.lineup, {}))].filter(
    (p) => p && p.id && p.name
  );

  const [matchRows] = await conn.query(
    "SELECT id, lineup, goalHistory, COALESCE(matchEndTime, matchStartTime, createdAt) AS d FROM match_results ORDER BY d ASC, id ASC"
  );
  const [savedRows] = await conn.query("SELECT lineup, savedAt FROM saved_lineups ORDER BY savedAt ASC");

  // ── 1. Nuvarande trupp ─────────────────────────────────────────────────────
  /** id → registerrad */
  const reg = new Map();
  const addAlias = (rec, label) => {
    if (!label) return;
    const cur = new Set([rec.name, labelOf(rec)]);
    if (!cur.has(label) && !rec.aliases.includes(label)) rec.aliases.push(label);
  };
  for (const p of currentPlayers) {
    if (reg.has(p.id)) continue;
    reg.set(p.id, {
      id: p.id,
      name: String(p.name).trim().slice(0, 120),
      number: String(p.number ?? "").trim().slice(0, 10),
      position: String(p.position ?? "F").slice(0, 4),
      teamColor: p.teamColor ?? null,
      captainRole: p.captainRole ?? null,
      isMember: true,
      active: true,
      aliases: [],
      mergedInto: null,
    });
  }
  const currentByName = new Map();
  for (const rec of reg.values()) {
    const k = norm(rec.name);
    currentByName.set(k, currentByName.has(k) ? null : rec.id); // null = tvetydigt
  }

  // ── 2. Historik (äldst först, så senaste uppgifterna vinner) ────────────────
  const historical = [
    ...savedRows.map((r) => playersIn(r.lineup)),
    ...matchRows.map((r) => playersIn(r.lineup)),
  ];
  let merged = 0;
  for (const list of historical) {
    for (const p of list) {
      const existing = reg.get(p.id);
      if (existing) {
        if (existing.mergedInto) addAlias(reg.get(existing.mergedInto), labelOf(p));
        else if (existing.active) {
          addAlias(existing, labelOf(p));
          addAlias(existing, p.name);
        } else {
          // Inaktiv historisk spelare: behåll senaste uppgifterna, tidigare som alias.
          addAlias(existing, labelOf(existing));
          existing.name = String(p.name).trim().slice(0, 120);
          existing.number = String(p.number ?? "").trim().slice(0, 10);
          existing.position = String(p.position ?? existing.position).slice(0, 4);
        }
        continue;
      }
      // Samma namn som exakt en nuvarande spelare → samma person med nytt ID.
      const sameAs = currentByName.get(norm(p.name));
      if (sameAs) {
        reg.set(p.id, { id: p.id, name: p.name, number: String(p.number ?? ""), position: p.position ?? "F",
          teamColor: null, captainRole: null, isMember: false, active: false, aliases: [], mergedInto: sameAs });
        addAlias(reg.get(sameAs), labelOf(p));
        merged++;
        continue;
      }
      reg.set(p.id, {
        id: p.id,
        name: String(p.name).trim().slice(0, 120),
        number: String(p.number ?? "").trim().slice(0, 10),
        position: String(p.position ?? "F").slice(0, 4),
        teamColor: p.teamColor ?? null,
        captainRole: null,
        isMember: false,
        active: false,
        aliases: [],
        mergedInto: null,
      });
    }
  }
  for (const rec of reg.values()) rec.aliases = rec.aliases.filter((a) => a !== rec.name && a !== labelOf(rec));

  // Unika etiketter i hela registret (för mål som inte går att koppla via matchen).
  const finalId = (id) => {
    let r = reg.get(id);
    for (let i = 0; r?.mergedInto && i < 10; i++) r = reg.get(r.mergedInto);
    return r?.id ?? id;
  };
  const globalLabel = new Map();
  const addGlobal = (label, id) => {
    const k = norm(label);
    if (!k) return;
    const prev = globalLabel.get(k);
    globalLabel.set(k, prev === undefined || prev === id ? id : null);
  };
  for (const rec of reg.values()) {
    const target = finalId(rec.id);
    addGlobal(rec.name, target);
    addGlobal(labelOf(rec), target);
    for (const a of rec.aliases) addGlobal(a, target);
  }

  // ── 3. Koppla mål och assist till ID ───────────────────────────────────────
  let linked = 0;
  let unlinked = 0;
  const goalUpdates = [];
  for (const m of matchRows) {
    const goals = parse(m.goalHistory, null);
    if (!Array.isArray(goals) || goals.length === 0) continue;
    const local = new Map();
    for (const p of playersIn(m.lineup)) {
      local.set(norm(labelOf(p)), finalId(p.id));
      if (!local.has(norm(p.name))) local.set(norm(p.name), finalId(p.id));
    }
    const resolve = (label) => {
      if (!label) return undefined;
      const k = norm(label);
      return local.get(k) ?? globalLabel.get(k) ?? undefined;
    };
    let changed = false;
    for (const g of goals) {
      for (const [field, idField] of [["scorer", "scorerId"], ["assist", "assistId"]]) {
        if (!g[field] || g[idField]) continue;
        const id = resolve(g[field]);
        if (id) {
          g[idField] = id;
          linked++;
          changed = true;
        } else unlinked++;
      }
    }
    if (changed) goalUpdates.push([JSON.stringify(goals), m.id]);
  }

  // ── 4. PIR-justeringar: namn → ID ──────────────────────────────────────────
  const [adjRows] = await conn.query("SELECT `value` FROM app_config WHERE `key` = 'pir_adjustments'");
  const oldAdj = adjRows.length ? parse(adjRows[0].value, {}) : {};
  const newAdj = {};
  for (const [key, value] of Object.entries(oldAdj)) {
    const id = reg.has(key) ? finalId(key) : globalLabel.get(norm(key));
    if (id) newAdj[id] = value;
  }

  // ── Skriv ──────────────────────────────────────────────────────────────────
  await conn.beginTransaction();
  try {
    for (const r of reg.values()) {
      await conn.query(
        "INSERT IGNORE INTO players (id, name, number, position, teamColor, captainRole, isMember, active, aliases, mergedInto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [r.id, r.name, r.number, r.position, r.teamColor, r.captainRole, r.isMember, r.active,
          JSON.stringify(r.aliases), r.mergedInto]
      );
    }
    for (const [json, id] of goalUpdates) {
      await conn.query("UPDATE match_results SET goalHistory = ? WHERE id = ?", [json, id]);
    }
    if (Object.keys(oldAdj).length) {
      await conn.query("UPDATE app_config SET `value` = ? WHERE `key` = 'pir_adjustments'", [JSON.stringify(newAdj)]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }

  const active = [...reg.values()].filter((r) => r.active).length;
  log(
    `Spelarregister: ${reg.size} spelare (${active} i truppen, ${reg.size - active - merged} bara i historiken, ` +
      `${merged} ihopslagna). Mål/assist kopplade: ${linked}, ej kopplade: ${unlinked}.`
  );
}

const MIGRATIONS = [["players_v1", migratePlayersV1]];

export async function runDataMigrations(conn, log) {
  const done = await getDone(conn);
  for (const [name, fn] of MIGRATIONS) {
    if (done.has(name)) continue;
    log(`Datamigrering ${name} …`);
    await fn(conn, log);
    await markDone(conn, done, name);
  }
}
