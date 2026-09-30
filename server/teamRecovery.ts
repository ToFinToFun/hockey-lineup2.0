/**
 * Återställ spelarnas lag (Vita/Gröna) efter att de oavsiktligt blivit Waivers.
 *
 * Förslag per spelare utan lag, i ordning:
 *  1. Senaste sparade uppställning eller delningslänk där spelaren hade ett lag
 *     (bara äldre sparningar innehåller spelarnas uppgifter – nyare sparar bara id).
 *  2. Annars: laget spelaren spelat i oftast de senaste 10 matcherna (minst 3,
 *     minst 70 %) – en gissning som styrelsen får bekräfta.
 * Inget ändras förrän förslagen godkänts.
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { savedLineups, matchPlayers, matchResults } from "../drizzle/schema";
import { listPlayers, updatePlayers } from "./playersDb";

export interface TeamSuggestion {
  playerId: string;
  name: string;
  teamColor: "white" | "green";
  source: "saved" | "matches";
  detail: string;
}

export async function teamSuggestions(): Promise<TeamSuggestion[]> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const missing = (await listPlayers()).filter((p) => p.active && !p.teamColor);
  if (!missing.length) return [];
  const wanted = new Set(missing.map((p) => p.id));
  const out = new Map<string, TeamSuggestion>();

  // 1. Sparade uppställningar och delningslänkar, nyast först
  const saved = await db.select({ name: savedLineups.name, lineup: savedLineups.lineup, savedAt: savedLineups.savedAt, expiresAt: savedLineups.expiresAt })
    .from(savedLineups).orderBy(desc(savedLineups.savedAt)).limit(500);
  for (const row of saved) {
    for (const p of Object.values((row.lineup ?? {}) as Record<string, { id?: string; teamColor?: string | null }>)) {
      if (!p?.id || !wanted.has(p.id) || out.has(p.id)) continue;
      if (p.teamColor !== "white" && p.teamColor !== "green") continue;
      const when = new Date(row.savedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" });
      const player = missing.find((m) => m.id === p.id)!;
      out.set(p.id, {
        playerId: p.id, name: player.name, teamColor: p.teamColor, source: "saved",
        detail: `${row.expiresAt ? "Delningslänk" : `Sparad uppställning "${row.name}"`} ${when}`,
      });
    }
  }

  // 2. Oftast spelade lag de senaste 10 matcherna
  for (const p of missing) {
    if (out.has(p.id)) continue;
    const rows = await db.select({ team: matchPlayers.team }).from(matchPlayers)
      .innerJoin(matchResults, eq(matchResults.id, matchPlayers.matchId))
      .where(eq(matchPlayers.playerId, p.id))
      .orderBy(desc(matchResults.matchEndTime)).limit(10);
    if (rows.length < 3) continue;
    const white = rows.filter((r) => r.team === "white").length;
    const green = rows.length - white;
    const top = white >= green ? "white" : "green";
    const share = Math.max(white, green) / rows.length;
    if (share < 0.7) continue;
    out.set(p.id, {
      playerId: p.id, name: p.name, teamColor: top, source: "matches",
      detail: `Spelade i ${top === "white" ? "Vita" : "Gröna"} ${Math.max(white, green)} av ${rows.length} senaste matcher`,
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function applyTeams(items: Array<{ playerId: string; teamColor: "white" | "green" }>) {
  await updatePlayers(items.map((i) => ({ id: i.playerId, fields: { teamColor: i.teamColor } })));
  return items.length;
}
