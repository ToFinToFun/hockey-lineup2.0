/**
 * Sponsorer: register (namn + valfri logga) och visningsräknare per säsong.
 *
 * - Mål: räknas direkt från match_goals (sponsorn sparas med varje mål),
 *   bara matcher som inte är avvisade.
 * - Laguppställningar: en rad i sponsor_news per skapad nyhet.
 *
 * Säsongen börjar 1 juni (se shared/sponsors.ts).
 */
import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import { matchGoals, matchResults, sponsorNews, sponsors, type SponsorRow } from "../drizzle/schema";
import { sponsorSeasonStart, sponsorSeasonLabel, type Sponsor, type SponsorCounts } from "../shared/sponsors";

const norm = (name: string) => name.trim().toLowerCase();

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

/** Mål per sponsornamn (normaliserat) i intervallet [from, to). */
async function goalCounts(from: Date, to: Date): Promise<Map<string, number>> {
  const db = await requireDb();
  const rows = await db
    .select({ sponsor: matchGoals.sponsor, n: sql<number>`count(*)` })
    .from(matchGoals)
    .innerJoin(matchResults, eq(matchResults.id, matchGoals.matchId))
    .where(
      and(
        gte(matchResults.matchEndTime, from),
        lt(matchResults.matchEndTime, to),
        ne(matchResults.reviewStatus, "rejected")
      )
    )
    .groupBy(matchGoals.sponsor);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.sponsor) continue;
    const key = norm(r.sponsor);
    map.set(key, (map.get(key) ?? 0) + Number(r.n));
  }
  return map;
}

/** Nyheter per sponsor-ID i intervallet [from, to). */
async function newsCounts(from: Date, to: Date): Promise<Map<number, number>> {
  const db = await requireDb();
  const rows = await db
    .select({ sponsorId: sponsorNews.sponsorId, n: sql<number>`count(*)` })
    .from(sponsorNews)
    .where(and(gte(sponsorNews.createdAt, from), lt(sponsorNews.createdAt, to)))
    .groupBy(sponsorNews.sponsorId);
  return new Map(rows.map((r) => [r.sponsorId, Number(r.n)]));
}

export interface SponsorList {
  season: { start: string; label: string; previousLabel: string };
  sponsors: Sponsor[];
}

export async function listSponsors(now: Date = new Date()): Promise<SponsorList> {
  const db = await requireDb();
  const start = sponsorSeasonStart(now);
  const prevStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
  const farFuture = new Date(start.getFullYear() + 2, 0, 1);

  const [rows, goalsNow, goalsPrev, newsNow, newsPrev] = await Promise.all([
    db.select().from(sponsors).orderBy(asc(sponsors.sortOrder), asc(sponsors.name)),
    goalCounts(start, farFuture),
    goalCounts(prevStart, start),
    newsCounts(start, farFuture),
    newsCounts(prevStart, start),
  ]);

  const counts = (row: SponsorRow, goals: Map<string, number>, news: Map<number, number>): SponsorCounts => ({
    matches: goals.get(norm(row.name)) ?? 0,
    lineups: news.get(row.id) ?? 0,
  });

  return {
    season: { start: start.toISOString(), label: sponsorSeasonLabel(start), previousLabel: sponsorSeasonLabel(prevStart) },
    sponsors: rows.map((row) => ({
      id: row.id,
      name: row.name,
      logo: row.logo ?? null,
      active: row.active,
      sortOrder: row.sortOrder,
      counts: counts(row, goalsNow, newsNow),
      previous: counts(row, goalsPrev, newsPrev),
    })),
  };
}

async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const db = await requireDb();
  const rows = await db.select({ id: sponsors.id, name: sponsors.name }).from(sponsors);
  return rows.some((r) => norm(r.name) === norm(name) && r.id !== exceptId);
}

export async function createSponsor(input: { name: string; logo: string | null; active: boolean }) {
  const db = await requireDb();
  const name = input.name.trim();
  if (await nameTaken(name)) throw new Error(`Det finns redan en sponsor som heter "${name}"`);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${sponsors.sortOrder}), 0)` }).from(sponsors);
  await db.insert(sponsors).values({ name, logo: input.logo, active: input.active, sortOrder: Number(max) + 1 });
}

/**
 * Uppdatera en sponsor. `logo: undefined` lämnar loggan orörd, `null` tar bort den.
 * Byter sponsorn namn uppdateras även målen, så att räknare och historik följer med.
 */
export async function updateSponsor(input: { id: number; name?: string; logo?: string | null; active?: boolean }) {
  const db = await requireDb();
  const [current] = await db.select().from(sponsors).where(eq(sponsors.id, input.id)).limit(1);
  if (!current) throw new Error("Sponsorn finns inte");

  const set: Partial<SponsorRow> = {};
  const newName = input.name?.trim();
  if (newName && newName !== current.name) {
    if (await nameTaken(newName, current.id)) throw new Error(`Det finns redan en sponsor som heter "${newName}"`);
    set.name = newName;
  }
  if (input.logo !== undefined) set.logo = input.logo;
  if (input.active !== undefined) set.active = input.active;
  if (Object.keys(set).length === 0) return;

  await db.transaction(async (tx) => {
    await tx.update(sponsors).set(set).where(eq(sponsors.id, input.id));
    if (set.name) {
      // Samma matchning som räknarna: skiftläge och mellanslag runt namnet spelar ingen roll
      await tx
        .update(matchGoals)
        .set({ sponsor: set.name })
        .where(sql`lower(trim(${matchGoals.sponsor})) = ${norm(current.name)}`);
    }
  });
}

/** Tar bort sponsorn. Målen behåller namnet som text i historiken. */
export async function deleteSponsor(id: number) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    await tx.delete(sponsorNews).where(eq(sponsorNews.sponsorId, id));
    await tx.delete(sponsors).where(eq(sponsors.id, id));
  });
}

export async function moveSponsor(id: number, direction: "up" | "down") {
  const db = await requireDb();
  const rows = await db.select({ id: sponsors.id }).from(sponsors).orderBy(asc(sponsors.sortOrder), asc(sponsors.name));
  const idx = rows.findIndex((r) => r.id === id);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= rows.length) return;
  const order = rows.map((r) => r.id);
  [order[idx], order[target]] = [order[target], order[idx]];
  await db.transaction(async (tx) => {
    for (let i = 0; i < order.length; i++) {
      await tx.update(sponsors).set({ sortOrder: i + 1 }).where(eq(sponsors.id, order[i]));
    }
  });
}

export async function recordSponsorNews(sponsorId: number) {
  const db = await requireDb();
  await db.insert(sponsorNews).values({ sponsorId });
}
