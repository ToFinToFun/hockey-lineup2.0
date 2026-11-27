/**
 * Omröstningar och intresseanmälningar.
 *
 * Admin skapar (rubrik, beskrivning, alternativ, ett eller flera val, valfri
 * stängningstid). Alla kan svara utan inloggning: en röst per telefon (telefonens
 * hemliga nyckel, sparad som hash) och den kan ändras. Är man inloggad som medlem
 * sparas också medlemmen och dess spelare – samma röst följer då med mellan
 * telefonerna, och admin ser vem som svarat vad.
 *
 * Resultatet visas för den som svarat, när omröstningen stängt, och alltid för admin.
 * Spärr: högst 40 röster per IP-adress och omröstning (en hel hall på samma wifi går bra).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "./db";
import { polls, pollVotes, type PollOption } from "../drizzle/schema";

export const POLL_LIMITS = { perIp: 40, maxOptions: 20, showClosedDays: 14 };
export type PollKind = "poll" | "interest";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}
const hash = (s: string) => createHash("sha256").update(`poll:${s}`).digest("hex");

type PollRow = typeof polls.$inferSelect;
export const pollOpen = (p: Pick<PollRow, "closed" | "closesAt">, now = new Date()) =>
  !p.closed && (!p.closesAt || p.closesAt.getTime() > now.getTime());

/** Alternativen efter en ändring: befintliga behåller sitt id, nya får nästa lediga */
export function mergeOptions(old: PollOption[], next: Array<{ id?: number | null; text: string }>): PollOption[] {
  let max = old.reduce((m, o) => Math.max(m, o.id), 0);
  const known = new Set(old.map((o) => o.id));
  return next
    .map((o) => ({ id: o.id != null && known.has(o.id) ? o.id : ++max, text: o.text.trim().replace(/\s+/g, " ").slice(0, 120) }))
    .filter((o) => o.text);
}

export async function savePoll(input: { id?: number; kind: PollKind; title: string; description: string | null; options: Array<{ id?: number | null; text: string }>; multi: boolean; closesAt: Date | null }) {
  const db = await requireDb();
  const title = input.title.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!title) throw new Error("Skriv en rubrik");
  const description = input.description?.trim() || null;
  if (input.id) {
    const [old] = await db.select().from(polls).where(eq(polls.id, input.id)).limit(1);
    if (!old) throw new Error("Omröstningen finns inte");
    const options = mergeOptions(old.options, input.options);
    if (options.length < 1) throw new Error("Lägg till minst ett alternativ");
    await db.update(polls).set({ kind: input.kind, title, description, options, multi: input.multi, closesAt: input.closesAt }).where(eq(polls.id, input.id));
    return input.id;
  }
  const options = mergeOptions([], input.options);
  if (options.length < 1) throw new Error("Lägg till minst ett alternativ");
  const [res] = await db.insert(polls).values({ kind: input.kind, title, description, options, multi: input.multi, closesAt: input.closesAt });
  return Number((res as { insertId: number }).insertId);
}

export async function setPollClosed(id: number, closed: boolean) {
  const db = await requireDb();
  // Öppnas en omröstning igen tas en passerad stängningstid bort
  const [p] = await db.select().from(polls).where(eq(polls.id, id)).limit(1);
  if (!p) return false;
  await db.update(polls).set({ closed, ...(!closed && p.closesAt && p.closesAt.getTime() <= Date.now() ? { closesAt: null } : {}) }).where(eq(polls.id, id));
  return true;
}

export async function deletePoll(id: number) {
  const db = await requireDb();
  await db.delete(pollVotes).where(eq(pollVotes.pollId, id));
  await db.delete(polls).where(eq(polls.id, id));
}

/** Rösten som gäller för den här personen: medlemmens (alla telefoner) eller telefonens */
async function findVote(pollId: number, deviceKey: string | null, memberId: number | null) {
  const db = await requireDb();
  if (memberId != null) {
    const [m] = await db.select().from(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.memberId, memberId))).limit(1);
    if (m) return m;
  }
  if (!deviceKey) return null;
  const [d] = await db.select().from(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.device, hash(`d:${deviceKey}`)))).limit(1);
  return d ?? null;
}

export type VoteError = "missing" | "closed" | "choices" | "ip";

