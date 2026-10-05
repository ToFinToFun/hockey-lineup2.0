import { isTeamAWhite as teamAIsWhite, normalizeTeamKey } from "../../shared/teams";
import { listOpponents } from "../opponents";
import { listPlayers } from "../playersDb";
import { iceTimeBySlot, matchMinutes, slotKind, type IcePos } from "../../shared/iceTime";
import { normalizeGoalType } from "../playerHistory";
/**
 * Score Tracker statistics tRPC router.
 * Contains the heavier analytics endpoints:
 * playerProfile, headToHead, seasonAwards, seasonStats, teamComparison
 */

import { adminProcedure, router, moduleProcedure } from "../_core/trpc";
import { getAllMatchResults, getExternalMatches } from "../scoreDb";
import { z } from "zod";
import { starCounts } from "../starStats";

// ─── Helpers ────────────────────────────────────────────────────────

function filterMatchesByDate(
  matches: Awaited<ReturnType<typeof getAllMatchResults>>,
  from?: string,
  to?: string
) {
  if (!from && !to) return matches;
  return matches.filter(m => {
    const matchDate = m.matchEndTime || m.createdAt;
    if (!matchDate) return true;
    const d = new Date(matchDate);
    if (from) {
      const fromDate = new Date(from + "T00:00:00");
      if (d < fromDate) return false;
    }
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      if (d > toDate) return false;
    }
    return true;
  });
}

/** Determine GWG scorer from goal history */
function findGwgScorer(
  goals: Array<{ team: string; scorer?: string; assist?: string; other?: string }>,
  whiteScore: number,
  greenScore: number
): string | null {
  if (whiteScore === greenScore) return null;
  const winningTeam = whiteScore > greenScore ? "white" : "green";
  const loserScore = Math.min(whiteScore, greenScore);
  const chronologicalGoals = [...goals].reverse();
  let winnerGoalCount = 0;
  for (const goal of chronologicalGoals) {
    const goalTeam = goal.team?.toLowerCase();
    const isWinnerGoal =
      normalizeTeamKey(goalTeam) === winningTeam;
    if (isWinnerGoal) {
      if (winnerGoalCount === loserScore) {
        return goal.scorer || null;
      }
      winnerGoalCount++;
    }
  }
  return null;
}

/** Extract player team and position from lineup slot */
function getPlayerTeamFromSlot(
  slotId: string,
  isTeamAWhite: boolean
): { team: "white" | "green"; position: string } {
  const team: "white" | "green" = slotId.startsWith("team-a")
    ? isTeamAWhite ? "white" : "green"
    : isTeamAWhite ? "green" : "white";

  let position = "";
  if (slotId.includes("-gk-")) {
    position = "MV";
  } else if (slotId.includes("-fwd-")) {
    const parts = slotId.split("-");
    const lastPart = parts[parts.length - 1];
    position = lastPart === "c" ? "C" : lastPart === "lw" ? "LW" : lastPart === "rw" ? "RW" : "F";
  } else if (slotId.includes("-def-")) {
    position = "B";
  }

  return { team, position };
}

/** Get player key from lineup entry */
function getPlayerKey(p: any): string {
  return p.number ? `${p.name} #${p.number}` : p.name;
}

const dateRangeInput = z
  .object({ from: z.string().optional(), to: z.string().optional(), includeExternal: z.boolean().optional(), venue: z.string().max(120).optional() })
  .optional();

// ─── Score Stats Router ─────────────────────────────────────────────

