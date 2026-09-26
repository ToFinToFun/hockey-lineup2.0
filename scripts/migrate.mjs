/**
 * Databasmigrering vid uppstart.
 *
 * 1. Skapar databasen om den saknas.
 * 2. Äldre databas utan migreringslogg (t.ex. sammanslagen av Manus): jämför
 *    tabeller och kolumner mot migreringarnas ögonblicksbilder och markerar de
 *    migreringar som redan motsvaras i databasen som körda ("baseline").
 * 3. Kör återstående migreringar.
 *
 * Avslutar med felkod om något går fel, så att en trasig version aldrig startar
 * (Coolify behåller då den gamla containern).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { runDataMigrations } from "./dataMigrations.mjs";

const MIGRATIONS = path.resolve(process.cwd(), "drizzle");
const MIGRATIONS_TABLE = "__drizzle_migrations";

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

// Kryptering (TLS): samma regler som servern (se server/db.ts, DATABASE_SSL).
const SSL_MODE = (process.env.DATABASE_SSL ?? "auto").toLowerCase();
let useTls = SSL_MODE === "on" || SSL_MODE === "true" || SSL_MODE === "require";

function tlsOptions() {
  const caPath = process.env.DATABASE_SSL_CA;
  return caPath ? { ca: readFileSync(caPath, "utf-8") } : { rejectUnauthorized: false };
}

function isSecureTransportError(err) {
  return err?.code === "ER_SECURE_TRANSPORT_REQUIRED" || /secure transport/i.test(err?.message ?? "");
}

/** Ansluter; kräver servern kryptering byts till TLS automatiskt. */
async function connectTo(url) {
  try {
    return await mysql.createConnection(useTls ? { uri: url, ssl: tlsOptions() } : { uri: url });
  } catch (err) {
    if (useTls || SSL_MODE === "off" || !isSecureTransportError(err)) throw err;
    log("Servern kräver kryptering – ansluter med TLS.");
    useTls = true;
    return mysql.createConnection({ uri: url, ssl: tlsOptions() });
  }
}

async function ensureDatabase(url) {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!dbName) return;
  u.pathname = "/";
  try {
    const conn = await connectTo(u.toString());
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, "")}\``);
    await conn.end();
  } catch (err) {
    // Saknar rättighet att skapa databaser – den finns troligen redan.
    log(`Kunde inte skapa databasen (${err.code ?? err.message}), fortsätter.`);
  }
}

function loadJournal() {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf-8"));
  return journal.entries.map((e) => {
    const sql = readFileSync(path.join(MIGRATIONS, `${e.tag}.sql`), "utf-8");
    const snapshot = JSON.parse(
      readFileSync(path.join(MIGRATIONS, "meta", `${String(e.idx).padStart(4, "0")}_snapshot.json`), "utf-8")
    );
    return { ...e, hash: createHash("sha256").update(sql).digest("hex"), snapshot };
  });
}

async function currentSchema(conn) {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
  );
  const schema = new Map();
  for (const { t, c } of rows) {
    if (!schema.has(t)) schema.set(t, new Set());
    schema.get(t).add(c);
  }
  return schema;
}

/** Stämmer databasen med ögonblicksbilden (alla tabeller och kolumner finns)? */
function matchesSnapshot(schema, snapshot) {
  const missing = [];
  for (const [table, def] of Object.entries(snapshot.tables)) {
    const cols = schema.get(table);
    if (!cols) {
      missing.push(table);
      continue;
    }
    for (const col of Object.keys(def.columns)) {
      if (!cols.has(col)) missing.push(`${table}.${col}`);
    }
  }
  return missing;
}

async function baselineIfNeeded(conn, entries) {
  const schema = await currentSchema(conn);
  const hasLog = schema.has(MIGRATIONS_TABLE);
  if (hasLog) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${MIGRATIONS_TABLE}\``);
    if (n > 0) return; // normalfallet
  }
  const appTables = [...schema.keys()].filter((t) => t !== MIGRATIONS_TABLE);
  if (appTables.length === 0) {
    log("Tom databas – alla migreringar körs från början.");
    return;
  }

  // Äldre databas: hitta den senaste migrering som databasen redan motsvarar.
  let applied = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (matchesSnapshot(schema, entries[i].snapshot).length === 0) {
      applied = i;
      break;
    }
  }
  if (applied < 0) {
    const missing = matchesSnapshot(schema, entries[0].snapshot);
    throw new Error(
      `Databasen har tabeller men matchar ingen känd migrering. Saknas: ${missing.join(", ")}`
    );
  }

  log(`Äldre databas utan migreringslogg. Markerar ${entries.slice(0, applied + 1).map((e) => e.tag).join(", ")} som redan körda.`);
  await conn.query(
    `CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)`
  );
  for (const e of entries.slice(0, applied + 1)) {
    await conn.query(`INSERT INTO \`${MIGRATIONS_TABLE}\` (hash, created_at) VALUES (?, ?)`, [e.hash, e.when]);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL saknas");

  await ensureDatabase(url);
  const conn = await connectTo(url);
  try {
    const entries = loadJournal();
    await baselineIfNeeded(conn, entries);
    await migrate(drizzle(conn), { migrationsFolder: MIGRATIONS, migrationsTable: MIGRATIONS_TABLE });
    await runDataMigrations(conn, log);
    const [[last]] = await conn.query(
      `SELECT created_at FROM \`${MIGRATIONS_TABLE}\` ORDER BY created_at DESC LIMIT 1`
    );
    const current = entries.find((e) => e.when === Number(last?.created_at));
    log(`Klart. Databasen är på ${current?.tag ?? "okänd nivå"}.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] MISSLYCKADES: ${err.message}`);
  process.exit(1);
});
