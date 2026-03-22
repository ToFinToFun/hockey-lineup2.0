import { eq, desc, gt } from "drizzle-orm";
import { getDb } from "./db";
import {
  lineupState,
  lineupOperations,
  savedLineups,
  type LineupState,
  type InsertLineupState,
  type LineupOperation,
  type SavedLineup,
} from "../drizzle/schema";

// ─── Lineup State CRUD ──────────────────────────────────────────────────────

const STATE_ROW_ID = 1; // We use a single-row table

/**
 * Get the current lineup state. Returns null if no state exists yet.
 */
export async function getLineupState(): Promise<LineupState | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(lineupState).where(eq(lineupState.id, STATE_ROW_ID)).limit(1);
  return rows[0] ?? null;
}

/**
 * Save/update the full lineup state. Creates the row if it doesn't exist.
 * Increments the version number and logs an operation.
 */
export async function saveLineupState(
  state: {
    players: any[];
    lineup: Record<string, any>;
    teamAName: string;
    teamBName: string;
    teamAConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number } | null;
    teamBConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number } | null;
    deletedPlayerIds?: string[] | null;
  },
  operation?: { opType: string; description: string; payload?: Record<string, any> }
): Promise<{ version: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current version
  const current = await getLineupState();
  const newVersion = (current?.version ?? 0) + 1;

  if (!current) {
    // Insert first row
    await db.insert(lineupState).values({
      id: STATE_ROW_ID,
      players: state.players,
      lineup: state.lineup,
      teamAName: state.teamAName,
      teamBName: state.teamBName,
      teamAConfig: state.teamAConfig ?? undefined,
      teamBConfig: state.teamBConfig ?? undefined,
      deletedPlayerIds: state.deletedPlayerIds ?? undefined,
      version: newVersion,
    });
  } else {
    // Update existing row
    await db.update(lineupState).set({
      players: state.players,
      lineup: state.lineup,
      teamAName: state.teamAName,
      teamBName: state.teamBName,
      teamAConfig: state.teamAConfig ?? undefined,
      teamBConfig: state.teamBConfig ?? undefined,
      deletedPlayerIds: state.deletedPlayerIds ?? undefined,
      version: newVersion,
    }).where(eq(lineupState.id, STATE_ROW_ID));
  }

  // Log the operation if provided
  if (operation) {
    await db.insert(lineupOperations).values({
      seq: newVersion,
      opType: operation.opType,
      description: operation.description,
      payload: operation.payload ?? {},
    });
  }

  return { version: newVersion };
}

// ─── Operations (for SSE) ───────────────────────────────────────────────────

/**
 * Get operations after a given sequence number (for SSE catch-up).
 */
export async function getOperationsAfter(afterSeq: number, limit = 50): Promise<LineupOperation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(lineupOperations)
    .where(gt(lineupOperations.seq, afterSeq))
    .orderBy(lineupOperations.seq)
    .limit(limit);
}

/**
 * Get the latest sequence number.
 */
export async function getLatestSeq(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ seq: lineupOperations.seq })
    .from(lineupOperations)
    .orderBy(desc(lineupOperations.seq))
    .limit(1);
  return rows[0]?.seq ?? 0;
}

// ─── Saved Lineups CRUD ─────────────────────────────────────────────────────

function generateShareId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Save a new lineup snapshot. Returns the shareId for URL sharing.
 */
export async function createSavedLineup(data: {
  name: string;
  teamAName: string;
  teamBName: string;
  lineup: Record<string, any>;
}): Promise<{ shareId: string; id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const shareId = generateShareId();
  const result = await db.insert(savedLineups).values({
    shareId,
    name: data.name,
    teamAName: data.teamAName,
    teamBName: data.teamBName,
    lineup: data.lineup,
    savedAt: Date.now(),
  });

  return { shareId, id: Number(result[0].insertId) };
}

/**
 * Get all saved lineups, ordered by favorite first then newest.
 */
export async function getAllSavedLineups(): Promise<SavedLineup[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(savedLineups)
    .orderBy(desc(savedLineups.favorite), desc(savedLineups.savedAt));
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
  return rows[0] ?? null;
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
