import { drizzle } from "drizzle-orm/mysql2";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Kontrollsumma för en tabell. Används för att upptäcka ändringar som görs
 * direkt i databasen (utanför appen), så att appens minne inte blir inaktuellt.
 */
export async function tableChecksum(table: "lineup_state" | "match_results"): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [rows] = (await db.execute(`CHECKSUM TABLE \`${table}\``)) as unknown as [Array<{ Checksum: number | string | null }>];
    return String(rows?.[0]?.Checksum ?? "");
  } catch {
    return null;
  }
}
