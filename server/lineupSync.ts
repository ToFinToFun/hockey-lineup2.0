/**
 * Serverns del av live-synken för uppställningen.
 *
 * - Dokumentet hålls i minnet (appen kör som en process) och sparas i
 *   databasen efter varje ändring.
 * - Ändringar (patchar) tillämpas strikt en i taget via en kö, får ett
 *   löpnummer (version) och skickas sedan till alla anslutna enheter.
 * - Samma patch-ID tillämpas bara en gång, så klienter kan skicka om säkert.
 */
import { eq } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { lineupState } from "../drizzle/schema";
import { sseManager } from "./sse";
import { applyOps, diffDocs, normalizeDoc, type LineupDoc, type LineupOp, type Player } from "../shared/lineupDoc";
import {
  createPlayer,
  getRegistryMap,
  onRegistryChange,
  resolveId,
  toLineupFields,
  updatePlayer,
} from "./playersDb";

const STATE_ROW_ID = 1;
const RECENT_PATCH_LIMIT = 500;

let doc: LineupDoc | null = null;
let version = 0;
const recentPatchIds: string[] = [];
let queue: Promise<unknown> = Promise.resolve();
/** Kontrollsumma för tabellen efter senaste egna läsning/skrivning. */
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

async function readRow() {
  const db = await getDb();
  return db ? (await db.select().from(lineupState).where(eq(lineupState.id, STATE_ROW_ID)).limit(1))[0] : undefined;
}

async function load(): Promise<void> {
  if (doc) return;
  knownChecksum = await tableChecksum("lineup_state");
  const row = await readRow();
  doc = normalizeDoc(row as Partial<LineupDoc> | undefined);
  version = row?.version ?? 0;
  lastExternalCheck = Date.now();
  startWatcher();
}

/**
 * Har någon ändrat uppställningen direkt i databasen (t.ex. med ett
 * databasverktyg)? Då läses den in igen och alla enheter hämtar om.
 * Körs i kön, så den krockar aldrig med appens egna ändringar.
 */
async function checkExternalChange(force = false): Promise<void> {
  if (!doc) return;
  if (!force && Date.now() - lastExternalCheck < EXTERNAL_CHECK_MS) return;
  lastExternalCheck = Date.now();
  const sum = await tableChecksum("lineup_state");
  if (sum == null || knownChecksum == null || sum === knownChecksum) return;
  const row = await readRow();
  doc = normalizeDoc(row as Partial<LineupDoc> | undefined);
  // Nytt löpnummer som alltid är högre än det klienterna har sett.
  version = Math.max(version, row?.version ?? 0) + 1;
  knownChecksum = sum;
  console.log(`[lineup] Ändring direkt i databasen upptäckt – laddar om (version ${version})`);
  sseManager.notifyLineupReset({ version });
}

function startWatcher() {
  if (watcher) return;
  // Även när ingen använder appen: upptäck externa ändringar och meddela enheterna.
  watcher = setInterval(() => {
    void serialize(() => checkExternalChange(true)).catch(() => {});
    void getRegistryMap().catch(() => {}); // upptäcker ändringar direkt i spelarregistret
  }, EXTERNAL_CHECK_MS);
  watcher.unref?.();
}

async function persist(next: LineupDoc, nextVersion: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const values = {
    players: next.players,
    lineup: next.lineup,
    teamAName: next.teamAName,
    teamBName: next.teamBName,
    teamAConfig: next.teamAConfig,
    teamBConfig: next.teamBConfig,
    deletedPlayerIds: next.deletedPlayerIds,
    version: nextVersion,
  };
  await db
    .insert(lineupState)
    .values({ id: STATE_ROW_ID, ...values })
    .onDuplicateKeyUpdate({ set: values });
  knownChecksum = await tableChecksum("lineup_state");
}

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

/** Tillämpar en patch, sparar och skickar den till alla enheter. */
export function applyLineupPatch(patchId: string, ops: LineupOp[], clientId?: string): Promise<PatchResult> {
  return serialize(async () => {
    await load();
    await checkExternalChange();
    if (recentPatchIds.includes(patchId)) return { version, duplicate: true };

    const next = applyOps(doc!, ops);
    const nextVersion = version + 1;
    await persist(next, nextVersion);
    doc = next;
    version = nextVersion;
    recentPatchIds.push(patchId);
    if (recentPatchIds.length > RECENT_PATCH_LIMIT) recentPatchIds.shift();

    sseManager.notifyLineupPatch({ version, patchId, clientId: clientId ?? null, ops });
    void writeThroughToRegistry(next, ops).catch((err) =>
      console.error("[lineup] Kunde inte uppdatera spelarregistret:", err)
    );
    return { version, duplicate: false };
  });
}

// ─── Synk med spelarregistret ────────────────────────────────────────────────

const REGISTRY_FIELDS = ["name", "number", "position", "teamColor", "captainRole"] as const;

function allDocPlayers(d: LineupDoc): Player[] {
  return [...d.players, ...Object.values(d.lineup)];
}

/**
 * Ändringar gjorda i Lineup (namn, nummer, position, lag, C/A, nya och
 * borttagna spelare) skrivs till registret.
 */
