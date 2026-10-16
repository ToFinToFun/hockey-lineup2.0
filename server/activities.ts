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

export interface Board {
  names: string[];
  /** Medlemmarnas id i sajtens register (samma som players.externalId för kopplade spelare) */
  memberIds: number[];
  /** Namn i Organisation som inte finns i registret */
  unmatched: string[];
  error: string | null;
}

let boardCache: { at: number; value: Board } | null = null;

/** Sajten säger till när Organisation sparats – nästa läsning hämtar på nytt. */
export function clearBoardCache() {
  boardCache = null;
}

/**
 * Styrelsen enligt sajten: gruppen Styrelsen under Organisation, matchad mot medlemsregistret.
 * Hämtas på nytt när sajten meddelar en ändring, annars högst var 10:e minut. Svarar sajten
 * inte används senast kända lista.
 */
export async function boardMembers(): Promise<Board> {
  if (boardCache && Date.now() - boardCache.at < 10 * 60_000) return boardCache.value;
  let value: Board;
  try {
    const { siteRequest, integrationConfigured } = await import("./integration");
    if (!integrationConfigured()) throw new Error("Kopplingen till sajten är inte inställd");
    const r = await siteRequest<{ names: string[]; memberIds: number[]; unmatched: string[] }>("GET", "/internal/v1/board");
    value = { names: r.names ?? [], memberIds: r.memberIds ?? [], unmatched: r.unmatched ?? [], error: null };
    await setConfigValue("activities.board", JSON.stringify(value)).catch(() => {});
  } catch (e) {
    const saved = await getConfigValue("activities.board").catch(() => null);
    const last = saved ? (JSON.parse(saved) as Partial<Board>) : {};
    value = { names: last.names ?? [], memberIds: last.memberIds ?? [], unmatched: last.unmatched ?? [], error: (e as Error).message };
  }
  boardCache = { at: Date.now(), value };
  return value;
}

/**
 * Vilka spelare som är kallade till en aktivitet. Bara medlemmar kan kallas (kallelsen går till
 * medlemmens e-post); den som inte är medlem kan bara läggas till som "kommer" av den som administrerar.
 */
export async function invitedPlayers(row: Pick<ActivityRow, "invite" | "invitedPlayerIds">, players: Awaited<ReturnType<typeof listPlayers>>) {
  const members = players.filter((p) => p.isMember);
  const out = new Set<string>();
  const warnings: string[] = [];
  if (row.invite === "all") for (const p of members) if (p.active) out.add(p.id);
  if (row.invite === "board") {
    const board = await boardMembers();
    for (const n of board.unmatched) warnings.push(`${n} (finns inte i medlemsregistret)`);
    for (const id of board.memberIds) {
      const p = members.find((x) => x.externalId === String(id));
      if (p) out.add(p.id);
      else warnings.push(`medlem ${id} (saknar spelare i appen – koppla under Koppla spelare på sajten)`);
    }
  }
  const memberIds = new Set(members.map((p) => p.id));
  for (const id of row.invitedPlayerIds ?? []) if (memberIds.has(id)) out.add(id);
  return { invited: out, warnings };
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
  const { invited, warnings } = await invitedPlayers(row, players);
  const answered = new Set(att.map((a) => a.playerId));
  const notAnswered = sortAttendees(
    [...invited]
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
    inviteWarnings: warnings,
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

// ─── Medlemmarna (egen inloggning) ───────────────────────────────────────────

/** Medlemmens spelare i appen (kopplad via sajtens register). */
export async function playerForMember(memberId: number) {
  return (await listPlayers()).find((p) => p.externalId === String(memberId)) ?? null;
}

function openState(row: ActivityRow, now = Date.now()) {
  const w = signupWindow(row);
  const end = (row.endsAt ?? new Date(row.startsAt.getTime() + 2 * 3600000)).getTime();
  return {
    window: w,
    notOpenYet: !!w.opensAt && now < w.opensAt.getTime(),
    closed: now >= w.closesAt.getTime(),
    over: now >= end,
  };
}

/** Kommande aktiviteter där medlemmen är kallad eller har svarat, med medlemmens svar. */
export async function memberActivities(playerId: string) {
  const d = await db();
  const players = await listPlayers();
  const rows = await d
    .select()
    .from(activities)
    .where(gte(activities.startsAt, new Date(Date.now() - 4 * 3600000)))
    .orderBy(asc(activities.startsAt))
    .limit(200);
  if (!rows.length) return [];
  const att = await d.select().from(activityAttendance).where(inArray(activityAttendance.activityId, rows.map((r) => r.id)));
  const out = [];
  for (const r of rows) {
    const mine = att.find((a) => a.activityId === r.id && a.playerId === playerId);
    const { invited } = await invitedPlayers(r, players);
    if (!mine && !invited.has(playerId)) continue;
    const st = openState(r);
    if (st.over) continue;
    out.push({
      id: r.id,
      type: r.type,
      title: r.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      location: r.location,
      cancelled: r.cancelled,
      feeEnabled: r.feeEnabled,
      maxParticipants: r.maxParticipants,
      yes: att.filter((a) => a.activityId === r.id && a.status === "yes").length,
      myStatus: (mine?.status as AttendanceStatus | undefined) ?? null,
      opensAt: st.window.opensAt,
      closesAt: st.window.closesAt,
      notOpenYet: st.notOpenYet,
      closed: st.closed,
    });
  }
  return out;
}

/** En aktivitet för medlemmen: detaljer, mitt svar och vilka som kommer. */
export async function memberActivity(id: number, playerId: string) {
  const a = await getActivity(id);
  const mine = [...a.yes, ...a.reserve, ...a.no].find((x) => x.playerId === playerId);
  const { invited } = await invitedPlayers(a.activity, await listPlayers());
  if (!mine && !invited.has(playerId)) throw new Error("Du är inte kallad till den här aktiviteten");
  const st = openState(a.activity);
  const r = a.activity;
  const pick = (x: Attendee) => ({ playerId: x.playerId, name: x.name, number: x.number, position: x.position, isMember: x.isMember });
  return {
    activity: {
      id: r.id,
      type: r.type,
      title: r.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      location: r.location,
      description: r.description,
      cancelled: r.cancelled,
      maxParticipants: r.maxParticipants,
      waitlist: r.waitlist,
      feeEnabled: r.feeEnabled,
      feeAmount: r.feeAmount,
      feeReason: r.feeReason,
      feeSwish: r.feeSwish,
      seriesId: r.seriesId,
    },
    myStatus: (mine?.status as AttendanceStatus | undefined) ?? null,
    opensAt: st.window.opensAt,
    closesAt: st.window.closesAt,
    notOpenYet: st.notOpenYet,
    closed: st.closed,
    over: st.over,
    yes: a.yes.map(pick),
    reserve: a.reserve.map(pick),
  };
}

/**
 * Medlemmen svarar. Kommer: bara när anmälan är öppen. Kommer inte: alltid fram till att
 * aktiviteten är slut (avanmälan går även efter att anmälan stängt).
 */
export async function memberRespond(id: number, playerId: string, status: "yes" | "no") {
  const a = await memberActivity(id, playerId);
  if (a.activity.cancelled) throw new Error("Aktiviteten är inställd");
  if (a.over) throw new Error("Aktiviteten är redan slut");
  if (status === "yes") {
    if (a.notOpenYet) throw new Error("Anmälan har inte öppnat än");
    if (a.closed) throw new Error("Anmälan har stängt – kontakta den som håller i aktiviteten");
  }
  return setAttendance(id, playerId, status, "self");
}
