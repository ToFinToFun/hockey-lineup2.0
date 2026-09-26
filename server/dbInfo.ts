/**
 * Översikt över databasen som appen faktiskt använder (för styrelsen).
 * Gör det lätt att kontrollera att ett externt verktyg är anslutet till
 * samma databas, och visar tabeller som appen inte använder.
 */
import { getDb } from "./db";
import { getLineupSnapshot } from "./lineupSync";
import { getAllMatchesIncludingUnreviewed } from "./scoreDb";

/** Tabeller som appen använder, och vad de innehåller. */
const APP_TABLES: Record<string, string> = {
  lineup_state: "Aktuell uppställning och trupp (en rad, spelarna som JSON)",
  saved_lineups: "Sparade uppställningar och delningslänkar",
  match_results: "Matcher från Score Tracker (mål, uppställning, granskning)",
  app_config: "Inställningar (säsong, PIR-vikter, justeringar, länkar)",
  __drizzle_migrations: "Migreringslogg (databasens version)",
};

export async function getDatabaseInfo() {
  const db = await getDb();
  if (!db) return null;
  const q = async <T>(sql: string) => ((await db.execute(sql)) as unknown as [T[]])[0];

  const [meta] = await q<{ db: string; host: string; version: string }>(
    "SELECT DATABASE() AS db, @@hostname AS host, VERSION() AS version"
  );
  const tables = await q<{ name: string }>(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
  );
  const tableInfo = [];
  for (const { name } of tables) {
    const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${name.replace(/`/g, "")}\``);
    tableInfo.push({ name, rows: Number(n), usedByApp: name in APP_TABLES, purpose: APP_TABLES[name] ?? "Används inte av appen" });
  }

  const { doc, version } = await getLineupSnapshot();
  const matches = await getAllMatchesIncludingUnreviewed();

  return {
    database: meta.db,
    host: meta.host,
    mysqlVersion: meta.version,
    tables: tableInfo,
    lineup: {
      version,
      inRoster: doc.players.length,
      placed: Object.keys(doc.lineup).length,
      total: doc.players.length + Object.keys(doc.lineup).length,
      registered: [...doc.players, ...Object.values(doc.lineup)].filter((p) => p.isRegistered).length,
    },
    matches: {
      total: matches.length,
      approved: matches.filter((m) => m.reviewStatus === "approved").length,
      pending: matches.filter((m) => m.reviewStatus === "pending").length,
      rejected: matches.filter((m) => m.reviewStatus === "rejected").length,
    },
  };
}
