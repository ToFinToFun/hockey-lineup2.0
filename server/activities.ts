/**
 * Aktiviteter (träningar, matcher, möten) och anmälan – ersätter på sikt laget.se.
 *
 * - Styrelsen skapar enstaka aktiviteter eller återkommande serier (samma seriesId).
 * - Anmälan per spelare i truppen: kommer / kommer inte / reserv. Den som administrerar
 *   kan lägga till vem som helst ur truppen (även icke-medlemmar, t.ex. en extern målvakt).
 * - Lineup kan hämta anmälningarna härifrån i stället för från laget.se (inställning
 *   "attendance_source"). Standard är laget.se, så inget ändras förrän det slås på.
 */
import { randomUUID } from "crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { activities, activityAttendance, type ActivityRow } from "../drizzle/schema";
import { listPlayers } from "./playersDb";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { LINEUP_TYPES, signupWindow, sortAttendees, stockholmParts, stockholmToDate, type ActivityType, type Invite } from "../shared/activities";
import type { AttendanceResult } from "./lagetSe";

export type AttendanceStatus = "yes" | "no" | "reserve";

export interface ActivityFields {
  type: ActivityType;
  title: string;
  location: string;
  description: string;
  invite: Invite;
  /** "HH:MM" svensk tid */
  startTime: string;
  /** "HH:MM" eller tom */
  endTime: string;
  maxParticipants: number | null;
  waitlist: boolean;
  opensDaysBefore: number | null;
  closesHoursBefore: number | null;
  /** Valda spelare utöver (eller i stället för) gruppen */
  invitedPlayerIds: string[];
  feeEnabled: boolean;
  feeAmount: number | null;
  feeReason: string;
  feeSwish: string;
}

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  return d;
}

/** Start och slut (UTC) för ett datum med fältens klockslag. Slut före start = över midnatt. */
function times(date: string, f: Pick<ActivityFields, "startTime" | "endTime">) {
  const startsAt = stockholmToDate(date, f.startTime);
  let endsAt: Date | null = f.endTime ? stockholmToDate(date, f.endTime) : null;
  if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86400000);
  return { startsAt, endsAt };
}

function rowValues(f: ActivityFields) {
  return {
    type: f.type,
    title: f.title.trim(),
    location: f.location.trim(),
    description: f.description.trim() || null,
    invite: f.invite,
    maxParticipants: f.maxParticipants,
    waitlist: f.waitlist,
    opensDaysBefore: f.opensDaysBefore,
    closesHoursBefore: f.closesHoursBefore,
    invitedPlayerIds: [...new Set(f.invitedPlayerIds)],
    feeEnabled: f.feeEnabled,
    feeAmount: f.feeEnabled ? f.feeAmount : null,
    feeReason: f.feeEnabled ? f.feeReason.trim().slice(0, 120) : "",
    feeSwish: f.feeEnabled ? f.feeSwish.trim().slice(0, 40) : "",
  };
}

// ─── Styrelsen (från sajtens Organisation) ───────────────────────────────────

let boardCache: { at: number; names: string[]; error: string | null } | null = null;

