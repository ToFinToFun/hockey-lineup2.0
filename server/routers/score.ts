/**
 * Score Tracker tRPC router.
 * Ported from stalstadens-score-tracker-web/server/routers.ts
 * Provides match CRUD, player stats, goalkeeper stats, player profiles,
 * head-to-head, season awards, season stats, and team comparison.
 */

import { publicProcedure, router } from "../_core/trpc";
import {
  insertMatchResult,
  getAllMatchResults,
  getMatchResultById,
  updateMatchResult,
  deleteMatchResult,
  deleteMultipleMatchResults,
  getConfigValue,
  setConfigValue,
  getAllConfig,
} from "../scoreDb";
import { z } from "zod";

// ─── Helpers ────────────────────────────────────────────────────────

/** Filter matches by optional date range (YYYY-MM-DD strings) */
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

// Default period config values
const DEFAULT_SEASON_FROM = "2025-10-01";
const DEFAULT_SEASON_TO = "2026-04-01";
const DEFAULT_PLAYOFF_FROM = "2026-04-01";
const DEFAULT_PLAYOFF_TO = "2026-05-01";
const DEFAULT_PRESEASON_FROM = "2025-09-01";
const DEFAULT_PRESEASON_TO = "2025-10-01";

const dateRangeInput = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .optional();

// ─── Score Router ───────────────────────────────────────────────────

