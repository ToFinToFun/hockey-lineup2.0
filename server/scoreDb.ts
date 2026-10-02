/**
 * Databaslager för matcher (Score Tracker) och appinställningar.
 */

import { isTeamAWhite, defaultTeamNames } from "../shared/teams";
import { correctLineupFromGoals } from "./lineupCorrection";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { getRegistryMap, onRegistryChange, labelOf, normalizeName } from "./playersDb";
import {
  matchResults, matchPlayers, matchGoals, appConfig,
  type MatchRow, type MatchResult, type PlayerRow,
} from "../drizzle/schema";

// ─── Matcher ─────────────────────────────────────────────────────────
// En match = en rad i match_results + deltagare (match_players) + mål
// (match_goals). Allt pekar på spelar-ID; namn och nummer hämtas från
// spelarregistret när matchen läses, så namnbyten slår igenom överallt.
//
// Matcherna läses ofta (statistik, PIR) men ändras sällan, så de hålls i minnet
// och laddas om vid ändringar – även ändringar gjorda direkt i databasen.

export interface GoalInput {
  team: string;
  scorer?: string;
  scorerId?: string;
  assist?: string;
  assistId?: string;
  other?: string;
  sponsor?: string;
  timestamp: string;
}

export interface MatchInput {
  name: string;
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory?: GoalInput[] | null;
  /** Uppställningen när matchen spelades: { teamAName, lineup: { slot: { id, … } } } */
  lineup?: { teamAName?: string; teamBName?: string; lineup?: Record<string, { id?: string; name?: string } | null> } | null;
  matchStartTime?: Date | null;
  matchEndTime?: Date;
  /** Plats från träningen på laget.se */
  location?: string | null;
  /** Match mot ett annat lag (opponents.id) */
  opponentId?: number | null;
  createdAt?: Date;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewedAt?: Date | null;
}

let matchCache: MatchResult[] | null = null;
let matchCacheVersion = 0;
let matchCacheChecksum: string | null = null;
let lastExternalCheck = 0;
const EXTERNAL_CHECK_MS = 5_000;

function invalidateMatches() {
  matchCache = null;
  matchCacheVersion++;
}
onRegistryChange(invalidateMatches);

async function matchChecksum(): Promise<string | null> {
  const sums = await Promise.all([tableChecksum("match_results"), tableChecksum("match_players"), tableChecksum("match_goals")]);
  return sums.some((x) => x == null) ? null : sums.join(":");
}

async function checkExternalMatchChanges() {
  if (!matchCache || Date.now() - lastExternalCheck < EXTERNAL_CHECK_MS) return;
  lastExternalCheck = Date.now();
  await getRegistryMap(); // upptäcker även ändringar direkt i spelarregistret
  const sum = await matchChecksum();
  if (sum != null && matchCacheChecksum != null && sum !== matchCacheChecksum) {
    console.log("[matcher] Ändring direkt i databasen upptäckt – laddar om");
    invalidateMatches();
  }
}

/** Ökar vid varje ändring – används för att cacha beräkningar (t.ex. PIR). */
export function getMatchCacheVersion() {
  return matchCacheVersion;
}

/** Som ovan, men kontrollerar först om databasen ändrats utifrån. */
export async function refreshMatchCacheVersion(): Promise<number> {
  await checkExternalMatchChanges();
  return matchCacheVersion;
}

const teamOf = (t: string): "white" | "green" =>
  /^(green|gröna|grön)$/i.test(t.trim()) ? "green" : "white";

function positionOfSlot(slot: string): string {
  if (slot.includes("-gk-")) return "MV";
  if (slot.includes("-def-")) return "B";
  if (slot.endsWith("-c")) return "C";
  return "F";
}

