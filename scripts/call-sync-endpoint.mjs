#!/usr/bin/env node
/**
 * Fetches data from Firebase and sends it to the app's /api/sync-firebase endpoint.
 * Usage: node scripts/call-sync-endpoint.mjs [target_url]
 * Default target: https://stalstadens.jlco.app
 */

const FIREBASE_URL = "https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app/.json";
const SYNC_SECRET = "stalstaden-sync-2026";
const TARGET = process.argv[2] || "https://stalstadens.jlco.app";

async function main() {
  console.log("=== Firebase → App Sync ===");
  
  // 1. Fetch Firebase data
  console.log("1. Fetching Firebase data...");
  const fbRes = await fetch(FIREBASE_URL);
  if (!fbRes.ok) throw new Error(`Firebase fetch failed: ${fbRes.status}`);
  const fbData = await fbRes.json();
  
  // 2. Parse players - Firebase structure: data.lineup.players + data.lineup.lineup
  const lineupRoot = fbData.lineup || {};
  
  // Bench players are in lineup.players (array)
  let benchPlayers = [];
  const rawPlayers = lineupRoot.players;
  if (Array.isArray(rawPlayers)) {
    benchPlayers = rawPlayers.filter(p => p != null);
  } else if (rawPlayers && typeof rawPlayers === 'object') {
    benchPlayers = Object.values(rawPlayers).filter(p => p != null);
  }
  
  // Placed players are in lineup.lineup (object: slotId -> player)
  const placedLineup = {};
  const rawLineup = lineupRoot.lineup;
  if (rawLineup && typeof rawLineup === 'object') {
    for (const [slotId, player] of Object.entries(rawLineup)) {
      if (player) placedLineup[slotId] = player;
    }
  }
  
  const teamAName = lineupRoot.teamAName || "VITA";
  const teamBName = lineupRoot.teamBName || "GRÖNA";
  const teamAConfig = lineupRoot.teamAConfig || null;
  const teamBConfig = lineupRoot.teamBConfig || null;
  
  console.log(`   Bench players: ${benchPlayers.length}`);
  console.log(`   Placed players: ${Object.keys(placedLineup).length}`);
  console.log(`   Teams: ${teamAName} vs ${teamBName}`);
  console.log(`   Config A: ${JSON.stringify(teamAConfig)}`);
  console.log(`   Config B: ${JSON.stringify(teamBConfig)}`);
  
  // Show sample players with their teamColor
  for (const p of benchPlayers.slice(0, 5)) {
    console.log(`     ${p.name} #${p.number || '?'} team=${p.teamColor || 'none'} pos=${p.position || '?'}`);
  }
  
  // 3. Parse saved lineups
  const savedLineups = [];
  if (fbData.savedLineups) {
    for (const [key, sl] of Object.entries(fbData.savedLineups)) {
      if (!sl) continue;
      savedLineups.push({
        name: sl.name || key,
        teamAName: sl.teamAName || "VITA",
        teamBName: sl.teamBName || "GRÖNA",
        lineup: sl.lineup || {},
      });
    }
  }
  console.log(`   Saved lineups: ${savedLineups.length}`);
  
  // 4. Send to app
  console.log(`\n2. Sending to ${TARGET}/api/sync-firebase ...`);
  const syncRes = await fetch(`${TARGET}/api/sync-firebase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": SYNC_SECRET,
    },
    body: JSON.stringify({
      players: benchPlayers,
      lineup: placedLineup,
      teamAName,
      teamBName,
      teamAConfig,
      teamBConfig,
      savedLineups,
    }),
  });
  
  const result = await syncRes.json();
  if (syncRes.ok && result.success) {
    console.log("✅ Sync successful!");
    console.log(`   Total players synced: ${benchPlayers.length} bench + ${Object.keys(placedLineup).length} placed`);
  } else {
    console.error("❌ Sync failed:", result);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
