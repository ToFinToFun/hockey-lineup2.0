/**
 * Kallelser och påminnelser för Aktiviteter – push till den som har det, annars mejl.
 *
 * Bara när det är påslaget på aktiviteten (notifyEmail) – laget.se kan fortsätta sköta
 * kallelserna parallellt, så inget skickas av sig självt. Mejlen skickas av sajten, som har
 * adresserna; appen skickar bara medlemmarnas id.
 *
 * - Kallelse: när anmälan öppnar (eller direkt om den redan är öppen), till kallade som inte svarat.
 * - Påminnelse: X timmar innan anmälan stänger, till kallade som fortfarande inte svarat.
 * - Inställd: till de anmälda (kommer/reserv), om kallelsen hade gått ut.
 */
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "./db";
import { activities, activityAttendance, type ActivityRow } from "../drizzle/schema";
import { listPlayers } from "./playersDb";
import { invitedPlayers } from "./activities";
import { appUrl } from "./clubConfig";
import { notifyMembers, purgeMessaging, type NotifyResult } from "./messaging";

export type MailResult = NotifyResult;
import { ACTIVITY_TYPE_NAMES, shortDate, signupWindow, stockholmParts, type ActivityType } from "../shared/activities";

const when = (d: Date) => {
  const p = stockholmParts(d);
  return `${shortDate(p.date)} kl ${p.time}`;
};

function body(a: ActivityRow, intro: string) {
  const w = signupWindow(a);
  const typeName = ACTIVITY_TYPE_NAMES[a.type as ActivityType] ?? "Aktivitet";
  return [
    intro,
    "",
    `${typeName}: ${a.title}`,
    `Tid: ${when(a.startsAt)}${a.endsAt ? `–${stockholmParts(a.endsAt).time}` : ""}`,
    a.location ? `Plats: ${a.location}` : "",
    a.description ? `\n${a.description}` : "",
    a.feeEnabled ? `\nExtra avgift: ${a.feeAmount ?? ""} kr${a.feeReason ? ` – ${a.feeReason}` : ""}${a.feeSwish ? `. Swisha till ${a.feeSwish}.` : ""}` : "",
    "",
    `Svara Kommer eller Kommer inte här: ${appUrl()}/mina/${a.id}`,
    `Anmälan stänger ${when(w.closesAt)}.`,
    "",
    "Första gången loggar du in med din e-postadress – du får en kod på mejlen.",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** Medlems-id (sajtens register) för spelare som är kallade och uppfyller filtret. */
async function recipients(a: ActivityRow, filter: (playerId: string, status: string | undefined) => boolean) {
  const d = await getDb();
  if (!d) return [];
  const players = await listPlayers();
  const { invited } = await invitedPlayers(a, players);
  const att = await d.select().from(activityAttendance).where(eq(activityAttendance.activityId, a.id));
  const status = new Map(att.map((x) => [x.playerId, x.status]));
  const ids = new Set<number>();
  const pool = new Set([...invited, ...att.map((x) => x.playerId)]);
  for (const pid of pool) {
    if (!filter(pid, status.get(pid))) continue;
    const p = players.find((x) => x.id === pid);
    const mid = Number(p?.externalId);
    if (p?.isMember && Number.isInteger(mid) && mid > 0) ids.add(mid);
  }
  return [...ids];
}

/** Push (rubrik + kort rad) eller mejl (hela texten) – samma länk till aktiviteten. */
async function send(a: ActivityRow, memberIds: number[], prefix: string, pushBody: string, mailText: string): Promise<NotifyResult> {
  if (!memberIds.length) return { pushed: 0, sent: 0, missingEmail: [], failed: [] };
  return notifyMembers({ memberIds }, {
    title: `${prefix}: ${a.title}`,
    body: pushBody,
    url: `/mina/${a.id}`,
    tag: `act-${a.id}`,
    mailSubject: subjectFor(a, prefix),
    mailText,
  });
}

const pushLine = (a: ActivityRow) => `${when(a.startsAt)}${a.location ? ` · ${a.location}` : ""}`;

const subjectFor = (a: ActivityRow, prefix: string) => `${prefix}: ${a.title} ${when(a.startsAt)}`;

/** Skickar kallelsen nu (styrelsen trycker, eller schemat när anmälan öppnar). */
export async function sendInvitation(a: ActivityRow): Promise<MailResult> {
  const ids = await recipients(a, (_pid, st) => st === undefined);
  const r = await send(a, ids, "Kallelse", `${pushLine(a)} – svara Kommer eller Kommer inte`, body(a, "Du är kallad till:"));
  const d = await getDb();
  await d?.update(activities).set({ notifiedAt: new Date() }).where(eq(activities.id, a.id));
  return r;
}

async function sendReminder(a: ActivityRow) {
  const ids = await recipients(a, (_pid, st) => st === undefined);
  await send(a, ids, "Påminnelse", `${pushLine(a)} – du har inte svarat`, body(a, "Du har inte svarat på kallelsen till:"));
  const d = await getDb();
  await d?.update(activities).set({ remindedAt: new Date() }).where(eq(activities.id, a.id));
}

async function sendCancelled(a: ActivityRow) {
  const ids = await recipients(a, (_pid, st) => st === "yes" || st === "reserve");
  const note = a.cancelledNote ? `\n${a.cancelledNote}` : "";
  await send(
    a,
    ids,
    "Inställt",
    `${pushLine(a)} är inställd${a.cancelledNote ? ` – ${a.cancelledNote}` : ""}`,
    `${ACTIVITY_TYPE_NAMES[a.type as ActivityType] ?? "Aktiviteten"} ${a.title} ${when(a.startsAt)} är inställd.${note}\n\n${appUrl()}/mina/${a.id}`,
  );
  const d = await getDb();
  await d?.update(activities).set({ cancelNotifiedAt: new Date() }).where(eq(activities.id, a.id));
}

/** Går igenom kommande aktiviteter med mejl påslaget och skickar det som är dags. */
export async function runActivityMail(now = new Date()) {
  const d = await getDb();
  if (!d) return;
  const rows = await d
    .select()
    .from(activities)
    .where(and(eq(activities.notifyEmail, true), gte(activities.startsAt, now)));
  for (const a of rows) {
    try {
      const w = signupWindow(a);
      if (a.cancelled) {
        if (a.notifiedAt && !a.cancelNotifiedAt) await sendCancelled(a);
        continue;
      }
      const open = (!w.opensAt || w.opensAt <= now) && now < w.closesAt;
      if (!a.notifiedAt && open) {
        await sendInvitation(a);
        continue;
      }
      if (a.notifiedAt && a.reminderHours != null && !a.remindedAt && open && now.getTime() >= w.closesAt.getTime() - a.reminderHours * 3600000) {
        await sendReminder(a);
      }
    } catch (e) {
      console.warn(`[aktiviteter] mejl för ${a.id} misslyckades:`, (e as Error).message);
    }
  }
}

export function startActivityMail() {
  const run = () => {
    void runActivityMail().catch((e) => console.warn("[aktiviteter] mejlschemat:", (e as Error).message));
    void purgeMessaging().catch((e) => console.warn("[aktiviteter] gallring av chatt/meddelanden:", (e as Error).message));
  };
  setTimeout(run, 60_000);
  setInterval(run, 5 * 60_000).unref();
}
