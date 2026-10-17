/**
 * Notiser, meddelanden från styrelsen och chatten per aktivitet.
 *
 * - Notiser: en regel, inga inställningar. Har medlemmen push på någon enhet får den push,
 *   annars mejl (via sajten, som har adresserna).
 * - Meddelanden: styrelsen skriver till alla medlemmar, styrelsen, de anmälda eller de som inte
 *   svarat på en aktivitet, eller valda medlemmar. Inkorg i appen + notis. Sparas i 12 månader.
 * - Chatt per aktivitet: de anmälda (kommer/reserv) och de med behörighet. Öppen från att anmälan
 *   öppnar till 12 timmar efter slut – sedan raderas allt. Bara push, aldrig mejl: en notis vid
 *   första nya inlägget, sedan tyst tills man läst (högst en per kvart). Tystad chatt: inga notiser.
 */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  activities,
  activityAttendance,
  activityChat,
  activityChatState,
  memberMessageReads,
  memberMessages,
  type ActivityRow,
} from "../drizzle/schema";
import { listPlayers } from "./playersDb";
import { boardMembers, chatClosesAt, invitedPlayers } from "./activities";
import { appUrl } from "./clubConfig";
import { shortDate, signupWindow, stockholmParts } from "../shared/activities";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  return d;
}

// ─── Notiser: push, annars mejl ──────────────────────────────────────────────

export interface MailResult {
  sent: number;
  missingEmail: number[];
  failed: number[];
}

export interface NotifyResult extends MailResult {
  pushed: number;
}

async function mail(target: { memberIds: number[] } | { all: true; excludeMemberIds: number[] }, subject: string, text: string): Promise<MailResult> {
  if ("memberIds" in target && !target.memberIds.length) return { sent: 0, missingEmail: [], failed: [] };
  const { siteRequest, integrationConfigured } = await import("./integration");
  if (!integrationConfigured()) throw new Error("Kopplingen till sajten är inte inställd – mejl kan inte skickas");
  return siteRequest<MailResult>("POST", "/internal/v1/mail/members", { ...target, subject, text });
}

/**
 * Når medlemmarna: push till den som har det, mejl till övriga.
 * target "all" = alla i registret (mejlet skickas av sajten till alla utom de som fick push).
 */
export async function notifyMembers(
  target: { memberIds: number[] } | { all: true },
  msg: { title: string; body: string; url: string; tag?: string; mailSubject: string; mailText: string },
): Promise<NotifyResult> {
  const { pushTo } = await import("./push");
  const all = !("memberIds" in target);
  const ids = all ? null : [...new Set(target.memberIds)];
  if (ids && !ids.length) return { pushed: 0, sent: 0, missingEmail: [], failed: [] };
  const reached = await pushTo(ids, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }).catch((e) => {
    console.warn("[notiser] push:", (e as Error).message);
    return new Set<number>();
  });
  const m = all
    ? await mail({ all: true, excludeMemberIds: [...reached] }, msg.mailSubject, msg.mailText)
    : await mail({ memberIds: ids!.filter((id) => !reached.has(id)) }, msg.mailSubject, msg.mailText);
  return { pushed: reached.size, ...m };
}

// ─── Meddelanden ─────────────────────────────────────────────────────────────

export type Audience =
  | { kind: "all" }
  | { kind: "board" }
  | { kind: "activity"; activityId: number; who: "yes" | "unanswered" }
  | { kind: "selected"; playerIds: string[] };

const when = (d: Date) => {
  const p = stockholmParts(d);
  return `${shortDate(p.date)} kl ${p.time}`;
};

