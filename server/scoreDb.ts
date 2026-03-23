/**
 * Database helpers for Score Tracker functionality.
 * Handles match results and app configuration.
 */

import { eq, inArray, desc } from "drizzle-orm";
import { getDb } from "./db";
import { matchResults, appConfig, type InsertMatchResult } from "../drizzle/schema";

// ─── Match Results ─────────────────────────────────────────────────

export async function insertMatchResult(match: InsertMatchResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(matchResults).values(match);
}

export async function getAllMatchResults() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(matchResults).orderBy(desc(matchResults.id));
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
}

export async function deleteMatchResult(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(matchResults).where(eq(matchResults.id, id));
}

export async function deleteMultipleMatchResults(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.delete(matchResults).where(inArray(matchResults.id, ids));
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
