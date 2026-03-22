#!/usr/bin/env node
/**
 * import-railway-data.mjs
 * 
 * One-time migration script to import all data from the Railway MySQL database
 * (match results site) into our unified database.
 * 
 * This script reads from the Railway database and writes to our target database.
 * Run this on migration day to get the freshest data.
 * 
 * Usage:
 *   # Dry run (preview what will be imported, no writes)
 *   RAILWAY_DB_URL="mysql://root:xxx@turntable.proxy.rlwy.net:10780/railway" \
 *   DATABASE_URL="mysql://user:pass@host:port/db" \
 *   DRY_RUN=1 \
 *   node scripts/import-railway-data.mjs
 * 
 *   # Actual import
 *   RAILWAY_DB_URL="mysql://root:xxx@turntable.proxy.rlwy.net:10780/railway" \
 *   DATABASE_URL="mysql://user:pass@host:port/db" \
 *   node scripts/import-railway-data.mjs
 * 
 * Environment variables:
 *   RAILWAY_DB_URL  - Connection string for the Railway (source) database
 *   DATABASE_URL    - Connection string for our (target) database
 *   DRY_RUN         - Set to "1" to preview without writing (optional)
 *   CLEAR_EXISTING  - Set to "1" to clear existing data before import (optional)
 */

import mysql from "mysql2/promise";

const RAILWAY_DB_URL = process.env.RAILWAY_DB_URL;
const TARGET_DB_URL = process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === "1";
const CLEAR_EXISTING = process.env.CLEAR_EXISTING === "1";

if (!RAILWAY_DB_URL) {
  console.error("❌ RAILWAY_DB_URL is required");
  console.error("   Example: mysql://root:xxx@turntable.proxy.rlwy.net:10780/railway");
  process.exit(1);
}

