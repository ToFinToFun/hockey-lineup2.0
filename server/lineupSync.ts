/**
 * Serverns del av live-synken för uppställningen.
 *
 * Lagring (lineup_state) innehåller bara:
 *   - slots:      plats → spelar-ID
 *   - attendance: spelar-ID → "registered" | "declined" (dagens match)
 *   - lagnamn och formation
 * All spelardata (namn, nummer, position, lag, C/A) finns bara i spelarregistret.
 * Truppen = aktiva spelare i registret som inte står på en plats.
 *
 * Klienterna får ett "dokument" med fullständiga spelare (se shared/lineupDoc)
 * och skickar små ändringar (patchar). Servern tillämpar dem en i taget,
 * skriver platser/anmälan till lineup_state och spelardata till registret,
 * och skickar patchen vidare till alla enheter.
 */
import { eq } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { lineupState, type PlayerRow } from "../drizzle/schema";
import { sseManager } from "./sse";
import { applyOps, emptyDoc, isValidSlot, type LineupDoc, type LineupOp, type Player } from "../shared/lineupDoc";
import { createPlayers, getRegistryMap, onRegistryChange, updatePlayers, type PlayerFields } from "./playersDb";

const STATE_ROW_ID = 1;
const RECENT_PATCH_LIMIT = 500;

interface Stored {
  slots: Record<string, string>;
  attendance: Record<string, "registered" | "declined">;
  teamAName: string;
  teamBName: string;
  teamAConfig: LineupDoc["teamAConfig"];
  teamBConfig: LineupDoc["teamBConfig"];
}

let stored: Stored | null = null;
let doc: LineupDoc | null = null;
let version = 0;
const recentPatchIds: string[] = [];
let queue: Promise<unknown> = Promise.resolve();
let knownChecksum: string | null = null;
let lastExternalCheck = 0;
let watcher: ReturnType<typeof setInterval> | null = null;
const EXTERNAL_CHECK_MS = 5_000;

/** Kör uppgifter en i taget, i den ordning de kom in. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// ─── Från lagring + register till dokument ──────────────────────────────────

function toPlayer(row: PlayerRow, attendance: Stored["attendance"]): Player {
  const status = attendance[row.id];
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    position: row.position as Player["position"],
    isMember: row.isMember,
    ...(row.teamColor ? { teamColor: row.teamColor as Player["teamColor"] } : {}),
    ...(row.captainRole ? { captainRole: row.captainRole as Player["captainRole"] } : {}),
    ...(status === "registered" ? { isRegistered: true } : {}),
    ...(status === "declined" ? { isDeclined: true } : {}),
  } as Player;
}

function hydrate(s: Stored, registry: Map<string, PlayerRow>): LineupDoc {
  const d: LineupDoc = { ...emptyDoc(), teamAName: s.teamAName, teamBName: s.teamBName, teamAConfig: s.teamAConfig, teamBConfig: s.teamBConfig };
  const placed = new Set<string>();
  for (const [slot, id] of Object.entries(s.slots)) {
    const row = registry.get(id);
    if (!row || placed.has(id) || !isValidSlot(d, slot)) continue;
    d.lineup[slot] = toPlayer(row, s.attendance);
    placed.add(id);
  }
  d.players = [...registry.values()]
    .filter((r) => r.active && !placed.has(r.id))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
    .map((r) => toPlayer(r, s.attendance));
  return d;
}

function dehydrate(d: LineupDoc): Stored {
  const attendance: Stored["attendance"] = {};
  const slots: Record<string, string> = {};
  for (const [slot, p] of Object.entries(d.lineup)) slots[slot] = p.id;
  for (const p of [...d.players, ...Object.values(d.lineup)]) {
    if (p.isRegistered) attendance[p.id] = "registered";
    else if (p.isDeclined) attendance[p.id] = "declined";
  }
  return { slots, attendance, teamAName: d.teamAName, teamBName: d.teamBName, teamAConfig: d.teamAConfig, teamBConfig: d.teamBConfig };
}

async function readStored(): Promise<{ stored: Stored; version: number }> {
  const db = await getDb();
  const row = db ? (await db.select().from(lineupState).where(eq(lineupState.id, STATE_ROW_ID)).limit(1))[0] : undefined;
  const base = emptyDoc();
  return {
    version: row?.version ?? 0,
    stored: {
      slots: (row?.slots as Stored["slots"]) ?? {},
      attendance: (row?.attendance as Stored["attendance"]) ?? {},
      teamAName: row?.teamAName ?? base.teamAName,
      teamBName: row?.teamBName ?? base.teamBName,
      teamAConfig: (row?.teamAConfig as Stored["teamAConfig"]) ?? base.teamAConfig,
      teamBConfig: (row?.teamBConfig as Stored["teamBConfig"]) ?? base.teamBConfig,
    },
  };
}

async function persist(s: Stored, nextVersion: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const values = { ...s, version: nextVersion };
  await db.insert(lineupState).values({ id: STATE_ROW_ID, ...values }).onDuplicateKeyUpdate({ set: values });
  knownChecksum = await tableChecksum("lineup_state");
}

async function load(): Promise<void> {
  if (doc) return;
  knownChecksum = await tableChecksum("lineup_state");
  const r = await readStored();
  stored = r.stored;
  version = r.version;
  doc = hydrate(stored, await getRegistryMap());
  lastExternalCheck = Date.now();
  startWatcher();
}

/** Bygger om dokumentet (efter ändring i registret eller direkt i databasen) och låter alla enheter hämta om. */
async function rebuild(reason: string, reread: boolean): Promise<void> {
  if (!doc) return;
  if (reread) {
    const r = await readStored();
    stored = r.stored;
    version = Math.max(version, r.version);
  }
  doc = hydrate(stored!, await getRegistryMap());
  version += 1;
  console.log(`[lineup] ${reason} – laddar om (version ${version})`);
  sseManager.notifyLineupReset({ version });
}