/** Styrelsens namn från sajten (gruppen Styrelsen under Organisation). Cachas i 10 minuter. */
export async function boardNames(): Promise<{ names: string[]; error: string | null }> {
  if (boardCache && Date.now() - boardCache.at < 10 * 60_000) return boardCache;
  try {
    const { siteRequest, integrationConfigured } = await import("./integration");
    if (!integrationConfigured()) return { names: [], error: "Kopplingen till sajten är inte inställd" };
    const r = await siteRequest<{ names: string[] }>("GET", "/internal/v1/board");
    boardCache = { at: Date.now(), names: r.names ?? [], error: null };
    await setConfigValue("activities.board", JSON.stringify(boardCache.names)).catch(() => {});
  } catch (e) {
    // Sajten svarar inte – använd senast kända lista
    const saved = await getConfigValue("activities.board").catch(() => null);
    boardCache = { at: Date.now(), names: saved ? (JSON.parse(saved) as string[]) : [], error: (e as Error).message };
  }
  return boardCache;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Vilka spelare som är kallade till en aktivitet (id → orsak). */
export async function invitedPlayers(row: Pick<ActivityRow, "invite" | "invitedPlayerIds">, players: Awaited<ReturnType<typeof listPlayers>>) {
  const out = new Map<string, "group" | "selected">();
  if (row.invite === "all") for (const p of players) if (p.isMember && p.active) out.set(p.id, "group");
  const unmatched: string[] = [];
  if (row.invite === "board") {
    const { names } = await boardNames();
    for (const n of names) {
      const p = players.find((x) => norm(x.name) === norm(n));
      if (p) out.set(p.id, "group");
      else unmatched.push(n);
    }
  }
  for (const id of row.invitedPlayerIds ?? []) if (!out.has(id)) out.set(id, "selected");
  return { invited: out, unmatched };
}

/** Skapar en aktivitet per datum. Flera datum blir en serie. Returnerar id:n. */
export async function createActivities(f: ActivityFields, dates: string[]): Promise<number[]> {
  const d = await db();
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) throw new Error("Välj minst ett datum");
  const seriesId = unique.length > 1 ? randomUUID() : null;
  const ids: number[] = [];
  for (const date of unique) {
    const [r] = await d.insert(activities).values({ ...rowValues(f), ...times(date, f), seriesId });
    ids.push((r as unknown as { insertId: number }).insertId);
  }
  return ids;
}

async function getRow(id: number): Promise<ActivityRow> {
  const d = await db();
  const [row] = await d.select().from(activities).where(eq(activities.id, id));
  if (!row) throw new Error("Aktiviteten finns inte");
  return row;
}

/** Tillfällen som påverkas: bara detta, eller detta och alla senare i samma serie. */
async function scopeRows(id: number, scope: "one" | "following"): Promise<ActivityRow[]> {
  const row = await getRow(id);
  if (scope === "one" || !row.seriesId) return [row];
  const d = await db();
  return d
    .select()
    .from(activities)
    .where(and(eq(activities.seriesId, row.seriesId), gte(activities.startsAt, row.startsAt)))
    .orderBy(asc(activities.startsAt));
}

/**
 * Ändrar ett tillfälle eller alla kommande i serien. Vid "alla kommande" behåller varje
 * tillfälle sitt datum men får de nya klockslagen. `date` flyttar bara ett enskilt tillfälle.
 */
export async function updateActivities(id: number, scope: "one" | "following", f: ActivityFields, date?: string) {
  const d = await db();
  const rows = await scopeRows(id, scope);
  for (const row of rows) {
    const day = scope === "one" && date ? date : stockholmParts(row.startsAt).date;
    await d.update(activities).set({ ...rowValues(f), ...times(day, f) }).where(eq(activities.id, row.id));
  }
  return { changed: rows.length };
}

export async function setCancelled(id: number, scope: "one" | "following", cancelled: boolean, note: string) {
  const d = await db();
  const rows = await scopeRows(id, scope);
  await d
    .update(activities)
    .set({ cancelled, cancelledNote: cancelled ? note.trim().slice(0, 200) : "" })
    .where(inArray(activities.id, rows.map((r) => r.id)));
  return { changed: rows.length };
}

export async function deleteActivities(id: number, scope: "one" | "following") {
  const d = await db();
  const ids = (await scopeRows(id, scope)).map((r) => r.id);
  await d.delete(activityAttendance).where(inArray(activityAttendance.activityId, ids));
  await d.delete(activities).where(inArray(activities.id, ids));
  return { deleted: ids.length };
}

export interface ActivitySummary extends ActivityRow {
  yes: number;
  no: number;
  reserve: number;
  goalies: number;
  seriesCount: number;
}