export async function castVote(input: { pollId: number; device: string; choices: number[]; memberId: number | null; playerId: string | null; ip: string }): Promise<{ ok: true } | { ok: false; reason: VoteError }> {
  const db = await requireDb();
  const [p] = await db.select().from(polls).where(eq(polls.id, input.pollId)).limit(1);
  if (!p) return { ok: false, reason: "missing" };
  if (!pollOpen(p)) return { ok: false, reason: "closed" };
  const valid = new Set(p.options.map((o) => o.id));
  const choices = [...new Set(input.choices)].filter((c) => valid.has(c));
  if (!choices.length || choices.length !== input.choices.length || (!p.multi && choices.length > 1)) return { ok: false, reason: "choices" };
  const device = hash(`d:${input.device}`), ipHash = hash(`ip:${input.ip}`);
  const existing = await findVote(p.id, input.device, input.memberId);
  if (existing) {
    await db.update(pollVotes).set({
      choices, ipHash,
      ...(input.memberId != null ? { memberId: input.memberId, playerId: input.playerId } : {}),
    }).where(eq(pollVotes.id, existing.id));
    return { ok: true };
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(pollVotes).where(and(eq(pollVotes.pollId, p.id), eq(pollVotes.ipHash, ipHash)));
  if (Number(n) >= POLL_LIMITS.perIp) return { ok: false, reason: "ip" };
  await db.insert(pollVotes).values({ pollId: p.id, device, memberId: input.memberId, playerId: input.playerId, choices, ipHash });
  return { ok: true };
}

/** Ta tillbaka sitt svar (t.ex. en intresseanmälan) */
export async function removeVote(pollId: number, deviceKey: string, memberId: number | null) {
  const db = await requireDb();
  const v = await findVote(pollId, deviceKey, memberId);
  if (!v) return false;
  const [p] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!p || !pollOpen(p)) return false;
  await db.delete(pollVotes).where(eq(pollVotes.id, v.id));
  return true;
}

/**
 * Omröstningarna att visa: öppna, och stängda de senaste två veckorna (admin ser alla).
 * Resultatet (antal per alternativ) bara när man svarat, när den stängt eller för admin.
 * Admin får också namnen på inloggade som svarat.
 */
export async function listPolls(opts: { device: string | null; memberId: number | null; admin: boolean; playerName: (id: string) => string | null; now?: Date }) {
  const db = await requireDb();
  const now = opts.now ?? new Date();
  const rows = await db.select().from(polls).orderBy(desc(polls.createdAt));
  const visible = rows.filter((p) => opts.admin || pollOpen(p, now)
    || now.getTime() - (p.closesAt && !p.closed ? p.closesAt : p.updatedAt).getTime() < POLL_LIMITS.showClosedDays * 86_400_000);
  if (!visible.length) return [];
  const votes = await db.select().from(pollVotes).where(inArray(pollVotes.pollId, visible.map((p) => p.id)));
  const myDevice = opts.device ? hash(`d:${opts.device}`) : null;
  return visible.map((p) => {
    const vs = votes.filter((v) => v.pollId === p.id);
    const mine = (opts.memberId != null ? vs.find((v) => v.memberId === opts.memberId) : undefined) ?? (myDevice ? vs.find((v) => v.device === myDevice) : undefined);
    const open = pollOpen(p, now);
    const showResults = opts.admin || !!mine || !open;
    const counts = Object.fromEntries(p.options.map((o) => [o.id, 0])) as Record<number, number>;
    const names: Record<number, string[]> = {};
    for (const v of vs) for (const c of v.choices) if (c in counts) {
      counts[c]++;
      const name = opts.admin && v.playerId ? opts.playerName(v.playerId) : null;
      if (name) (names[c] ??= []).push(name);
    }
    return {
      id: p.id, kind: p.kind as PollKind, title: p.title, description: p.description, options: p.options, multi: p.multi,
      closesAt: p.closesAt, closed: p.closed, open, createdAt: p.createdAt,
      voters: vs.length,
      mine: mine ? mine.choices : null,
      counts: showResults ? counts : null,
      names: opts.admin ? names : null,
    };
  });
}

/** Startsidan: antal öppna och deras rubriker */
export async function openPollsSummary(now = new Date()) {
  const db = await requireDb();
  const rows = await db.select({ id: polls.id, title: polls.title, closed: polls.closed, closesAt: polls.closesAt }).from(polls).orderBy(desc(polls.createdAt));
  return rows.filter((p) => pollOpen(p, now)).map((p) => ({ id: p.id, title: p.title }));
}