export const scoreRouter = router({
  /** App configuration (season/playoff dates) */
  config: router({
    getPeriods: publicProcedure.query(async () => {
      const config = await getAllConfig();
      return {
        seasonFrom: config["season_from"] ?? DEFAULT_SEASON_FROM,
        seasonTo: config["season_to"] ?? DEFAULT_SEASON_TO,
        playoffFrom: config["playoff_from"] ?? DEFAULT_PLAYOFF_FROM,
        playoffTo: config["playoff_to"] ?? DEFAULT_PLAYOFF_TO,
        preseasonFrom: config["preseason_from"] ?? DEFAULT_PRESEASON_FROM,
        preseasonTo: config["preseason_to"] ?? DEFAULT_PRESEASON_TO,
      };
    }),
    updatePeriods: publicProcedure
      .input(
        z.object({
          seasonFrom: z.string().optional(),
          seasonTo: z.string().optional(),
          playoffFrom: z.string().optional(),
          playoffTo: z.string().optional(),
          preseasonFrom: z.string().optional(),
          preseasonTo: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.seasonFrom) await setConfigValue("season_from", input.seasonFrom);
        if (input.seasonTo) await setConfigValue("season_to", input.seasonTo);
        if (input.playoffFrom) await setConfigValue("playoff_from", input.playoffFrom);
        if (input.playoffTo) await setConfigValue("playoff_to", input.playoffTo);
        if (input.preseasonFrom) await setConfigValue("preseason_from", input.preseasonFrom);
        if (input.preseasonTo) await setConfigValue("preseason_to", input.preseasonTo);
        return { success: true };
      }),
  }),

  /** Match CRUD */
  match: router({
    save: publicProcedure
      .input(
        z.object({
          name: z.string(),
          teamWhiteScore: z.number(),
          teamGreenScore: z.number(),
          goalHistory: z.any().optional(),
          matchStartTime: z.string().optional(),
          lineup: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertMatchResult({
          name: input.name,
          teamWhiteScore: input.teamWhiteScore,
          teamGreenScore: input.teamGreenScore,
          goalHistory: input.goalHistory ?? null,
          matchStartTime: input.matchStartTime ? new Date(input.matchStartTime) : null,
          matchEndTime: new Date(),
          lineup: input.lineup ?? null,
        });
        return { success: true };
      }),

    list: publicProcedure.query(async () => {
      return getAllMatchResults();
    }),

    detail: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getMatchResultById(input.id);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          teamWhiteScore: z.number().optional(),
          teamGreenScore: z.number().optional(),
          goalHistory: z.any().optional(),
          lineup: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateMatchResult(id, { ...data, editedAt: new Date() });
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteMatchResult(input.id);
        return { success: true };
      }),

    deleteMany: publicProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        await deleteMultipleMatchResults(input.ids);
        return { success: true, deletedCount: input.ids.length };
      }),
  }),

  /** Per-player statistics across all matches - only players from lineups */
  playerStats: publicProcedure.input(dateRangeInput).query(async ({ input }) => {
    const allMatches = await getAllMatchResults();
    const matches = filterMatchesByDate(allMatches, input?.from, input?.to);
    const playerMap: Record<
      string,
      {
        name: string;
        matchesPlayed: number;
        matchesWhite: number;
        matchesGreen: number;
        wins: number;
        losses: number;
        draws: number;
        goals: number;
        assists: number;
        gwg: number;
        recentForm: Array<"V" | "F" | "O">;
        goalTypes: Record<string, number>;
      }
    > = {};

    for (const match of matches) {
      const lineup = match.lineup as any;
      if (!lineup) continue;

      const lineupEntries = lineup.lineup || {};
      const teamAName = (lineup.teamAName || "").toLowerCase();
      const isTeamAWhite = teamAName.includes("vit");

      const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
      const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
      const isDraw = match.teamWhiteScore === match.teamGreenScore;

      for (const [slotId, p] of Object.entries(lineupEntries)) {
        if (!p || typeof p !== "object" || !(p as any).name) continue;

        const pl = p as any;
        const playerKey = pl.number ? `${pl.name} #${pl.number}` : pl.name;

        let playerTeam: "white" | "green";
        if (slotId.startsWith("team-a")) {
          playerTeam = isTeamAWhite ? "white" : "green";
        } else {
          playerTeam = isTeamAWhite ? "green" : "white";
        }

        if (!playerMap[playerKey]) {
          playerMap[playerKey] = {
            name: playerKey,
            matchesPlayed: 0,
            matchesWhite: 0,
            matchesGreen: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            goals: 0,
            assists: 0,
            gwg: 0,
            recentForm: [],
            goalTypes: {},
          };
        }
        playerMap[playerKey].matchesPlayed++;
        if (playerTeam === "white") playerMap[playerKey].matchesWhite++;
        else playerMap[playerKey].matchesGreen++;

        if (isDraw) {
          playerMap[playerKey].draws++;
          playerMap[playerKey].recentForm.push("O");
        } else if (playerTeam === "white" && isWhiteWin) {
          playerMap[playerKey].wins++;
          playerMap[playerKey].recentForm.push("V");
        } else if (playerTeam === "green" && isGreenWin) {
          playerMap[playerKey].wins++;
          playerMap[playerKey].recentForm.push("V");
        } else {
          playerMap[playerKey].losses++;
          playerMap[playerKey].recentForm.push("F");
        }
      }

      // Count goals and assists from goalHistory
      const goals = match.goalHistory as Array<{
        scorer?: string;
        assist?: string;
        other?: string;
      }> | null;
      if (goals && Array.isArray(goals)) {
        for (const goal of goals) {
          if (goal.scorer && playerMap[goal.scorer]) {
            playerMap[goal.scorer].goals++;
            if (goal.other) {
              playerMap[goal.scorer].goalTypes[goal.other] =
                (playerMap[goal.scorer].goalTypes[goal.other] || 0) + 1;
            }
          }
          if (goal.assist && playerMap[goal.assist]) {
            playerMap[goal.assist].assists++;
          }
        }

        // GWG calculation
        if (!isDraw) {
          const winnerTeam = isWhiteWin ? "white" : "green";
          const loserScore = isWhiteWin ? match.teamGreenScore : match.teamWhiteScore;
          const chronologicalGoals = [...goals].reverse();
          let winnerGoalCount = 0;
          for (const goal of chronologicalGoals) {
            if (!goal.scorer) continue;
            const scorerEntry = Object.entries(lineupEntries).find(([, p]) => {
              const pl = p as any;
              const key = pl?.number ? `${pl.name} #${pl.number}` : pl?.name;
              return key === goal.scorer;
            });
            if (!scorerEntry) continue;
            const scorerSlotId = scorerEntry[0];
            let scorerTeam: "white" | "green";
            if (scorerSlotId.startsWith("team-a")) {
              scorerTeam = isTeamAWhite ? "white" : "green";
            } else {
              scorerTeam = isTeamAWhite ? "green" : "white";
            }
            if (scorerTeam === winnerTeam) {
              if (winnerGoalCount === loserScore && playerMap[goal.scorer]) {
                playerMap[goal.scorer].gwg++;
                break;
              }
              winnerGoalCount++;
            }
          }
        }
      }
    }

    return Object.values(playerMap)
      .map(p => ({
        name: p.name,
        matchesPlayed: p.matchesPlayed,
        matchesWhite: p.matchesWhite,
        matchesGreen: p.matchesGreen,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        goals: p.goals,
        assists: p.assists,
        gwg: p.gwg,
        points: p.goals + p.assists,
        winRate: p.matchesPlayed > 0 ? Math.round((p.wins / p.matchesPlayed) * 100) : 0,
        recentForm: p.recentForm.slice(-5),
        goalTypes: p.goalTypes,
      }))
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.points - a.points);
  }),

  /** Goalkeeper statistics */
  goalkeeperStats: publicProcedure.input(dateRangeInput).query(async ({ input }) => {
    const allMatches = await getAllMatchResults();
    const matches = filterMatchesByDate(allMatches, input?.from, input?.to);
    const gkMap: Record<
      string,
      {
        name: string;
        matchesPlayed: number;
        matchesWhite: number;
        matchesGreen: number;
        wins: number;
        losses: number;
        draws: number;
        goalsAgainst: number;
        cleanSheets: number;
        teams: Set<string>;
      }
    > = {};

    for (const match of matches) {
      const lineup = match.lineup as any;
      if (!lineup) continue;

      const lineupEntries = lineup.lineup || {};
      const teamAName = (lineup.teamAName || "").toLowerCase();
      const isTeamAWhite = teamAName.includes("vit");

      const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
      const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
      const isDraw = match.teamWhiteScore === match.teamGreenScore;

      for (const [slotId, p] of Object.entries(lineupEntries)) {
        if (!slotId.includes("-gk-")) continue;
        if (!p || typeof p !== "object" || !(p as any).name) continue;

        const pl = p as any;
        const key = pl.number ? `${pl.name} #${pl.number}` : pl.name;

        let playerTeam: "white" | "green";
        if (slotId.startsWith("team-a")) {
          playerTeam = isTeamAWhite ? "white" : "green";
        } else {
          playerTeam = isTeamAWhite ? "green" : "white";
        }

        const goalsAgainst = playerTeam === "white" ? match.teamGreenScore : match.teamWhiteScore;

        if (!gkMap[key]) {
          gkMap[key] = {
            name: key,
            matchesPlayed: 0,
            matchesWhite: 0,
            matchesGreen: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            goalsAgainst: 0,
            cleanSheets: 0,
            teams: new Set(),
          };
        }

        gkMap[key].matchesPlayed++;
        if (playerTeam === "white") gkMap[key].matchesWhite++;
        else gkMap[key].matchesGreen++;
        gkMap[key].goalsAgainst += goalsAgainst;
        gkMap[key].teams.add(playerTeam);

        if (goalsAgainst === 0) gkMap[key].cleanSheets++;

        if (isDraw) gkMap[key].draws++;
        else if (playerTeam === "white" && isWhiteWin) gkMap[key].wins++;
        else if (playerTeam === "green" && isGreenWin) gkMap[key].wins++;
        else gkMap[key].losses++;
      }
    }

    return Object.values(gkMap)
      .map(gk => ({
        name: gk.name,
        matchesPlayed: gk.matchesPlayed,
        matchesWhite: gk.matchesWhite,
        matchesGreen: gk.matchesGreen,
        wins: gk.wins,
        losses: gk.losses,
        draws: gk.draws,
        goalsAgainst: gk.goalsAgainst,
        goalsAgainstPerMatch:
          gk.matchesPlayed > 0 ? Math.round((gk.goalsAgainst / gk.matchesPlayed) * 10) / 10 : 0,
        cleanSheets: gk.cleanSheets,
        winRate: gk.matchesPlayed > 0 ? Math.round((gk.wins / gk.matchesPlayed) * 100) : 0,
        primaryTeam: gk.teams.size > 0 ? Array.from(gk.teams)[0] : "unknown",
      }))
      .sort(
        (a, b) => b.matchesPlayed - a.matchesPlayed || a.goalsAgainstPerMatch - b.goalsAgainstPerMatch
      );
  }),
});
