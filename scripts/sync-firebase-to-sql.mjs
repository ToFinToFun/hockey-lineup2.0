#!/usr/bin/env node
/**
 * sync-firebase-to-sql.mjs
 * 
 * Fetches the current state from Firebase Realtime Database and writes it
 * directly to the SQL database (lineup_state + saved_lineups).
 * 
 * Usage:
 *   DATABASE_URL="mysql://..." node scripts/sync-firebase-to-sql.mjs
 *   
 *   Or with DRY_RUN=1 to just preview what would be written:
 *   DRY_RUN=1 node scripts/sync-firebase-to-sql.mjs
 */

import mysql from "mysql2/promise";

const FIREBASE_URL = "https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app";
const DRY_RUN = process.env.DRY_RUN === "1";

async function fetchFirebase(path) {
  const url = `${FIREBASE_URL}${path}.json`;
  console.log(`  Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firebase fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function generateShareId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function main() {
  console.log("=== Firebase → SQL Sync ===");
  console.log(DRY_RUN ? "  *** DRY RUN MODE ***\n" : "");

  // 1. Fetch all Firebase data
  console.log("1. Fetching Firebase data...");
  const data = await fetchFirebase("/");
  
  const firebaseLineup = data.lineup || {};
  const firebaseSaved = data.savedLineups || {};

  // 2. Parse Firebase lineup state
  console.log("\n2. Parsing Firebase lineup state...");
  
  // Firebase stores bench players as a sparse array under "players"
  const firebasePlayers = firebaseLineup.players || [];
  // Convert sparse array/object to clean array
  let playersArray;
  if (Array.isArray(firebasePlayers)) {
    playersArray = firebasePlayers.filter(p => p !== null && p !== undefined);
  } else {
    playersArray = Object.values(firebasePlayers);
  }
  
  // Firebase lineup slots (placed players)
  const firebaseLineupSlots = firebaseLineup.lineup || {};
  
  const teamAName = firebaseLineup.teamAName || "VITA";
  const teamBName = firebaseLineup.teamBName || "GRÖNA";
  const teamAConfig = firebaseLineup.teamAConfig || null;
  const teamBConfig = firebaseLineup.teamBConfig || null;

  console.log(`  Bench players: ${playersArray.length}`);
  console.log(`  Placed players (lineup slots): ${Object.keys(firebaseLineupSlots).length}`);
  console.log(`  Teams: ${teamAName} vs ${teamBName}`);
  console.log(`  Config A: ${JSON.stringify(teamAConfig)}`);
  console.log(`  Config B: ${JSON.stringify(teamBConfig)}`);
  
  // Show some player details
  console.log("\n  Sample bench players:");
  playersArray.slice(0, 5).forEach(p => {
    console.log(`    ${p.name} (#${p.number || '?'}) - ${p.position} - team: ${p.teamColor || 'none'} - registered: ${p.isRegistered}`);
  });
  
  console.log("\n  Placed players:");
  Object.entries(firebaseLineupSlots).forEach(([slot, p]) => {
    console.log(`    ${slot}: ${p.name} (#${p.number || '?'}) - ${p.position} - team: ${p.teamColor || 'none'}`);
  });

  // 3. Parse saved lineups from Firebase
  console.log("\n3. Parsing Firebase saved lineups...");
  const savedEntries = Object.entries(firebaseSaved);
  console.log(`  Found ${savedEntries.length} saved lineups:`);
  savedEntries.forEach(([key, sl]) => {
    const slotCount = sl.lineup ? Object.keys(sl.lineup).length : 0;
    console.log(`    ${key}: "${sl.name}" - ${slotCount} slots - saved: ${new Date(sl.savedAt).toLocaleString()}`);
  });

  if (DRY_RUN) {
    console.log("\n=== DRY RUN COMPLETE - No changes made ===");
    return;
  }

  // 4. Connect to database
  console.log("\n4. Connecting to database...");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable not set!");
    process.exit(1);
  }
  
  const connection = await mysql.createConnection(dbUrl);
  console.log("  Connected!");

  try {
    // 5. Update lineup_state (single row, id=1)
    console.log("\n5. Updating lineup_state...");
    
    // Check if row exists
    const [rows] = await connection.execute("SELECT id, version FROM lineup_state WHERE id = 1");
    const currentVersion = rows.length > 0 ? Number(rows[0].version) : 0;
    const newVersion = currentVersion + 1;
    
    if (rows.length > 0) {
      await connection.execute(
        `UPDATE lineup_state SET 
          players = ?, 
          lineup = ?, 
          teamAName = ?, 
          teamBName = ?, 
          teamAConfig = ?, 
          teamBConfig = ?,
          version = ?
        WHERE id = 1`,
        [
          JSON.stringify(playersArray),
          JSON.stringify(firebaseLineupSlots),
          teamAName,
          teamBName,
          teamAConfig ? JSON.stringify(teamAConfig) : null,
          teamBConfig ? JSON.stringify(teamBConfig) : null,
          newVersion,
        ]
      );
      console.log(`  Updated existing row (version ${currentVersion} → ${newVersion})`);
    } else {
      await connection.execute(
        `INSERT INTO lineup_state (players, lineup, teamAName, teamBName, teamAConfig, teamBConfig, version) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          JSON.stringify(playersArray),
          JSON.stringify(firebaseLineupSlots),
          teamAName,
          teamBName,
          teamAConfig ? JSON.stringify(teamAConfig) : null,
          teamBConfig ? JSON.stringify(teamBConfig) : null,
          1,
        ]
      );
      console.log("  Inserted new row");
    }

    // 6. Sync saved lineups (replace test data with real Firebase data)
    console.log("\n6. Syncing saved lineups...");
    
    // Delete test data (names containing "Test" or "Lookup" or "Favorite Test")
    const [deleteResult] = await connection.execute(
      "DELETE FROM saved_lineups WHERE name LIKE '%Test%' OR name LIKE '%Lookup%'"
    );
    console.log(`  Deleted ${deleteResult.affectedRows} test entries`);
    
    // Check which Firebase lineups already exist (by name)
    const [existingSaved] = await connection.execute("SELECT name FROM saved_lineups");
    const existingNames = new Set(existingSaved.map(r => r.name));
    
    let inserted = 0;
    let skipped = 0;
    for (const [fbKey, sl] of savedEntries) {
      if (existingNames.has(sl.name)) {
        console.log(`  Skipping "${sl.name}" (already exists)`);
        skipped++;
        continue;
      }
      
      // Build the saved lineup data
      const lineupData = sl.lineup || {};
      const savedAt = sl.savedAt || Date.now();
      const shareId = generateShareId();
      const slTeamAName = sl.teamAName || "VITA";
      const slTeamBName = sl.teamBName || "GRÖNA";
      const favorite = sl.favorite || false;
      
      await connection.execute(
        `INSERT INTO saved_lineups (shareId, name, teamAName, teamBName, lineup, favorite, savedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shareId, sl.name, slTeamAName, slTeamBName, JSON.stringify(lineupData), favorite ? 1 : 0, savedAt]
      );
      console.log(`  Inserted "${sl.name}" (${Object.keys(lineupData).length} slots)`);
      inserted++;
    }
    console.log(`  Summary: ${inserted} inserted, ${skipped} skipped`);

    // 7. Verify
    console.log("\n7. Verifying...");
    const [verifyState] = await connection.execute(
      "SELECT JSON_LENGTH(players) as num_players, JSON_LENGTH(lineup) as num_in_lineup, teamAName, teamBName, version FROM lineup_state WHERE id = 1"
    );
    console.log(`  lineup_state: ${verifyState[0].num_players} players, ${verifyState[0].num_in_lineup} in lineup, version ${verifyState[0].version}`);
    
    const [verifySaved] = await connection.execute("SELECT COUNT(*) as cnt FROM saved_lineups");
    console.log(`  saved_lineups: ${verifySaved[0].cnt} entries`);

    console.log("\n=== SYNC COMPLETE ===");
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
