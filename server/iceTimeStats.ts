/**
 * Uppskattad speltid per spelare för en lista matcher (samma regler som i
 * Lineup): total, per position, poäng, och för målvakter insläppta, vinster
 * och hållna nollor. Används av Statistik → Spelare/Målvakter/Hallar och korten.
 */
import { getAllMatchResults } from "./scoreDb";
import { listPlayers } from "./playersDb";
import { iceTimeBySlot, matchMinutes, slotKind, type IcePos } from "../shared/iceTime";
import { isTeamAWhite as teamAIsWhite, normalizeTeamKey } from "../shared/teams";

type MatchRow = Awaited<ReturnType<typeof getAllMatchResults>>[number];

export function iceTimeRows(matches: MatchRow[], registry: Map<string, string>) {
    type Row = { id: string; name: string; matches: number; minutes: number; byPos: Record<IcePos, number>; goals: number; assists: number; gkMatches: number; ga: number; shutouts: number; gkWins: number };
  const rows = new Map<string, Row>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = { id, name: registry.get(id) ?? id, matches: 0, minutes: 0, byPos: { MV: 0, B: 0, C: 0, F: 0 }, goals: 0, assists: 0, gkMatches: 0, ga: 0, shutouts: 0, gkWins: 0 }; rows.set(id, r); }
    return r;
  };
  const bare = (n: string | undefined) => (n ?? "").replace(/\s*#\d*\s*$/, "").trim().toLowerCase();
  for (const m of matches) {
    const slots = ((m.lineup as { lineup?: Record<string, { id?: string; name?: string }> } | null)?.lineup) ?? {};
    // Utsatt längd (träningens längd på laget.se) – annars start till avslut, annars 60 min
    const len = (m as { plannedMinutes?: number | null }).plannedMinutes ?? matchMinutes(m.matchStartTime, m.matchEndTime ?? m.createdAt);
    const byName = new Map<string, string>();
    // Insläppta mål per lag (lag A = vita om lagnamnet säger det, som i övrig statistik)
    const aWhite = teamAIsWhite(((m.lineup as { teamAName?: string } | null)?.teamAName ?? "").toLowerCase());
    let whiteGoals = 0, greenGoals = 0;
    for (const g of (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Array<{ team?: string }>) {
      const k = normalizeTeamKey(g.team);
      if (k === "white") whiteGoals++; else if (k === "green") greenGoals++;
    }
    const against = { a: aWhite ? greenGoals : whiteGoals, b: aWhite ? whiteGoals : greenGoals };
    const scored = { a: aWhite ? whiteGoals : greenGoals, b: aWhite ? greenGoals : whiteGoals };
    for (const team of ["a", "b"] as const) {
      const filled = Object.keys(slots).filter((k) => k.startsWith(`team-${team}-`) && slots[k]?.id);
      const mins = iceTimeBySlot(filled, len);
      for (const slotId of filled) {
        const p = slots[slotId]!;
        if (!p.id || !registry.has(p.id)) continue; // bara våra spelare
        const r = row(p.id);
        const k = slotKind(slotId)!;
        const t = mins.get(slotId) ?? 0;
        r.matches++;
        r.minutes += t;
        r.byPos[k.pos] += t;
        // Målvakt: insläppta mål efter andel av matchen; hållen nolla om ensam i målet utan insläppt
        if (k.pos === "MV") {
          r.gkMatches++;
          if (scored[team] > against[team]) r.gkWins++;
          r.ga += against[team] * (len ? t / len : 1);
          const gkCount = filled.filter((x) => slotKind(x)?.pos === "MV").length;
          if (against[team] === 0 && gkCount === 1) r.shutouts++;
        }
        if (p.name) byName.set(bare(p.name), p.id);
      }
    }
    // Poäng i matchen (id om det finns, annars namnet i uppställningen)
    for (const g of (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Array<{ scorer?: string; assist?: string; scorerId?: string; assistId?: string }>) {
      const sid = g.scorerId ?? byName.get(bare(g.scorer));
      const aid = g.assistId ?? byName.get(bare(g.assist));
      if (sid && rows.has(sid)) rows.get(sid)!.goals++;
      if (aid && rows.has(aid)) rows.get(aid)!.assists++;
    }
  }
  return [...rows.values()].map((r) => {
    const points = r.goals + r.assists;
    return {
      ...r,
      minutes: Math.round(r.minutes),
      byPos: { MV: Math.round(r.byPos.MV), B: Math.round(r.byPos.B), C: Math.round(r.byPos.C), F: Math.round(r.byPos.F) },
      points,
      perMatch: r.matches ? Math.round(r.minutes / r.matches) : 0,
      p60: r.minutes >= 30 ? Math.round((points / r.minutes) * 60 * 100) / 100 : null,
      // Målvakt: insläppta (avrundat), insläppta per 60 min i mål, hållna nollor
      ga: Math.round(r.ga * 10) / 10,
      ga60: r.byPos.MV >= 30 ? Math.round((r.ga / r.byPos.MV) * 60 * 100) / 100 : null,
    };
  }).sort((a, b) => b.minutes - a.minutes);
}

export type IceTimeRow = ReturnType<typeof iceTimeRows>[number];

/** Med spelarregistret hämtat. */
export async function iceTimeFor(matches: MatchRow[]) {
  const registry = new Map((await listPlayers()).map((p) => [p.id, p.name]));
  return iceTimeRows(matches, registry);
}
