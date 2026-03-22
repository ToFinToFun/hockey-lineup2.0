import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Lineup State ────────────────────────────────────────────────────────────
// Single-row table holding the current lineup state (replaces Firebase /lineup node)

export const lineupState = mysqlTable("lineup_state", {
  id: int("id").autoincrement().primaryKey(),
  /** JSON array of Player objects in the available roster */
  players: json("players").notNull().$type<any[]>(),
  /** JSON object mapping slotId → Player for current lineup */
  lineup: json("lineup").notNull().$type<Record<string, any>>(),
  /** Team A display name */
  teamAName: varchar("teamAName", { length: 100 }).notNull().default("VITA"),
  /** Team B display name */
  teamBName: varchar("teamBName", { length: 100 }).notNull().default("GRÖNA"),
  /** Team A formation config (goalkeepers, defensePairs, forwardLines) */
  teamAConfig: json("teamAConfig").$type<{ goalkeepers: number; defensePairs: number; forwardLines: number }>(),
  /** Team B formation config */
  teamBConfig: json("teamBConfig").$type<{ goalkeepers: number; defensePairs: number; forwardLines: number }>(),
  /** IDs of intentionally deleted players (prevents re-merge) */
  deletedPlayerIds: json("deletedPlayerIds").$type<string[]>(),
  /** Monotonically increasing version number for optimistic concurrency */
  version: bigint("version", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LineupState = typeof lineupState.$inferSelect;
export type InsertLineupState = typeof lineupState.$inferInsert;

// ─── Lineup Operations (Change Log) ─────────────────────────────────────────
// Each mutation is recorded as an operation for SSE-based real-time sync

export const lineupOperations = mysqlTable("lineup_operations", {
  id: int("id").autoincrement().primaryKey(),
  /** Monotonically increasing sequence number (matches lineupState.version) */
  seq: bigint("seq", { mode: "number" }).notNull(),
  /** Type of operation: movePlayer, removePlayer, renameTeam, updateConfig, etc. */
  opType: varchar("opType", { length: 50 }).notNull(),
  /** Human-readable description, e.g. "Någon flyttade Spelare X till Kedja 2" */
  description: varchar("description", { length: 500 }).notNull().default(""),
  /** Full operation payload as JSON (details vary by opType) */
  payload: json("payload").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LineupOperation = typeof lineupOperations.$inferSelect;
export type InsertLineupOperation = typeof lineupOperations.$inferInsert;

// ─── Saved Lineups ──────────────────────────────────────────────────────────
// Named lineup snapshots that users can save, load, share, and favorite

export const savedLineups = mysqlTable("saved_lineups", {
  id: int("id").autoincrement().primaryKey(),
  /** Short unique ID for sharing URLs (replaces Firebase push-key) */
  shareId: varchar("shareId", { length: 20 }).notNull().unique(),
  /** User-given name, e.g. "Hemmaplan 5-3-2" */
  name: varchar("name", { length: 200 }).notNull(),
  /** Team A display name at time of save */
  teamAName: varchar("teamAName", { length: 100 }).notNull(),
  /** Team B display name at time of save */
  teamBName: varchar("teamBName", { length: 100 }).notNull(),
  /** JSON object mapping slotId → Player */
  lineup: json("lineup").notNull().$type<Record<string, any>>(),
  /** Whether this lineup is marked as a favorite */
  favorite: boolean("favorite").notNull().default(false),
  /** Unix timestamp in ms when saved (for display) */
  savedAt: bigint("savedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SavedLineup = typeof savedLineups.$inferSelect;
export type InsertSavedLineup = typeof savedLineups.$inferInsert;

// ─── App Config (from match results site) ──────────────────────────────────
// Key-value config store for season/playoff dates etc.

export const appConfig = mysqlTable("app_config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppConfig = typeof appConfig.$inferSelect;
export type InsertAppConfig = typeof appConfig.$inferInsert;

// ─── Match Results (from match results site) ───────────────────────────────
// Stores match scores, goal history, and lineup snapshots per match

export const matchResults = mysqlTable("match_results", {
  id: int("id").autoincrement().primaryKey(),
  /** Match name/title, e.g. "26-03-19 Torsdag 22:00 2-5" */
  name: varchar("name", { length: 255 }).notNull(),
  /** Team white (VITA) final score */
  teamWhiteScore: int("teamWhiteScore").notNull(),
  /** Team green (GRÖNA) final score */
  teamGreenScore: int("teamGreenScore").notNull(),
  /** JSON array of goal events: [{team, scorer, assist?, other?, sponsor?, timestamp}] */
  goalHistory: json("goalHistory").$type<Array<{
    team: string;
    scorer: string;
    assist?: string;
    other?: string;
    sponsor?: string;
    timestamp: string;
  }>>(),
  /** When the match started */
  matchStartTime: timestamp("matchStartTime"),
  /** When the match ended */
  matchEndTime: timestamp("matchEndTime").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Last edit timestamp (null if never edited) */
  editedAt: timestamp("editedAt"),
  /** Full lineup snapshot at time of match: {lineup, availablePlayers, teamAName, teamBName, teamAConfig, teamBConfig} */
  lineup: json("lineup").$type<{
    lineup?: Record<string, any>;
    availablePlayers?: any[];
    teamAName?: string;
    teamBName?: string;
    teamAConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
    teamBConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
  }>(),
});

export type MatchResult = typeof matchResults.$inferSelect;
export type InsertMatchResult = typeof matchResults.$inferInsert;