/** Aktiviteter i ett intervall (standard: från i dag och framåt), med antal anmälda. */
export async function listActivities(opts: { from?: Date; to?: Date } = {}): Promise<ActivitySummary[]> {
  const d = await db();
  const from = opts.from ?? stockholmToDate(stockholmParts(new Date()).date, "00:00");
  const where = opts.to ? and(gte(activities.startsAt, from), lte(activities.startsAt, opts.to)) : gte(activities.startsAt, from);
  const rows = await d.select().from(activities).where(where).orderBy(asc(activities.startsAt)).limit(500);
  if (rows.length === 0) return [];
  const [att, players, series] = await Promise.all([
    d.select().from(activityAttendance).where(inArray(activityAttendance.activityId, rows.map((r) => r.id))),
    listPlayers(),
    d
      .select({ seriesId: activities.seriesId, n: sql<number>`count(*)` })
      .from(activities)
      .where(inArray(activities.seriesId, [...new Set(rows.map((r) => r.seriesId).filter((s): s is string => !!s))].concat("-")))
      .groupBy(activities.seriesId),
  ]);
  const pos = new Map(players.map((p) => [p.id, p.position]));
  const seriesN = new Map(series.map((s) => [s.seriesId, Number(s.n)]));
  return rows.map((r) => {
    const mine = att.filter((a) => a.activityId === r.id);
    const yes = mine.filter((a) => a.status === "yes");
    return {
      ...r,
      yes: yes.length,
      no: mine.filter((a) => a.status === "no").length,
      reserve: mine.filter((a) => a.status === "reserve").length,
      goalies: yes.filter((a) => pos.get(a.playerId) === "MV").length,
      seriesCount: r.seriesId ? seriesN.get(r.seriesId) ?? 1 : 1,
    };
  });
}

export interface Attendee {
  playerId: string;
  name: string;
  number: string;
  position: string;
  isMember: boolean;
  status: AttendanceStatus;
  source: string;
  comment: string;
  updatedAt: Date;
}

/** En aktivitet med anmälningslistan (målvakter först, sedan bokstavsordning) och truppen. */
export async function getActivity(id: number) {
  const d = await db();
  const row = await getRow(id);
  const [att, players] = await Promise.all([d.select().from(activityAttendance).where(eq(activityAttendance.activityId, id)), listPlayers()]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const attendees: Attendee[] = att
    .map((a) => {
      const p = byId.get(a.playerId);
      return {
        playerId: a.playerId,
        name: p?.name ?? "Okänd spelare",
        number: p?.number ?? "",
        position: p?.position ?? "",
        isMember: p?.isMember ?? false,
        status: a.status as AttendanceStatus,
        source: a.source,
        comment: a.comment,
        updatedAt: a.updatedAt,
      };
    });
  const roster = players
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, isMember: p.isMember, teamColor: p.teamColor }));
  const { invited, unmatched } = await invitedPlayers(row, players);
  const answered = new Set(att.map((a) => a.playerId));
  const notAnswered = sortAttendees(
    [...invited.keys()]
      .filter((pid) => !answered.has(pid))
      .map((pid) => byId.get(pid))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ playerId: p.id, name: p.name, number: p.number, position: p.position, isMember: p.isMember })),
  );
  return {
    activity: row,
    window: signupWindow(row),
    invitedCount: invited.size,
    notAnswered,
    unmatchedBoard: unmatched,
    yes: sortAttendees(attendees.filter((a) => a.status === "yes")),
    reserve: sortAttendees(attendees.filter((a) => a.status === "reserve")),
    no: sortAttendees(attendees.filter((a) => a.status === "no")),
    roster: sortAttendees(roster),
  };
}

/**
 * Sätter en spelares anmälan. null tar bort raden (inte svarat).
 * Den som administrerar (force) går förbi max antal; annars blir det reserv eller stopp.
 */
