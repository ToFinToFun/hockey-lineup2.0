/**
 * Matcherna i en period, i detalj, för Statistik → Export (underlag till en
 * AI som skriver artiklar till Stålbladet): datum, plats, resultat, målen i
 * tidsordning med minut, matchens stjärnor och lagen per kedja med speltid.
 * Bara namn och hockeysiffror – inga kontaktuppgifter.
 */
import { goalsOldestFirst, winningGoalIndex } from "../shared/goalOrder";
import { iceTimeBySlot, matchMinutes, slotKind } from "../shared/iceTime";
import { isTeamAWhite, normalizeTeamKey, type TeamKey } from "../shared/teams";
import { normalizeGoalType } from "./playerHistory";
import { starsOfMatch } from "./starStats";

type Slot = { id?: string; name?: string; number?: string };
export type ExportMatchInput = {
  id: number; name: string; teamWhiteScore: number; teamGreenScore: number;
  goalHistory: unknown; lineup?: unknown; report?: { stars?: string[]; title?: string | null } | null;
  matchStartTime?: Date | string | null; matchEndTime?: Date | string | null; createdAt?: Date | string | null;
  plannedMinutes?: number | null; location?: string | null; opponentId?: number | null;
};

export interface ExportGoal { minute: number | null; team: TeamKey; scorer: string; assist: string; type: string; score: string; gwg: boolean }
export interface ExportLine { label: string; players: Array<{ name: string; pos: string; minutes: number }> }
export interface ExportMatch {
  id: number; start: string; location: string; opponent: string | null; title: string;
  white: number; green: number; minutes: number;
  goals: ExportGoal[]; stars: string[]; teams: Record<TeamKey, ExportLine[]>;
}

const bare = (n: string | undefined) => (n ?? "").replace(/\s*#\d*\s*$/, "").trim();
const POS: Record<string, string> = { c: "C", lw: "LW", rw: "RW" };

/** Positionen som den visas (G, D, C, LW, RW, F) och kedjan/backparet ur platsens id. */
function slotInfo(slotId: string): { group: string; order: number; pos: string } | null {
  const k = slotKind(slotId);
  if (!k) return null;
  if (k.pos === "MV") return { group: "Målvakt", order: 0, pos: "G" };
  const n = Number(slotId.match(/-(?:def|fwd)-(\d+)/)?.[1] ?? 1);
  if (k.pos === "B") return { group: `Backpar ${n}`, order: 100 + n, pos: "D" };
  return { group: `Kedja ${n}`, order: 10 + n, pos: POS[slotId.split("-").pop() ?? ""] ?? "F" };
}

export function matchLog(matches: ExportMatchInput[], registry: Map<string, string>, opponents: Map<number, string>): ExportMatch[] {
  const when = (m: ExportMatchInput) => new Date(m.matchStartTime ?? m.createdAt ?? 0).getTime();
  return [...matches].sort((a, b) => when(a) - when(b)).map((m) => {
    const wrap = (m.lineup ?? null) as { teamAName?: string; lineup?: Record<string, Slot | null> } | null;
    const slots = wrap?.lineup ?? {};
    const aWhite = isTeamAWhite(wrap?.teamAName);
    const len = m.plannedMinutes ?? matchMinutes(m.matchStartTime, m.matchEndTime ?? m.createdAt);
    const nameOf = (id: string | undefined, label: string | undefined) => (id && registry.get(id)) || bare(label);

    // Målen i tidsordning, med ställningen efter varje mål
    const goals = goalsOldestFirst<{ team?: string; scorer?: string; scorerId?: string; assist?: string; assistId?: string; other?: string; timestamp?: string }>(m.goalHistory);
    const gwg = winningGoalIndex(m.goalHistory, m.teamWhiteScore, m.teamGreenScore);
    const start = m.matchStartTime ? new Date(m.matchStartTime).getTime() : null;
    const run = { white: 0, green: 0 };
    const outGoals: ExportGoal[] = [];
    goals.forEach((g, i) => {
      const team = normalizeTeamKey(g.team);
      if (!team) return;
      run[team]++;
      const t = g.timestamp ? new Date(g.timestamp).getTime() : NaN;
      const minute = start != null && Number.isFinite(t) && t >= start ? Math.floor((t - start) / 60000) + 1 : null;
      const type = normalizeGoalType(g.other) ?? (g.other && g.other.trim() ? g.other.trim() : "");
      outGoals.push({ minute: minute != null && minute <= 240 ? minute : null, team, scorer: nameOf(g.scorerId, g.scorer), assist: nameOf(g.assistId, g.assist), type, score: `${run.white}–${run.green}`, gwg: i === gwg });
    });

    // Lagen per kedja/backpar med uppskattad speltid (samma regler som i Lineup)
    const teams: Record<TeamKey, ExportLine[]> = { white: [], green: [] };
    for (const side of ["a", "b"] as const) {
      const filled = Object.keys(slots).filter((k) => k.startsWith(`team-${side}-`) && (slots[k]?.id || slots[k]?.name));
      const mins = iceTimeBySlot(filled, len);
      const groups = new Map<string, { order: number; players: ExportLine["players"] }>();
      for (const slotId of filled) {
        const info = slotInfo(slotId);
        if (!info) continue;
        const p = slots[slotId]!;
        const g = groups.get(info.group) ?? { order: info.order, players: [] };
        g.players.push({ name: nameOf(p.id, p.name), pos: info.pos, minutes: Math.round(mins.get(slotId) ?? 0) });
        groups.set(info.group, g);
      }
      const team: TeamKey = (side === "a") === aWhite ? "white" : "green";
      const order = { C: 0, LW: 1, RW: 2, F: 3, D: 4, G: 5 } as Record<string, number>;
      teams[team] = [...groups.entries()].sort((x, y) => x[1].order - y[1].order)
        .map(([label, g]) => ({ label, players: g.players.sort((p, q) => (order[p.pos] ?? 9) - (order[q.pos] ?? 9)) }));
    }

    const stars = starsOfMatch(m as never).map((c) => bare(c.name));
    return {
      id: m.id,
      start: new Date(m.matchStartTime ?? m.createdAt ?? 0).toISOString(),
      location: m.location ?? "",
      opponent: m.opponentId != null ? opponents.get(m.opponentId) ?? "Okänt lag" : null,
      title: m.report?.title ?? "",
      white: m.teamWhiteScore, green: m.teamGreenScore, minutes: len,
      goals: outGoals, stars, teams,
    };
  });
}
