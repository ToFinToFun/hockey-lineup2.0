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
import { applyOps, diffDocs, normalizeDoc, type LineupDoc, type LineupOp } from "../shared/lineupDoc";

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
    return { version, duplicate: false };
  });
}

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