export const scoreStatsRouter = router({
  /**
   * Uppskattad speltid per spelare (samma regler som i Lineup, räknat på varje
   * sparad match utifrån uppställningen och matchens längd): total, per
   * position, snitt per match och poäng per 60 minuter.
   */
  iceTime: adminProcedure.input(dateRangeInput).query(async ({ input }) => {
    const matches = filterMatchesByDate(await getAllMatchResults({ includeExternal: input?.includeExternal }), input?.from, input?.to)
      // Bara en hall (Statistik → Hallar)
      .filter((m) => !input?.venue || (m as { location?: string | null }).location === input.venue);
    const registry = new Map((await listPlayers()).map((p) => [p.id, p.name]));
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
  }),

  /**
   * Statistik per hall (platsen sparas per match): matcher, vinster per lag,
   * mål per match och bästa poänggörare i hallen. Lagens vinster räknas bara för
   * internmatcher; spelarnas siffror följer valet "Inkl. externa matcher".
   */
  venueStats: moduleProcedure("media", "cards", "stats", "players", "matches", "report").input(dateRangeInput).query(async ({ input }) => {
    const matches = filterMatchesByDate(await getAllMatchResults({ includeExternal: input?.includeExternal }), input?.from, input?.to)
      .filter((m) => !!m.location);
    type Line = { name: string; goals: number; assists: number };
    const halls = new Map<string, { matches: number; whiteWins: number; greenWins: number; draws: number; goals: number; scorers: Map<string, Line> }>();
    for (const m of matches) {
      const h = halls.get(m.location!) ?? { matches: 0, whiteWins: 0, greenWins: 0, draws: 0, goals: 0, scorers: new Map() };
      h.matches++;
      h.goals += m.teamWhiteScore + m.teamGreenScore;
      if (m.opponentId == null) {
        if (m.teamWhiteScore > m.teamGreenScore) h.whiteWins++;
        else if (m.teamGreenScore > m.teamWhiteScore) h.greenWins++;
        else h.draws++;
      }
      for (const g of (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Array<{ scorer?: string; assist?: string }>) {
        for (const [name, kind] of [[g.scorer, "goals"], [g.assist, "assists"]] as const) {
          const n = (name ?? "").trim();
          if (!n) continue;
          const l = h.scorers.get(n) ?? { name: n, goals: 0, assists: 0 };
          l[kind]++;
          h.scorers.set(n, l);
        }
      }
      halls.set(m.location!, h);
    }
    return [...halls.entries()].map(([venue, h]) => ({
      venue, matches: h.matches, whiteWins: h.whiteWins, greenWins: h.greenWins, draws: h.draws,
      goalsPerMatch: Math.round((h.goals / h.matches) * 10) / 10,
      top: [...h.scorers.values()].map((l) => ({ ...l, points: l.goals + l.assists }))
        .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name, "sv")),
    })).sort((a, b) => b.matches - a.matches);
  }),

  /**
   * Resultat mot varje motståndare (matcher mot andra lag): V/O/F, målskillnad,
   * våra bästa poänggörare mot dem och deras målskyttar mot oss.
   */
  opponentRecords: moduleProcedure("media", "cards", "stats", "players", "matches", "report").input(dateRangeInput).query(async ({ input }) => {
    const matches = filterMatchesByDate(await getExternalMatches(), input?.from, input?.to);
    const opps = new Map((await listOpponents(true)).map((o) => [o.id, o]));
    type Line = { name: string; goals: number; assists: number };
    const add = (m: Map<string, Line>, name: string | undefined, kind: "goals" | "assists") => {
      const n = (name ?? "").trim();
      if (!n) return;
      const l = m.get(n) ?? { name: n, goals: 0, assists: 0 };
      l[kind]++;
      m.set(n, l);
    };
    const byOpp = new Map<number, { matches: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; last: { name: string; us: number; them: number } | null; ours: Map<string, Line>; theirs: Map<string, Line> }>();
    for (const m of matches) {
      const id = m.opponentId!;
      const r = byOpp.get(id) ?? { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, last: null, ours: new Map(), theirs: new Map() };
      r.matches++;
      r.goalsFor += m.teamWhiteScore;
      r.goalsAgainst += m.teamGreenScore;
      if (m.teamWhiteScore > m.teamGreenScore) r.wins++;
      else if (m.teamWhiteScore < m.teamGreenScore) r.losses++;
      else r.draws++;
      if (!r.last) r.last = { name: m.name, us: m.teamWhiteScore, them: m.teamGreenScore };
      for (const g of (Array.isArray(m.goalHistory) ? m.goalHistory : []) as Array<{ team?: string; scorer?: string; assist?: string }>) {
        const theirs = normalizeTeamKey(g.team) === "green";
        add(theirs ? r.theirs : r.ours, g.scorer, "goals");
        add(theirs ? r.theirs : r.ours, g.assist, "assists");
      }
      byOpp.set(id, r);
    }
    const top = (m: Map<string, Line>) => [...m.values()].map((l) => ({ ...l, points: l.goals + l.assists }))
      .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name, "sv"));
    return [...byOpp.entries()].map(([id, r]) => {
      const o = opps.get(id);
      return {
        opponentId: id, name: o?.name ?? "Okänt lag", color: o?.color ?? "#ef4444", logoUrl: o?.logoUrl ?? null,
        matches: r.matches, wins: r.wins, draws: r.draws, losses: r.losses, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
        last: r.last, ourScorers: top(r.ours), theirScorers: top(r.theirs),
      };
    }).sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, "sv"));
  }),

  /** Detailed player profile with per-match history */
  playerProfile: moduleProcedure("media", "cards", "stats", "players", "matches", "report")
    .input(z.object({ name: z.string(), includeExternal: z.boolean().optional() }))
    .query(async ({ input }) => {
      const matches = await getAllMatchResults({ includeExternal: input.includeExternal });
      const matchHistory: Array<{
        matchId: number;
        matchName: string;
        team: "white" | "green";
        position: string;
        result: "win" | "loss" | "draw";
        whiteScore: number;
        greenScore: number;
        goals: number;
        assists: number;
        gwg: number;
        goalDetails: Array<{ team: string; other?: string; assist?: string }>;
      }> = [];

      let totalGoals = 0;
      let totalAssists = 0;
      let totalGwg = 0;
      const goalTypeCounts: Record<string, number> = {};

      for (const match of matches) {
        const lineup = match.lineup as any;
        if (!lineup) continue;

        const lineupEntries = lineup.lineup || {};
        const teamAName = (lineup.teamAName || "").toLowerCase();
        const isTeamAWhite = teamAIsWhite(teamAName);

        // Find this player in the lineup
        let playerTeam: "white" | "green" | null = null;
        let playerPosition = "";
        for (const [slotId, p] of Object.entries(lineupEntries)) {
          if (!p || typeof p !== "object" || !(p as any).name) continue;
          const key = getPlayerKey(p);
          if (key === input.name) {
            const info = getPlayerTeamFromSlot(slotId, isTeamAWhite);
            playerTeam = info.team;
            playerPosition = info.position || ((p as any).position || "").toUpperCase();
            break;
          }
        }

        if (!playerTeam) continue;

        const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
        const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
        let result: "win" | "loss" | "draw" = "draw";
        if (playerTeam === "white" && isWhiteWin) result = "win";
        else if (playerTeam === "green" && isGreenWin) result = "win";
        else if (playerTeam === "white" && isGreenWin) result = "loss";
        else if (playerTeam === "green" && isWhiteWin) result = "loss";

        // Count goals and assists in this match
        let matchGoals = 0;
        let matchAssists = 0;
        let matchGwg = 0;
        const goalDetails: Array<{ team: string; other?: string; assist?: string }> = [];
        const goals = match.goalHistory as Array<{ team: string; scorer?: string; assist?: string; other?: string }> | null;
        if (goals && Array.isArray(goals)) {
          for (const goal of goals) {
            if (goal.scorer === input.name) {
              matchGoals++;
              goalDetails.push({ team: goal.team, other: goal.other, assist: goal.assist });
            }
            if (goal.assist === input.name) {
              matchAssists++;
            }
          }

          // Check GWG
          const gwgScorer = findGwgScorer(goals, match.teamWhiteScore, match.teamGreenScore);
          if (gwgScorer === input.name) matchGwg = 1;
        }

        totalGoals += matchGoals;
        totalAssists += matchAssists;
        totalGwg += matchGwg;

        for (const gd of goalDetails) {
          const gt = normalizeGoalType(gd.other);
          if (gt) goalTypeCounts[gt] = (goalTypeCounts[gt] || 0) + 1;
        }

        matchHistory.push({
          matchId: match.id,
          matchName: match.name,
          team: playerTeam,
          position: playerPosition,
          result,
          whiteScore: match.teamWhiteScore,
          greenScore: match.teamGreenScore,
          goals: matchGoals,
          assists: matchAssists,
          gwg: matchGwg,
          goalDetails,
        });
      }

      const wins = matchHistory.filter(m => m.result === "win").length;
      const losses = matchHistory.filter(m => m.result === "loss").length;
      const draws = matchHistory.filter(m => m.result === "draw").length;
      const matchesWhite = matchHistory.filter(m => m.team === "white").length;
      const matchesGreen = matchHistory.filter(m => m.team === "green").length;

      // Position statistics
      const positionCounts: Record<string, number> = {};
      for (const mh of matchHistory) {
        if (mh.position) {
          positionCounts[mh.position] = (positionCounts[mh.position] || 0) + 1;
        }
      }
      const positionStats = Object.entries(positionCounts)
        .map(([position, count]) => ({
          position,
          count,
          percentage: matchHistory.length > 0 ? Math.round((count / matchHistory.length) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Find best match
      let bestMatch: {
        matchId: number;
        matchName: string;
        team: "white" | "green";
        position: string;
        result: "win" | "loss" | "draw";
        whiteScore: number;
        greenScore: number;
        goals: number;
        assists: number;
        points: number;
      } | null = null;
      for (const mh of matchHistory) {
        const pts = mh.goals + mh.assists;
        if (pts > 0 && (!bestMatch || pts > bestMatch.points || (pts === bestMatch.points && mh.goals > bestMatch.goals))) {
          bestMatch = { ...mh, points: pts };
        }
      }

      // Calculate streaks
      const chronological = [...matchHistory].reverse();
      let currentWinStreak = 0, maxWinStreak = 0;
      let currentLossStreak = 0, maxLossStreak = 0;
      let currentDrawStreak = 0, maxDrawStreak = 0;
      let currentUnbeatenStreak = 0, maxUnbeatenStreak = 0;
      let currentWinlessStreak = 0, maxWinlessStreak = 0;

      for (const mh of chronological) {
        if (mh.result === "win") {
          currentWinStreak++; currentLossStreak = 0; currentDrawStreak = 0;
          currentUnbeatenStreak++; currentWinlessStreak = 0;
        } else if (mh.result === "loss") {
          currentWinStreak = 0; currentLossStreak++; currentDrawStreak = 0;
          currentUnbeatenStreak = 0; currentWinlessStreak++;
        } else {
          currentWinStreak = 0; currentLossStreak = 0; currentDrawStreak++;
          currentUnbeatenStreak++; currentWinlessStreak++;
        }
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        maxDrawStreak = Math.max(maxDrawStreak, currentDrawStreak);
        maxUnbeatenStreak = Math.max(maxUnbeatenStreak, currentUnbeatenStreak);
        maxWinlessStreak = Math.max(maxWinlessStreak, currentWinlessStreak);
      }

      // Monthly MVP
      const monthlyPlayerStats: Record<string, Record<string, { goals: number; assists: number; gwg: number; points: number }>> = {};
      for (const m of matches) {
        const mDate = m.matchEndTime || m.createdAt;
        if (!mDate) continue;
        const d = new Date(mDate);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyPlayerStats[monthKey]) monthlyPlayerStats[monthKey] = {};

        const mGoals = m.goalHistory as Array<{ team: string; scorer?: string; assist?: string; other?: string }> | null;
        if (!mGoals || !Array.isArray(mGoals)) continue;

        for (const g of mGoals) {
          if (g.scorer) {
            if (!monthlyPlayerStats[monthKey][g.scorer]) monthlyPlayerStats[monthKey][g.scorer] = { goals: 0, assists: 0, gwg: 0, points: 0 };
            monthlyPlayerStats[monthKey][g.scorer].goals++;
            monthlyPlayerStats[monthKey][g.scorer].points++;
          }
          if (g.assist) {
            if (!monthlyPlayerStats[monthKey][g.assist]) monthlyPlayerStats[monthKey][g.assist] = { goals: 0, assists: 0, gwg: 0, points: 0 };
            monthlyPlayerStats[monthKey][g.assist].assists++;
            monthlyPlayerStats[monthKey][g.assist].points++;
          }
        }

        const gwgScorer = findGwgScorer(mGoals, m.teamWhiteScore, m.teamGreenScore);
        if (gwgScorer && monthlyPlayerStats[monthKey][gwgScorer]) {
          monthlyPlayerStats[monthKey][gwgScorer].gwg++;
        }
      }

      const monthNames: Record<string, string> = {
        "01": "Januari", "02": "Februari", "03": "Mars", "04": "April",
        "05": "Maj", "06": "Juni", "07": "Juli", "08": "Augusti",
        "09": "September", "10": "Oktober", "11": "November", "12": "December",
      };
      const mvpMonths: Array<{ month: string; goals: number; assists: number; points: number; gwg: number }> = [];
      for (const [monthKey, players] of Object.entries(monthlyPlayerStats)) {
        const sorted = Object.entries(players).sort((a, b) => {
          if (b[1].points !== a[1].points) return b[1].points - a[1].points;
          if (b[1].goals !== a[1].goals) return b[1].goals - a[1].goals;
          if (b[1].assists !== a[1].assists) return b[1].assists - a[1].assists;
          return b[1].gwg - a[1].gwg;
        });
        if (sorted.length > 0 && sorted[0][0] === input.name) {
          const [year, month] = monthKey.split("-");
          const monthLabel = `${monthNames[month!] || month} ${year}`;
          const s = sorted[0][1];
          mvpMonths.push({ month: monthLabel, goals: s.goals, assists: s.assists, points: s.points, gwg: s.gwg });
        }
      }

      // Matchens stjärnor (namnet kan ha "#nr" på slutet)
      const bareName = input.name.replace(/\s*#\d+\s*$/, "").trim().toLowerCase();
      const myStars = starCounts(matches as never).find((x) => x.name.trim().toLowerCase() === bareName) ?? null;

      return {
        name: input.name,
        stars: myStars ? { stars3: myStars.stars3, stars2: myStars.stars2, stars1: myStars.stars1, total: myStars.total } : { stars3: 0, stars2: 0, stars1: 0, total: 0 },
        matchesPlayed: matchHistory.length,
        matchesWhite,
        matchesGreen,
        wins,
        losses,
        draws,
        totalGoals,
        totalAssists,
        totalGwg,
        winRate: matchHistory.length > 0 ? Math.round((wins / matchHistory.length) * 100) : 0,
        positionStats,
        goalTypes: goalTypeCounts,
        bestMatch,
        streaks: {
          longestWinStreak: maxWinStreak,
          longestLossStreak: maxLossStreak,
          longestDrawStreak: maxDrawStreak,
          longestUnbeatenStreak: maxUnbeatenStreak,
          longestWinlessStreak: maxWinlessStreak,
          currentWinStreak,
          currentLossStreak,
          currentUnbeatenStreak,
        },
        mvpMonths,
        matchHistory,
      };
    }),

  /** Head-to-head comparison between two players */
  headToHead: moduleProcedure("media", "cards", "stats", "players", "matches", "report")
    .input(z.object({
      player1: z.string(),
      player2: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allMatches = await getAllMatchResults();
      const matches = filterMatchesByDate(allMatches, input.from, input.to);

      const stats = {
        player1: {
          name: input.player1,
          matchesPlayed: 0, matchesWhite: 0, matchesGreen: 0,
          wins: 0, losses: 0, draws: 0,
          goals: 0, assists: 0, points: 0,
          winRate: 0,
          sameTeamMatches: 0, oppositeTeamMatches: 0,
          positionCounts: {} as Record<string, number>,
        },
        player2: {
          name: input.player2,
          matchesPlayed: 0, matchesWhite: 0, matchesGreen: 0,
          wins: 0, losses: 0, draws: 0,
          goals: 0, assists: 0, points: 0,
          winRate: 0,
          sameTeamMatches: 0, oppositeTeamMatches: 0,
          positionCounts: {} as Record<string, number>,
        },
        sharedMatches: 0,
        sameTeamRecord: { wins: 0, losses: 0, draws: 0 },
        oppositeTeamRecord: { p1Wins: 0, p2Wins: 0, draws: 0 },
      };

      for (const match of matches) {
        const lineup = match.lineup as any;
        if (!lineup) continue;
        const lineupEntries = lineup.lineup || {};
        const teamAName = (lineup.teamAName || "").toLowerCase();
        const isTeamAWhite = teamAIsWhite(teamAName);

        let p1Team: "white" | "green" | null = null;
        let p2Team: "white" | "green" | null = null;
        let p1Pos = "";
        let p2Pos = "";

        for (const [slotId, p] of Object.entries(lineupEntries)) {
          if (!p || typeof p !== "object" || !(p as any).name) continue;
          const key = getPlayerKey(p);
          const info = getPlayerTeamFromSlot(slotId, isTeamAWhite);
          if (key === input.player1) { p1Team = info.team; p1Pos = info.position; }
          if (key === input.player2) { p2Team = info.team; p2Pos = info.position; }
        }

        const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
        const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
        const isDraw = match.teamWhiteScore === match.teamGreenScore;

        const getResult = (team: "white" | "green"): "win" | "loss" | "draw" => {
          if (isDraw) return "draw";
          if (team === "white" && isWhiteWin) return "win";
          if (team === "green" && isGreenWin) return "win";
          return "loss";
        };

        const goals = match.goalHistory as Array<{ scorer?: string; assist?: string }> | null;
        let p1Goals = 0, p1Assists = 0, p2Goals = 0, p2Assists = 0;
        if (goals && Array.isArray(goals)) {
          for (const g of goals) {
            if (g.scorer === input.player1) p1Goals++;
            if (g.assist === input.player1) p1Assists++;
            if (g.scorer === input.player2) p2Goals++;
            if (g.assist === input.player2) p2Assists++;
          }
        }

        if (p1Team) {
          stats.player1.matchesPlayed++;
          if (p1Team === "white") stats.player1.matchesWhite++;
          else stats.player1.matchesGreen++;
          const r = getResult(p1Team);
          if (r === "win") stats.player1.wins++;
          else if (r === "loss") stats.player1.losses++;
          else stats.player1.draws++;
          stats.player1.goals += p1Goals;
          stats.player1.assists += p1Assists;
          if (p1Pos) stats.player1.positionCounts[p1Pos] = (stats.player1.positionCounts[p1Pos] || 0) + 1;
        }

        if (p2Team) {
          stats.player2.matchesPlayed++;
          if (p2Team === "white") stats.player2.matchesWhite++;
          else stats.player2.matchesGreen++;
          const r = getResult(p2Team);
          if (r === "win") stats.player2.wins++;
          else if (r === "loss") stats.player2.losses++;
          else stats.player2.draws++;
          stats.player2.goals += p2Goals;
          stats.player2.assists += p2Assists;
          if (p2Pos) stats.player2.positionCounts[p2Pos] = (stats.player2.positionCounts[p2Pos] || 0) + 1;
        }

        if (p1Team && p2Team) {
          stats.sharedMatches++;
          if (p1Team === p2Team) {
            stats.player1.sameTeamMatches++;
            stats.player2.sameTeamMatches++;
            const r = getResult(p1Team);
            if (r === "win") stats.sameTeamRecord.wins++;
            else if (r === "loss") stats.sameTeamRecord.losses++;
            else stats.sameTeamRecord.draws++;
          } else {
            stats.player1.oppositeTeamMatches++;
            stats.player2.oppositeTeamMatches++;
            const r1 = getResult(p1Team);
            if (r1 === "win") stats.oppositeTeamRecord.p1Wins++;
            else if (r1 === "loss") stats.oppositeTeamRecord.p2Wins++;
            else stats.oppositeTeamRecord.draws++;
          }
        }
      }

      stats.player1.points = stats.player1.goals + stats.player1.assists;
      stats.player2.points = stats.player2.goals + stats.player2.assists;
      stats.player1.winRate = stats.player1.matchesPlayed > 0 ? Math.round((stats.player1.wins / stats.player1.matchesPlayed) * 100) : 0;
      stats.player2.winRate = stats.player2.matchesPlayed > 0 ? Math.round((stats.player2.wins / stats.player2.matchesPlayed) * 100) : 0;

      return stats;
    }),

  /** Season Awards */
  seasonAwards: moduleProcedure("media", "cards", "stats", "players", "matches", "report").input(dateRangeInput).query(async ({ input }) => {
    const allMatches = await getAllMatchResults({ includeExternal: input?.includeExternal });
    const matches = filterMatchesByDate(allMatches, input?.from, input?.to);

    if (matches.length === 0) {
      return { awards: [], totalMatches: 0 };
    }

    const playerMap: Record<string, {
      name: string;
      matchesPlayed: number;
      wins: number; losses: number; draws: number;
      goals: number; assists: number; points: number; gwg: number;
      goalsAgainst: number; cleanSheets: number; gkMatches: number;
      maxWinStreak: number; currentWinStreak: number;
      maxUnbeatenStreak: number;
      bestMatchPoints: number; bestMatchName: string;
      bestMatchGoals: number; bestMatchAssists: number;
    }> = {};

    const ensurePlayer = (name: string) => {
      if (!playerMap[name]) {
        playerMap[name] = {
          name, matchesPlayed: 0, wins: 0, losses: 0, draws: 0,
          goals: 0, assists: 0, points: 0, gwg: 0,
          goalsAgainst: 0, cleanSheets: 0, gkMatches: 0,
          maxWinStreak: 0, currentWinStreak: 0,
          maxUnbeatenStreak: 0,
          bestMatchPoints: 0, bestMatchName: "", bestMatchGoals: 0, bestMatchAssists: 0,
        };
      }
    };

    const playerMatchResults: Record<string, Array<"win" | "loss" | "draw">> = {};

    for (const match of matches) {
      const lineup = match.lineup as any;
      const lineupEntries = lineup?.lineup || {};
      const teamAName = (lineup?.teamAName || "").toLowerCase();
      const isTeamAWhite = teamAIsWhite(teamAName);
      const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
      const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
      const isDraw = match.teamWhiteScore === match.teamGreenScore;

      const matchPlayerGoals: Record<string, number> = {};
      const matchPlayerAssists: Record<string, number> = {};

      const goals = match.goalHistory as Array<{ team: string; scorer?: string; assist?: string; other?: string }> | null;
      if (goals && Array.isArray(goals)) {
        for (const goal of goals) {
          if (goal.scorer) matchPlayerGoals[goal.scorer] = (matchPlayerGoals[goal.scorer] || 0) + 1;
          if (goal.assist) matchPlayerAssists[goal.assist] = (matchPlayerAssists[goal.assist] || 0) + 1;
        }

        const gwgScorer = findGwgScorer(goals, match.teamWhiteScore, match.teamGreenScore);
        if (gwgScorer) {
          ensurePlayer(gwgScorer);
          playerMap[gwgScorer].gwg++;
        }
      }

      for (const [slotId, p] of Object.entries(lineupEntries)) {
        if (!p || typeof p !== "object" || !(p as any).name) continue;
        const playerKey = getPlayerKey(p);
        ensurePlayer(playerKey);

        const { team: playerTeam } = getPlayerTeamFromSlot(slotId, isTeamAWhite);
        playerMap[playerKey].matchesPlayed++;

        let result: "win" | "loss" | "draw" = "draw";
        if (isDraw) {
          playerMap[playerKey].draws++;
        } else if ((playerTeam === "white" && isWhiteWin) || (playerTeam === "green" && isGreenWin)) {
          playerMap[playerKey].wins++;
          result = "win";
        } else {
          playerMap[playerKey].losses++;
          result = "loss";
        }

        if (!playerMatchResults[playerKey]) playerMatchResults[playerKey] = [];
        playerMatchResults[playerKey].push(result);

        if (slotId.includes("-gk-")) {
          playerMap[playerKey].gkMatches++;
          const goalsAgainst = playerTeam === "white" ? match.teamGreenScore : match.teamWhiteScore;
          playerMap[playerKey].goalsAgainst += goalsAgainst;
          if (goalsAgainst === 0) playerMap[playerKey].cleanSheets++;
        }

        const mGoals = matchPlayerGoals[playerKey] || 0;
        const mAssists = matchPlayerAssists[playerKey] || 0;
        const mPoints = mGoals + mAssists;
        if (mPoints > playerMap[playerKey].bestMatchPoints) {
          playerMap[playerKey].bestMatchPoints = mPoints;
          playerMap[playerKey].bestMatchName = match.name;
          playerMap[playerKey].bestMatchGoals = mGoals;
          playerMap[playerKey].bestMatchAssists = mAssists;
        }
      }

      for (const [player, g] of Object.entries(matchPlayerGoals)) {
        ensurePlayer(player);
        playerMap[player].goals += g;
      }
      for (const [player, a] of Object.entries(matchPlayerAssists)) {
        ensurePlayer(player);
        playerMap[player].assists += a;
      }
    }

    for (const player of Object.values(playerMap)) {
      player.points = player.goals + player.assists;
      const results = playerMatchResults[player.name] || [];
      let curWin = 0, maxWin = 0, curUnbeaten = 0, maxUnbeaten = 0;
      for (const r of results) {
        if (r === "win") { curWin++; curUnbeaten++; }
        else if (r === "draw") { curWin = 0; curUnbeaten++; }
        else { curWin = 0; curUnbeaten = 0; }
        maxWin = Math.max(maxWin, curWin);
        maxUnbeaten = Math.max(maxUnbeaten, curUnbeaten);
      }
      player.maxWinStreak = maxWin;
      player.currentWinStreak = curWin;
      player.maxUnbeatenStreak = maxUnbeaten;
    }

    const players = Object.values(playerMap).filter(p => p.matchesPlayed >= 1 || p.goals > 0 || p.assists > 0);
    const minMatches = Math.max(1, Math.floor(matches.length * 0.3));

    const awards: Array<{
      id: string; title: string; emoji: string; winner: string;
      value: string; description: string; runnerUp?: string; runnerUpValue?: string; third?: string; thirdValue?: string;
    }> = [];

    // 1. Skyttekung
    const byGoals = [...players].sort((a, b) => b.goals - a.goals || b.points - a.points);
    if (byGoals.length > 0 && byGoals[0].goals > 0) {
      awards.push({ id: "top_scorer", title: "Skyttekung", emoji: "\uD83C\uDFD2", winner: byGoals[0].name, value: `${byGoals[0].goals} mål`, description: "Flest gjorda mål under säsongen", runnerUp: byGoals[1]?.name, runnerUpValue: byGoals[1] ? `${byGoals[1].goals} mål` : undefined, third: byGoals[2]?.name, thirdValue: byGoals[2] ? `${byGoals[2].goals} mål` : undefined });
    }

    // 2. Poängkung
    const byPoints = [...players].sort((a, b) => b.points - a.points || b.goals - a.goals || b.assists - a.assists || b.gwg - a.gwg);
    if (byPoints.length > 0 && byPoints[0].points > 0) {
      awards.push({ id: "points_leader", title: "Poängkung", emoji: "\uD83D\uDC51", winner: byPoints[0].name, value: `${byPoints[0].points} poäng (${byPoints[0].goals}+${byPoints[0].assists})`, description: "Flest poäng (mål + assist) under säsongen", runnerUp: byPoints[1]?.name, runnerUpValue: byPoints[1] ? `${byPoints[1].points} poäng` : undefined, third: byPoints[2]?.name, thirdValue: byPoints[2] ? `${byPoints[2].points} poäng` : undefined });
    }

    // 3. Assistkung
    const byAssists = [...players].sort((a, b) => b.assists - a.assists || b.points - a.points);
    if (byAssists.length > 0 && byAssists[0].assists > 0) {
      awards.push({ id: "assist_leader", title: "Assistkung", emoji: "\uD83E\uDD45", winner: byAssists[0].name, value: `${byAssists[0].assists} assist`, description: "Flest assist under säsongen", runnerUp: byAssists[1]?.name, runnerUpValue: byAssists[1] ? `${byAssists[1].assists} assist` : undefined, third: byAssists[2]?.name, thirdValue: byAssists[2] ? `${byAssists[2].assists} assist` : undefined });
    }

    // 4. Mr. Clutch
    const byGwg = [...players].sort((a, b) => b.gwg - a.gwg || b.goals - a.goals);
    if (byGwg.length > 0 && byGwg[0].gwg > 0) {
      awards.push({ id: "mr_clutch", title: "Mr. Clutch", emoji: "\uD83E\uDD45", winner: byGwg[0].name, value: `${byGwg[0].gwg} GWG`, description: "Flest avgörande mål (Game Winning Goals)", runnerUp: byGwg[1]?.name, runnerUpValue: byGwg[1] ? `${byGwg[1].gwg} GWG` : undefined, third: byGwg[2]?.name, thirdValue: byGwg[2] ? `${byGwg[2].gwg} GWG` : undefined });
    }

    // 5. Vinnaren
    const eligibleWinRate = players.filter(p => p.matchesPlayed >= minMatches);
    const byWinRate = [...eligibleWinRate].sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed) || b.wins - a.wins);
    if (byWinRate.length > 0 && byWinRate[0].wins > 0) {
      const wr = Math.round((byWinRate[0].wins / byWinRate[0].matchesPlayed) * 100);
      awards.push({ id: "best_winner", title: "Vinnaren", emoji: "\uD83C\uDFC6", winner: byWinRate[0].name, value: `${wr}% (${byWinRate[0].wins}V/${byWinRate[0].matchesPlayed}M)`, description: `Högsta vinstprocent (min ${minMatches} matcher)`, runnerUp: byWinRate[1]?.name, runnerUpValue: byWinRate[1] ? `${Math.round((byWinRate[1].wins / byWinRate[1].matchesPlayed) * 100)}%` : undefined, third: byWinRate[2]?.name, thirdValue: byWinRate[2] ? `${Math.round((byWinRate[2].wins / byWinRate[2].matchesPlayed) * 100)}%` : undefined });
    }

    // 6. Järnmannen
    const byMatches = [...players].sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    if (byMatches.length > 0) {
      awards.push({ id: "iron_man", title: "Järnmannen", emoji: "\uD83D\uDCAA", winner: byMatches[0].name, value: `${byMatches[0].matchesPlayed} matcher`, description: "Flest spelade matcher under säsongen", runnerUp: byMatches[1]?.name, runnerUpValue: byMatches[1] ? `${byMatches[1].matchesPlayed} matcher` : undefined, third: byMatches[2]?.name, thirdValue: byMatches[2] ? `${byMatches[2].matchesPlayed} matcher` : undefined });
    }

    // 7. Bästa sviten
    const byWinStreak = [...players].sort((a, b) => b.maxWinStreak - a.maxWinStreak || b.wins - a.wins);
    if (byWinStreak.length > 0 && byWinStreak[0].maxWinStreak > 1) {
      awards.push({ id: "best_streak", title: "Bästa sviten", emoji: "\uD83D\uDD25", winner: byWinStreak[0].name, value: `${byWinStreak[0].maxWinStreak} raka vinster`, description: "Längsta vinstsviten under säsongen", runnerUp: byWinStreak[1]?.name, runnerUpValue: byWinStreak[1]?.maxWinStreak > 1 ? `${byWinStreak[1].maxWinStreak} raka vinster` : undefined, third: byWinStreak[2]?.name, thirdValue: byWinStreak[2]?.maxWinStreak > 1 ? `${byWinStreak[2].maxWinStreak} raka vinster` : undefined });
    }

    // 8. Obesegrad
    const byUnbeaten = [...players].sort((a, b) => b.maxUnbeatenStreak - a.maxUnbeatenStreak);
    if (byUnbeaten.length > 0 && byUnbeaten[0].maxUnbeatenStreak > 2) {
      awards.push({ id: "unbeaten", title: "Obesegrad", emoji: "\uD83D\uDEE1\uFE0F", winner: byUnbeaten[0].name, value: `${byUnbeaten[0].maxUnbeatenStreak} matcher utan förlust`, description: "Längsta obesegrade sviten", runnerUp: byUnbeaten[1]?.name, runnerUpValue: byUnbeaten[1]?.maxUnbeatenStreak > 2 ? `${byUnbeaten[1].maxUnbeatenStreak} matcher` : undefined, third: byUnbeaten[2]?.name, thirdValue: byUnbeaten[2]?.maxUnbeatenStreak > 2 ? `${byUnbeaten[2].maxUnbeatenStreak} matcher` : undefined });
    }

    // 9. Matchens spelare
    const byBestMatch = [...players].sort((a, b) => b.bestMatchPoints - a.bestMatchPoints || b.bestMatchGoals - a.bestMatchGoals);
    if (byBestMatch.length > 0 && byBestMatch[0].bestMatchPoints > 0) {
      awards.push({ id: "best_match", title: "Matchens spelare", emoji: "\u2B50", winner: byBestMatch[0].name, value: `${byBestMatch[0].bestMatchPoints}p (${byBestMatch[0].bestMatchGoals}+${byBestMatch[0].bestMatchAssists})`, description: `Bästa enskilda matchprestationen — ${byBestMatch[0].bestMatchName}`, runnerUp: byBestMatch[1]?.name, runnerUpValue: byBestMatch[1]?.bestMatchPoints > 0 ? `${byBestMatch[1].bestMatchPoints}p` : undefined, third: byBestMatch[2]?.name, thirdValue: byBestMatch[2]?.bestMatchPoints > 0 ? `${byBestMatch[2].bestMatchPoints}p` : undefined });
    }

    // 10. Bästa målvakt
    const goalkeepers = players.filter(p => p.gkMatches >= 1);
    const byGk = [...goalkeepers].sort((a, b) => (a.goalsAgainst / a.gkMatches) - (b.goalsAgainst / b.gkMatches) || b.cleanSheets - a.cleanSheets);
    if (byGk.length > 0) {
      const gaPer = (byGk[0].goalsAgainst / byGk[0].gkMatches).toFixed(1);
      awards.push({ id: "best_goalkeeper", title: "Bästa målvakt", emoji: "\uD83E\uDD45", winner: byGk[0].name, value: `${gaPer} insläppta/match, ${byGk[0].cleanSheets} nollor`, description: `Lägst insläppta mål per match (${byGk[0].gkMatches} matcher i mål)`, runnerUp: byGk[1]?.name, runnerUpValue: byGk[1] ? `${(byGk[1].goalsAgainst / byGk[1].gkMatches).toFixed(1)} insläppta/match` : undefined, third: byGk[2]?.name, thirdValue: byGk[2] ? `${(byGk[2].goalsAgainst / byGk[2].gkMatches).toFixed(1)} insläppta/match` : undefined });
    }

    return { awards, totalMatches: matches.length };
  }),

  /** Aggregated season statistics */
  seasonStats: moduleProcedure("media", "cards", "stats", "players", "matches", "report").input(dateRangeInput).query(async ({ input }) => {
    const allMatches = await getAllMatchResults({ includeExternal: input?.includeExternal });
    const matches = filterMatchesByDate(allMatches, input?.from, input?.to);
    if (matches.length === 0) {
      return {
        totalMatches: 0, whiteWins: 0, greenWins: 0, draws: 0,
        totalGoalsWhite: 0, totalGoalsGreen: 0,
        topScorers: [] as { name: string; goals: number; assists: number; gwg: number; points: number; team: string; matches: number }[],
        starLeaders: [] as import("../starStats").StarCount[],
        recentForm: [] as { name: string; whiteScore: number; greenScore: number }[],
        biggestWinWhite: null as { name: string; whiteScore: number; greenScore: number } | null,
        biggestWinGreen: null as { name: string; whiteScore: number; greenScore: number } | null,
        highestScoringMatch: null as { name: string; whiteScore: number; greenScore: number; totalGoals: number } | null,
        goalTypes: [] as { type: string; count: number }[],
        playerRecordGoals: null as { playerName: string; goals: number; matchName: string } | null,
        playerRecordAssists: null as { playerName: string; assists: number; matchName: string } | null,
        playerRecordPoints: null as { playerName: string; points: number; goals: number; assists: number; matchName: string } | null,
        monthlyMvp: [] as { month: string; playerName: string; goals: number; assists: number; points: number; gwg: number; matches: number }[],
      };
    }

    let whiteWins = 0, greenWins = 0, draws = 0;
    let totalGoalsWhite = 0, totalGoalsGreen = 0;
    const playerStats: Record<string, { goals: number; assists: number; gwg: number; team: string; matches: number }> = {};
    const goalTypes: Record<string, number> = {};

    let biggestWinWhite: { name: string; whiteScore: number; greenScore: number; diff: number } | null = null;
    let biggestWinGreen: { name: string; whiteScore: number; greenScore: number; diff: number } | null = null;
    let highestScoringMatch: { name: string; whiteScore: number; greenScore: number; totalGoals: number } | null = null;

    let playerRecordGoals: { playerName: string; goals: number; matchName: string } | null = null;
    let playerRecordAssists: { playerName: string; assists: number; matchName: string } | null = null;
    let playerRecordPoints: { playerName: string; points: number; goals: number; assists: number; matchName: string } | null = null;

    const monthlyPlayerStats: Record<string, Record<string, { goals: number; assists: number; gwg: number; matches: Set<number> }>> = {};

    for (const match of matches) {
      // Lagsiffror (Vita/Gröna) bara för internmatcher – externa räknas bara för spelarna
      if (match.opponentId == null) {
      totalGoalsWhite += match.teamWhiteScore;
      totalGoalsGreen += match.teamGreenScore;

      if (match.teamWhiteScore > match.teamGreenScore) whiteWins++;
      else if (match.teamGreenScore > match.teamWhiteScore) greenWins++;
      else draws++;

      const totalGoals = match.teamWhiteScore + match.teamGreenScore;
      if (!highestScoringMatch || totalGoals > highestScoringMatch.totalGoals) {
        highestScoringMatch = { name: match.name, whiteScore: match.teamWhiteScore, greenScore: match.teamGreenScore, totalGoals };
      }

      const whiteDiff = match.teamWhiteScore - match.teamGreenScore;
      if (whiteDiff > 0 && (!biggestWinWhite || whiteDiff > biggestWinWhite.diff)) {
        biggestWinWhite = { name: match.name, whiteScore: match.teamWhiteScore, greenScore: match.teamGreenScore, diff: whiteDiff };
      }
      const greenDiff = match.teamGreenScore - match.teamWhiteScore;
      if (greenDiff > 0 && (!biggestWinGreen || greenDiff > biggestWinGreen.diff)) {
        biggestWinGreen = { name: match.name, whiteScore: match.teamWhiteScore, greenScore: match.teamGreenScore, diff: greenDiff };
      }
      }

      const goals = match.goalHistory as Array<{ team: string; scorer?: string; assist?: string; other?: string }> | null;
      if (goals && Array.isArray(goals)) {
        const matchPlayerGoals: Record<string, number> = {};
        const matchPlayerAssists: Record<string, number> = {};

        for (const goal of goals) {
          if (goal.scorer) {
            if (!playerStats[goal.scorer]) playerStats[goal.scorer] = { goals: 0, assists: 0, gwg: 0, team: goal.team, matches: 0 };
            playerStats[goal.scorer].goals++;
            matchPlayerGoals[goal.scorer] = (matchPlayerGoals[goal.scorer] || 0) + 1;
          }
          if (goal.assist) {
            if (!playerStats[goal.assist]) playerStats[goal.assist] = { goals: 0, assists: 0, gwg: 0, team: goal.team, matches: 0 };
            playerStats[goal.assist].assists++;
            matchPlayerAssists[goal.assist] = (matchPlayerAssists[goal.assist] || 0) + 1;
          }
          const key = normalizeGoalType(goal.other);
          if (key) goalTypes[key] = (goalTypes[key] || 0) + 1;
        }

        // Track matches played per player
        const matchPlayers = new Set([...Object.keys(matchPlayerGoals), ...Object.keys(matchPlayerAssists)]);
        for (const player of matchPlayers) {
          if (playerStats[player]) playerStats[player].matches++;
        }

        const gwgScorer = findGwgScorer(goals, match.teamWhiteScore, match.teamGreenScore);
        if (gwgScorer && playerStats[gwgScorer]) {
          playerStats[gwgScorer].gwg++;
        }

        for (const [player, g] of Object.entries(matchPlayerGoals)) {
          if (!playerRecordGoals || g > playerRecordGoals.goals) {
            playerRecordGoals = { playerName: player, goals: g, matchName: match.name };
          }
        }
        for (const [player, a] of Object.entries(matchPlayerAssists)) {
          if (!playerRecordAssists || a > playerRecordAssists.assists) {
            playerRecordAssists = { playerName: player, assists: a, matchName: match.name };
          }
        }
        const allPlayers = Array.from(new Set([...Object.keys(matchPlayerGoals), ...Object.keys(matchPlayerAssists)]));
        for (const player of allPlayers) {
          const g = matchPlayerGoals[player] || 0;
          const a = matchPlayerAssists[player] || 0;
          const pts = g + a;
          if (!playerRecordPoints || pts > playerRecordPoints.points) {
            playerRecordPoints = { playerName: player, points: pts, goals: g, assists: a, matchName: match.name };
          }
        }

        // Monthly MVP tracking
        const matchDate = match.createdAt ? new Date(match.createdAt) : null;
        if (matchDate) {
          const monthKey = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyPlayerStats[monthKey]) monthlyPlayerStats[monthKey] = {};
          const mps = monthlyPlayerStats[monthKey];
          for (const [player, g] of Object.entries(matchPlayerGoals)) {
            if (!mps[player]) mps[player] = { goals: 0, assists: 0, gwg: 0, matches: new Set() };
            mps[player].goals += g;
            mps[player].matches.add(match.id);
          }
          for (const [player, a] of Object.entries(matchPlayerAssists)) {
            if (!mps[player]) mps[player] = { goals: 0, assists: 0, gwg: 0, matches: new Set() };
            mps[player].assists += a;
            mps[player].matches.add(match.id);
          }
          if (gwgScorer) {
            if (!mps[gwgScorer]) mps[gwgScorer] = { goals: 0, assists: 0, gwg: 0, matches: new Set() };
            mps[gwgScorer].gwg++;
            mps[gwgScorer].matches.add(match.id);
          }
        }
      }
    }

    const monthlyMvp = Object.entries(monthlyPlayerStats)
      .map(([month, players]) => {
        let bestPlayer = "", bestPoints = -1, bestGwg = -1, bestGoals = 0, bestAssists = 0, bestMatches = 0;
        for (const [player, stats] of Object.entries(players)) {
          const pts = stats.goals + stats.assists;
          if (pts > bestPoints || (pts === bestPoints && stats.gwg > bestGwg)) {
            bestPlayer = player; bestPoints = pts; bestGwg = stats.gwg;
            bestGoals = stats.goals; bestAssists = stats.assists; bestMatches = stats.matches.size;
          }
        }
        return { month, playerName: bestPlayer, goals: bestGoals, assists: bestAssists, points: bestPoints, gwg: bestGwg, matches: bestMatches };
      })
      .sort((a, b) => b.month.localeCompare(a.month));

    const topScorers = Object.entries(playerStats)
      .map(([name, stats]) => ({ name, goals: stats.goals, assists: stats.assists, gwg: stats.gwg, points: stats.goals + stats.assists, team: stats.team, matches: stats.matches }))
      .sort((a, b) => b.points - a.points || b.goals - a.goals || b.assists - a.assists || b.gwg - a.gwg);

    const recentForm = matches.slice(0, 20).map(m => ({ name: m.name, whiteScore: m.teamWhiteScore, greenScore: m.teamGreenScore }));

    return {
      totalMatches: matches.length, whiteWins, greenWins, draws, totalGoalsWhite, totalGoalsGreen,
      topScorers, recentForm,
      // Matchens stjärnor per spelare (samma som i matchrapporterna)
      starLeaders: starCounts(matches as never),
      biggestWinWhite: biggestWinWhite ? { name: biggestWinWhite.name, whiteScore: biggestWinWhite.whiteScore, greenScore: biggestWinWhite.greenScore } : null,
      biggestWinGreen: biggestWinGreen ? { name: biggestWinGreen.name, whiteScore: biggestWinGreen.whiteScore, greenScore: biggestWinGreen.greenScore } : null,
      highestScoringMatch, playerRecordGoals, playerRecordAssists, playerRecordPoints,
      goalTypes: Object.entries(goalTypes).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      monthlyMvp,
    };
  }),

  /** Team comparison (Vita vs Gröna) */
  teamComparison: moduleProcedure("media", "cards", "stats", "players", "matches", "report").input(dateRangeInput).query(async ({ input }) => {
    const allMatches = await getAllMatchResults();
    const matches = filterMatchesByDate(allMatches, input?.from, input?.to);

    let whiteWins = 0, greenWins = 0, draws = 0;
    let whiteGoals = 0, greenGoals = 0;
    let whiteCleanSheets = 0, greenCleanSheets = 0;
    let whiteGwg = 0, greenGwg = 0;
    let whitePenalties = 0, greenPenalties = 0;
    const whitePlayers = new Set<string>();
    const greenPlayers = new Set<string>();
    let whiteTotalPoints = 0, greenTotalPoints = 0;

    for (const match of matches) {
      whiteGoals += match.teamWhiteScore;
      greenGoals += match.teamGreenScore;

      if (match.teamWhiteScore > match.teamGreenScore) whiteWins++;
      else if (match.teamGreenScore > match.teamWhiteScore) greenWins++;
      else draws++;

      if (match.teamGreenScore === 0) whiteCleanSheets++;
      if (match.teamWhiteScore === 0) greenCleanSheets++;

      const lineup = match.lineup as any;
      if (lineup) {
        const lineupEntries = lineup.lineup || {};
        const teamAName = (lineup.teamAName || "").toLowerCase();
        const isTeamAWhite = teamAIsWhite(teamAName);

        for (const [slotId, p] of Object.entries(lineupEntries)) {
          if (!p || typeof p !== "object" || !(p as any).name) continue;
          const key = getPlayerKey(p);
          const isTeamA = slotId.startsWith("team-a");
          if ((isTeamA && isTeamAWhite) || (!isTeamA && !isTeamAWhite)) {
            whitePlayers.add(key);
          } else {
            greenPlayers.add(key);
          }
        }
      }

      const goals = match.goalHistory as Array<{ team?: string; scorer?: string; assist?: string; other?: string }> | null;
      if (goals && Array.isArray(goals)) {
        for (const g of goals) {
          const gt = (g.team || "").toLowerCase();
          const isWhiteGoal = normalizeTeamKey(gt) === "white";
          if (isWhiteGoal) {
            whiteTotalPoints++;
            if (g.assist) whiteTotalPoints++;
            if (g.other === "Straff") whitePenalties++;
          } else {
            greenTotalPoints++;
            if (g.assist) greenTotalPoints++;
            if (g.other === "Straff") greenPenalties++;
          }
        }

        const gwgScorer = findGwgScorer(goals as any, match.teamWhiteScore, match.teamGreenScore);
        if (gwgScorer) {
          // Determine which team scored the GWG
          if (match.teamWhiteScore > match.teamGreenScore) whiteGwg++;
          else greenGwg++;
        }
      }
    }

    const totalMatches = matches.length || 1;

    return {
      totalMatches: matches.length,
      white: {
        wins: whiteWins, goals: whiteGoals,
        goalsPerMatch: Math.round((whiteGoals / totalMatches) * 10) / 10,
        cleanSheets: whiteCleanSheets, gwg: whiteGwg,
        uniquePlayers: whitePlayers.size,
        winRate: Math.round((whiteWins / totalMatches) * 100),
        totalPoints: whiteTotalPoints,
        pointsPerMatch: Math.round((whiteTotalPoints / totalMatches) * 10) / 10,
        penalties: whitePenalties,
        penaltiesPerMatch: Math.round((whitePenalties / totalMatches) * 100) / 100,
      },
      green: {
        wins: greenWins, goals: greenGoals,
        goalsPerMatch: Math.round((greenGoals / totalMatches) * 10) / 10,
        cleanSheets: greenCleanSheets, gwg: greenGwg,
        uniquePlayers: greenPlayers.size,
        winRate: Math.round((greenWins / totalMatches) * 100),
        totalPoints: greenTotalPoints,
        pointsPerMatch: Math.round((greenTotalPoints / totalMatches) * 10) / 10,
        penalties: greenPenalties,
        penaltiesPerMatch: Math.round((greenPenalties / totalMatches) * 100) / 100,
      },
      draws,
    };
  }),
});
