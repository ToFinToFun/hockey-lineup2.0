import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { fetchAttendance, updateAttendance, type AttendingStatus } from "./lagetSe";
import { saveLagetSeCredentials, getLagetSeCredentials, hasLagetSeCredentials } from "./secretsDb";
import {
  getLineupState,
  saveLineupState,
  getOperationsAfter,
  createSavedLineup,
  getAllSavedLineups,
  getSavedLineupByShareId,
  toggleSavedLineupFavorite,
  deleteSavedLineup,
} from "./lineupDb";
import { sseManager } from "./sse";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  laget: router({
    /** Hämta anmälningslistan från laget.se för dagens/nästa event */
    attendance: publicProcedure.query(async () => {
      const result = await fetchAttendance();
      return result;
    }),

    /** Ändra en spelares deltagarstatus på laget.se */
    updateAttendance: publicProcedure
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
    /** Get the current lineup state */
    getState: publicProcedure.query(async () => {
      const state = await getLineupState();
      return state;
    }),

    /** Save/update the full lineup state with an operation description */
    saveState: publicProcedure
      .input(
        z.object({
          players: z.array(z.any()),
          lineup: z.record(z.string(), z.any()),
          teamAName: z.string(),
          teamBName: z.string(),
          teamAConfig: z.object({
            goalkeepers: z.number(),
            defensePairs: z.number(),
            forwardLines: z.number(),
          }).optional(),
          teamBConfig: z.object({
            goalkeepers: z.number(),
            defensePairs: z.number(),
            forwardLines: z.number(),
          }).optional(),
          deletedPlayerIds: z.array(z.string()).optional(),
          operation: z.object({
            opType: z.string(),
            description: z.string(),
            payload: z.record(z.string(), z.any()).optional(),
          }).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { operation, ...stateData } = input;
        const result = await saveLineupState(stateData, operation);

        // Notify all SSE clients about the change
        // Echo prevention is handled client-side via version numbers
        sseManager.notifyStateChange({
          version: result.version,
          opType: operation?.opType ?? "fullSync",
          description: operation?.description ?? "",
          state: stateData,
        });

        return result;
      }),

    /** Get operations after a given sequence number (for SSE catch-up) */
    getOperationsAfter: publicProcedure
      .input(z.object({ afterSeq: z.number() }))
      .query(async ({ input }) => {
        return getOperationsAfter(input.afterSeq);
      }),
  }),

  // ─── Saved Lineups ────────────────────────────────────────────────────────

  savedLineups: router({
    /** Get all saved lineups */
    list: publicProcedure.query(async () => {
      return getAllSavedLineups();
    }),

    /** Get a single saved lineup by shareId (for shared view) */
    getByShareId: publicProcedure
      .input(z.object({ shareId: z.string() }))
      .query(async ({ input }) => {
        return getSavedLineupByShareId(input.shareId);
      }),

    /** Create a new saved lineup */
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          teamAName: z.string(),
          teamBName: z.string(),
          lineup: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ input }) => {
        const result = await createSavedLineup(input);
        // Notify SSE clients
        sseManager.notifySavedLineupsChange({
          action: "created",
          shareId: result.shareId,
          id: result.id,
        });
        return result;
      }),

    /** Toggle favorite status */
    toggleFavorite: publicProcedure
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
    delete: publicProcedure
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
    /** Check if laget.se credentials are configured */
    hasLagetSeCredentials: publicProcedure.query(async () => {
      return { configured: await hasLagetSeCredentials() };
    }),

    /** Get laget.se username (masked password) */
    getLagetSeInfo: publicProcedure.query(async () => {
      const creds = await getLagetSeCredentials();
      if (!creds) return { configured: false, username: "" };
      return { configured: true, username: creds.username };
    }),

    /** Save laget.se credentials (encrypted in DB) */
    saveLagetSeCredentials: publicProcedure
      .input(
        z.object({
          username: z.string().min(1, "Ange e-postadress"),
          password: z.string().min(1, "Ange lösenord"),
        })
      )
      .mutation(async ({ input }) => {
        await saveLagetSeCredentials(input);
        return { success: true };
      }),

    /** Test laget.se connection with current credentials */
    testLagetSeConnection: publicProcedure.mutation(async () => {
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
  }),
});

export type AppRouter = typeof appRouter;