/** Sätter ihop matcherna som resten av appen läser dem. */
function assemble(
  rows: MatchRow[],
  participants: Array<typeof matchPlayers.$inferSelect>,
  goals: Array<typeof matchGoals.$inferSelect>,
  registry: Map<string, PlayerRow>
): MatchResult[] {
  const byMatch = new Map<number, { players: typeof participants; goals: typeof goals }>();
  for (const r of rows) byMatch.set(r.id, { players: [], goals: [] });
  for (const p of participants) byMatch.get(p.matchId)?.players.push(p);
  for (const g of goals) byMatch.get(g.matchId)?.goals.push(g);

  const labelFor = (id: string | null, fallback: string | null) => {
    const reg = id ? registry.get(id) : undefined;
    return reg ? labelOf(reg) : fallback ?? undefined;
  };

  return rows.map((row) => {
    const data = byMatch.get(row.id)!;
    const lineup: Record<string, { id: string; name: string; number: string; position: string }> = {};
    for (const p of data.players) {
      const reg = registry.get(p.playerId);
      lineup[p.slot] = { id: p.playerId, name: reg?.name ?? "Okänd spelare", number: reg?.number ?? "", position: reg?.position ?? p.position };
    }
    const goalHistory = [...data.goals]
      .sort((a, b) => a.seq - b.seq)
      .map((g) => ({
        team: g.team,
        scorer: labelFor(g.scorerId, g.scorerName),
        scorerId: g.scorerId ?? undefined,
        assist: labelFor(g.assistId, g.assistName),
        assistId: g.assistId ?? undefined,
        other: g.goalType ?? undefined,
        sponsor: g.sponsor ?? undefined,
        timestamp: g.time,
      }));
    return {
      ...row,
      // Lag A är alltid Vita i sparade matcher (se matchPlayersFrom).
      lineup: data.players.length ? { ...defaultTeamNames(), lineup } : null,
      goalHistory,
    };
  });
}

async function loadAllMatches(): Promise<MatchResult[]> {
  await checkExternalMatchChanges();
  if (matchCache) return matchCache;
  const db = await getDb();
  if (!db) return [];
  matchCacheChecksum = await matchChecksum();
  const [rows, participants, goals, registry] = await Promise.all([
    db.select().from(matchResults).orderBy(desc(matchResults.id)),
    db.select().from(matchPlayers),
    db.select().from(matchGoals),
    getRegistryMap(),
  ]);
  matchCache = assemble(rows, participants, goals, registry);
  lastExternalCheck = Date.now();
  return matchCache;
}

/** Deltagarrader från uppställningen (vilket lag som är vilket: isTeamAWhite i shared/teams). */
function matchPlayersFrom(matchId: number, lineup: MatchInput["lineup"], registry: Map<string, PlayerRow>) {
  if (!lineup?.lineup) return [];
  const teamAWhite = isTeamAWhite(lineup.teamAName);
  const seen = new Set<string>();
  const out: Array<typeof matchPlayers.$inferInsert> = [];
  for (const [slot, p] of Object.entries(lineup.lineup)) {
    if (!p?.id || seen.has(p.id) || !registry.has(p.id)) continue;
    if (!/^team-[ab]-/.test(slot)) continue;
    seen.add(p.id);
    const inA = slot.startsWith("team-a-");
    const team = inA === teamAWhite ? "white" : "green";
    // Spara alltid Vita som lag A så att platserna blir entydiga.
    const normalizedSlot = team === "white" ? slot.replace(/^team-b-/, "team-a-") : slot.replace(/^team-a-/, "team-b-");
    out.push({ matchId, playerId: p.id, team, slot: normalizedSlot, position: positionOfSlot(slot) });
  }
  return out;
}

/** Målrader. Spelare kopplas via ID, annars via namn bland matchens deltagare. */
function matchGoalsFrom(
  matchId: number,
  goals: GoalInput[] | null | undefined,
  participants: Array<typeof matchPlayers.$inferInsert>,
  registry: Map<string, PlayerRow>
) {
  const byLabel = new Map<string, string>();
  for (const p of participants) {
    const reg = registry.get(p.playerId);
    if (!reg) continue;
    byLabel.set(normalizeName(labelOf(reg)), reg.id);
    byLabel.set(normalizeName(reg.name), reg.id);
  }
  const resolve = (id?: string, label?: string) => {
    if (id && registry.has(id)) return { id, name: null };
    const found = label ? byLabel.get(normalizeName(label)) : undefined;
    return found ? { id: found, name: null } : { id: null, name: label?.trim() ? label.trim().slice(0, 120) : null };
  };
  return (goals ?? []).map((g, seq) => {
    const scorer = resolve(g.scorerId, g.scorer);
    const assist = resolve(g.assistId, g.assist);
    return {
      matchId,
      seq,
      team: teamOf(g.team),
      scorerId: scorer.id,
      scorerName: scorer.name,
      assistId: assist.id,
      assistName: assist.name,
      goalType: g.other?.trim() || null,
      sponsor: g.sponsor?.trim() || null,
      time: (g.timestamp ?? "").slice(0, 20),
    } satisfies typeof matchGoals.$inferInsert;
  });
}

