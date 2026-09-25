import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, lineupProcedure, adminProcedure, router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { fetchAttendance, updateAttendance, type AttendingStatus } from "./lagetSe";
import { scoreRouter } from "./routers/score";
import { scoreStatsRouter } from "./routers/scoreStats";
import { getAllMatchResults, getConfigValue, setConfigValue, getMatchCacheVersion } from "./scoreDb";
import { calculatePIR, DEFAULT_PIR_WEIGHTS, type PirWeights } from "./pir";
import { analyzePir, sanitizeWeights, type PirAnalysis } from "./pirAnalysis";
import { getLineupSnapshot, applyLineupPatch, applyFullState } from "./lineupSync";
import type { LineupOp } from "../shared/lineupDoc";
import {
  createSavedLineup,
  getAllSavedLineups,
  getSavedLineupByShareId,
  toggleSavedLineupFavorite,
  deleteSavedLineup,
  deleteExpiredShares,
} from "./lineupDb";
import { sseManager } from "./sse";
import { z } from "zod";

const teamConfigSchema = z.object({
  goalkeepers: z.number().int().min(1).max(2),
  defensePairs: z.number().int().min(1).max(4),
  forwardLines: z.number().int().min(1).max(4),
});
const playerSchema = z.looseObject({ id: z.string().min(1).max(100), name: z.string().max(200) });
const lineupOpSchema = z.union([
  z.object({ t: z.literal("slot"), slot: z.string().max(40), player: playerSchema.nullable() }),
  z.object({ t: z.literal("rosterUpsert"), player: playerSchema, index: z.number().int().min(0).max(10000) }),
  z.object({ t: z.literal("rosterRemove"), id: z.string().max(100) }),
  z.object({ t: z.literal("field"), key: z.enum(["teamAName", "teamBName"]), value: z.string().max(100) }),
  z.object({ t: z.literal("field"), key: z.enum(["teamAConfig", "teamBConfig"]), value: teamConfigSchema }),
  z.object({ t: z.literal("field"), key: z.literal("deletedPlayerIds"), value: z.array(z.string().max(100)).max(1000) }),
]);

let pirCache: { key: string; result: ReturnType<typeof calculatePIR> } | null = null;
let analysisCache: { key: string; result: PirAnalysis } | null = null;

// PIR-inställningar i app_config (vikter och manuella justeringar per spelare).
const PIR_WEIGHTS_KEY = "pir_weights";
const PIR_ADJUSTMENTS_KEY = "pir_adjustments";
let pirConfigVersion = 0;

async function loadPirConfig(): Promise<{ weights: PirWeights; adjustments: Record<string, number> }> {
  const [w, a] = await Promise.all([getConfigValue(PIR_WEIGHTS_KEY), getConfigValue(PIR_ADJUSTMENTS_KEY)]);
  let weights = DEFAULT_PIR_WEIGHTS;
  let adjustments: Record<string, number> = {};
  try { if (w) weights = sanitizeWeights(JSON.parse(w)); } catch { /* standardvikter */ }
  try { if (a) adjustments = JSON.parse(a); } catch { /* inga justeringar */ }
  return { weights, adjustments };
}

