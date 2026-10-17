/**
 * Kalenderprenumeration (iCal) för medlemmen: aktiviteter där man är kallad eller har svarat.
 *
 * Kalenderappar kan inte logga in, så varje medlem har en hemlig länk. "Ny länk" byter den –
 * den gamla slutar fungera direkt. Avslutad/raderad medlem: länken tas bort (server/integration.ts).
 */
import { randomBytes } from "crypto";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "./db";
import { activities, activityAttendance, memberCalendars } from "../drizzle/schema";
import { listPlayers } from "./playersDb";
import { invitedPlayers, playerForMember } from "./activities";
import { appUrl } from "./clubConfig";
import { ACTIVITY_TYPE_NAMES, type ActivityType } from "../shared/activities";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  return d;
}

const newToken = () => randomBytes(24).toString("base64url");

export async function calendarToken(memberId: number): Promise<string> {
  const d = await db();
  const [row] = await d.select().from(memberCalendars).where(eq(memberCalendars.memberId, memberId));
  if (row) return row.token;
  const token = newToken();
  await d.insert(memberCalendars).values({ memberId, token });
  return token;
}

export async function renewCalendarToken(memberId: number): Promise<string> {
  const token = newToken();
  await (await db()).insert(memberCalendars).values({ memberId, token }).onDuplicateKeyUpdate({ set: { token, createdAt: new Date() } });
  return token;
}

export async function removeCalendar(memberId: number) {
  await (await db()).delete(memberCalendars).where(eq(memberCalendars.memberId, memberId));
}

// ─── iCal-formatet (RFC 5545) ────────────────────────────────────────────────

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Radbrytning efter 75 byte (fortsättningsrader börjar med ett mellanslag). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const ANSWER: Record<string, string> = { yes: "Du kommer", reserve: "Du står på reservlistan", no: "Du kommer inte" };

/** Kalendern för länken, eller null om länken inte finns. */
export async function calendarFeed(token: string): Promise<string | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const d = await db();
  const [cal] = await d.select().from(memberCalendars).where(eq(memberCalendars.token, token));
  if (!cal) return null;
  void d.update(memberCalendars).set({ lastFetchedAt: new Date() }).where(eq(memberCalendars.memberId, cal.memberId)).catch(() => undefined);

  const player = await playerForMember(cal.memberId);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stålstadens SF//Aktiviteter//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Stålstadens",
    "X-WR-TIMEZONE:Europe/Stockholm",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  if (player) {
    const players = await listPlayers();
    const rows = await d
      .select()
      .from(activities)
      .where(and(gte(activities.startsAt, new Date(Date.now() - 60 * 86400000)), lte(activities.startsAt, new Date(Date.now() + 400 * 86400000))))
      .orderBy(asc(activities.startsAt))
      .limit(500);
    const att = rows.length
      ? await d
          .select()
          .from(activityAttendance)
          .where(and(inArray(activityAttendance.activityId, rows.map((r) => r.id)), eq(activityAttendance.playerId, player.id)))
      : [];
    const stamp = utc(new Date());
    for (const r of rows) {
      const mine = att.find((a) => a.activityId === r.id);
      if (!mine && !(await invitedPlayers(r, players)).invited.has(player.id)) continue;
      const end = r.endsAt ?? new Date(r.startsAt.getTime() + 2 * 3600000);
      const type = ACTIVITY_TYPE_NAMES[r.type as ActivityType] ?? "Aktivitet";
      const desc = [
        r.cancelled ? `INSTÄLLD${r.cancelledNote ? ` – ${r.cancelledNote}` : ""}` : "",
        `${type}. ${mine ? ANSWER[mine.status] ?? "" : "Du har inte svarat"}.`,
        r.description ?? "",
        `${appUrl()}/mina/${r.id}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:aktivitet-${r.id}@stalstadens.se`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utc(r.startsAt)}`,
        `DTEND:${utc(end)}`,
        `SUMMARY:${esc(`${r.cancelled ? "Inställd: " : ""}${r.title}`)}`,
        ...(r.location ? [`LOCATION:${esc(r.location)}`] : []),
        `DESCRIPTION:${esc(desc)}`,
        `URL:${appUrl()}/mina/${r.id}`,
        `STATUS:${r.cancelled ? "CANCELLED" : "CONFIRMED"}`,
        // Tackat nej: syns som ledig tid
        `TRANSP:${mine?.status === "no" ? "TRANSPARENT" : "OPAQUE"}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