/** Mottagare (medlems-id) och en beskrivning. toAll = alla i registret. */
async function resolveAudience(a: Audience): Promise<{ toAll: boolean; memberIds: number[]; label: string; activityId: number | null }> {
  const players = await listPlayers();
  const midOf = (pid: string) => {
    const p = players.find((x) => x.id === pid);
    const n = Number(p?.externalId);
    return p?.isMember && Number.isInteger(n) && n > 0 ? n : null;
  };
  if (a.kind === "all") return { toAll: true, memberIds: [], label: "Alla medlemmar", activityId: null };
  if (a.kind === "board") {
    const b = await boardMembers();
    return { toAll: false, memberIds: b.memberIds, label: "Styrelsen", activityId: null };
  }
  if (a.kind === "selected") {
    const ids = a.playerIds.map(midOf).filter((x): x is number => x !== null);
    const names = a.playerIds.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    return { toAll: false, memberIds: [...new Set(ids)], label: names.length <= 3 ? names.join(", ") : `${names.length} medlemmar`, activityId: null };
  }
  const d = await db();
  const [row] = await d.select().from(activities).where(eq(activities.id, a.activityId));
  if (!row) throw new Error("Aktiviteten finns inte");
  const att = await d.select().from(activityAttendance).where(eq(activityAttendance.activityId, row.id));
  let pids: string[];
  if (a.who === "yes") pids = att.filter((x) => x.status === "yes" || x.status === "reserve").map((x) => x.playerId);
  else {
    const answered = new Set(att.map((x) => x.playerId));
    pids = [...(await invitedPlayers(row, players)).invited].filter((pid) => !answered.has(pid));
  }
  const ids = [...new Set(pids.map(midOf).filter((x): x is number => x !== null))];
  return { toAll: false, memberIds: ids, label: `${a.who === "yes" ? "Anmälda" : "Ej svarat"}: ${row.title} ${when(row.startsAt)}`, activityId: row.id };
}

export async function sendMessage(input: { title: string; body: string; audience: Audience }) {
  const r = await resolveAudience(input.audience);
  if (!r.toAll && !r.memberIds.length) throw new Error("Inga mottagare");
  const d = await db();
  const [ins] = await d.insert(memberMessages).values({
    title: input.title.trim(),
    body: input.body.trim(),
    audienceLabel: r.label.slice(0, 200),
    activityId: r.activityId,
    toAll: r.toAll,
    recipientMemberIds: r.memberIds,
  });
  const id = (ins as unknown as { insertId: number }).insertId;
  const n = await notifyMembers(r.toAll ? { all: true } : { memberIds: r.memberIds }, {
    title: input.title.trim(),
    body: input.body.trim().slice(0, 180),
    url: "/mina/meddelanden",
    tag: `msg-${id}`,
    mailSubject: input.title.trim(),
    mailText: `${input.body.trim()}\n\n– Styrelsen, Stålstadens SF\n${appUrl()}/mina/meddelanden`,
  });
  await d.update(memberMessages).set({ emailed: n.sent, pushed: n.pushed }).where(eq(memberMessages.id, id));
  return { id, recipients: r.toAll ? null : r.memberIds.length, label: r.label, notify: n };
}

export async function sentMessages() {
  return (await db()).select().from(memberMessages).orderBy(desc(memberMessages.id)).limit(100);
}

export async function deleteMessage(id: number) {
  const d = await db();
  await d.delete(memberMessageReads).where(eq(memberMessageReads.messageId, id));
  await d.delete(memberMessages).where(eq(memberMessages.id, id));
}

/** Medlemmens inkorg (senaste 12 månaderna) med lästa/olästa. */
export async function inbox(memberId: number) {
  const d = await db();
  const rows = await d
    .select()
    .from(memberMessages)
    .where(sql`(${memberMessages.toAll} = true or json_contains(${memberMessages.recipientMemberIds}, ${String(memberId)}))`)
    .orderBy(desc(memberMessages.id))
    .limit(100);
  const reads = rows.length
    ? await d.select().from(memberMessageReads).where(and(eq(memberMessageReads.memberId, memberId), inArray(memberMessageReads.messageId, rows.map((r) => r.id))))
    : [];
  const read = new Set(reads.map((r) => r.messageId));
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.createdAt, audienceLabel: r.audienceLabel, read: read.has(r.id) }));
}

