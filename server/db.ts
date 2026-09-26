import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

type Db = ReturnType<typeof makeDb>;
const makeDb = (pool: mysql.Pool) => drizzle({ client: pool });

let _db: Db | null = null;
let _connecting: Promise<Db | null> | null = null;

/**
 * Anslutningsinställningar från DATABASE_URL.
 *
 * Kryptering (TLS) styrs av DATABASE_SSL:
 * - "auto" (standard): okrypterat, men kräver servern kryptering
 *   (require_secure_transport) ansluter vi krypterat i stället.
 * - "on": alltid krypterat.  - "off": aldrig krypterat.
 * Certifikatet kontrolleras bara om DATABASE_SSL_CA pekar på en CA-fil
 * (Coolifys databascertifikat är självsignerade).
 */
export function mysqlOptions(url: string, useTls: boolean): mysql.PoolOptions {
  const options: mysql.PoolOptions = { uri: url, connectionLimit: 10, enableKeepAlive: true };
  if (useTls) {
    const caPath = process.env.DATABASE_SSL_CA;
    options.ssl = caPath ? { ca: readFileSync(caPath, "utf-8") } : { rejectUnauthorized: false };
  }
  return options;
}

function isSecureTransportError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "ER_SECURE_TRANSPORT_REQUIRED" || /secure transport/i.test(e?.message ?? "");
}

async function connect(url: string): Promise<Db> {
  const mode = (process.env.DATABASE_SSL ?? "auto").toLowerCase();
  const tryConnect = async (useTls: boolean) => {
    const pool = mysql.createPool(mysqlOptions(url, useTls));
    try {
      await pool.query("SELECT 1");
      return pool;
    } catch (err) {
      await pool.end().catch(() => {});
      throw err;
    }
  };
  let pool: mysql.Pool;
  if (mode === "on" || mode === "true" || mode === "require") {
    pool = await tryConnect(true);
  } else {
    try {
      pool = await tryConnect(false);
    } catch (err) {
      if (mode === "off" || !isSecureTransportError(err)) throw err;
      console.log("[Database] Servern kräver kryptering – ansluter med TLS");
      pool = await tryConnect(true);
    }
  }
  return makeDb(pool);
}

// Skapas vid första användning så att lokala verktyg kan köras utan databas.
export async function getDb() {
  if (_db || !process.env.DATABASE_URL) return _db;
  _connecting ??= connect(process.env.DATABASE_URL)
    .then((db) => (_db = db))
    .catch((error) => {
      console.warn("[Database] Kunde inte ansluta:", (error as Error).message);
      return null;
    })
    .finally(() => {
      _connecting = null;
    });
  return _connecting;
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