async function checkExternalChange(force = false): Promise<void> {
  if (!doc) return;
  if (!force && Date.now() - lastExternalCheck < EXTERNAL_CHECK_MS) return;
  lastExternalCheck = Date.now();
  const sum = await tableChecksum("lineup_state");
  if (sum == null || knownChecksum == null || sum === knownChecksum) return;
  knownChecksum = sum;
  await rebuild("Ändring direkt i databasen upptäckt", true);
}

function startWatcher() {
  if (watcher) return;
  watcher = setInterval(() => {
    void serialize(() => checkExternalChange(true)).catch(() => {});
    void getRegistryMap().catch(() => {}); // upptäcker ändringar direkt i spelarregistret
  }, EXTERNAL_CHECK_MS);
  watcher.unref?.();
}

// Ändringar i registret som inte kom från uppställningen (sidan Spelare,
// import, direkt i databasen) → bygg om dokumentet.
let applyingOwnRegistryWrite = false;
onRegistryChange(() => {
  if (applyingOwnRegistryWrite) return;
  void serialize(() => rebuild("Spelarregistret ändrades", false)).catch(() => {});
});

// ─── Publika funktioner ─────────────────────────────────────────────────────

export interface LineupSnapshot {
  doc: LineupDoc;
  version: number;
  /** Senast tillämpade patch-ID:n – klienten kan se vilka av dess ändringar som redan är med. */
  appliedPatchIds: string[];
}

export function getLineupSnapshot(): Promise<LineupSnapshot> {
  return serialize(async () => {
    await load();
    await checkExternalChange();
    return { doc: doc!, version, appliedPatchIds: [...recentPatchIds] };
  });
}

export interface PatchResult {
  version: number;
  duplicate: boolean;
}

const REGISTRY_FIELDS = ["name", "number", "position", "teamColor", "captainRole"] as const;

/** Tillämpar en patch, sparar och skickar den till alla enheter. */
export function applyLineupPatch(patchId: string, ops: LineupOp[], clientId?: string): Promise<PatchResult> {
  return serialize(async () => {
    await load();
    await checkExternalChange();
    if (recentPatchIds.includes(patchId)) return { version, duplicate: true };

    const before = doc!;
    const next = applyOps(before, ops);

    // Spelardata → registret: nya spelare, ändrade uppgifter, borttagna ur truppen.
    const registry = await getRegistryMap();
    const inNext = new Map([...next.players, ...Object.values(next.lineup)].map((p) => [p.id, p]));
    const creates: Array<PlayerFields & { id: string; name: string }> = [];
    const updates: Array<{ id: string; fields: PlayerFields }> = [];
    for (const p of inNext.values()) {
      const row = registry.get(p.id);
      if (!row) {
        creates.push({
          id: p.id, name: p.name || "Ny spelare", number: p.number ?? "", position: p.position ?? "F",
          teamColor: p.teamColor ?? null, captainRole: p.captainRole ?? null, isMember: false, active: true,
        });
        continue;
      }
      const fields: PlayerFields = {};
      const src = p as unknown as Record<string, unknown>;
      for (const key of REGISTRY_FIELDS) {
        // Namn, nummer och position: saknas fältet ändras inget. Lag och C/A: saknas = borttaget.
        const optional = key === "teamColor" || key === "captainRole";
        if (!optional && (src[key] === undefined || src[key] === null)) continue;
        const value = src[key] ?? null;
        if ((row as unknown as Record<string, unknown>)[key] !== value) (fields as Record<string, unknown>)[key] = value;
      }
      if (!row.active) fields.active = true;
      if (Object.keys(fields).length) updates.push({ id: p.id, fields });
    }
    // Spelare som försvunnit helt (borttagna i Lineup) blir inaktiva – historiken finns kvar.
    for (const p of [...before.players, ...Object.values(before.lineup)]) {
      if (!inNext.has(p.id) && registry.get(p.id)?.active) updates.push({ id: p.id, fields: { active: false } });
    }
    const removed = ops.find((o) => o.t === "field" && o.key === "deletedPlayerIds");
    if (removed && Array.isArray((removed as { value: unknown }).value)) {
      for (const id of (removed as { value: string[] }).value) {
        if (registry.get(id)?.active && !inNext.has(id)) updates.push({ id, fields: { active: false } });
      }
    }
    applyingOwnRegistryWrite = true;
    try {
      if (creates.length) await createPlayers(creates);
      if (updates.length) await updatePlayers(updates);
    } finally {
      applyingOwnRegistryWrite = false;
    }

    const nextStored = dehydrate(next);
    const nextVersion = version + 1;
    await persist(nextStored, nextVersion);
    stored = nextStored;
    doc = next;
    version = nextVersion;
    recentPatchIds.push(patchId);
    if (recentPatchIds.length > RECENT_PATCH_LIMIT) recentPatchIds.shift();

    sseManager.notifyLineupPatch({ version, patchId, clientId: clientId ?? null, ops });
    return { version, duplicate: false };
  });
}

/** Endast för tester: glöm dokumentet i minnet. */
export function resetLineupCacheForTests() {
  if (watcher) clearInterval(watcher);
  watcher = null;
  knownChecksum = null;
  stored = null;
  doc = null;
  version = 0;
  recentPatchIds.length = 0;
}
