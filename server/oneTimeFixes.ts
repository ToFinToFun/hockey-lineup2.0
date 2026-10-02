/**
 * Engångsrättningar som körs en gång vid serverstart (flagga i app_config).
 *
 * 2026-09-30: spelare som spelade 29/9 blev oavsiktligt Waivers (se CHANGELOG
 * 2.44.5). Återställ laget för dem som saknar lag till laget de spelade i den
 * matchen. Spelare som redan har ett lag rörs inte. Resultatet sparas i
 * app_config ("fix_team_restore_20260930") och skrivs i serverloggen.
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "./db";
import { matchPlayers, matchResults } from "../drizzle/schema";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { listPlayers, updatePlayers } from "./playersDb";
import { migrateAltPositionsFromConfig } from "./altPositions";

const FLAG = "fix_team_restore_20260930";

export async function restoreTeamsFromMatch(dayStart: Date, dayEnd: Date): Promise<{ matchId: number | null; matchName: string | null; restored: Array<{ id: string; name: string; team: string }> }> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  // Gårdagens match (senast avslutade inom dygnet, även efter midnatt)
  const [match] = await db.select({ id: matchResults.id, name: matchResults.name }).from(matchResults)
    .where(and(gte(matchResults.matchEndTime, dayStart), lt(matchResults.matchEndTime, dayEnd)))
    .orderBy(desc(matchResults.matchEndTime)).limit(1);
  if (!match) return { matchId: null, matchName: null, restored: [] };

  const played = await db.select({ playerId: matchPlayers.playerId, team: matchPlayers.team }).from(matchPlayers).where(eq(matchPlayers.matchId, match.id));
  const registry = new Map((await listPlayers()).map((p) => [p.id, p]));
  const restored: Array<{ id: string; name: string; team: string }> = [];
  const updates: Array<{ id: string; fields: { teamColor: "white" | "green" } }> = [];
  for (const p of played) {
    const row = registry.get(p.playerId);
    if (!row || row.teamColor) continue; // har redan ett lag – rör inte
    updates.push({ id: p.playerId, fields: { teamColor: p.team } });
    restored.push({ id: p.playerId, name: row.name, team: p.team });
  }
  if (updates.length) await updatePlayers(updates);
  return { matchId: match.id, matchName: match.name, restored };
}

export async function runOneTimeFixes() {
  // Alternativa positioner: från inställning till spelarregistret (gör inget om redan flyttat)
  await migrateAltPositionsFromConfig()
    .then((n) => { if (n) console.log(`[engångsrättning] ${n} alternativa positioner flyttade till spelarregistret`); })
    .catch((err) => console.error("[engångsrättning] alternativa positioner:", err));
  try {
    if (await getConfigValue(FLAG)) return;
    // 29/9 kl 06 till 30/9 kl 06 (svensk tid) – träningen var 22:15
    const res = await restoreTeamsFromMatch(new Date(2026, 8, 29, 6, 0), new Date(2026, 8, 30, 6, 0));
    await setConfigValue(FLAG, JSON.stringify({ at: new Date().toISOString(), ...res }));
    console.log(`[engångsrättning] Lag återställda från "${res.matchName ?? "ingen match hittades"}": ${res.restored.map((r) => `${r.name} → ${r.team}`).join(", ") || "inga"}`);
  } catch (err) {
    console.error("[engångsrättning] misslyckades:", err);
  }
}
