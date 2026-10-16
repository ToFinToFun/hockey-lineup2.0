/**
 * Aktiviteter – gemensamt för klient och server: typer, svensk tid och sortering.
 * Tider sparas i UTC och visas alltid i svensk tid (Europe/Stockholm), oavsett
 * var servern eller webbläsaren står.
 */

export const ACTIVITY_TYPES = ["training", "match", "meeting", "other"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_NAMES: Record<ActivityType, string> = {
  training: "Träning",
  match: "Match",
  meeting: "Möte",
  other: "Övrigt",
};

/** Typer som Lineup kan hämta anmälningar från. */
export const LINEUP_TYPES: ActivityType[] = ["training", "match"];

/** Vilka som kallas. Valda spelare kan läggas till utöver gruppen – eller i stället ("none"). */
export const INVITES = ["all", "board", "none"] as const;
export type Invite = (typeof INVITES)[number];
export const INVITE_NAMES: Record<Invite, string> = { all: "Alla medlemmar", board: "Styrelsen", none: "Bara valda" };

/** Förslag när extra avgift kryssas i. */
export const DEFAULT_FEE = { amount: 50, reason: "Försäsong", swish: "123 427 55 66" };

export const WEEKDAY_NAMES = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

const TZ = "Europe/Stockholm";

/** Delarna av en tidpunkt i svensk tid. weekday: 0 = måndag … 6 = söndag. */
export function stockholmParts(d: Date): { date: string; time: string; weekday: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const wd = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"].findIndex((w) => String(p.weekday).toLowerCase().startsWith(w));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: wd };
}

/** Hur många minuter svensk tid ligger före UTC vid en viss tidpunkt (60 eller 120). */
function offsetMinutes(utcMs: number): number {
  const { date, time } = stockholmParts(new Date(utcMs));
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Math.round((Date.UTC(y, m - 1, d, h, mi) - utcMs) / 60000);
}

/** "2026-10-20" + "21:00" i svensk tid → Date (UTC). Klarar sommartid. */
export function stockholmToDate(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - offsetMinutes(guess) * 60000;
  // Runt bytet till/från sommartid kan första gissningen hamna fel – räkna om en gång
  ts = guess - offsetMinutes(ts) * 60000;
  return new Date(ts);
}

/** Lägg till dagar på ett datum "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Veckodag för ett datum (0 = måndag … 6 = söndag). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Alla datum från–till (inklusive) på valda veckodagar. Högst 200 tillfällen. */
export function seriesDates(from: string, to: string, weekdays: number[]): string[] {
  const out: string[] = [];
  if (!from || !to || to < from || weekdays.length === 0) return out;
  for (let d = from; d <= to && out.length < 200; d = addDays(d, 1)) {
    if (weekdays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** "tis 20 okt" */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Anmälan öppnar/stänger, utifrån start och inställningarna. */
export function signupWindow(a: { startsAt: Date | string; opensDaysBefore: number | null; closesHoursBefore: number | null }) {
  const start = new Date(a.startsAt).getTime();
  return {
    opensAt: a.opensDaysBefore == null ? null : new Date(start - a.opensDaysBefore * 86400000),
    closesAt: new Date(start - (a.closesHoursBefore ?? 0) * 3600000),
  };
}

/** Anmälningslistan: målvakter först, sedan alla andra i bokstavsordning oavsett position. */
export function sortAttendees<T extends { name: string; position: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ga = a.position === "MV" ? 0 : 1;
    const gb = b.position === "MV" ? 0 : 1;
    return ga - gb || a.name.localeCompare(b.name, "sv");
  });
}
