import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, lineupProcedure, adminProcedure, router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { playersRouter } from "./routers/players";
import { fetchAttendance, updateAttendance, publishNews, deleteNews, fetchAccountName, NEWS_ADMIN_URL, type AttendingStatus } from "./lagetSe";
import { seasonHistory, seasonOf, recentForm, recentWinners } from "./playerHistory";
import { setPlayerPhoto, deletePlayerPhoto, MAX_PHOTO_BASE64 } from "./playerPhotos";
import { listSponsors, createSponsor, updateSponsor, deleteSponsor, moveSponsor, recordSponsorNews } from "./sponsorsDb";
import { scoreRouter } from "./routers/score";
import { scoreStatsRouter } from "./routers/scoreStats";
import { getAllMatchResults, getConfigValue, setConfigValue, getMatchCacheVersion, refreshMatchCacheVersion } from "./scoreDb";
import { calculatePIR, DEFAULT_PIR_WEIGHTS, type PirWeights } from "./pir";
import { analyzePir, sanitizeWeights, type PirAnalysis } from "./pirAnalysis";
import { getRegistryMap, getRegistryVersion } from "./playersDb";
import { getLineupSnapshot, applyLineupPatch } from "./lineupSync";
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

let pirCache: { key: string; result: Array<ReturnType<typeof calculatePIR>[number] & { label: string }> } | null = null;
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
  const aWhite = (m: (typeof matches)[number]) => (((m.lineup as { teamAName?: string } | null)?.teamAName) ?? "VITA").toLowerCase().includes("vit");
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
/** Senast publicerade nyheten (JSON: id, url, title, eventDate, publishedAt). */
const NEWS_LAST_PUBLISHED_KEY = "laget_news_last_published";

type PublishedNews = { id: number; url: string; title: string; eventDate: string | null; publishedAt: string; publishAt?: string | null };

async function readLastPublished(): Promise<PublishedNews | null> {
  const raw = await getConfigValue(NEWS_LAST_PUBLISHED_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as PublishedNews; } catch { return null; }
}

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

    /** Vilket lag som var hemmalag i senaste laget.se-nyheten ("a" = lag A, "b" = lag B). */
    newsLastHome: lineupProcedure.query(async () => {
      const value = await getConfigValue(NEWS_LAST_HOME_KEY);
      const lastHome: "a" | "b" | null = value === "a" || value === "b" ? value : null;
      return { lastHome };
    }),

    /** Namnet på laget.se-kontot som publicerar (inte e-postadressen) och adressen till nyhetsadministrationen. */
    newsAccount: lineupProcedure.query(async () => ({ name: await fetchAccountName(), adminUrl: NEWS_ADMIN_URL })),

    /** Senast publicerade nyheten från appen (för att kunna ersätta den vid ändringar). */
    newsLastPublished: lineupProcedure.query(() => readLastPublished()),

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
        const result = await publishNews({
          id: input.updateId,
          title: input.title,
          body: input.body,
          image: Buffer.from(input.imageBase64, "base64"),
          imageName: input.imageName,
          imageType: input.imageType,
          showPublisher: input.showPublisher,
          publishAt: input.publishAt,
        });
        if (!result.success) return { success: false as const, error: result.error };

        const published: PublishedNews = {
          id: result.id, url: result.url, title: input.title, eventDate: input.eventDate,
          publishedAt: new Date().toISOString(),
          publishAt: input.publishAt ? `${input.publishAt.date} ${input.publishAt.hour}:${input.publishAt.minute}` : null,
        };
        await setConfigValue(NEWS_LAST_PUBLISHED_KEY, JSON.stringify(published));
        return { success: true as const, id: result.id, url: result.url, updated: !!input.updateId, publishAt: published.publishAt };
      }),

    /** Ta bort en nyhet som appen publicerat (samma som "Ta bort" i laget.se-admin). */
    deleteNews: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const result = await deleteNews(input.id);
        if (!result.success) return { success: false as const, error: result.error ?? "Nyheten kunde inte tas bort" };
        const last = await readLastPublished();
        if (last?.id === input.id) await setConfigValue(NEWS_LAST_PUBLISHED_KEY, "");
        return { success: true as const };
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
          const playerKey = (p as { id?: string } | null)?.id;
          if (!playerKey) continue;

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

          // Sparade matcher har alltid Vita som lag A
          let team = "";
          if (slotId.startsWith("team-a-")) team = "white";
          else if (slotId.startsWith("team-b-")) team = "green";
          if (team) {
            if (!teamCounts[playerKey]) teamCounts[playerKey] = {};
            teamCounts[playerKey][team] = (teamCounts[playerKey][team] || 0) + 1;
          }
        }
      }

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

      // For each player, find the most-played position and team
      const result: Record<string, { mostPlayed: string; stats: Record<string, number>; mostPlayedTeam?: string; teamStats?: Record<string, number>; record?: (typeof records)[string] }> = {};
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

        result[playerKey] = { mostPlayed, stats, mostPlayedTeam, teamStats: tStats, record: records[playerKey] };
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
        const key = `${await refreshMatchCacheVersion()}:${JSON.stringify(weights)}:${withSuggestion}`;
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