export async function setAttendance(activityId: number, playerId: string, status: "yes" | "no" | null, source: "self" | "admin", force = false) {
  const d = await db();
  const row = await getRow(activityId);
  if (status === null) {
    await d.delete(activityAttendance).where(and(eq(activityAttendance.activityId, activityId), eq(activityAttendance.playerId, playerId)));
    return { status: null };
  }
  let final: AttendanceStatus = status;
  if (status === "yes" && row.maxParticipants != null && !force) {
    const [c] = await d
      .select({ n: sql<number>`count(*)` })
      .from(activityAttendance)
      .where(and(eq(activityAttendance.activityId, activityId), eq(activityAttendance.status, "yes"), sql`${activityAttendance.playerId} <> ${playerId}`));
    if (Number(c?.n ?? 0) >= row.maxParticipants) {
      if (!row.waitlist) throw new Error(`Fullt – max ${row.maxParticipants} deltagare`);
      final = "reserve";
    }
  }
  await d
    .insert(activityAttendance)
    .values({ activityId, playerId, status: final, source })
    .onDuplicateKeyUpdate({ set: { status: final, source } });
  // Plats ledig? Första på reservlistan flyttas upp
  if (status === "no" && row.maxParticipants != null && row.waitlist) await promoteReserve(activityId, row.maxParticipants);
  return { status: final };
}

async function promoteReserve(activityId: number, max: number) {
  const d = await db();
  const all = await d.select().from(activityAttendance).where(eq(activityAttendance.activityId, activityId));
  const yes = all.filter((a) => a.status === "yes").length;
  const reserves = all.filter((a) => a.status === "reserve").sort((a, b) => +a.createdAt - +b.createdAt);
  for (const r of reserves.slice(0, Math.max(0, max - yes))) {
    await d.update(activityAttendance).set({ status: "yes" }).where(eq(activityAttendance.id, r.id));
  }
}

// ─── Lineup ──────────────────────────────────────────────────────────────────

const SOURCE_KEY = "attendance_source";
export type AttendanceSource = "laget" | "app";

export async function getAttendanceSource(): Promise<AttendanceSource> {
  return (await getConfigValue(SOURCE_KEY)) === "app" ? "app" : "laget";
}

export async function setAttendanceSource(source: AttendanceSource) {
  await setConfigValue(SOURCE_KEY, source);
}

/** Dagens eller nästa träning/match (inte inställd) – den som Lineup visar anmälningar för. */
export async function nextLineupActivity(now = new Date()): Promise<ActivityRow | null> {
  const d = await db();
  // Pågående räknas också: start upp till 4 timmar bakåt
  const rows = await d
    .select()
    .from(activities)
    .where(and(gte(activities.startsAt, new Date(now.getTime() - 4 * 3600000)), eq(activities.cancelled, false), inArray(activities.type, LINEUP_TYPES)))
    .orderBy(asc(activities.startsAt))
    .limit(5);
  return rows.find((r) => (r.endsAt ?? new Date(r.startsAt.getTime() + 2 * 3600000)) > now) ?? null;
}

/** Samma form som laget.se-hämtningen, så att Lineup fungerar oförändrat. */
export async function appAttendance(): Promise<AttendanceResult> {
  const row = await nextLineupActivity();
  if (!row) return { eventTitle: "", eventDate: "", registeredNames: [], declinedNames: [], totalRegistered: 0, noEvent: true };
  const a = await getActivity(row.id);
  const start = stockholmParts(row.startsAt);
  return {
    eventTitle: row.title,
    eventDate: start.date,
    eventTime: start.time,
    eventEndTime: row.endsAt ? stockholmParts(row.endsAt).time : undefined,
    eventLocation: row.location || undefined,
    registeredNames: a.yes.map((x) => x.name),
    declinedNames: a.no.map((x) => x.name),
    totalRegistered: a.yes.length,
  };
}

/** Lineup ändrar en spelares anmälan (på namn, som mot laget.se). */
export async function setAppAttendanceByName(playerName: string, status: "Attending" | "NotAttending" | "NotAnswered") {
  const row = await nextLineupActivity();
  if (!row) return { success: false, error: "Ingen kommande träning eller match i appen" };
  const players = await listPlayers();
  const norm = (s: string) => s.trim().toLowerCase();
  const p = players.find((x) => norm(x.name) === norm(playerName)) ?? players.find((x) => x.lagetName && norm(x.lagetName) === norm(playerName));
  if (!p) return { success: false, error: `Hittar ingen spelare som heter ${playerName}` };
  await setAttendance(row.id, p.id, status === "Attending" ? "yes" : status === "NotAttending" ? "no" : null, "admin", true);
  return { success: true };
}
