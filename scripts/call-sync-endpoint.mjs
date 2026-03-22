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
  
  // 2. Parse players
  const benchPlayers = [];
  const lineup = {};
  
  if (fbData.availablePlayers) {
    const playersArr = Array.isArray(fbData.availablePlayers)
      ? fbData.availablePlayers
      : Object.values(fbData.availablePlayers);
    for (const p of playersArr) {
      if (p) benchPlayers.push(p);
    }
  }
  
  if (fbData.lineup) {
    for (const [slotId, player] of Object.entries(fbData.lineup)) {
      if (player) lineup[slotId] = player;
    }
  }
  
  const teamAName = fbData.teamAName || "VITA";
  const teamBName = fbData.teamBName || "GRÖNA";
  const teamAConfig = fbData.teamAConfig || null;
  const teamBConfig = fbData.teamBConfig || null;
  
  console.log(`   Bench players: ${benchPlayers.length}`);
  console.log(`   Placed players: ${Object.keys(lineup).length}`);
  console.log(`   Teams: ${teamAName} vs ${teamBName}`);
  
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
      lineup,
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
  } else {
    console.error("❌ Sync failed:", result);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