if (!TARGET_DB_URL) {
  console.error("❌ DATABASE_URL is required");
  console.error("   Example: mysql://user:pass@host:port/database");
  process.exit(1);
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  Railway → Unified Database Import Script");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Mode:   ${DRY_RUN ? "🔍 DRY RUN (no writes)" : "🚀 LIVE IMPORT"}`);
console.log(`  Clear:  ${CLEAR_EXISTING ? "⚠️  Will clear existing data first" : "Preserve existing data"}`);
console.log(`  Source: Railway DB`);
console.log(`  Target: ${TARGET_DB_URL.replace(/:[^:@]+@/, ":***@")}`);
console.log("═══════════════════════════════════════════════════════════\n");

let sourceConn;
let targetConn;

try {
  // ─── Connect to both databases ─────────────────────────────────────────────
  console.log("📡 Connecting to Railway (source) database...");
  sourceConn = await mysql.createConnection(RAILWAY_DB_URL);
  console.log("   ✅ Connected to Railway\n");

  console.log("📡 Connecting to target database...");
  targetConn = await mysql.createConnection(TARGET_DB_URL);
  console.log("   ✅ Connected to target\n");

  // ─── Verify target tables exist ────────────────────────────────────────────
  console.log("🔍 Verifying target tables exist...");
  const [targetTables] = await targetConn.query("SHOW TABLES");
  const tableNames = targetTables.map(r => Object.values(r)[0]);
  
  const requiredTables = ["app_config", "match_results"];
  for (const t of requiredTables) {
    if (!tableNames.includes(t)) {
      console.error(`   ❌ Table '${t}' not found in target database!`);
      console.error("   Run 'pnpm db:push' first to create the schema.");
      process.exit(1);
    }
    console.log(`   ✅ ${t}`);
  }
  console.log();

  // ─── Read source data ──────────────────────────────────────────────────────
  console.log("📖 Reading data from Railway...\n");

  // app_config
  const [configRows] = await sourceConn.query("SELECT * FROM app_config ORDER BY id");
  console.log(`   app_config: ${configRows.length} rows`);
  for (const row of configRows) {
    console.log(`     - ${row.key} = ${row.value} (updated: ${row.updatedAt})`);
  }
  console.log();

  // match_results
  const [matchRows] = await sourceConn.query("SELECT * FROM match_results ORDER BY id");
  console.log(`   match_results: ${matchRows.length} rows`);
  for (const row of matchRows) {
    const goals = row.goalHistory ? JSON.parse(typeof row.goalHistory === 'string' ? row.goalHistory : JSON.stringify(row.goalHistory)) : [];
    console.log(`     - [${row.id}] ${row.name} (${goals.length} goals, lineup: ${row.lineup ? 'yes' : 'no'})`);
  }
  console.log();

  // users (check if any exist)
  const [userRows] = await sourceConn.query("SELECT * FROM users ORDER BY id");
  console.log(`   users: ${userRows.length} rows`);
  if (userRows.length > 0) {
    for (const row of userRows) {
      console.log(`     - ${row.name || row.openId} (role: ${row.role})`);
    }
  } else {
    console.log("     (empty - skipping)");
  }
  console.log();

  if (DRY_RUN) {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  🔍 DRY RUN COMPLETE — No data was written");
    console.log("  Remove DRY_RUN=1 to perform the actual import.");
    console.log("═══════════════════════════════════════════════════════════");
  } else {
    // ─── Clear existing data if requested ──────────────────────────────────
    if (CLEAR_EXISTING) {
      console.log("🗑️  Clearing existing data in target...");
      await targetConn.query("DELETE FROM match_results");
      await targetConn.query("DELETE FROM app_config");
      console.log("   ✅ Cleared\n");
    }

    // ─── Import app_config ─────────────────────────────────────────────────
    console.log("📥 Importing app_config...");
    let configImported = 0;
    let configSkipped = 0;
    
    for (const row of configRows) {
      try {
        // Use INSERT ... ON DUPLICATE KEY UPDATE to handle re-runs gracefully
        await targetConn.query(
          `INSERT INTO app_config (\`key\`, value, updatedAt) 
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = VALUES(updatedAt)`,
          [row.key, row.value, row.updatedAt]
        );
        configImported++;
        console.log(`   ✅ ${row.key} = ${row.value}`);
      } catch (err) {
        console.error(`   ❌ Failed to import config '${row.key}': ${err.message}`);
        configSkipped++;
      }
    }
    console.log(`   → Imported: ${configImported}, Skipped: ${configSkipped}\n`);

    // ─── Import match_results ──────────────────────────────────────────────
    console.log("📥 Importing match_results...");
    let matchImported = 0;
    let matchSkipped = 0;

    for (const row of matchRows) {
      try {
        // Check if this match already exists (by name + matchEndTime)
        const [existing] = await targetConn.query(
          "SELECT id FROM match_results WHERE name = ? AND matchEndTime = ?",
          [row.name, row.matchEndTime]
        );

        if (existing.length > 0 && !CLEAR_EXISTING) {
          console.log(`   ⏭️  Skipping existing: ${row.name}`);
          matchSkipped++;
          continue;
        }

        // Ensure JSON fields are strings for insertion
        const goalHistoryStr = row.goalHistory 
          ? (typeof row.goalHistory === 'string' ? row.goalHistory : JSON.stringify(row.goalHistory))
          : null;
        const lineupStr = row.lineup
          ? (typeof row.lineup === 'string' ? row.lineup : JSON.stringify(row.lineup))
          : null;

        await targetConn.query(
          `INSERT INTO match_results 
           (name, teamWhiteScore, teamGreenScore, goalHistory, matchStartTime, matchEndTime, createdAt, editedAt, lineup)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.name,
            row.teamWhiteScore,
            row.teamGreenScore,
            goalHistoryStr,
            row.matchStartTime,
            row.matchEndTime,
            row.createdAt,
            row.editedAt,
            lineupStr,
          ]
        );
        matchImported++;
        console.log(`   ✅ ${row.name}`);
      } catch (err) {
        console.error(`   ❌ Failed to import match '${row.name}': ${err.message}`);
        matchSkipped++;
      }
    }
    console.log(`   → Imported: ${matchImported}, Skipped: ${matchSkipped}\n`);

    // ─── Import users (if any) ─────────────────────────────────────────────
    if (userRows.length > 0) {
      console.log("📥 Importing users...");
      let userImported = 0;
      let userSkipped = 0;

      for (const row of userRows) {
        try {
          const [existing] = await targetConn.query(
            "SELECT id FROM users WHERE openId = ?",
            [row.openId]
          );

          if (existing.length > 0) {
            console.log(`   ⏭️  Skipping existing user: ${row.name || row.openId}`);
            userSkipped++;
            continue;
          }

          await targetConn.query(
            `INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.openId, row.name, row.email, row.loginMethod, row.role, row.createdAt, row.updatedAt, row.lastSignedIn]
          );
          userImported++;
          console.log(`   ✅ ${row.name || row.openId}`);
        } catch (err) {
          console.error(`   ❌ Failed to import user '${row.name || row.openId}': ${err.message}`);
          userSkipped++;
        }
      }
      console.log(`   → Imported: ${userImported}, Skipped: ${userSkipped}\n`);
    }

    // ─── Summary ───────────────────────────────────────────────────────────
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ IMPORT COMPLETE");
    console.log(`  app_config:    ${configImported} imported`);
    console.log(`  match_results: ${matchImported} imported, ${matchSkipped} skipped`);
    if (userRows.length > 0) {
      console.log(`  users:         imported`);
    }
    console.log("═══════════════════════════════════════════════════════════");
  }

} catch (err) {
  console.error("\n❌ Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  if (sourceConn) await sourceConn.end();
  if (targetConn) await targetConn.end();
  console.log("\n🔌 Database connections closed.");
}
