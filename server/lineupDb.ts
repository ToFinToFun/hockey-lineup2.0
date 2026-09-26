import { eq, desc, and, isNull, isNotNull, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "./db";
import { savedLineups, type SavedLineup } from "../drizzle/schema";
import { getRegistryMap } from "./playersDb";

// Sparade uppställningar lagrar bara plats → spelar-ID. Namn, nummer m.m.
// hämtas från spelarregistret när de läses.
function toSlotIds(lineup: Record<string, { id?: string } | string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, p] of Object.entries(lineup ?? {})) {
    const id = typeof p === "string" ? p : p?.id;
    if (id) out[slot] = id;
  }
  return out;
}

async function hydrateSaved<T extends SavedLineup | null>(row: T): Promise<T> {
  if (!row) return row;
  const registry = await getRegistryMap();
  const lineup: Record<string, unknown> = {};
  for (const [slot, id] of Object.entries(toSlotIds(row.lineup as Record<string, string>))) {
    const r = registry.get(id);
    if (!r) continue;
    lineup[slot] = {
      id: r.id, name: r.name, number: r.number, position: r.position,
      ...(r.teamColor ? { teamColor: r.teamColor } : {}),
      ...(r.captainRole ? { captainRole: r.captainRole } : {}),
    };
  }
  return { ...row, lineup };
}

// ─── Saved Lineups CRUD ─────────────────────────────────────────────────────

function generateShareId(): string {
  // 12 slumpade tecken (≈71 bitar) – går inte att gissa.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(12), (b) => chars[b % chars.length]).join("");
}

/**
 * Save a new lineup snapshot. Returns the shareId for URL sharing.
 */
export async function createSavedLineup(data: {
  name: string;
  teamAName: string;
  teamBName: string;
  lineup: Record<string, any>;
  /** Delningslänk som går ut efter angivet antal timmar (visas inte bland sparade). */
  expiresInHours?: number;
}): Promise<{ shareId: string; id: number; expiresAt: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const shareId = generateShareId();
  const expiresAt = data.expiresInHours ? new Date(Date.now() + data.expiresInHours * 3600_000) : null;
  const result = await db.insert(savedLineups).values({
    shareId,
    name: data.name,
    teamAName: data.teamAName,
    teamBName: data.teamBName,
    lineup: toSlotIds(data.lineup),
    savedAt: Date.now(),
    expiresAt,
  });

  return { shareId, id: Number(result[0].insertId), expiresAt: expiresAt?.getTime() ?? null };
}

/**
 * Get all saved lineups, ordered by favorite first then newest.
 */
export async function getAllSavedLineups(): Promise<SavedLineup[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(savedLineups)
    .where(isNull(savedLineups.expiresAt))
    .orderBy(desc(savedLineups.favorite), desc(savedLineups.savedAt));
  return Promise.all(rows.map(hydrateSaved));
}

/**
 * Get a single saved lineup by its shareId (for shared view).
 */
export async function getSavedLineupByShareId(shareId: string): Promise<SavedLineup | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(savedLineups)
    .where(eq(savedLineups.shareId, shareId))
    .limit(1);
  return hydrateSaved(rows[0] ?? null);
}

/**
 * Toggle the favorite status of a saved lineup.
 */
export async function toggleSavedLineupFavorite(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ favorite: savedLineups.favorite }).from(savedLineups).where(eq(savedLineups.id, id)).limit(1);
  if (rows[0]) {
    await db.update(savedLineups).set({ favorite: !rows[0].favorite }).where(eq(savedLineups.id, id));
  }
}

/**
 * Delete a saved lineup by ID.
 */
export async function deleteSavedLineup(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(savedLineups).where(eq(savedLineups.id, id));
}

/** Tar bort delningslänkar som gått ut. */
export async function deleteExpiredShares(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(savedLineups)
    .where(and(isNotNull(savedLineups.expiresAt), lt(savedLineups.expiresAt, new Date())));
}
