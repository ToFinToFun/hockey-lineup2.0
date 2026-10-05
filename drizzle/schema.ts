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
  /** Matchtyp: intern eller mot motståndare (shared/matchSetup.ts). Null = intern. */
  matchSetup: json("matchSetup"),
  /** Senast en spelare placerades/flyttades/togs ur laget eller lades till i truppen (visas som "Ändrad …") */
  lineupChangedAt: timestamp("lineupChangedAt"),
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
  /** Utsatt matchlängd i minuter (träningens längd på laget.se, eller satt i efterhand) – används för speltid */
  plannedMinutes: int("plannedMinutes"),
  /** Match mot ett annat lag (opponents.id); null = internmatch */
  opponentId: int("opponentId"),
  /** Plats från träningen på laget.se när matchen sparades, t.ex. "Coop Arena C-Hallen" */
  location: varchar("location", { length: 120 }),
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
  /** Alternativ position (hybridspelare): MV, B, C eller F */
  altPosition: varchar("altPosition", { length: 4 }),
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
  /** "lineup" = nyhet med laguppställning, "media" = video i Media */
  kind: varchar("kind", { length: 16 }).default("lineup").notNull(),
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

// ─── Hockeykort ──────────────────────────────────────────────────────────────
// Max ett sparat kort per spelare: originalfotot (utan ram) och valen, så att
// kortet kan byggas om med ny statistik eller annan stil.

export const playerCards = mysqlTable("player_cards", {
  playerId: varchar("playerId", { length: 64 }).primaryKey(),
  /** Originalfotot som JPEG (base64, utan data:-prefix), förminskat till max ~1200 px. */
  source: mediumtext("source").notNull(),
  /** Stil, beskärning, bildjusteringar, texter och statistikval. */
  settings: json("settings").$type<Record<string, unknown>>().notNull(),
  /** Friläggningsmask (gråskala-PNG, base64): vitt = spelaren, svart = bakgrund. Null = ingen friläggning. */
  mask: mediumtext("mask"),
  /** Kortet används som profilbild och ritas om automatiskt när statistiken ändras */
  liveProfile: boolean("liveProfile").default(false).notNull(),
  /** Fingeravtryck av det senast ritade profilkortet – oförändrat = inget att göra */
  renderedHash: varchar("renderedHash", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Media (egna Instagram-inlägg) ───────────────────────────────────────────
// Sparade utkast: mall, val och bildtext – så att de kan öppnas och ändras igen.

export const mediaPosts = mysqlTable("media_posts", {
  id: int("id").autoincrement().primaryKey(),
  /** "lineup" (ett lags uppställning) eller "text" (rubrik, text, egen bild) */
  type: varchar("type", { length: 20 }).notNull(),
  /** Namn i listan över sparade inlägg */
  title: varchar("title", { length: 120 }).notNull(),
  settings: json("settings").$type<Record<string, unknown>>().notNull(),
  caption: text("caption"),
  /** Egen bakgrundsbild (JPEG, base64) – valfri */
  photo: mediumtext("photo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Klubbens loggor (uppladdade – går före klubbprofilens filer) ─────────────

export const clubAssets = mysqlTable("club_assets", {
  /** "club", "white", "green" eller "crest" */
  key: varchar("key", { length: 20 }).primaryKey(),
  /** Bilden som base64 (PNG eller JPEG) */
  image: mediumtext("image").notNull(),
  mime: varchar("mime", { length: 30 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Motståndare (matcher mot andra lag – steg 3 i docs/PLAN-lag-och-motstandare.md) ─

export const opponents = mysqlTable("opponents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  /** Kortnamn, t.ex. "KHC" */
  shortName: varchar("shortName", { length: 10 }),
  /** Lagfärg (#rrggbb) för bilder och Score Tracker */
  color: varchar("color", { length: 7 }).notNull().default("#ef4444"),
  /** Logga (PNG/JPEG base64) – valfri */
  logo: mediumtext("logo"),
  logoMime: varchar("logoMime", { length: 30 }),
  archived: boolean("archived").notNull().default(false),
  /** Lagets egen uppställning (plats → opponent_players.id) – fylls i via länken eller i Lineup */
  lineup: json("lineup").$type<Record<string, number>>(),
  /** Laget som lista utan platser (opponent_players.id) – null = platser */
  lineupList: json("lineupList").$type<number[] | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const opponentPlayers = mysqlTable("opponent_players", {
  id: int("id").autoincrement().primaryKey(),
  opponentId: int("opponentId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  number: varchar("number", { length: 4 }),
  /** MV, B, C, F (samma koder som vårt register) */
  position: varchar("position", { length: 4 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [index("opponent_players_opponent_idx").on(t.opponentId)]);
