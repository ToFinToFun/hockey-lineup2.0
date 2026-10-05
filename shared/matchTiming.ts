/**
 * Matchens starttid och namn.
 *
 * Starttiden tas från dagens evenemang på laget.se (träningstiden) när det
 * finns ett som startat inom de senaste 6 timmarna (eller börjar inom en halvtimme).
 * Annars uppskattas den: första målets klockslag, eller en timme före Avsluta
 * avrundat till hel timme. Datumet räknas från starttiden – så en träning
 * 22:15 som avslutas efter midnatt får rätt dag.
 */

export function eventStartDate(date?: string | null, time?: string | null): Date | null {
  const d = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return null;
  return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
}

export function resolveMatchStart(
  event: { eventDate?: string | null; eventTime?: string | null } | null | undefined,
  firstGoalAt: string | null | undefined,
  now = new Date()
): { start: Date; source: "event" | "goal" | "estimate" } {
  const ev = eventStartDate(event?.eventDate, event?.eventTime);
  if (ev && now.getTime() - ev.getTime() <= 6 * 3600_000 && ev.getTime() - now.getTime() <= 30 * 60_000) {
    return { start: ev, source: "event" };
  }
  if (firstGoalAt) {
    const g = new Date(firstGoalAt);
    if (!Number.isNaN(g.getTime()) && now.getTime() - g.getTime() <= 6 * 3600_000) return { start: g, source: "goal" };
  }
  const est = new Date(now.getTime() - 3600_000);
  if (est.getMinutes() >= 30) est.setHours(est.getHours() + 1);
  est.setMinutes(0, 0, 0);
  return { start: est, source: "estimate" };
}

/**
 * Platsen från laget.se hör till matchen om evenemanget är samma dag som matchen
 * (eller kvällen innan, för matcher som avslutas efter midnatt) – oavsett om
 * starttiden togs från träningen, första målet eller uppskattades.
 */
export function eventLocationFor(
  event: { eventDate?: string | null; eventTime?: string | null; eventLocation?: string | null } | null | undefined,
  matchStart: Date
): string | undefined {
  const loc = event?.eventLocation?.trim();
  if (!loc || !event?.eventDate) return undefined;
  const ev = eventStartDate(event.eventDate, event.eventTime ?? "12:00");
  if (!ev) return undefined;
  return Math.abs(matchStart.getTime() - ev.getTime()) <= 12 * 3600_000 ? loc : undefined;
}

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const two = (n: number) => String(n).padStart(2, "0");

/** "26-09-29 Tisdag 22:15 3-2" */
export function matchName(start: Date, white: number, green: number): string {
  return `${String(start.getFullYear()).slice(2)}-${two(start.getMonth() + 1)}-${two(start.getDate())} ${WEEKDAYS[start.getDay()]} ${two(start.getHours())}:${two(start.getMinutes())} ${white}-${green}`;
}

/**
 * Minuter in i matchen för ett mål ("12'"). Målets tid är ett klockslag
 * ("22:27:10"); passerar det midnatt räknas det till nästa dygn. null om det
 * inte går (saknad start eller orimligt värde).
 */
export function elapsedMinutes(goalClock: string | undefined, start: Date | string | null | undefined): number | null {
  if (!goalClock || !start) return null;
  const s = typeof start === "string" ? new Date(start) : start;
  if (Number.isNaN(s.getTime())) return null;
  const m = goalClock.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const goalSec = +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0);
  const startSec = s.getHours() * 3600 + s.getMinutes() * 60 + s.getSeconds();
  let diff = goalSec - startSec;
  if (diff < -3600) diff += 24 * 3600; // efter midnatt
  if (diff < 0 || diff > 5 * 3600) return null;
  return Math.floor(diff / 60);
}

/**
 * Träningens längd i minuter från laget.se (start- och sluttid "HH:MM"),
 * även över midnatt. Rimliga längder (15–240 min), annars null.
 */
export function trainingMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const p = (t: string | null | undefined) => {
    const m = t?.match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(start), b = p(end);
  if (a == null || b == null) return null;
  const d = (b - a + 24 * 60) % (24 * 60);
  return d >= 15 && d <= 240 ? d : null;
}
