import { isTeamAWhite, defaultTeamNames } from "../shared/teams";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, lineupProcedure, adminProcedure, router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { playersRouter } from "./routers/players";
import { newsExists, fetchAttendance, updateAttendance, publishNews, deleteNews, fetchAccountName, NEWS_ADMIN_URL, type AttendingStatus } from "./lagetSe";
import { seasonHistory, seasonOf, recentForm, recentWinners } from "./playerHistory";
import { ENV } from "./_core/env";
import { setPlayerPhoto, deletePlayerPhoto, MAX_PHOTO_BASE64 } from "./playerPhotos";
import { listCards, cardStats, saveCard, deleteCard, MAX_CARD_SOURCE_BASE64 } from "./playerCards";
import { refreshLiveProfile } from "./cardProfile";
import { club } from "../shared/club";
import { getClubOverrides, saveClubOverrides, loadClub } from "./clubConfig";
import { getFeatures, setFeatures } from "./features";
import { createOpponentLink, updateOpponentLink, ourViewOf, listOpponentLinks, revokeOpponentLink, resolveLink, linkView, setLinkSlot, afterLinkPlayerChange, getStoredOpponentLineup, getStoredOpponentList, setStoredOpponentList, setLinkList } from "./opponentLinks";
import { listOpponents, getOpponent, saveOpponent, deleteOpponent, addOpponentPlayer, updateOpponentPlayer, deleteOpponentPlayer, MAX_OPPONENT_LOGO_BASE64 } from "./opponents";
import { CLUB_ASSET_KEYS, MAX_CLUB_ASSET_BASE64, setClubAsset, deleteClubAsset, listClubAssets } from "./clubAssets";
import { listMediaPosts, mediaPhotoIds, saveMediaPost, deleteMediaPost, MAX_MEDIA_PHOTO_BASE64 } from "./mediaPosts";
import { listSponsors, createSponsor, updateSponsor, deleteSponsor, moveSponsor, recordSponsorNews } from "./sponsorsDb";
import { scoreRouter } from "./routers/score";
import { scoreStatsRouter } from "./routers/scoreStats";
import { getAllMatchResults, getConfigValue, setConfigValue, getMatchCacheVersion, refreshMatchCacheVersion } from "./scoreDb";
import { calculatePIR, DEFAULT_PIR_WEIGHTS, type PirWeights } from "./pir";
import { analyzePir, sanitizeWeights, type PirAnalysis } from "./pirAnalysis";
import { getRegistryMap, getRegistryVersion } from "./playersDb";
import { getLineupSnapshot, applyLineupPatch, getLineupChangedAt } from "./lineupSync";
import { readLastPublished, writeLastPublished, type PublishedNews } from "./newsState";
import { getAutoNewsConfig, setAutoNewsConfig, getAutoNewsStatus } from "./autoNews";
import { getAutoLineupConfig, setAutoLineupConfig, getAutoLineupState } from "./autoLineup";
import { getActiveLock, lockLineup, unlockLineup, differsFromLock, parsePublishAt } from "./lineupLock";
import { scoreLineupView } from "./scoreLineupView";
import { getLineupContext, saveLineupContext } from "./lineupContexts";
import { opponentPlayerId } from "../shared/matchSetup";
import { loadPirConfig, PIR_WEIGHTS_KEY, PIR_ADJUSTMENTS_KEY, PIR_THRESHOLDS_KEY } from "./pirConfig";
import { DEFAULT_PIR_THRESHOLDS, PIR_THRESHOLD_LIMITS, sanitizeThresholds } from "../shared/pirThresholds";
import { positionAndTeamHistory } from "./positionHistory";
import { nextEvent, eventStart } from "./autoNews";
import { withExternalEvent } from "./matchEvent";
import { NOTIFICATION_TYPES, getRecipients, setRecipients, smtpConfigured, sendTestMail, notifyLater, mailLayout, type NotificationType } from "./notifications";
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
  z.object({ t: z.literal("field"), key: z.literal("setup"), value: z.object({
    mode: z.enum(["internal", "external"]),
    opponentId: z.number().int().positive().nullable(),
    ourName: z.string().max(80).nullable(),
    ourLogo: z.enum(["club", "white", "green", "crest"]),
    date: z.string().max(10).nullable().optional(),
    time: z.string().max(5).nullable().optional(),
    location: z.string().max(100).nullable().optional(),
    oppList: z.array(z.number().int().positive()).max(60).nullable().optional(),
  }) }),
]);

let pirCache: { key: string; result: Array<ReturnType<typeof calculatePIR>[number] & { label: string }> } | null = null;
let analysisCache: { key: string; result: PirAnalysis } | null = null;

// PIR-inställningar i app_config (vikter och manuella justeringar per spelare): server/pirConfig.ts
let pirConfigVersion = 0;

// Förklaring och historik per spelare – dyrt att räkna, så cachat per spelare och dataläge.
const pirExplainCache = new Map<string, PirExplanation>();

export interface PirExplanation {
  playerKey: string;
  rating: number;
  /** Betyget om bara lagresultaten räknats (utan mål/assist/målvaktsbonus) */
  teamOnlyRating: number;
  /** Mål-, assist- och målvaktsbonusarnas bidrag */
  individual: number;
  adjustment: number;
  /** Betyget efter var och en av spelarens senaste matcher (äldst först) */
  history: Array<{ matchId: number; date: string; rating: number; result: "V" | "O" | "F" }>;
}

