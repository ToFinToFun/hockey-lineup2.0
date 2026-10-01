import { normalizeGoalType } from "../playerHistory";
import { resolvePeriods, toMonthDay, type MonthDayPeriods } from "../../shared/periods";
import { scheduleLiveProfileRefresh } from "../cardProfile";
import { unlockLineup } from "../lineupLock";
import { notifyLater, mailLayout } from "../notifications";
import { ENV } from "../_core/env";
import { TRPCError } from "@trpc/server";
/**
 * Score Tracker tRPC router.
 * Ported from stalstadens-score-tracker-web/server/routers.ts
 * Provides match CRUD, player stats, goalkeeper stats, player profiles,
 * head-to-head, season awards, season stats, and team comparison.
 */

import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import {
  saveMatch,
  getAllMatchResults,
  getAllMatchesIncludingUnreviewed,
  countPendingMatches,
  setMatchReviewStatus,
  getMatchResultById,
  updateMatch,
  setMatchReport,
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
/** Månad-dag ("10-01"); gamla värden med år ("2025-10-01") godtas och sparas utan år. */
const monthDay = z.string().regex(/^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Ange månad och dag").transform(toMonthDay);
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

// Skydd mot massinskick från den öppna score trackern: max 20 matcher per IP och timme.
const saveAttempts = new Map<string, { count: number; resetAt: number }>();
function saveRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = saveAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    saveAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 20;
}

const REPORT_TAGS_KEY = "report_hashtags";
const DEFAULT_REPORT_TAGS = ["#StålstadensSF", "#Gubbhockey"];

export const scoreRouter = router({
  /** App configuration (season/playoff dates) */
  config: router({
    /**
     * Perioderna: månad-dag som återkommer varje år (recurring) och de konkreta
     * datumen för det pågående hockeyåret (som statistiken filtrerar på).
     */
    getPeriods: adminProcedure.query(async () => {
      const config = await getAllConfig();
      const recurring: MonthDayPeriods = {
        seasonFrom: toMonthDay(config["season_from"] ?? DEFAULT_SEASON_FROM),
        seasonTo: toMonthDay(config["season_to"] ?? DEFAULT_SEASON_TO),
        playoffFrom: toMonthDay(config["playoff_from"] ?? DEFAULT_PLAYOFF_FROM),
        playoffTo: toMonthDay(config["playoff_to"] ?? DEFAULT_PLAYOFF_TO),
        preseasonFrom: toMonthDay(config["preseason_from"] ?? DEFAULT_PRESEASON_FROM),
        preseasonTo: toMonthDay(config["preseason_to"] ?? DEFAULT_PRESEASON_TO),
      };
      return { ...resolvePeriods(recurring), recurring };
    }),
    updatePeriods: adminProcedure
      .input(
        z.object({
          seasonFrom: monthDay.optional(),
          seasonTo: monthDay.optional(),
          playoffFrom: monthDay.optional(),
          playoffTo: monthDay.optional(),
          preseasonFrom: monthDay.optional(),
          preseasonTo: monthDay.optional(),
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
  /** Hashtags som alltid läggs till i matchrapportens bildtext. */
  reportTags: router({
    get: adminProcedure.query(async () => {
      const raw = await getConfigValue(REPORT_TAGS_KEY);
      try {
        const tags = raw ? (JSON.parse(raw) as string[]) : null;
        if (Array.isArray(tags)) return tags;
      } catch { /* standard */ }
      return DEFAULT_REPORT_TAGS;
    }),
    set: adminProcedure
      .input(z.array(z.string().trim().min(2).max(60).regex(/^#[^\s#]+$/, "En hashtag börjar med # och har inga mellanslag")).max(20))
      .mutation(async ({ input }) => {
        await setConfigValue(REPORT_TAGS_KEY, JSON.stringify(input));
        return { success: true };
      }),
  }),

  match: router({
    save: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          teamWhiteScore: z.number().int().min(0).max(99),
          teamGreenScore: z.number().int().min(0).max(99),
          goalHistory: z
            .array(
              z.object({
                team: z.string().max(20),
                scorer: z.string().max(100).optional().default(""),
                assist: z.string().max(100).optional(),
                scorerId: z.string().max(64).optional(),
                assistId: z.string().max(64).optional(),
                other: z.string().max(100).optional(),
                sponsor: z.string().max(100).optional(),
                timestamp: z.string().max(40),
              })
            )
            .max(200)
            .optional(),
          matchStartTime: z.string().max(40).optional(),
          matchEndTime: z.string().max(40).optional(),
          location: z.string().trim().max(120).optional(),
          createdAt: z.string().max(40).optional(),
          lineup: z.any().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (saveRateLimited(ctx.req.ip ?? "okänd")) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "För många sparade matcher, vänta en stund" });
        }
        const reviewStatus = ctx.session?.role === "admin" ? "approved" : "pending";
        await saveMatch({
          // Styrelsens matcher godkänns direkt, övriga väntar på granskning.
          reviewStatus,
          reviewedAt: ctx.session?.role === "admin" ? new Date() : null,
          name: input.name,
          teamWhiteScore: input.teamWhiteScore,
          teamGreenScore: input.teamGreenScore,
          goalHistory: input.goalHistory ?? null,
          matchStartTime: input.matchStartTime ? new Date(input.matchStartTime) : null,
          location: input.location || null,
          matchEndTime: input.matchEndTime ? new Date(input.matchEndTime) : new Date(),
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
          lineup: input.lineup ?? null,
        });
        scheduleLiveProfileRefresh(); // profilkort med statistik ritas om i bakgrunden
        await unlockLineup().catch(() => undefined); // matchen avslutad – laget låses upp
        if (reviewStatus === "pending") {
          const m = mailLayout("Match väntar på godkännande", [
            `<b>${input.name}</b> – Vita ${input.teamWhiteScore}–${input.teamGreenScore} Gröna – är sparad och väntar på att godkännas innan den räknas i statistiken.`,
          ], { href: `${ENV.appUrl}/history`, label: "Öppna matchhistoriken" });
          notifyLater("matchPending", () => ({ subject: `Väntar på godkännande: ${input.name}`, ...m }));
        }
        return { success: true, reviewStatus };
      }),

    list: adminProcedure.query(async () => {
      return getAllMatchesIncludingUnreviewed();
    }),

    /** Antal matcher som väntar på granskning. */
    pendingCount: adminProcedure.query(async () => {
      return { count: await countPendingMatches() };
    }),

    /** Godkänn eller avvisa matcher. Bara godkända räknas i statistiken. */
    review: adminProcedure
      .input(
        z.object({
          ids: z.array(z.number().int()).min(1).max(500),
          status: z.enum(["approved", "rejected", "pending"]),
        })
      )
      .mutation(async ({ input }) => {
        await setMatchReviewStatus(input.ids, input.status);
        scheduleLiveProfileRefresh(); // profilkort med statistik ritas om i bakgrunden
        return { success: true };
      }),

    detail: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getMatchResultById(input.id);
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          teamWhiteScore: z.number().optional(),
          teamGreenScore: z.number().optional(),
          goalHistory: z.array(z.object({
            team: z.string().max(20),
            scorer: z.string().max(120).optional(),
            scorerId: z.string().max(64).optional(),
            assist: z.string().max(120).optional(),
            assistId: z.string().max(64).optional(),
            other: z.string().max(100).optional(),
            sponsor: z.string().max(120).optional(),
            timestamp: z.string().max(40).default(""),
          })).max(200).optional(),
          matchEndTime: z.string().optional(),
          createdAt: z.string().optional(),
          /** Plats (tom sträng tar bort den) */
          location: z.string().trim().max(120).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, matchEndTime, createdAt, location, ...data } = input;
        await updateMatch(id, {
          ...data,
          matchEndTime: matchEndTime ? new Date(matchEndTime) : undefined,
          createdAt: createdAt ? new Date(createdAt) : undefined,
          ...(location !== undefined ? { location: location || null } : {}),
        });
        scheduleLiveProfileRefresh(); // profilkort med statistik ritas om i bakgrunden
        return { success: true };
      }),

    /** Matchrapportens val: Stars of the Game och "presenteras av". */
    setReport: adminProcedure
      .input(z.object({
        id: z.number(),
        report: z.object({
          stars: z.array(z.string().max(120)).max(3).optional(),
          sponsor: z.string().max(120).nullable().optional(),
          showStats: z.array(z.boolean()).max(3).optional(),
          title: z.string().trim().max(30).nullable().optional(),
        }).nullable(),
      }))
      .mutation(async ({ input }) => {
        await setMatchReport(input.id, input.report);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteMatchResult(input.id);
        scheduleLiveProfileRefresh(); // profilkort med statistik ritas om i bakgrunden
        return { success: true };
      }),

    deleteMany: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        await deleteMultipleMatchResults(input.ids);
        scheduleLiveProfileRefresh(); // profilkort med statistik ritas om i bakgrunden
        return { success: true, deletedCount: input.ids.length };
      }),
  }),

  /** Per-player statistics across all matches - only players from lineups */
  playerStats: adminProcedure.input(dateRangeInput).query(async ({ input }) => {
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
            const gt = normalizeGoalType(goal.other);
            if (gt) playerMap[goal.scorer].goalTypes[gt] = (playerMap[goal.scorer].goalTypes[gt] || 0) + 1;
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
  goalkeeperStats: adminProcedure.input(dateRangeInput).query(async ({ input }) => {
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