async function getPirRatings() {
  const key = `${getMatchCacheVersion()}:${pirConfigVersion}`;
  if (!pirCache || pirCache.key !== key) {
    const { weights, adjustments } = await loadPirConfig();
    pirCache = { key, result: calculatePIR(await getAllMatchResults(), { weights, adjustments }) };
  }
  return pirCache.result;
}

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  score: scoreRouter,
  scoreStats: scoreStatsRouter,
  laget: router({
    /** Hämta anmälningslistan från laget.se för dagens/nästa event */
    attendance: lineupProcedure.query(async () => {
      const result = await fetchAttendance();
      return result;
    }),

    /** Ändra en spelares deltagarstatus på laget.se */
    updateAttendance: lineupProcedure
      .input(
        z.object({
          playerName: z.string().min(1),
          status: z.enum(["Attending", "NotAttending", "NotAnswered"]),
        })
      )
      .mutation(async ({ input }) => {
        const result = await updateAttendance(
          input.playerName,
          input.status as AttendingStatus
        );
        return result;
      }),
  }),

  // ─── Lineup State ──────────────────────────────────────────────────────────

  lineup: router({
    /** Aktuell uppställning (öppen – visas i Score Tracker). */
    getState: publicProcedure.query(async () => {
      const { doc, version, appliedPatchIds } = await getLineupSnapshot();
      return { ...doc, version, appliedPatchIds };
    }),

    /** Tillämpa en ändring (patch) på uppställningen. Skickas live till alla enheter. */
    patch: lineupProcedure
      .input(
        z.object({
          id: z.string().min(8).max(64),
          clientId: z.string().max(64).optional(),
          ops: z.array(lineupOpSchema).min(1).max(500),
        })
      )
      .mutation(async ({ input }) => {
        return applyLineupPatch(input.id, input.ops as LineupOp[], input.clientId);
      }),

    /** Äldre klienter (före v2.2) skickar hela uppställningen – görs om till en patch. */
    saveState: lineupProcedure
      .input(
        z.object({
          players: z.array(z.any()),
          lineup: z.record(z.string(), z.any()),
          teamAName: z.string(),
          teamBName: z.string(),
          teamAConfig: teamConfigSchema.optional(),
          teamBConfig: teamConfigSchema.optional(),
          deletedPlayerIds: z.array(z.string()).optional(),
          operation: z.any().optional(),
          clientId: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { operation: _op, clientId, ...state } = input;
        return applyFullState(state, clientId);
      }),

    /**
     * Calculate the most-played position for each player from match history.
     * Returns a map: playerKey -> { mostPlayed: "B", stats: { B: 10, C: 2, ... } }
     */
    positionHistory: lineupProcedure.query(async () => {
      const allMatches = await getAllMatchResults();
      // playerKey -> { position -> count }
      const positionCounts: Record<string, Record<string, number>> = {};
      // playerKey -> { team -> count }
      const teamCounts: Record<string, Record<string, number>> = {};

      for (const match of allMatches) {
        const lineup = match.lineup as any;
        if (!lineup) continue;
        const lineupEntries = lineup.lineup || {};

        for (const [slotId, p] of Object.entries(lineupEntries)) {
          if (!p || typeof p !== "object" || !(p as any).name) continue;
          const pl = p as any;
          // Use just the name as key to consolidate across matches
          const playerKey = (pl.name as string).trim();

          // Extract position from slot ID
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
          if (!position) continue;

          if (!positionCounts[playerKey]) positionCounts[playerKey] = {};
          positionCounts[playerKey][position] = (positionCounts[playerKey][position] || 0) + 1;

          // Extract team from slot ID (team-a = white, team-b = green)
          let team = "";
          if (slotId.startsWith("team-a-")) team = "white";
          else if (slotId.startsWith("team-b-")) team = "green";
          if (team) {
            if (!teamCounts[playerKey]) teamCounts[playerKey] = {};
            teamCounts[playerKey][team] = (teamCounts[playerKey][team] || 0) + 1;
          }
        }
      }

      // For each player, find the most-played position and team
      const result: Record<string, { mostPlayed: string; stats: Record<string, number>; mostPlayedTeam?: string; teamStats?: Record<string, number> }> = {};
      for (const [playerKey, stats] of Object.entries(positionCounts)) {
        let mostPlayed = "";
        let maxCount = 0;
        for (const [pos, count] of Object.entries(stats)) {
          if (count > maxCount) {
            maxCount = count;
            mostPlayed = pos;
          }
        }

        // Most played team
        let mostPlayedTeam: string | undefined;
        const tStats = teamCounts[playerKey];
        if (tStats) {
          let maxTeamCount = 0;
          for (const [team, count] of Object.entries(tStats)) {
            if (count > maxTeamCount) {
              maxTeamCount = count;
              mostPlayedTeam = team;
            }
          }
        }

        result[playerKey] = { mostPlayed, stats, mostPlayedTeam, teamStats: tStats };
      }

      return result;
    }),
  }),

  // ─── Saved Lineups ────────────────────────────────────────────────────────

  savedLineups: router({
    /** Get all saved lineups */
    list: lineupProcedure.query(async () => {
      return getAllSavedLineups();
    }),

    /** En delad/sparad uppställning via länk. Öppen (skrivskyddad); delningslänkar går ut efter 48 h. */
    getByShareId: publicProcedure
      .input(z.object({ shareId: z.string().max(20) }))
      .query(async ({ input }) => {
        const row = await getSavedLineupByShareId(input.shareId);
        if (!row) return null;
        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
        return row;
      }),

    /** Create a new saved lineup */
    create: lineupProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          teamAName: z.string(),
          teamBName: z.string(),
          lineup: z.record(z.string(), z.any()),
          /** true = delningslänk som går ut efter 48 h och inte syns bland sparade. */
          share: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { share, ...data } = input;
        await deleteExpiredShares().catch(() => {});
        const result = await createSavedLineup({ ...data, expiresInHours: share ? 48 : undefined });
        if (share) return result;
        // Notify SSE clients
        sseManager.notifySavedLineupsChange({
          action: "created",
          shareId: result.shareId,
          id: result.id,
        });
        return result;
      }),

    /** Toggle favorite status */
    toggleFavorite: lineupProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await toggleSavedLineupFavorite(input.id);
        sseManager.notifySavedLineupsChange({
          action: "favoriteToggled",
          id: input.id,
        });
        return { success: true };
      }),

    /** Delete a saved lineup */
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSavedLineup(input.id);
        sseManager.notifySavedLineupsChange({
          action: "deleted",
          id: input.id,
        });
        return { success: true };
      }),
  }),

  // ─── Settings ──────────────────────────────────────────────────────────────

  settings: router({
    /** Test laget.se connection with current credentials */
    testLagetSeConnection: adminProcedure.mutation(async () => {
      try {
        const result = await fetchAttendance();
        if (result.error && result.error.includes("Kontrollera användarnamn")) {
          return { success: false, error: "Felaktigt användarnamn eller lösenord" };
        }
        if (result.error) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          eventTitle: result.eventTitle,
          eventDate: result.eventDate,
          totalRegistered: result.totalRegistered,
        };
      } catch (err: any) {
        return { success: false, error: err.message || "Okänt fel" };
      }
    }),

    /** Get PIR settings (all granular toggles) */
    getPirSettings: lineupProcedure.query(async () => {
      const [enabled, showRating, showTrend, showTeamStrength, showPrediction, useForBalance] = await Promise.all([
        getConfigValue("pir_enabled"),
        getConfigValue("pir_show_rating"),
        getConfigValue("pir_show_trend"),
        getConfigValue("pir_show_team_strength"),
        getConfigValue("pir_show_prediction"),
        getConfigValue("pir_use_for_balance"),
      ]);
      return {
        enabled: enabled === "true",
        showRating: showRating !== "false",       // default true when PIR enabled
        showTrend: showTrend !== "false",         // default true when PIR enabled
        showTeamStrength: showTeamStrength !== "false", // default true
        showPrediction: showPrediction !== "false",     // default true
        useForBalance: useForBalance !== "false",       // default true (always use for balance)
      };
    }),

    /** Update PIR settings (requires admin password) */
    setPirSettings: adminProcedure
      .input(
        z.object({
          password: z.string().optional(),
          enabled: z.boolean().optional(),
          showRating: z.boolean().optional(),
          showTrend: z.boolean().optional(),
          showTeamStrength: z.boolean().optional(),
          showPrediction: z.boolean().optional(),
          useForBalance: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const updates: Promise<void>[] = [];
        if (input.enabled !== undefined) updates.push(setConfigValue("pir_enabled", input.enabled ? "true" : "false"));
        if (input.showRating !== undefined) updates.push(setConfigValue("pir_show_rating", input.showRating ? "true" : "false"));
        if (input.showTrend !== undefined) updates.push(setConfigValue("pir_show_trend", input.showTrend ? "true" : "false"));
        if (input.showTeamStrength !== undefined) updates.push(setConfigValue("pir_show_team_strength", input.showTeamStrength ? "true" : "false"));
        if (input.showPrediction !== undefined) updates.push(setConfigValue("pir_show_prediction", input.showPrediction ? "true" : "false"));
        if (input.useForBalance !== undefined) updates.push(setConfigValue("pir_use_for_balance", input.useForBalance ? "true" : "false"));
        await Promise.all(updates);
        return { success: true };
      }),

    // Keep backward compat aliases
    getPirEnabled: adminProcedure.query(async () => {
      const val = await getConfigValue("pir_enabled");
      return { enabled: val === "true" };
    }),
    setPirEnabled: adminProcedure
      .input(z.object({ enabled: z.boolean(), password: z.string().optional() }))
      .mutation(async ({ input }) => {
        await setConfigValue("pir_enabled", input.enabled ? "true" : "false");
        return { success: true };
      }),
  }),

  // ─── PIR (Player Impact Rating) ──────────────────────────────────────────

  pir: router({
    /** Get PIR ratings for all players (enhanced with trend, confidence, etc.) */
    getRatings: lineupProcedure.query(async () => {
      // Räknas bara om när matcherna eller inställningarna har ändrats.
      return getPirRatings();
    }),

    /** Vikter och manuella justeringar (styrelsen). */
    getConfig: adminProcedure.query(async () => {
      const cfg = await loadPirConfig();
      return { ...cfg, defaults: DEFAULT_PIR_WEIGHTS };
    }),

    setWeights: adminProcedure
      .input(z.object({
        goal: z.number().min(0).max(20),
        assist: z.number().min(0).max(20),
        goalkeeper: z.number().min(0).max(20),
        halfLifeDays: z.number().min(14).max(730),
      }))
      .mutation(async ({ input }) => {
        await setConfigValue(PIR_WEIGHTS_KEY, JSON.stringify(sanitizeWeights(input)));
        pirConfigVersion++;
        return { success: true };
      }),

    /** Manuell justering av en spelares PIR (0 tar bort justeringen). */
    setAdjustment: adminProcedure
      .input(z.object({ playerKey: z.string().min(1).max(200), value: z.number().int().min(-500).max(500) }))
      .mutation(async ({ input }) => {
        const { adjustments } = await loadPirConfig();
        if (input.value === 0) delete adjustments[input.playerKey];
        else adjustments[input.playerKey] = input.value;
        await setConfigValue(PIR_ADJUSTMENTS_KEY, JSON.stringify(adjustments));
        pirConfigVersion++;
        return { success: true };
      }),

    /** Träffsäkerhet bakåt i tiden, med förslag på vikter om withSuggestion. */
    analysis: adminProcedure
      .input(z.object({ withSuggestion: z.boolean().default(false) }).optional())
      .query(async ({ input }) => {
        const { weights } = await loadPirConfig();
        const withSuggestion = input?.withSuggestion ?? false;
        const key = `${getMatchCacheVersion()}:${JSON.stringify(weights)}:${withSuggestion}`;
        if (!analysisCache || analysisCache.key !== key) {
          analysisCache = { key, result: await analyzePir(await getAllMatchResults(), weights, withSuggestion) };
        }
        return analysisCache.result;
      }),
  }),

  // ─── Stats Visibility ────────────────────────────────────────────────────

  statsConfig: router({
    /** Get stats visibility settings */
    getVisibility: adminProcedure.query(async () => {
      const raw = await getConfigValue("stats_visibility");
      const defaults = {
        overview: true,
        leaders: true,
        awards: true,
        players: true,
        teams: true,
        showPir: false,
        minMatchesForStats: 3,
      };
      if (!raw) return defaults;
      try {
        return { ...defaults, ...JSON.parse(raw) };
      } catch {
        return defaults;
      }
    }),

    /** Update stats visibility settings (requires admin password) */
    setVisibility: adminProcedure
      .input(
        z.object({
          password: z.string().optional(),
          overview: z.boolean().optional(),
          leaders: z.boolean().optional(),
          awards: z.boolean().optional(),
          players: z.boolean().optional(),
          teams: z.boolean().optional(),
          showPir: z.boolean().optional(),
          minMatchesForStats: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { password: _ignored, ...settings } = input;
        // Merge with existing
        const raw = await getConfigValue("stats_visibility");
        let current: Record<string, any> = {};
        if (raw) {
          try { current = JSON.parse(raw); } catch { /* ignore */ }
        }
        const merged = { ...current, ...settings };
        await setConfigValue("stats_visibility", JSON.stringify(merged));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
