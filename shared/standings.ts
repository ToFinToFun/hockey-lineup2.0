/**
 * Serietabellen för Vita och Gröna (NHL-stil: 2 poäng för vinst, 1 för oavgjort)
 * och finalen i slutspelet (matchserie – flest vunna matcher).
 */
export type TeamKey = "white" | "green";

export interface StandingRow {
  team: TeamKey;
  gp: number; w: number; l: number; t: number;
  gf: number; ga: number; diff: number; pts: number;
}

export interface SeriesMatch { id?: number; date: string; white: number; green: number }

interface MatchLike { id?: number; teamWhiteScore: number; teamGreenScore: number; matchStartTime?: Date | string | null; createdAt?: Date | string | null }

const empty = (team: TeamKey): StandingRow => ({ team, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0, diff: 0, pts: 0 });

/** Tabellen: poäng, sedan målskillnad, sedan gjorda mål. */
export function standings(matches: MatchLike[]): StandingRow[] {
  const r = { white: empty("white"), green: empty("green") };
  for (const m of matches) {
    const w = m.teamWhiteScore, g = m.teamGreenScore;
    r.white.gp++; r.green.gp++;
    r.white.gf += w; r.white.ga += g;
    r.green.gf += g; r.green.ga += w;
    if (w > g) { r.white.w++; r.green.l++; }
    else if (g > w) { r.green.w++; r.white.l++; }
    else { r.white.t++; r.green.t++; }
  }
  for (const x of [r.white, r.green]) { x.diff = x.gf - x.ga; x.pts = x.w * 2 + x.t; }
  return [r.white, r.green].sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf);
}

/** Finalen: vunna matcher per lag och matcherna i tidsordning. */
export function series(matches: MatchLike[]): { white: number; green: number; ties: number; leader: TeamKey | null; matches: SeriesMatch[] } {
  const date = (m: MatchLike) => new Date(m.matchStartTime ?? m.createdAt ?? 0);
  const ordered = [...matches].sort((a, b) => date(a).getTime() - date(b).getTime());
  let white = 0, green = 0, ties = 0;
  for (const m of ordered) {
    if (m.teamWhiteScore > m.teamGreenScore) white++;
    else if (m.teamGreenScore > m.teamWhiteScore) green++;
    else ties++;
  }
  return {
    white, green, ties,
    leader: white > green ? "white" : green > white ? "green" : null,
    matches: ordered.map((m) => ({ id: m.id, date: date(m).toISOString(), white: m.teamWhiteScore, green: m.teamGreenScore })),
  };
}

/** "26/27" för säsongen som ett datum hör till (säsongen börjar 1 augusti). */
export function seasonShort(d: Date | string): string {
  const x = new Date(d);
  const y = x.getMonth() >= 7 ? x.getFullYear() : x.getFullYear() - 1;
  return `${String(y % 100).padStart(2, "0")}/${String((y + 1) % 100).padStart(2, "0")}`;
}