export async function markRead(memberId: number, messageId: number) {
  await (await db()).insert(memberMessageReads).values({ memberId, messageId }).onDuplicateKeyUpdate({ set: { memberId } });
}

// ─── Chatt per aktivitet ─────────────────────────────────────────────────────

const CHAT_AFTER_HOURS = 12;

export function chatWindow(a: Pick<ActivityRow, "startsAt" | "endsAt" | "opensDaysBefore" | "closesHoursBefore" | "createdAt">) {
  const w = signupWindow(a);
  const opens = w.opensAt ?? a.createdAt;
  const closes = chatClosesAt(a);
  const now = Date.now();
  return { opensAt: opens, closesAt: closes, open: now >= +opens && now < +closes };
}

/** Får spelaren vara med i chatten (anmäld: kommer eller reserv)? */
export async function inChat(activityId: number, playerId: string) {
  const [row] = await (await db())
    .select()
    .from(activityAttendance)
    .where(and(eq(activityAttendance.activityId, activityId), eq(activityAttendance.playerId, playerId)));
  return row?.status === "yes" || row?.status === "reserve";
}

export async function chatMessages(activityId: number) {
  const rows = await (await db()).select().from(activityChat).where(eq(activityChat.activityId, activityId)).orderBy(activityChat.id).limit(500);
  const players = await listPlayers();
  return rows.map((r) => {
    const p = r.playerId ? players.find((x) => x.id === r.playerId) : null;
    return { id: r.id, playerId: r.playerId, name: r.playerId ? p?.name ?? "Okänd" : "Styrelsen", position: p?.position ?? "", text: r.text, createdAt: r.createdAt };
  });
}

export async function postChat(activityId: number, playerId: string | null, text: string) {
  const [a] = await (await db()).select().from(activities).where(eq(activities.id, activityId));
  if (!a) throw new Error("Aktiviteten finns inte");
  if (!chatWindow(a).open) throw new Error("Chatten är stängd");
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new Error("Skriv något");
  const [ins] = await (await db()).insert(activityChat).values({ activityId, playerId, text: clean });
  const id = (ins as unknown as { insertId: number }).insertId;
  void chatPush(a, id, playerId, clean).catch((e) => console.warn("[chatt] push:", (e as Error).message));
}

const CHAT_PUSH_GAP = 15 * 60_000;

/**
 * Push om ett nytt chattinlägg till de anmälda (inte till den som skrev). Första nya inlägget
 * ger en notis; sedan tyst för den chatten tills man läst, högst en notis per kvart. Tystad: inget.
 */
async function chatPush(a: ActivityRow, newId: number, authorPlayerId: string | null, text: string) {
  const d = await db();
  const players = await listPlayers();
  const att = await d.select().from(activityAttendance).where(eq(activityAttendance.activityId, a.id));
  const targets = new Map<number, string>(); // medlems-id → spelar-id
  for (const x of att) {
    if ((x.status !== "yes" && x.status !== "reserve") || x.playerId === authorPlayerId) continue;
    const p = players.find((pl) => pl.id === x.playerId);
    const mid = Number(p?.externalId);
    if (p?.isMember && Number.isInteger(mid) && mid > 0) targets.set(mid, p.id);
  }
  if (!targets.size) return;
  const states = await d.select().from(activityChatState).where(and(eq(activityChatState.activityId, a.id), inArray(activityChatState.memberId, [...targets.keys()])));
  const earlier = await d
    .select({ id: activityChat.id, playerId: activityChat.playerId })
    .from(activityChat)
    .where(and(eq(activityChat.activityId, a.id), lt(activityChat.id, newId)));
  const now = Date.now();
  const send: number[] = [];
  for (const [mid, pid] of targets) {
    const st = states.find((x) => x.memberId === mid);
    if (st?.muted) continue;
    const unreadBefore = earlier.some((c) => c.id > (st?.lastReadId ?? 0) && c.playerId !== pid);
    if (unreadBefore && st?.notifiedAt && now - st.notifiedAt.getTime() < CHAT_PUSH_GAP) continue;
    send.push(mid);
  }
  if (!send.length) return;
  const author = authorPlayerId ? players.find((p) => p.id === authorPlayerId)?.name ?? "Någon" : "Styrelsen";
  const { pushTo } = await import("./push");
  const reached = await pushTo(send, { title: `${a.title} ${when(a.startsAt)}`, body: `${author}: ${text.slice(0, 140)}`, url: `/mina/${a.id}`, tag: `chat-${a.id}` });
  for (const mid of reached) {
    await d
      .insert(activityChatState)
      .values({ activityId: a.id, memberId: mid, notifiedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { notifiedAt: new Date() } });
  }
}

