#!/usr/bin/env node
/**
 * One-time migration script: Firebase Realtime Database → SQL (MySQL/TiDB)
 *
 * This script reads data from Firebase and inserts it into the SQL database.
 *
 * Usage:
 *   1. Set environment variables:
 *      - DATABASE_URL: MySQL connection string (e.g. mysql://user:pass@host:port/db?ssl=...)
 *      - FIREBASE_DB_URL: Firebase Realtime Database URL
 *        (e.g. https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app)
 *
 *   2. Run:
 *      node scripts/migrate-firebase-to-sql.mjs
 *
 * What it migrates:
 *   - /lineup → lineup_state table (current state: players, lineup, teamNames, configs)
 *   - /savedLineups → saved_lineups table (all saved lineup snapshots)
 *
 * Safety:
 *   - Checks if data already exists in SQL before inserting (won't overwrite)
 *   - Dry-run mode: set DRY_RUN=1 to preview without writing
 *   - Logs every step for auditability
 */

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app";
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("🔍 DRY RUN MODE — no data will be written to SQL\n");
}

// ─── Firebase REST API ──────────────────────────────────────────────────────

async function fetchFirebase(path) {
  const url = `${FIREBASE_DB_URL}${path}.json`;
  console.log(`📡 Fetching Firebase: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Firebase fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data;
}

// ─── SQL Connection ─────────────────────────────────────────────────────────

async function getConnection() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("✅ Connected to SQL database");
  return conn;
}

// ─── Migrate Lineup State ───────────────────────────────────────────────────

async function migrateLineupState(conn) {
  console.log("\n═══ Migrating Lineup State ═══");

  // Check if data already exists
  const [existing] = await conn.execute("SELECT id FROM lineup_state WHERE id = 1");
  if (existing.length > 0) {
    console.log("⚠️  lineup_state already has data (id=1). Skipping to avoid overwrite.");
    console.log("   Delete the row manually if you want to re-migrate.");
    return;
  }

  // Fetch from Firebase
  const firebaseState = await fetchFirebase("/lineup");
  if (!firebaseState) {
    console.log("ℹ️  No lineup state found in Firebase. Skipping.");
    return;
  }

  console.log(`   Found state with ${firebaseState.availablePlayers?.length ?? 0} players`);
  console.log(`   Team A: "${firebaseState.teamAName ?? "VITA"}"`);
  console.log(`   Team B: "${firebaseState.teamBName ?? "GRÖNA"}"`);
  console.log(`   Lineup slots filled: ${Object.keys(firebaseState.lineup ?? {}).length}`);

  if (DRY_RUN) {
    console.log("   [DRY RUN] Would insert into lineup_state");
    return;
  }

  await conn.execute(
    `INSERT INTO lineup_state (id, players, lineup, teamAName, teamBName, teamAConfig, teamBConfig, deletedPlayerIds, version)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      JSON.stringify(firebaseState.availablePlayers ?? []),
      JSON.stringify(firebaseState.lineup ?? {}),
      firebaseState.teamAName ?? "VITA",
      firebaseState.teamBName ?? "GRÖNA",
      JSON.stringify(firebaseState.teamAConfig ?? { goalkeepers: 1, defensePairs: 2, forwardLines: 2 }),
      JSON.stringify(firebaseState.teamBConfig ?? { goalkeepers: 1, defensePairs: 2, forwardLines: 2 }),
      JSON.stringify(firebaseState.deletedPlayerIds ?? []),
    ]
  );

  console.log("✅ Lineup state migrated successfully");
}

// ─── Migrate Saved Lineups ──────────────────────────────────────────────────

async function migrateSavedLineups(conn) {
  console.log("\n═══ Migrating Saved Lineups ═══");

  // Check if data already exists
  const [existing] = await conn.execute("SELECT COUNT(*) as count FROM saved_lineups");
  if (existing[0].count > 0) {
    console.log(`⚠️  saved_lineups already has ${existing[0].count} rows. Skipping to avoid duplicates.`);
    console.log("   Truncate the table manually if you want to re-migrate.");
    return;
  }

  // Fetch from Firebase
  const firebaseLineups = await fetchFirebase("/savedLineups");
  if (!firebaseLineups) {
    console.log("ℹ️  No saved lineups found in Firebase. Skipping.");
    return;
  }

  const entries = Object.entries(firebaseLineups);
  console.log(`   Found ${entries.length} saved lineups in Firebase`);

  let migrated = 0;
  let skipped = 0;

  for (const [firebaseKey, lineup] of entries) {
    const name = lineup.name ?? "Namnlös";
    const teamAName = lineup.teamAName ?? "VITA";
    const teamBName = lineup.teamBName ?? "GRÖNA";
    const lineupData = lineup.lineup ?? {};
    const favorite = lineup.favorite === true;
    const savedAt = lineup.savedAt ?? Date.now();

    // Use the Firebase push-key as shareId (it's already unique)
    // Truncate to 20 chars if needed
    const shareId = firebaseKey.substring(0, 20);

    console.log(`   [${migrated + 1}/${entries.length}] "${name}" (${shareId}) — ${Object.keys(lineupData).length} slots, fav=${favorite}`);

    if (DRY_RUN) {
      migrated++;
      continue;
    }

    try {
      await conn.execute(
        `INSERT INTO saved_lineups (shareId, name, teamAName, teamBName, lineup, favorite, savedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          shareId,
          name,
          teamAName,
          teamBName,
          JSON.stringify(lineupData),
          favorite ? 1 : 0,
          savedAt,
        ]
      );
      migrated++;
    } catch (err) {
      console.error(`   ❌ Failed to migrate "${name}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n✅ Saved lineups: ${migrated} migrated, ${skipped} skipped`);

  if (migrated > 0) {
    console.log("\n⚠️  IMPORTANT: Shared links that used Firebase push-keys as IDs");
    console.log("   will now use the same keys as shareId in the SQL database.");
    console.log("   Old links like /lineup/-NxAbCdEf will still work if the");
    console.log("   Firebase key matches the shareId in the database.");
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Firebase → SQL Migration Script");
  console.log("═══════════════════════════════════\n");
  console.log(`Firebase URL: ${FIREBASE_DB_URL}`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`); // Hide password
  console.log("");

  let conn;
  try {
    conn = await getConnection();

    await migrateLineupState(conn);
    await migrateSavedLineups(conn);

    console.log("\n═══════════════════════════════════");
    console.log("🎉 Migration complete!");
    if (DRY_RUN) {
      console.log("   (This was a dry run — no data was written)");
      console.log("   Remove DRY_RUN=1 to execute for real.");
    }
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