async function explainPir(playerKey: string): Promise<PirExplanation | null> {
  const key = `${await refreshMatchCacheVersion()}:${pirConfigVersion}:${playerKey}`;
  const hit = pirExplainCache.get(key);
  if (hit) return hit;
  const all = await getPirRatings();
  const me = all.find((r) => r.playerKey === playerKey);
  if (!me) return null;

  const { weights, adjustments } = await loadPirConfig();
  const matches = await getAllMatchResults();
  const teamOnly = calculatePIR(matches, { weights: { goal: 0, assist: 0, goalkeeper: 0, halfLifeDays: weights.halfLifeDays }, skipTrend: true })
    .find((r) => r.playerKey === playerKey);

  // Spelarens matcher (äldst först) och betyget direkt efter var och en – högst de 20 senaste
  const dateOf = (m: (typeof matches)[number]) => new Date((m.matchEndTime ?? m.matchStartTime ?? m.createdAt) as unknown as string);
  const sorted = [...matches].sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime());
  const aWhite = (m: (typeof matches)[number]) => isTeamAWhite((m.lineup as { teamAName?: string } | null)?.teamAName);
  const played = sorted.filter((m) => {
    const lu = (m.lineup as { lineup?: Record<string, { id?: string; name?: string }> } | null)?.lineup ?? {};
    return Object.values(lu).some((p) => (p?.id ?? p?.name) === playerKey);
  }).slice(-20);
  const history: PirExplanation["history"] = [];
  for (const m of played) {
    const until = dateOf(m);
    const upTo = sorted.filter((x) => dateOf(x).getTime() <= until.getTime());
    const r = calculatePIR(upTo, { weights, adjustments, now: until, skipTrend: true, iterations: 8 }).find((x) => x.playerKey === playerKey);
    const lu = (m.lineup as { lineup?: Record<string, { id?: string; name?: string }> } | null)?.lineup ?? {};
    const slot = Object.entries(lu).find(([, p]) => (p?.id ?? p?.name) === playerKey)?.[0] ?? "";
    const white = slot.startsWith("team-a") === aWhite(m);
    const own = white ? m.teamWhiteScore : m.teamGreenScore;
    const opp = white ? m.teamGreenScore : m.teamWhiteScore;
    if (r) history.push({ matchId: m.id, date: until.toISOString(), rating: r.rating, result: own > opp ? "V" : own < opp ? "F" : "O" });
  }

  const teamOnlyRating = teamOnly?.rating ?? 1000;
  const result: PirExplanation = {
    playerKey,
    rating: me.rating,
    teamOnlyRating,
    individual: me.rating - me.adjustment - teamOnlyRating,
    adjustment: me.adjustment,
    history,
  };
  if (pirExplainCache.size > 200) pirExplainCache.clear();
  pirExplainCache.set(key, result);
  return result;
}

async function getPirRatings() {
  const key = `${await refreshMatchCacheVersion()}:${pirConfigVersion}:${getRegistryVersion()}`;
  if (!pirCache || pirCache.key !== key) {
    const { weights, adjustments } = await loadPirConfig();
    const registry = await getRegistryMap();
    // Etikett "Namn #nr" som statistiksidorna använder för att identifiera spelaren.
    const result = calculatePIR(await getAllMatchResults(), { weights, adjustments }).map((r) => {
      const reg = registry.get(r.playerKey);
      return { ...r, name: reg?.name ?? r.name, label: reg ? (reg.number ? `${reg.name} #${reg.number}` : reg.name) : r.name };
    });
    pirCache = { key, result };
  }
  return pirCache.result;
}

const NEWS_LAST_HOME_KEY = "laget_news_last_home";
// Om den senaste nyheten finns kvar på laget.se (kontrolleras högst varannan minut)
const newsExistsCache = new Map<number, { exists: boolean | null; at: number }>();

type PlayerRecord = { matches: number; wins: number; draws: number; losses: number; goals: number; assists: number };

