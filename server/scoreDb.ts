/**
 * Database helpers for Score Tracker functionality.
 * Handles match results and app configuration.
 */

import { eq, inArray, desc } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { canonicalizeMatch, getRegistryMap, onRegistryChange } from "./playersDb";
import { matchResults, appConfig, type InsertMatchResult } from "../drizzle/schema";

// ─── Match Results ─────────────────────────────────────────────────

// Alla matcher läses ofta (statistik, PIR) men ändras sällan. De hålls därför
// i minnet och laddas om först när något skrivs. Appen kör som en enda process.
type MatchRow = typeof matchResults.$inferSelect;
let matchCache: MatchRow[] | null = null;
let matchCacheVersion = 0;
/** Kontrollsumman när cachen laddades – ändras den har någon ändrat direkt i databasen. */
let matchCacheChecksum: string | null = null;
let lastExternalCheck = 0;
const EXTERNAL_CHECK_MS = 5_000;

/** Anropas efter varje ändring av matcher (och av spelarregistret). */
function invalidateMatches() {
  matchCache = null;
  matchCacheVersion++;
}
onRegistryChange(invalidateMatches);

/** Har tabellen ändrats utanför appen sedan cachen laddades? Då laddas den om. */
async function checkExternalMatchChanges() {
  if (!matchCache || Date.now() - lastExternalCheck < EXTERNAL_CHECK_MS) return;
  lastExternalCheck = Date.now();
  await getRegistryMap(); // upptäcker även ändringar direkt i spelarregistret
  const sum = await tableChecksum("match_results");
  if (sum != null && matchCacheChecksum != null && sum !== matchCacheChecksum) {
    console.log("[matcher] Ändring direkt i databasen upptäckt – laddar om");
    invalidateMatches();
  }
}

/** Ökar vid varje ändring – används för att cacha beräkningar (t.ex. PIR). */
export function getMatchCacheVersion() {
  return matchCacheVersion;
}

async function loadAllMatches(): Promise<MatchRow[]> {
  await checkExternalMatchChanges();
  if (matchCache) return matchCache;
  const db = await getDb();
  if (!db) return [];
  matchCacheChecksum = await tableChecksum("match_results");
  const rows = await db.select().from(matchResults).orderBy(desc(matchResults.id));
  // Spelarnas nuvarande namn/nummer via ID – historiken följer med vid namnbyte.
  const registry = await getRegistryMap();
  matchCache = rows.map((m) => canonicalizeMatch(m, registry));
  lastExternalCheck = Date.now();
  return matchCache;
}

/** Ökar när matcherna ändrats – även direkt i databasen (kontrolleras högst var 5:e s). */
export async function refreshMatchCacheVersion(): Promise<number> {
  await checkExternalMatchChanges();
  return matchCacheVersion;
}

export async function insertMatchResult(match: InsertMatchResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(matchResults).values(match);
  invalidateMatches();
}

/** Godkända matcher – det enda som räknas i statistik och PIR. */
export async function getAllMatchResults() {
  return (await loadAllMatches()).filter((m) => m.reviewStatus === "approved");
}

/** Alla matcher inklusive ej granskade och avvisade (för styrelsens historik). */
export async function getAllMatchesIncludingUnreviewed() {
  return loadAllMatches();
}

export async function countPendingMatches() {
  return (await loadAllMatches()).filter((m) => m.reviewStatus === "pending").length;
}

export async function setMatchReviewStatus(ids: number[], status: "approved" | "rejected" | "pending") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db
    .update(matchResults)
    .set({ reviewStatus: status, reviewedAt: status === "pending" ? null : new Date() })
    .where(inArray(matchResults.id, ids));
  invalidateMatches();
}

export async function getMatchResultById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(matchResults).where(eq(matchResults.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateMatchResult(id: number, data: Partial<InsertMatchResult>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(matchResults).set(data).where(eq(matchResults.id, id));
  invalidateMatches();
}

export async function deleteMatchResult(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(matchResults).where(eq(matchResults.id, id));
  invalidateMatches();
}

export async function deleteMultipleMatchResults(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.delete(matchResults).where(inArray(matchResults.id, ids));
  invalidateMatches();
}

// ─── App Config ───────────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return result.length > 0 ? result[0].value : null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(appConfig).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appConfig);
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}
