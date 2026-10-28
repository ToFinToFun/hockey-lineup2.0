/**
 * PIR över tid: spelarens betyg i varje roll direkt efter var och en av hans
 * matcher. Räknas om från matcherna (som betyget) – inget sparas i databasen.
 */
import type { MatchResult } from "../drizzle/schema";
import { calculatePIR, type PirOptions } from "./pir";
import { pirThresholds } from "../shared/pirThresholds";
import { isTeamAWhite } from "../shared/teams";

export interface PirHistoryPoint {
  matchId: number;
  date: string;
  rating: number;
  result: "V" | "O" | "F";
  /** Mål för och emot (spelarens lag) */
  score: [number, number];
  /** Före visningsgränsen (färre än 3 matcher i rollen) */
  provisional: boolean;
}

export interface PirHistory {
  outfield: PirHistoryPoint[];
  goalkeeper: PirHistoryPoint[];
}

/** Samma datum som beräkningen använder */
const dateOf = (m: MatchResult) => new Date((m.matchStartTime ?? m.matchEndTime ?? m.createdAt) as unknown as string);

/**
 * Kurvor för alla spelare. Räknar om betygen efter varje match (växer
 * kvadratiskt: ~0,2 s för 50 matcher, ~5 s för 300), så resultatet cachas och
 * beräkningen släpper tråden mellan matcherna så att servern inte låses.
 */
export async function pirHistoryAll(
  matches: MatchResult[],
  options: Pick<PirOptions, "weights" | "adjustments"> = {},
  yieldFn: () => Promise<void> = () => new Promise((r) => setImmediate(r)),
): Promise<Map<string, PirHistory>> {
  const out = new Map<string, PirHistory>();
  const get = (p: string) => out.get(p) ?? out.set(p, { outfield: [], goalkeeper: [] }).get(p)!;
  const sorted = matches
    .filter((m) => (m.lineup as { lineup?: unknown } | null)?.lineup)
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime());
  const minShow = pirThresholds().minMatchesShow;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const until = dateOf(m);
    // Matcher med samma starttid räknas tillsammans – räkna bara vid den sista
    if (i + 1 < sorted.length && dateOf(sorted[i + 1]).getTime() === until.getTime()) continue;
    await yieldFn();
    const upTo = sorted.slice(0, i + 1);
    const ratings = new Map(
      calculatePIR(upTo, { ...options, now: until, skipTrend: true, iterations: 8, provisionalRoles: true }).map((r) => [r.playerKey, r])
    );
    // Alla matcher som slutar vid den här tidpunkten
    for (let j = i; j >= 0 && dateOf(sorted[j]).getTime() === until.getTime(); j--) {
      const match = sorted[j];
      const lineup = (match.lineup as { teamAName?: string; lineup?: Record<string, { id?: string } | null> }) ?? {};
      const aWhite = isTeamAWhite(lineup.teamAName);
      for (const [slot, pl] of Object.entries(lineup.lineup ?? {})) {
        if (!pl?.id) continue;
        const r = ratings.get(String(pl.id));
        if (!r) continue;
        const gk = slot.includes("-gk-");
        const rating = gk ? r.goalkeeperRating : r.outfieldRating;
        if (rating == null) continue;
        const white = slot.startsWith("team-a") === aWhite;
        const own = white ? match.teamWhiteScore : match.teamGreenScore;
        const opp = white ? match.teamGreenScore : match.teamWhiteScore;
        const played = gk ? r.goalkeeperMatchesPlayed : r.outfieldMatchesPlayed;
        get(String(pl.id))[gk ? "goalkeeper" : "outfield"].push({
          matchId: match.id,
          date: until.toISOString(),
          rating,
          result: own > opp ? "V" : own < opp ? "F" : "O",
          score: [own, opp],
          provisional: played < minShow,
        });
      }
    }
  }
  // Ordningen inom samma tidpunkt (j räknade bakåt) – sortera på datum, sedan match
  for (const h of out.values()) {
    for (const list of [h.outfield, h.goalkeeper]) list.sort((a, b) => a.date.localeCompare(b.date) || a.matchId - b.matchId);
  }
  return out;
}