export async function saveMatch(input: MatchInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const registry = await getRegistryMap();
  const id = await db.transaction(async (tx) => {
    const [res] = await tx.insert(matchResults).values({
      name: input.name,
      teamWhiteScore: input.teamWhiteScore,
      teamGreenScore: input.teamGreenScore,
      matchStartTime: input.matchStartTime ?? null,
      location: input.location?.trim() || null,
      opponentId: input.opponentId ?? null,
      matchEndTime: input.matchEndTime ?? new Date(),
      createdAt: input.createdAt,
      reviewStatus: input.reviewStatus ?? "pending",
      reviewedAt: input.reviewedAt ?? null,
    });
    const matchId = Number(res.insertId);
    const participants = matchPlayersFrom(matchId, input.lineup, registry);
    if (participants.length) await tx.insert(matchPlayers).values(participants);
    const goalRows = matchGoalsFrom(matchId, input.goalHistory, participants, registry);
    if (goalRows.length) await tx.insert(matchGoals).values(goalRows);
    return matchId;
  });
  invalidateMatches();
  return id;
}

/** Spara val i matchrapporten (stjärnor och sponsor) – påverkar inte statistiken. */
export async function setMatchReport(id: number, report: { stars?: string[]; sponsor?: string | null; showStats?: boolean[]; title?: string | null } | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(matchResults).set({ report }).where(eq(matchResults.id, id));
  invalidateMatches();
}

export async function updateMatch(
  id: number,
  data: Partial<Pick<MatchInput, "name" | "teamWhiteScore" | "teamGreenScore" | "goalHistory" | "matchEndTime" | "createdAt" | "location">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const registry = await getRegistryMap();
  await db.transaction(async (tx) => {
    const { goalHistory, ...fields } = data;
    await tx.update(matchResults).set({ ...fields, editedAt: new Date() }).where(eq(matchResults.id, id));
    if (goalHistory) {
      const participants = await tx.select().from(matchPlayers).where(eq(matchPlayers.matchId, id));
      await tx.delete(matchGoals).where(eq(matchGoals.matchId, id));
      const rows = matchGoalsFrom(id, goalHistory, participants, registry);
      if (rows.length) await tx.insert(matchGoals).values(rows);
    }
  });
  invalidateMatches();
}

/** Godkända matcher – det enda som räknas i statistik och PIR. */
// Rättade uppställningar återanvänds så länge matchobjektet är detsamma (cachen byts vid ändringar).
const correctedCache = new WeakMap<object, unknown>();

/**
 * Godkända matcher för statistik och PIR. Uppställningen rättas utifrån målen
 * (spelare som bytt lag i sista stund), se lineupCorrection.ts.
 * Matcher mot andra lag räknas bara med om includeExternal (PIR aldrig).
 */
export async function getAllMatchResults(opts: { includeExternal?: boolean } = {}) {
  return (await loadAllMatches())
    .filter((m) => m.reviewStatus === "approved")
    .filter((m) => opts.includeExternal || m.opponentId == null)
    .map((m) => {
      let c = correctedCache.get(m) as typeof m | undefined;
      if (!c) {
        c = correctLineupFromGoals(m);
        correctedCache.set(m, c);
      }
      return c;
    });
}

/** Alla matcher inklusive ej granskade och avvisade (för styrelsens historik). */
export async function getAllMatchesIncludingUnreviewed() {
  return loadAllMatches();
}

export async function countPendingMatches() {
  return (await loadAllMatches()).filter((m) => m.reviewStatus === "pending").length;
}

export async function getMatchResultById(id: number) {
  return (await loadAllMatches()).find((m) => m.id === id);
}

export async function setMatchReviewStatus(ids: number[], status: "approved" | "rejected" | "pending") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db
    .update(matchResults)
    .set({ reviewStatus: status, reviewedAt: status === "pending" ? null : new Date() })
    .where(inArray(matchResults.id, ids));
  invalidateMatches();
}

export async function deleteMultipleMatchResults(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(matchGoals).where(inArray(matchGoals.matchId, ids));
    await tx.delete(matchPlayers).where(inArray(matchPlayers.matchId, ids));
    await tx.delete(matchResults).where(inArray(matchResults.id, ids));
  });
  invalidateMatches();
}

export async function deleteMatchResult(id: number) {
  await deleteMultipleMatchResults([id]);
}

// ─── App Config ───────────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return result.length > 0 ? result[0].value : null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(appConfig).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appConfig);
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}
