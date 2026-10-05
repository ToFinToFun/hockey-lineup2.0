/**
 * Rolig statistik per spelare (gemensam funktion, används av Statistik och
 * Media): matchens första mål, sista mål, sena mål (sista 10 min), måltorka
 * (längsta och pågående svit utan mål) och matcher utan poäng.
 */
import { matchMinutes } from "../shared/iceTime";

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
  pointless: number; longestPointless: number;
}

const bare = (n: string | undefined) => (n ?? "").replace(/\s*#\d*\s*$/, "").trim().toLowerCase();
const when = (m: MatchLike) => new Date(m.matchStartTime ?? m.createdAt ?? 0).getTime();

export function computeFunStats(matches: MatchLike[], registry: Map<string, string>): FunRow[] {
  const rows = new Map<string, FunRow & { run: number; runP: number }>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = { id, name: registry.get(id) ?? id, matches: 0, firstGoals: 0, lastGoals: 0, lateGoals: 0, longestDrought: 0, currentDrought: 0, pointless: 0, longestPointless: 0, run: 0, runP: 0 }; rows.set(id, r); }
    return r;
  };
  for (const m of [...matches].sort((a, b) => when(a) - when(b))) {
    const slots = ((m.lineup as { lineup?: Record<string, { id?: string; name?: string }> } | null)?.lineup) ?? {};
    const players = Object.values(slots).filter((p) => p?.id && registry.has(p.id)) as Array<{ id: string; name?: string }>;
    if (!players.length) continue;
    const byName = new Map(players.map((p) => [bare(p.name), p.id]));
    const goals = (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Goal[];
    const sid = (g: Goal) => g.scorerId ?? byName.get(bare(g.scorer));
    const aid = (g: Goal) => g.assistId ?? byName.get(bare(g.assist));
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
  return [...rows.values()].map(({ run, runP, ...r }) => ({ ...r, currentDrought: run }));
}
