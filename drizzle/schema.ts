import { int, json, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, boolean, bigint, index } from "drizzle-orm/mysql-core";

// ─── Lineup State ────────────────────────────────────────────────────────────
// Single-row table holding the current lineup state (replaces Firebase /lineup node)

export const lineupState = mysqlTable("lineup_state", {
  id: int("id").autoincrement().primaryKey(),
  /** Plats → spelar-ID. Spelardata (namn, nummer …) finns bara i `players`. */
  slots: json("slots").$type<Record<string, string>>(),
  /** Spelar-ID → anmälan till dagens match ("registered" | "declined"). */
  attendance: json("attendance").$type<Record<string, "registered" | "declined">>(),
  /** Team A display name */
  teamAName: varchar("teamAName", { length: 100 }).notNull().default("VITA"),
  /** Team B display name */
  teamBName: varchar("teamBName", { length: 100 }).notNull().default("GRÖNA"),
  /** Team A formation config (goalkeepers, defensePairs, forwardLines) */
  teamAConfig: json("teamAConfig").$type<{ goalkeepers: number; defensePairs: number; forwardLines: number }>(),
  /** Team B formation config */
  teamBConfig: json("teamBConfig").$type<{ goalkeepers: number; defensePairs: number; forwardLines: number }>(),
  /** IDs of intentionally deleted players (prevents re-merge) */
  /** Monotonically increasing version number for optimistic concurrency */
  version: bigint("version", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LineupState = typeof lineupState.$inferSelect;
export type InsertLineupState = typeof lineupState.$inferInsert;

// ─── Lineup Operations (Change Log) ─────────────────────────────────────────
// Each mutation is recorded as an operation for SSE-based real-time sync

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
  /** Delningslänkar går ut (48 h). Sparade uppställningar har inget utgångsdatum. */
  expiresAt: timestamp("expiresAt"),
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
  /** When the match started */
  matchStartTime: timestamp("matchStartTime"),
  /** When the match ended */
  matchEndTime: timestamp("matchEndTime").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Last edit timestamp (null if never edited) */
  editedAt: timestamp("editedAt"),
  /**
   * Granskning: matcher sparade utan inloggning är "pending" tills styrelsen
   * godkänner ("approved") eller avvisar ("rejected"). Bara godkända räknas i statistiken.
   */
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("approved").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  /**
   * Val i matchrapporten: Stars of the Game (1:a–3:e, spelar-ID eller namn) och
   * matchens sponsor ("presenteras av"). Null = räknas fram automatiskt.
   */
  report: json("report").$type<{ stars?: string[]; sponsor?: string | null; showStats?: boolean[]; title?: string | null }>(),
}, (t) => [
  index("match_results_review_idx").on(t.reviewStatus),
  index("match_results_end_idx").on(t.matchEndTime),
]);

export type MatchRow = typeof matchResults.$inferSelect;
export type InsertMatchResult = typeof matchResults.$inferInsert;

// ─── Spelarregister ──────────────────────────────────────────────────────────
// En rad per person. Fast ID som aldrig ändras – namn, nummer, position och lag
// kan ändras utan att historiken tappas. Uppställningen innehåller kopior av
// spelarna; registret är källan för spelardata och hålls i synk av servern.

export const players = mysqlTable("players", {
  /** Fast ID (samma som i uppställningen och matchernas uppställningar). */
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  number: varchar("number", { length: 10 }).default("").notNull(),
  /** MV, B, F, C, IB */
  position: varchar("position", { length: 4 }).default("F").notNull(),
  /** white | green | null */
  teamColor: varchar("teamColor", { length: 10 }),
  /** C | A | null */
  captainRole: varchar("captainRole", { length: 2 }),
  /** Finns i klubbens medlemsregister. Spelare som inte gör det flaggas men finns kvar. */
  isMember: boolean("isMember").default(true).notNull(),
  /** Aktiv = ingår i truppen i Lineup. Inaktiva finns kvar för historiken. */
  active: boolean("active").default(true).notNull(),
  /** Namnet som det står i laget.se (om det skiljer sig), för anmälningsmatchning. */
  lagetName: varchar("lagetName", { length: 150 }),
  /** ID i ett externt medlemsregister (förberett för framtida synk). */
  externalId: varchar("externalId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerRow = typeof players.$inferSelect;
export type InsertPlayerRow = typeof players.$inferInsert;

// ─── Matchdeltagare och mål ──────────────────────────────────────────────────
// En rad per spelare som stod i uppställningen i en match, och en rad per mål.
// Allt pekar på spelarens fasta ID – namn och nummer hämtas från `players`.

export const matchPlayers = mysqlTable("match_players", {
  id: int("id").autoincrement().primaryKey(),
  matchId: int("matchId").notNull(),
  playerId: varchar("playerId", { length: 64 }).notNull(),
  team: mysqlEnum("team", ["white", "green"]).notNull(),
  /** Platsen i uppställningen, t.ex. "team-a-fwd-1-c". */
  slot: varchar("slot", { length: 40 }).notNull(),
  /** MV, B, C eller F (härlett från platsen). */
  position: varchar("position", { length: 4 }).notNull(),
}, (t) => [
  index("match_players_match_idx").on(t.matchId),
  index("match_players_player_idx").on(t.playerId),
]);

export const matchGoals = mysqlTable("match_goals", {
  id: int("id").autoincrement().primaryKey(),
  matchId: int("matchId").notNull(),
  /** Ordning i matchen (0 = senaste målet, samma ordning som Score Tracker visar). */
  seq: int("seq").notNull(),
  team: mysqlEnum("team", ["white", "green"]).notNull(),
  scorerId: varchar("scorerId", { length: 64 }),
  assistId: varchar("assistId", { length: 64 }),
  /** Fritext för gästspelare som inte finns i registret. */
  scorerName: varchar("scorerName", { length: 120 }),
  assistName: varchar("assistName", { length: 120 }),
  /** Måltyp, t.ex. "Straff", "Självmål". */
  goalType: varchar("goalType", { length: 60 }),
  sponsor: varchar("sponsor", { length: 120 }),
  /** Klockslag när målet registrerades (HH:MM:SS). */
  time: varchar("time", { length: 20 }).notNull().default(""),
}, (t) => [
  index("match_goals_match_idx").on(t.matchId),
  index("match_goals_scorer_idx").on(t.scorerId),
  index("match_goals_assist_idx").on(t.assistId),
]);

/**
 * Matchen som resten av appen läser den: uppställning och mål sammanställda
 * från `match_players`/`match_goals` med spelarnas nuvarande namn från
 * `players` (se server/matchStore.ts).
 */
export type MatchResult = MatchRow & {
  lineup: {
    teamAName: string;
    teamBName: string;
    lineup: Record<string, { id: string; name: string; number: string; position: string }>;
  } | null;
  goalHistory: Array<{
    team: "white" | "green";
    scorer?: string;
    scorerId?: string;
    assist?: string;
    assistId?: string;
    other?: string;
    sponsor?: string;
    timestamp: string;
  }> | null;
};

// ─── Sponsorer ───────────────────────────────────────────────────────────────
// Styrelsen lägger till sponsorer med namn och (valfritt) logga. Loggan sparas
// som PNG (data-URL) i databasen så att den följer med i backupen.

export const sponsors = mysqlTable("sponsors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  /** PNG som data-URL, redan beskuren och skalad. Null = bara text. */
  logo: mediumtext("logo"),
  /** Inaktiva visas inte och väljs inte, men finns kvar i statistiken. */
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SponsorRow = typeof sponsors.$inferSelect;

/**
 * En rad per nyhet ("Dagens lag") som skapats med en matchsponsor.
 * Målsponsorer räknas direkt från match_goals.
 */
export const sponsorNews = mysqlTable("sponsor_news", {
  id: int("id").autoincrement().primaryKey(),
  sponsorId: int("sponsorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("sponsor_news_sponsor_idx").on(t.sponsorId),
  index("sponsor_news_created_idx").on(t.createdAt),
]);

// ─── Spelarbilder ────────────────────────────────────────────────────────────
// Liten profilbild per spelare (kvadratisk JPEG, redan förminskad i webbläsaren).
// Egen tabell så att spelarlistan aldrig laddar bilderna; de hämtas bara när
// spelarkortet öppnas (GET /api/players/:id/photo).

export const playerPhotos = mysqlTable("player_photos", {
  playerId: varchar("playerId", { length: 64 }).primaryKey(),
  /** JPEG som base64 (utan data:-prefix). */
  image: mediumtext("image").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