async function writeThroughToRegistry(next: LineupDoc, ops: LineupOp[]) {
  const touched = new Map<string, Player>();
  for (const op of ops) {
    if (op.t === "slot" && op.player) touched.set(op.player.id, op.player);
    if (op.t === "rosterUpsert") touched.set(op.player.id, op.player);
  }
  const removed = ops.filter((o): o is Extract<LineupOp, { t: "rosterRemove" }> => o.t === "rosterRemove").map((o) => o.id);
  if (touched.size === 0 && removed.length === 0) return;

  const registry = await getRegistryMap();
  const inDoc = new Set(allDocPlayers(next).map((p) => p.id));
  for (const p of touched.values()) {
    if (!inDoc.has(p.id)) continue;
    const row = registry.get(p.id);
    if (!row) {
      await createPlayer({
        id: p.id,
        name: String(p.name ?? "").trim() || "Namnlös",
        number: String(p.number ?? ""),
        position: p.position ?? "F",
        teamColor: p.teamColor ?? null,
        captainRole: p.captainRole ?? null,
        // Ny spelare i Lineup: inte i medlemsregistret förrän styrelsen säger det.
        isMember: (p as Player & { isMember?: boolean }).isMember ?? false,
        active: true,
      });
      continue;
    }
    const diff: Record<string, unknown> = {};
    for (const key of REGISTRY_FIELDS) {
      const a = (p as unknown as Record<string, unknown>)[key] ?? null;
      const b = (row as unknown as Record<string, unknown>)[key] ?? null;
      if (String(a ?? "") !== String(b ?? "")) diff[key] = a;
    }
    if (!row.active) diff.active = true;
    if (Object.keys(diff).length) await updatePlayer(p.id, diff);
  }
  for (const id of removed) {
    // Borttagen ur Lineup (inte bara flyttad till en plats) → inaktiv i registret.
    if (!inDoc.has(id) && registry.get(id)?.active) await updatePlayer(id, { active: false });
  }
}

/**
 * Registret → uppställningen: nya uppgifter, nya aktiva spelare, inaktiva
 * och ihopslagna tas bort. Körs när registret ändrats (styrelsen, import,
 * direkt i databasen). Blir det inga skillnader händer ingenting.
 */
async function reconcileWithRegistry() {
  const registry = await getRegistryMap();
  if (registry.size === 0) return;
  const { doc: current } = await getLineupSnapshot();
  const ops: LineupOp[] = [];
  const seen = new Set<string>();

  const updated = (p: Player): Player | null => {
    const row = registry.get(p.id);
    if (!row) return p; // okänd för registret – lämnas (skrivs in vid nästa ändring)
    if (row.mergedInto || resolveId(registry, p.id) !== p.id || !row.active) return null;
    return { ...p, ...toLineupFields(row) } as Player;
  };
  const same = (a: Player, b: Player) =>
    REGISTRY_FIELDS.every((k) => String((a as any)[k] ?? "") === String((b as any)[k] ?? "")) &&
    (a as any).isMember === (b as any).isMember &&
    ((a as any).lagetName ?? undefined) === ((b as any).lagetName ?? undefined);

  for (const [slot, p] of Object.entries(current.lineup)) {
    seen.add(p.id);
    const u = updated(p);
    if (!u) ops.push({ t: "slot", slot, player: null });
    else if (!same(p, u)) ops.push({ t: "slot", slot, player: u });
  }
  current.players.forEach((p, index) => {
    seen.add(p.id);
    const u = updated(p);
    if (!u) ops.push({ t: "rosterRemove", id: p.id });
    else if (!same(p, u)) ops.push({ t: "rosterUpsert", player: u, index });
  });
  let end = current.players.length;
  for (const row of registry.values()) {
    if (!row.active || row.mergedInto || seen.has(row.id)) continue;
    ops.push({ t: "rosterUpsert", player: { id: row.id, ...toLineupFields(row) } as unknown as Player, index: end++ });
  }
  if (ops.length) await applyLineupPatch(`registry-${Date.now()}-${Math.random().toString(36).slice(2)}`, ops);
}

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
onRegistryChange(() => {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileWithRegistry().catch((err) => console.error("[lineup] Synk med registret misslyckades:", err));
  }, 300);
});

/** För tester: kör synken med registret direkt. */
export const reconcileWithRegistryForTests = reconcileWithRegistry;

/**
 * Äldre klienter skickar hela uppställningen. Den görs om till en patch mot
 * nuvarande dokument så att de inte skriver över andras ändringar i onödan.
 */
export async function applyFullState(state: Partial<LineupDoc>, clientId?: string): Promise<PatchResult> {
  const { doc: current } = await getLineupSnapshot();
  const ops = diffDocs(current, normalizeDoc({ ...current, ...state }));
  return applyLineupPatch(`legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`, ops, clientId);
}

/** Endast för tester: glöm dokumentet i minnet. */
export function resetLineupCacheForTests() {
  if (watcher) clearInterval(watcher);
  watcher = null;
  knownChecksum = null;
  doc = null;
  version = 0;
  recentPatchIds.length = 0;
}