/** Logga: PNG som data-URL, redan skalad i webbläsaren (max ca 1,5 MB). */
const logoSchema = z
  .string()
  .max(2_000_000, "Loggan är för stor")
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Loggan måste vara en PNG");

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  players: playersRouter,
  score: scoreRouter,
  scoreStats: scoreStatsRouter,
  laget: router({
    /** Hämta anmälningslistan från laget.se för dagens/nästa event */
    attendance: lineupProcedure.query(async () => {
      // Mot andra lag kan matchen ha egen dag/tid/plats (Lineup → Match)
      return withExternalEvent(await fetchAttendance());
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

    /** Vilket lag som var hemmalag i senaste laget.se-nyheten ("a" = lag A, "b" = lag B). */
    newsLastHome: lineupProcedure.query(async () => {
      const value = await getConfigValue(NEWS_LAST_HOME_KEY);
      const lastHome: "a" | "b" | null = value === "a" || value === "b" ? value : null;
      return { lastHome };
    }),

    /** Namnet på laget.se-kontot som publicerar (inte e-postadressen) och adressen till nyhetsadministrationen. */
    newsAccount: lineupProcedure.query(async () => ({ name: await fetchAccountName(), adminUrl: NEWS_ADMIN_URL })),

    /** Senast publicerade nyheten från appen (för att kunna ersätta den vid ändringar). */
    /**
     * Senast publicerade nyheten – kontrollerad mot laget.se, så att "Uppdatera
     * befintlig nyhet" inte visas för en nyhet som tagits bort där.
     */
    newsLastPublished: lineupProcedure.query(async () => {
      const last = await readLastPublished();
      if (!last) return null;
      const cached = newsExistsCache.get(last.id);
      let exists = cached && Date.now() - cached.at < 2 * 60_000 ? cached.exists : await newsExists(last.id);
      if (!cached || Date.now() - cached.at >= 2 * 60_000) newsExistsCache.set(last.id, { exists, at: Date.now() });
      if (exists === false) {
        await writeLastPublished(null);
        return null;
      }
      return last;
    }),

    /**
     * Publicera "Dagens lag" på laget.se via adminformuläret – direkt eller
     * tidsinställt. Med updateId uppdateras den nyheten i stället (samma plats i flödet).
     */
    publishNews: adminProcedure
      .input(
        z.object({
          title: z.string().trim().min(2).max(60),
          body: z.string().max(7000),
          imageBase64: z.string().max(7_000_000).regex(/^[A-Za-z0-9+/=]+$/),
          imageType: z.enum(["image/jpeg", "image/png"]),
          imageName: z.string().max(100),
          showPublisher: z.boolean(),
          publishAt: z
            .object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              hour: z.string().regex(/^([01]\d|2[0-3])$/),
              minute: z.string().regex(/^[0-5]\d$/),
            })
            .optional(),
          eventDate: z.string().max(10).nullable(),
          updateId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Borttagen på laget.se sedan senast? Då publiceras en ny i stället för att uppdatera
        let updateId = input.updateId;
        let replacedMissing = false;
        if (updateId && (await newsExists(updateId)) === false) {
          updateId = undefined;
          replacedMissing = true;
          await writeLastPublished(null);
        }
        const result = await publishNews({
          id: updateId,
          title: input.title,
          body: input.body,
          image: Buffer.from(input.imageBase64, "base64"),
          imageName: input.imageName,
          imageType: input.imageType,
          showPublisher: input.showPublisher,
          publishAt: input.publishAt,
        });
        if (!result.success) return { success: false as const, error: result.error };
        // Laget låses för Score Tracker och statistiken (publicerat = det som gäller)
        // Tidsinställd nyhet: laget räknas som publicerat först vid den inställda tiden
        const at = input.publishAt ? parsePublishAt(`${input.publishAt.date} ${input.publishAt.hour}:${input.publishAt.minute}`) : null;
        await lockLineup(input.title, at).catch((e) => console.error("[lås] kunde inte låsa laget:", e));

        const published: PublishedNews = {
          id: result.id, url: result.url, title: input.title, eventDate: input.eventDate,
          publishedAt: new Date().toISOString(),
          publishAt: input.publishAt ? `${input.publishAt.date} ${input.publishAt.hour}:${input.publishAt.minute}` : null,
        };
        await writeLastPublished(published);
        newsExistsCache.set(result.id, { exists: true, at: Date.now() });
        if (published.publishAt && !updateId) {
          const m = mailLayout("Tidsinställd nyhet skapad", [`"${input.title}" går ut på laget.se ${published.publishAt}.`], { href: result.url, label: "Visa nyheten" });
          notifyLater("newsScheduled", () => ({ subject: `Tidsinställd: ${input.title}`, ...m }));
        }
        return { success: true as const, id: result.id, url: result.url, updated: !!updateId, replacedMissing, publishAt: published.publishAt };
      }),

    /** Ta bort en nyhet som appen publicerat (samma som "Ta bort" i laget.se-admin). */
    deleteNews: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const result = await deleteNews(input.id);
        if (!result.success) return { success: false as const, error: result.error ?? "Nyheten kunde inte tas bort" };
        const last = await readLastPublished();
        if (last?.id === input.id) await writeLastPublished(null);
        newsExistsCache.delete(input.id);
        return { success: true as const, alreadyGone: !!result.alreadyGone };
      }),

    /** Automatisk nyhet: inställningar och senaste händelse. */
    autoNews: adminProcedure.query(async () => ({ config: await getAutoNewsConfig(), status: await getAutoNewsStatus() })),
    setAutoNews: adminProcedure
      .input(z.object({ enabled: z.boolean(), minutesBefore: z.number().int().min(15).max(240), minPlayers: z.number().int().min(1).max(40) }))
      .mutation(async ({ input }) => {
        await setAutoNewsConfig(input);
        return { success: true };
      }),

    /** Auto-lag (Lineup): gör om laget före match om det inte stämmer med anmälningarna. */
    autoLineup: lineupProcedure.query(async () => ({ config: await getAutoLineupConfig(), state: await getAutoLineupState() })),
    setAutoLineup: lineupProcedure
      .input(z.object({ enabled: z.boolean(), minutesBefore: z.number().int().min(60).max(240) }))
      .mutation(async ({ input }) => {
        await setAutoLineupConfig(input);
        return { success: true };
      }),

    /** Spara hemmalaget när en nyhet skapats, så att nästa nyhet växlar automatiskt. */
    setNewsLastHome: lineupProcedure
      .input(z.object({ home: z.enum(["a", "b"]) }))
      .mutation(async ({ input }) => {
        await setConfigValue(NEWS_LAST_HOME_KEY, input.home);
        return { success: true };
      }),
  }),

  // ─── Spelarbilder ──────────────────────────────────────────────────────────
  // Visas via GET /api/players/:id/photo (se server/_core/index.ts).

  playerPhotos: router({
    set: lineupProcedure
      .input(z.object({
        playerId: z.string().min(1).max(64),
        imageBase64: z.string().max(MAX_PHOTO_BASE64, "Bilden är för stor").regex(/^[A-Za-z0-9+/=]+$/),
      }))
      .mutation(async ({ input }) => {
        // JPEG börjar alltid med FF D8
        if (!input.imageBase64.startsWith("/9j/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Bilden måste vara JPEG" });
        await setPlayerPhoto(input.playerId, input.imageBase64);
        return { success: true };
      }),
    delete: lineupProcedure
      .input(z.object({ playerId: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        await deletePlayerPhoto(input.playerId);
        return { success: true };
      }),
  }),

  // ─── Hockeykort ────────────────────────────────────────────────────────────
  // Originalfotot visas via GET /api/players/:id/card-source (se server/_core/index.ts).

  cards: router({
    list: adminProcedure.query(() => listCards()),
    stats: adminProcedure
      .input(z.object({ playerId: z.string().min(1).max(64), includeExternal: z.boolean().optional() }))
      .query(({ input }) => cardStats(input.playerId, { includeExternal: input.includeExternal })),
    save: adminProcedure
      .input(z.object({
        playerId: z.string().min(1).max(64),
        settings: z.record(z.string(), z.unknown()),
        sourceBase64: z.string().max(MAX_CARD_SOURCE_BASE64, "Fotot är för stort").regex(/^[A-Za-z0-9+/=]+$/).optional(),
        /** Använd kortet som profilbild och håll det uppdaterat automatiskt */
        liveProfile: z.boolean().optional(),
        /** Friläggningsmask som PNG (base64); null tar bort den */
        maskBase64: z.string().max(600_000, "Masken är för stor").regex(/^[A-Za-z0-9+/=]+$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.sourceBase64 && !input.sourceBase64.startsWith("/9j/")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Fotot måste vara JPEG" });
        }
        if (JSON.stringify(input.settings).length > 20_000) throw new TRPCError({ code: "BAD_REQUEST", message: "För många inställningar" });
        if (input.maskBase64 && !input.maskBase64.startsWith("iVBOR")) throw new TRPCError({ code: "BAD_REQUEST", message: "Masken måste vara PNG" });
        await saveCard(input.playerId, input.settings, input.sourceBase64, input.liveProfile, input.maskBase64);
        // Profilkortet ritas direkt så att beskedet stämmer (tar under en sekund)
        let profileUpdated = false;
        if (input.liveProfile) {
          profileUpdated = await refreshLiveProfile(input.playerId, true).catch((err) => {
            console.error("[cards.save] profilkort:", err);
            return false;
          });
        }
        return { success: true, profileUpdated };
      }),
    delete: adminProcedure
      .input(z.object({ playerId: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        await deleteCard(input.playerId);
        return { success: true };
      }),
  }),

  // ─── Klubben: namn, lag, hallar m.m. (profil + inställningar) ─────────────

  club: router({
    /** Klubbens identitet – används av alla sidor och bilder (inga hemligheter). */
    get: publicProcedure.query(async () => ({ club: club(), overrides: await getClubOverrides(), features: await getFeatures() })),
    /** Slå på/av funktioner som är under uppbyggnad (beta). */
    setFeatures: adminProcedure
      .input(z.object({ opponents: z.boolean().optional() }))
      .mutation(({ input }) => setFeatures(input)),
    set: adminProcedure
      .input(z.object({
        name: z.string().trim().max(60).optional(),
        shortName: z.string().trim().max(10).optional(),
        fullName: z.string().trim().max(100).optional(),
        hubTitle: z.string().trim().max(40).optional(),
        hubSubtitle: z.string().trim().max(40).optional(),
        appUrl: z.string().trim().max(200).optional(),
        hashtags: z.array(z.string().trim().min(2).max(40)).max(12).optional(),
        laget: z.object({ slug: z.string().trim().max(60).regex(/^[A-Za-z0-9_-]*$/, "Bara bokstäver a–z, siffror, - och _").optional() }).optional(),
        teams: z.object({
          white: z.object({ name: z.string().trim().max(20).optional(), shortName: z.string().trim().max(6).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).optional(),
          green: z.object({ name: z.string().trim().max(20).optional(), shortName: z.string().trim().max(6).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => ({ club: await saveClubOverrides(input) })),
    /** Ladda upp en logga (PNG/JPEG, base64) – ersätter profilens fil. */
    setLogo: adminProcedure
      .input(z.object({ key: z.enum(CLUB_ASSET_KEYS), base64: z.string().max(MAX_CLUB_ASSET_BASE64, "Bilden är för stor").regex(/^[A-Za-z0-9+/=]+$/) }))
      .mutation(async ({ input }) => {
        await setClubAsset(input.key, input.base64);
        return { club: await loadClub() };
      }),
    /** Ta bort uppladdad logga – profilens fil gäller igen. */
    resetLogo: adminProcedure
      .input(z.object({ key: z.enum(CLUB_ASSET_KEYS) }))
      .mutation(async ({ input }) => {
        await deleteClubAsset(input.key);
        return { club: await loadClub() };
      }),
    /** Vilka loggor som är uppladdade */
    logos: adminProcedure.query(() => listClubAssets()),
  }),

  // ─── Motståndare (matcher mot andra lag) ───────────────────────────────────
  // Loggan visas via GET /api/opponents/:id/logo (se server/_core/index.ts).

  opponents: router({
    list: adminProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(({ input }) => listOpponents(input?.includeArchived ?? false)),
    get: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const o = await getOpponent(input.id);
      if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Laget finns inte" });
      return o;
    }),
    save: adminProcedure
      .input(z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1, "Ange lagets namn").max(80),
        shortName: z.string().trim().max(10).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        archived: z.boolean().optional(),
        logoBase64: z.string().max(MAX_OPPONENT_LOGO_BASE64, "Loggan är för stor").regex(/^[A-Za-z0-9+/=]+$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => ({ id: await saveOpponent(input) })),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteOpponent(input.id);
      return { success: true };
    }),
    addPlayer: adminProcedure
      .input(z.object({ opponentId: z.number().int().positive(), name: z.string().trim().min(1).max(80), number: z.string().trim().max(4).nullable().optional(), position: z.enum(["MV", "B", "C", "F", ""]).nullable().optional() }))
      .mutation(async ({ input }) => ({ id: await addOpponentPlayer(input.opponentId, { ...input, position: input.position || null }) })),
    updatePlayer: adminProcedure
      .input(z.object({ opponentId: z.number().int().positive(), id: z.number().int().positive(), name: z.string().trim().min(1).max(80).optional(), number: z.string().trim().max(4).nullable().optional(), position: z.enum(["MV", "B", "C", "F", ""]).nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        await updateOpponentPlayer(input.opponentId, input.id, { ...input, position: input.position === undefined ? undefined : input.position || null });
        return { success: true };
      }),
    deletePlayer: adminProcedure
      .input(z.object({ opponentId: z.number().int().positive(), id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteOpponentPlayer(input.opponentId, input.id);
        return { success: true };
      }),
    /** Lagets sparade uppställning (plats → spelar-id) – fylls i Lineup när laget väljs. */
    storedLineup: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getStoredOpponentLineup(input.id)),
    /** Lagets sparade lista (utan platser) – null = platser */
    storedList: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getStoredOpponentList(input.id)),
    setStoredList: adminProcedure
      .input(z.object({ id: z.number().int().positive(), ids: z.array(z.number().int().positive()).max(60).nullable() }))
      .mutation(async ({ input }) => { await setStoredOpponentList(input.id, input.ids); return { success: true }; }),
    /** Delningslänkar till laget */
    links: adminProcedure.input(z.object({ opponentId: z.number().int().positive() })).query(async ({ input }) => (await listOpponentLinks(input.opponentId)).map((l) => ({ ...l, ourView: ourViewOf(l) }))),
    createLink: adminProcedure
      .input(z.object({
        opponentId: z.number().int().positive(),
        /** Vad laget ser av vårt lag: uppställningen, bara spelarna eller inget */
        ourView: z.enum(["lineup", "players", "none"]).optional(),
        showOurTeam: z.boolean().optional(),
        days: z.number().int().min(1).max(60).default(7),
        /** Matchdagen: länken gäller till ett dygn efter (i stället för days) */
        matchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          return await createOpponentLink(input.opponentId, input.ourView ?? (input.showOurTeam ? "lineup" : "none"), { days: input.days, matchDate: input.matchDate });
        } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    /** Ändra vad laget ser av vårt lag och/eller matchdagen – länken är densamma */
    updateLink: adminProcedure
      .input(z.object({
        token: z.string().max(64),
        ourView: z.enum(["lineup", "players", "none"]).optional(),
        matchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        try { return await updateOpponentLink(input.token, { ourView: input.ourView, matchDate: input.matchDate }); }
        catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
      }),
    revokeLink: adminProcedure.input(z.object({ token: z.string().max(64) })).mutation(async ({ input }) => {
      await revokeOpponentLink(input.token);
      return { success: true };
    }),
  }),

  // ─── Motståndarens delningslänk (utan inloggning, med token) ───────────────

  opponentLink: router({
    view: publicProcedure.input(z.object({ token: z.string().min(10).max(64) })).query(async ({ input }) => {
      try { return await linkView(input.token); } catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
    }),
    saveTeam: publicProcedure
      .input(z.object({
        token: z.string().min(10).max(64),
        name: z.string().trim().min(1).max(80),
        shortName: z.string().trim().max(10).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        logoBase64: z.string().max(MAX_OPPONENT_LOGO_BASE64, "Loggan är för stor").regex(/^[A-Za-z0-9+/=]+$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const link = await resolveLink(input.token).catch((e) => { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); });
        await saveOpponent({ id: link.opponentId, name: input.name, shortName: input.shortName, color: input.color, logoBase64: input.logoBase64 });
        return { success: true };
      }),
    addPlayer: publicProcedure
      .input(z.object({ token: z.string().min(10).max(64), name: z.string().trim().min(1).max(80), number: z.string().trim().max(4).nullable().optional(), position: z.enum(["MV", "B", "C", "F", ""]).nullable().optional() }))
      .mutation(async ({ input }) => {
        const link = await resolveLink(input.token).catch((e) => { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); });
        const o = await getOpponent(link.opponentId);
        if ((o?.players.length ?? 0) >= 60) throw new TRPCError({ code: "BAD_REQUEST", message: "Max 60 spelare" });
        return { id: await addOpponentPlayer(link.opponentId, { ...input, position: input.position || null }) };
      }),
    updatePlayer: publicProcedure
      .input(z.object({ token: z.string().min(10).max(64), id: z.number().int().positive(), name: z.string().trim().min(1).max(80).optional(), number: z.string().trim().max(4).nullable().optional(), position: z.enum(["MV", "B", "C", "F", ""]).nullable().optional() }))
      .mutation(async ({ input }) => {
        const link = await resolveLink(input.token).catch((e) => { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); });
        await updateOpponentPlayer(link.opponentId, input.id, { ...input, position: input.position === undefined ? undefined : input.position || null });
        await afterLinkPlayerChange(link.opponentId);
        return { success: true };
      }),
    /** Laget som lista (ids) eller platser (null) */
    setList: publicProcedure
      .input(z.object({ token: z.string().min(10).max(64), ids: z.array(z.number().int().positive()).max(60).nullable() }))
      .mutation(async ({ input }) => {
        try { await setLinkList(input.token, input.ids); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
        return { success: true };
      }),
    deletePlayer: publicProcedure
      .input(z.object({ token: z.string().min(10).max(64), id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const link = await resolveLink(input.token).catch((e) => { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); });
        // Tas ur uppställningen först (om spelaren står där)
        const view = await linkView(input.token);
        for (const [slot, pid] of Object.entries(view.lineup)) if (pid === input.id) await setLinkSlot(input.token, slot, null);
        if (view.list?.includes(input.id)) await setLinkList(input.token, view.list.filter((x) => x !== input.id));
        await updateOpponentPlayer(link.opponentId, input.id, { active: false });
        await afterLinkPlayerChange(link.opponentId);
        return { success: true };
      }),
    setSlot: publicProcedure
      .input(z.object({ token: z.string().min(10).max(64), slot: z.string().max(40), playerId: z.number().int().positive().nullable() }))
      .mutation(async ({ input }) => {
        try { await setLinkSlot(input.token, input.slot, input.playerId); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
        return { success: true };
      }),
  }),

  // ─── Media: egna Instagram-inlägg ──────────────────────────────────────────
  // Egen bild visas via GET /api/media/:id/photo (se server/_core/index.ts).

  media: router({
    list: adminProcedure.query(async () => {
      const [posts, withPhoto] = await Promise.all([listMediaPosts(), mediaPhotoIds()]);
      return posts.map((p) => ({ ...p, hasPhoto: withPhoto.has(p.id) }));
    }),
    save: adminProcedure
      .input(z.object({
        id: z.number().int().positive().optional(),
        type: z.enum(["lineup", "text", "cards", "stats", "result"]),
        title: z.string().trim().min(1).max(120),
        settings: z.record(z.string(), z.unknown()),
        caption: z.string().max(3000),
        photoBase64: z.string().max(MAX_MEDIA_PHOTO_BASE64, "Bilden är för stor").regex(/^[A-Za-z0-9+/=]+$/).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.photoBase64 && !input.photoBase64.startsWith("/9j/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Bilden måste vara JPEG" });
        if (JSON.stringify(input.settings).length > 60_000) throw new TRPCError({ code: "BAD_REQUEST", message: "För mycket data i inlägget" });
        return { id: await saveMediaPost(input) };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteMediaPost(input.id);
        return { success: true };
      }),
  }),

  // ─── Notiser (e-post) ───────────────────────────────────────────────────────

  notifications: router({
    get: adminProcedure.query(async () => ({
      smtpConfigured: smtpConfigured(),
      from: ENV.smtpFrom || null,
      types: Object.entries(NOTIFICATION_TYPES).map(([id, label]) => ({ id, label })),
      recipients: await getRecipients(),
    })),
    set: adminProcedure
      .input(z.array(z.object({
        email: z.string().trim().email("Ogiltig e-postadress").max(200),
        types: z.array(z.enum(Object.keys(NOTIFICATION_TYPES) as [NotificationType, ...NotificationType[]])),
      })).max(30))
      .mutation(async ({ input }) => {
        await setRecipients(input);
        return { success: true };
      }),
    test: adminProcedure
      .input(z.object({ email: z.string().trim().email() }))
      .mutation(({ input }) => sendTestMail(input.email)),
  }),

  // ─── Sponsorer ─────────────────────────────────────────────────────────────

  sponsors: router({
    /** Alla sponsorer med logga och visningar denna och förra säsongen. Öppen – Score Tracker behöver den. */
    list: publicProcedure.query(() => listSponsors()),

    create: adminProcedure
      .input(z.object({ name: z.string().trim().min(1).max(120), logo: logoSchema.nullable(), active: z.boolean().default(true) }))
      .mutation(async ({ input }) => {
        await createSponsor(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          name: z.string().trim().min(1).max(120).optional(),
          logo: logoSchema.nullable().optional(),
          active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updateSponsor(input);
        return { success: true };
      }),

    move: adminProcedure
      .input(z.object({ id: z.number().int(), direction: z.enum(["up", "down"]) }))
      .mutation(async ({ input }) => {
        await moveSponsor(input.id, input.direction);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteSponsor(input.id);
        return { success: true };
      }),

    /** En nyhet ("Dagens lag") skapades med den här matchsponsorn. */
    recordNews: lineupProcedure
      .input(z.object({ sponsorId: z.number().int() }))
      .mutation(async ({ input }) => {
        await recordSponsorNews(input.sponsorId);
        return { success: true };
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


    /**
     * Calculate the most-played position for each player from match history.
     * Returns a map: playerKey -> { mostPlayed: "B", stats: { B: 10, C: 2, ... } }
     */
    /** De senaste 30 matchernas vinnare (Vita/Gröna/oavgjort), äldst först – resultatraden under prediktionen. */
    recentResults: lineupProcedure.query(async () => recentWinners(await getAllMatchResults(), 30)),

    /** De tio senaste spelade matchernas uppställningar (från Score Tracker), för att hämta dem igen. */
    recentMatchLineups: lineupProcedure.query(async () => {
      const matches = (await getAllMatchResults())
        .filter((m) => (m.lineup as { lineup?: Record<string, unknown> } | null)?.lineup && Object.keys((m.lineup as { lineup: Record<string, unknown> }).lineup).length > 0)
        .sort((a, b) => new Date((b.matchStartTime ?? b.matchEndTime ?? b.createdAt) as unknown as string).getTime() - new Date((a.matchStartTime ?? a.matchEndTime ?? a.createdAt) as unknown as string).getTime())
        .slice(0, 10);
      return matches.map((m) => {
        const d = new Date((m.matchStartTime ?? m.matchEndTime ?? m.createdAt) as unknown as string);
        const wrap = m.lineup as { teamAName?: string; teamBName?: string; lineup: Record<string, unknown> };
        return {
          id: m.id,
          label: `Lagen ${d.getDate()}/${d.getMonth() + 1} – ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          result: `${m.teamWhiteScore}–${m.teamGreenScore}`,
          teamAName: wrap.teamAName ?? defaultTeamNames().teamAName,
          teamBName: wrap.teamBName ?? defaultTeamNames().teamBName,
          lineup: wrap.lineup,
          playedAt: d.toISOString(),
        };
      });
    }),

    /**
     * Laget för Score Tracker: det låsta (efter publicerad nyhet) om spärren är
     * aktiv, annars det aktuella.
     */
    /**
     * Laget i Score Tracker. Inloggade ser alltid laget (det låsta efter publicerad
     * nyhet, annars Lineup). Andra ser det enligt scoreLineupView: publicerat lag,
     * annars live från 75 min före matchstart.
     */
    scoreState: publicProcedure.query(async ({ ctx }) => {
      const lock = await getActiveLock();
      const { doc } = await getLineupSnapshot();
      let view: import("./scoreLineupView").ScoreLineupView | { mode: "staff" } = { mode: "staff" };
      if (!ctx.session) {
        const ev = await nextEvent().catch(() => null);
        view = scoreLineupView(lock, eventStart(ev?.date, ev?.time));
        if (view.mode === "scheduled" || view.mode === "hidden") {
          // Inget lag att visa än: tomma lag, bara lagnamnen
          return {
            ...doc, players: [], lineup: {}, locked: false, lockedAt: null, lockExpiresAt: null, opponent: null, view,
          };
        }
      }
      const state = lock ? lock.doc : doc;
      // Mot motståndare: lagets namn, färg och logga till Score Tracker
      const opp = state.setup?.mode === "external" && state.setup.opponentId ? await getOpponent(state.setup.opponentId).catch(() => null) : null;
      return {
        ...state, locked: !!lock, lockedAt: lock?.lockedAt ?? null, lockExpiresAt: lock?.expiresAt ?? null,
        opponent: opp ? {
          id: opp.id, name: opp.name, shortName: opp.shortName, color: opp.color, logoUrl: opp.logoUrl,
          // Lagets sparade spelare – går att välja som målskytt även om de inte står i uppställningen
          players: opp.players.filter((p) => p.active).map((p) => ({ id: opponentPlayerId(p.id), name: p.name, number: p.number ?? "", position: p.position ?? "" })),
        } : null,
        view,
      };
    }),
    /** Spärrens läge för Lineup: låst, när, och om Lineup ändrats sedan dess. */
    lockStatus: lineupProcedure.query(async () => {
      const lock = await getActiveLock();
      if (!lock) return { locked: false as const };
      const { doc } = await getLineupSnapshot();
      return { locked: true as const, lockedAt: lock.lockedAt, expiresAt: lock.expiresAt, newsTitle: lock.newsTitle, changed: differsFromLock(doc, lock) };
    }),
    /** Lås upp: Score Tracker använder Lineup som den ser ut nu. */
    unlock: lineupProcedure.mutation(async () => {
      await unlockLineup();
      return { success: true };
    }),

    /** När uppställningen senast ändrades (visas som "Ändrad torsdag 18:43"). */
    /** Sparad uppställning för en match (internmatch eller mot ett lag) – se server/lineupContexts.ts */
    context: lineupProcedure.input(z.object({ key: z.string().regex(/^(internal|opp-\d+)$/) })).query(({ input }) => getLineupContext(input.key)),
    saveContext: lineupProcedure
      .input(z.object({
        key: z.string().regex(/^(internal|opp-\d+)$/),
        slots: z.record(z.string().max(40), z.string().max(80)),
        teamAConfig: z.any().optional(),
        teamBConfig: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        await saveLineupContext(input.key, { slots: input.slots, teamAConfig: input.teamAConfig, teamBConfig: input.teamBConfig });
        return { success: true };
      }),

    lastChanged: lineupProcedure.query(async () => ({ changedAt: (await getLineupChangedAt())?.toISOString() ?? null })),

    positionHistory: lineupProcedure.query(async () => {
      const allMatches = await getAllMatchResults();
      const history = positionAndTeamHistory(allMatches);

      // Matcher, vinster, mål och assist – innevarande säsong och totalt
      const seasonNow = seasonOf(new Date());
      const form = recentForm(allMatches, 10);
      const records: Record<string, { season: PlayerRecord & { label: string }; total: PlayerRecord; form: string }> = {};
      for (const [id, lines] of seasonHistory(allMatches)) {
        const total: PlayerRecord = { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0 };
        for (const l of lines) {
          total.matches += l.matches; total.wins += l.wins; total.draws += l.draws;
          total.losses += l.losses; total.goals += l.goals; total.assists += l.assists;
        }
        const cur = lines.find((l) => l.season === seasonNow);
        records[id] = {
          season: {
            label: seasonNow,
            matches: cur?.matches ?? 0, wins: cur?.wins ?? 0, draws: cur?.draws ?? 0,
            losses: cur?.losses ?? 0, goals: cur?.goals ?? 0, assists: cur?.assists ?? 0,
          },
          total,
          form: (form.players.get(id) ?? []).join(""),
        };
      }

      const result: Record<string, { mostPlayed: string; stats: Record<string, number>; mostPlayedTeam?: string; teamStats?: Record<string, number>; record?: (typeof records)[string] }> = {};
      for (const [playerKey, h] of Object.entries(history)) result[playerKey] = { ...h, record: records[playerKey] };

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

    /** En spelares PIR med placering bland alla med betyg i samma roll (spelarprofilen). */
    player: adminProcedure
      .input(z.object({ id: z.string().min(1).max(64) }))
      .query(async ({ input }) => {
        const all = await getPirRatings();
        const me = all.find((r) => r.playerKey === input.id);
        if (!me) return null;
        const rank = (key: "outfieldRating" | "goalkeeperRating") => {
          const mine = me[key];
          if (mine == null) return null;
          const rated = all.filter((r) => r[key] != null);
          return { rank: rated.filter((r) => (r[key] as number) > mine).length + 1, of: rated.length };
        };
        return { ...me, outfieldRank: rank("outfieldRating"), goalkeeperRank: rank("goalkeeperRating") };
      }),

    /** Vikter och manuella justeringar (styrelsen). */
    /** Varför spelaren har sitt betyg: lagresultat, individuella bonusar, justering och utveckling. */
    explain: adminProcedure
      .input(z.object({ id: z.string().min(1).max(64) }))
      .query(({ input }) => explainPir(input.id)),

    getConfig: adminProcedure.query(async () => {
      const cfg = await loadPirConfig();
      return { ...cfg, defaults: DEFAULT_PIR_WEIGHTS, thresholdDefaults: DEFAULT_PIR_THRESHOLDS, thresholdLimits: PIR_THRESHOLD_LIMITS };
    }),

    /** Gränserna (för Lineup, prediktion och Auto i webbläsaren) – bara siffror, öppet. */
    thresholds: publicProcedure.query(async () => (await loadPirConfig()).thresholds),

    /** Ändra gränserna (styrelsen). Tomt objekt = standard. */
    setThresholds: adminProcedure
      .input(z.object({
        minMatchesShow: z.number().int(), fullConfidence: z.number().int(), newcomerMatches: z.number().int(),
        backtestWarmup: z.number().int(), minMatchesForSuggestion: z.number().int(),
      }).partial())
      .mutation(async ({ input }) => {
        await setConfigValue(PIR_THRESHOLDS_KEY, JSON.stringify(sanitizeThresholds(input)));
        await loadPirConfig();
        pirConfigVersion++;
        analysisCache = null;
        return { success: true };
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
        const { weights, thresholds } = await loadPirConfig();
        const withSuggestion = input?.withSuggestion ?? false;
        const key = `${await refreshMatchCacheVersion()}:${JSON.stringify(weights)}:${JSON.stringify(thresholds)}:${withSuggestion}`;
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