/** Tar bort ett inlägg: styrelsen alla, medlemmen sina egna. */
export async function deleteChat(id: number, playerId: string | null) {
  const d = await db();
  const where = playerId ? and(eq(activityChat.id, id), eq(activityChat.playerId, playerId)) : eq(activityChat.id, id);
  await d.delete(activityChat).where(where);
}

export async function chatState(activityId: number, memberId: number) {
  const [row] = await (await db())
    .select()
    .from(activityChatState)
    .where(and(eq(activityChatState.activityId, activityId), eq(activityChatState.memberId, memberId)));
  return { muted: row?.muted ?? false, lastReadId: row?.lastReadId ?? 0 };
}

export async function setChatState(activityId: number, memberId: number, patch: { muted?: boolean; lastReadId?: number }) {
  const cur = await chatState(activityId, memberId);
  const next = { muted: patch.muted ?? cur.muted, lastReadId: Math.max(cur.lastReadId, patch.lastReadId ?? 0) };
  await (await db()).insert(activityChatState).values({ activityId, memberId, ...next }).onDuplicateKeyUpdate({ set: next });
}

/** Olästa chattinlägg per aktivitet för medlemmen (tystade räknas inte). */
export async function unreadChats(memberId: number, playerId: string, activityIds: number[]) {
  if (!activityIds.length) return new Map<number, number>();
  const d = await db();
  const states = await d.select().from(activityChatState).where(and(eq(activityChatState.memberId, memberId), inArray(activityChatState.activityId, activityIds)));
  const counts = await d
    .select({ activityId: activityChat.activityId, id: activityChat.id, playerId: activityChat.playerId })
    .from(activityChat)
    .where(inArray(activityChat.activityId, activityIds));
  const out = new Map<number, number>();
  for (const aid of activityIds) {
    const st = states.find((s) => s.activityId === aid);
    if (st?.muted) continue;
    const n = counts.filter((c) => c.activityId === aid && c.playerId !== playerId && c.id > (st?.lastReadId ?? 0)).length;
    if (n) out.set(aid, n);
  }
  return out;
}

/** Gallring: chatt för aktiviteter som slutade för mer än 12 h sedan; meddelanden äldre än 12 månader. */
export async function purgeMessaging(now = new Date()) {
  const d = await db();
  const ended = await d
    .select({ id: activities.id })
    .from(activities)
    .where(lt(sql`coalesce(${activities.endsAt}, date_add(${activities.startsAt}, interval 2 hour))`, new Date(now.getTime() - CHAT_AFTER_HOURS * 3600000)));
  const ids = ended.map((r) => r.id);
  if (ids.length) {
    await d.delete(activityChat).where(inArray(activityChat.activityId, ids));
    await d.delete(activityChatState).where(inArray(activityChatState.activityId, ids));
  }
  const old = new Date(now.getTime() - 365 * 86400000);
  const oldMsgs = await d.select({ id: memberMessages.id }).from(memberMessages).where(lt(memberMessages.createdAt, old));
  if (oldMsgs.length) {
    await d.delete(memberMessageReads).where(inArray(memberMessageReads.messageId, oldMsgs.map((m) => m.id)));
    await d.delete(memberMessages).where(inArray(memberMessages.id, oldMsgs.map((m) => m.id)));
  }
}

