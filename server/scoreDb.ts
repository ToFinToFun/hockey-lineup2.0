/**
 * Database helpers for Score Tracker functionality.
 * Handles match results and app configuration.
 */

import { eq, inArray, desc } from "drizzle-orm";
import { getDb } from "./db";
import { matchResults, appConfig, type InsertMatchResult } from "../drizzle/schema";

// ─── Match Results ─────────────────────────────────────────────────

// Alla matcher läses ofta (statistik, PIR) men ändras sällan. De hålls därför
// i minnet och laddas om först när något skrivs. Appen kör som en enda process.
type MatchRow = typeof matchResults.$inferSelect;
let matchCache: MatchRow[] | null = null;
let matchCacheVersion = 0;

/** Anropas efter varje ändring av matcher. */
function invalidateMatches() {
  matchCache = null;
  matchCacheVersion++;
}

/** Ökar vid varje ändring – används för att cacha beräkningar (t.ex. PIR). */
export function getMatchCacheVersion() {
  return matchCacheVersion;
}

async function loadAllMatches(): Promise<MatchRow[]> {
  if (matchCache) return matchCache;
  const db = await getDb();
  if (!db) return [];
  matchCache = await db.select().from(matchResults).orderBy(desc(matchResults.id));
  return matchCache;
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
