/**
 * Rolig statistik per spelare (gemensam funktion, används av Statistik och
 * Media): matchens första mål, sista mål, sena mål (sista 10 min), måltorka
 * (längsta och pågående svit utan mål) och matcher utan poäng.
 */
import { matchMinutes } from "../shared/iceTime";
import { isTeamAWhite, normalizeTeamKey } from "../shared/teams";

type Goal = { team?: string; scorer?: string; assist?: string; scorerId?: string; assistId?: string; timestamp?: string };
type MatchLike = {
  id: number; name: string; goalHistory: unknown; lineup: unknown;
  matchStartTime?: Date | string | null; matchEndTime?: Date | string | null; createdAt?: Date | string | null;
  plannedMinutes?: number | null;
};

export interface FunRow {
  id: string; name: string; matches: number;
  firstGoals: number; lastGoals: number; lateGoals: number;
  longestDrought: number; currentDrought: number;
  pointless: number; longestPointless: number; currentPointless: number;
}

/** Målvakternas sviter: matcher i rad med högst 1/2/3 insläppta, vinster i rad (längsta och pågående) */
export interface GoalieFunRow {
  id: string; name: string; gkMatches: number;
  max1: number; max2: number; max3: number; current2: number;
  winStreak: number; currentWins: number;
}

const bare = (n: string | undefined) => (n ?? "").replace(/\s*#\d*\s*$/, "").trim().toLowerCase();
const when = (m: MatchLike) => new Date(m.matchStartTime ?? m.createdAt ?? 0).getTime();

export function computeFunStats(matches: MatchLike[], registry: Map<string, string>): FunRow[] {
  const rows = new Map<string, FunRow & { run: number; runP: number }>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = { id, name: registry.get(id) ?? id, matches: 0, firstGoals: 0, lastGoals: 0, lateGoals: 0, longestDrought: 0, currentDrought: 0, pointless: 0, longestPointless: 0, currentPointless: 0, run: 0, runP: 0 }; rows.set(id, r); }
    return r;
  };
  for (const m of [...matches].sort((a, b) => when(a) - when(b))) {
    const slots = ((m.lineup as { lineup?: Record<string, { id?: string; name?: string }> } | null)?.lineup) ?? {};
    // Utespelare: den som stod i mål räknas inte i sviterna den matchen (målvakterna har egna)
    const players = Object.entries(slots).filter(([k, p]) => !/-gk-/.test(k) && p?.id && registry.has(p.id)).map(([, p]) => p) as Array<{ id: string; name?: string }>;
    if (!players.length) continue;
    const byName = new Map(players.map((p) => [bare(p.name), p.id]));
    // Målen sparas med det senaste först – i tidsordning här
    const goals = [...((Array.isArray(m.goalHistory) ? m.goalHistory : []) as Goal[])].reverse();
    const sid = (g: Goal) => g.scorerId ?? (bare(g.scorer) ? byName.get(bare(g.scorer)) : undefined);
    const aid = (g: Goal) => g.assistId ?? (bare(g.assist) ? byName.get(bare(g.assist)) : undefined);
    const scored = new Set<string>(), pointed = new Set<string>();
    for (const g of goals) {
      const s = sid(g), a = aid(g);
      if (s) { scored.add(s); pointed.add(s); }
      if (a) pointed.add(a);
    }
    // Första och sista målet i matchen
    const first = goals[0] ? sid(goals[0]) : undefined;
    const last = goals.length ? sid(goals[goals.length - 1]) : undefined;
    if (first && registry.has(first)) row(first).firstGoals++;
    if (last && registry.has(last)) row(last).lastGoals++;
    // Sena mål: de sista 10 minuterna (kräver starttid)
    if (m.matchStartTime) {
      const st = new Date(m.matchStartTime);
      const len = m.plannedMinutes ?? matchMinutes(m.matchStartTime, m.matchEndTime ?? m.createdAt);
      for (const g of goals) {
        const t = g.timestamp?.match(/^(\d{1,2}):(\d{2})/);
        const s = sid(g);
        if (!t || !s || !registry.has(s)) continue;
        const min = ((Number(t[1]) * 60 + Number(t[2])) - (st.getHours() * 60 + st.getMinutes()) + 1440) % 1440;
        if (min >= len - 10 && min <= len + 15) row(s).lateGoals++;
      }
    }
    for (const p of players) {
      const r = row(p.id);
      r.matches++;
      r.run = scored.has(p.id) ? 0 : r.run + 1;
      r.longestDrought = Math.max(r.longestDrought, r.run);
      if (!pointed.has(p.id)) r.pointless++;
      r.runP = pointed.has(p.id) ? 0 : r.runP + 1;
      r.longestPointless = Math.max(r.longestPointless, r.runP);
    }
  }
  return [...rows.values()].map(({ run, runP, ...r }) => ({ ...r, currentDrought: run, currentPointless: runP }));
}

/** Målvakternas sviter (gemensam funktion). Delar två målvakter på målet räknas lagets insläppta för båda. */
export function computeGoalieFun(matches: MatchLike[], registry: Map<string, string>): GoalieFunRow[] {
  const rows = new Map<string, GoalieFunRow & { r1: number; r2: number; r3: number; w: number }>();
  for (const m of [...matches].sort((a, b) => when(a) - when(b))) {
    const lu = (m.lineup as { teamAName?: string; lineup?: Record<string, { id?: string }> } | null) ?? null;
    const slots = lu?.lineup ?? {};
    const aWhite = isTeamAWhite(lu?.teamAName);
    const goals = (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Goal[];
    const scored = { white: 0, green: 0 };
    for (const g of goals) { const k = normalizeTeamKey(g.team); if (k) scored[k]++; }
    const seen = new Set<string>();
    for (const [slot, p] of Object.entries(slots)) {
      if (!/-gk-/.test(slot) || !p?.id || !registry.has(p.id) || seen.has(p.id)) continue;
      seen.add(p.id);
      const own: "white" | "green" = slot.startsWith("team-a") === aWhite ? "white" : "green";
      const opp = own === "white" ? "green" : "white";
      const ga = scored[opp], won = scored[own] > scored[opp];
      let r = rows.get(p.id);
      if (!r) { r = { id: p.id, name: registry.get(p.id) ?? p.id, gkMatches: 0, max1: 0, max2: 0, max3: 0, current2: 0, winStreak: 0, currentWins: 0, r1: 0, r2: 0, r3: 0, w: 0 }; rows.set(p.id, r); }
      r.gkMatches++;
      r.r1 = ga <= 1 ? r.r1 + 1 : 0; r.max1 = Math.max(r.max1, r.r1);
      r.r2 = ga <= 2 ? r.r2 + 1 : 0; r.max2 = Math.max(r.max2, r.r2);
      r.r3 = ga <= 3 ? r.r3 + 1 : 0; r.max3 = Math.max(r.max3, r.r3);
      r.w = won ? r.w + 1 : 0; r.winStreak = Math.max(r.winStreak, r.w);
    }
  }
  return [...rows.values()].map(({ r1, r2, r3, w, ...r }) => ({ ...r, current2: r2, currentWins: w }));
}
