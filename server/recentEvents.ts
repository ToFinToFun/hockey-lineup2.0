/**
 * Matchens tid och plats ska inte bero på vem som sparar den.
 *
 * Score Tracker är öppen för alla, men laget.se läses bara av servern (och av
 * inloggade). Därför fyller servern i det som saknas när en match sparas:
 * starttiden från träningen, platsen och den utsatta längden. Servern minns de
 * senaste evenemangen, så att en match som sparas efter träningen (eller laddas
 * upp senare utan nät) ändå hittar rätt evenemang även om laget.se redan visar nästa.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import { eventStartDate, matchName, trainingMinutes } from "../shared/matchTiming";

export interface KnownEvent {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime?: string | null;
  location?: string | null;
}

const KEY = "laget_recent_events";
const KEEP = 12;

export async function recentEvents(): Promise<KnownEvent[]> {
  try {
    const raw = await getConfigValue(KEY);
    const list = raw ? (JSON.parse(raw) as KnownEvent[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.date === "string" && typeof e.time === "string") : [];
  } catch {
    return [];
  }
}

/** Kom ihåg ett evenemang (samma dag och tid uppdateras, t.ex. ny plats). */
export async function rememberEvent(ev: Partial<KnownEvent> | null | undefined): Promise<void> {
  if (!ev?.date || !ev.time || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || !/^\d{1,2}:\d{2}/.test(ev.time)) return;
  const list = await recentEvents();
  const next: KnownEvent = { date: ev.date, time: ev.time.slice(0, 5), endTime: ev.endTime ?? null, location: ev.location?.trim() || null };
  const i = list.findIndex((e) => e.date === next.date && e.time === next.time);
  if (i >= 0) {
    const old = list[i];
    // Behåll det vi redan vet om nya läsningen saknar det
    list[i] = { ...next, endTime: next.endTime ?? old.endTime ?? null, location: next.location ?? old.location ?? null };
    if (JSON.stringify(old) === JSON.stringify(list[i])) return;
  } else {
    list.push(next);
  }
  list.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  await setConfigValue(KEY, JSON.stringify(list.slice(0, KEEP))).catch(() => undefined);
}

/**
 * Evenemanget som matchen hör till (exporteras för test): träningen som börjat
 * högst 6 h före matchens slut (eller börjar inom en halvtimme efter), närmast
 * den starttid klienten angav.
 */
export function pickEvent(events: KnownEvent[], clientStart: Date | null, end: Date): KnownEvent | null {
  let best: { ev: KnownEvent; d: number } | null = null;
  for (const ev of events) {
    const s = eventStartDate(ev.date, ev.time);
    if (!s) continue;
    const sinceStart = end.getTime() - s.getTime();
    if (sinceStart > 6 * 3600_000 || sinceStart < -30 * 60_000) continue;
    const d = Math.abs((clientStart ?? end).getTime() - s.getTime());
    if (!best || d < best.d) best = { ev, d };
  }
  return best?.ev ?? null;
}

export interface MatchTimeFields {
  name: string;
  teamWhiteScore: number;
  teamGreenScore: number;
  matchStartTime: Date | null;
  matchEndTime: Date;
  location: string | null;
  plannedMinutes: number | null;
}

/**
 * Fyll i tid, plats och längd från evenemanget (exporteras för test). Platsen
 * och längden som klienten skickade går före; starttiden tas från evenemanget
 * (som när klienten själv kunde läsa laget.se) och namnet följer med.
 */
export function applyEvent<T extends MatchTimeFields>(m: T, ev: KnownEvent | null): T {
  if (!ev) return m;
  const start = eventStartDate(ev.date, ev.time)!;
  const autoName = /^\d{2}-\d{2}-\d{2} \S+ \d{2}:\d{2} \d+-\d+$/.test(m.name);
  return {
    ...m,
    matchStartTime: start,
    name: autoName ? matchName(start, m.teamWhiteScore, m.teamGreenScore) : m.name,
    location: m.location || ev.location || null,
    plannedMinutes: m.plannedMinutes ?? trainingMinutes(ev.time, ev.endTime) ?? null,
  };
}

/** Evenemangen att välja bland: de senaste kända plus nästa (inkl. extern match med egen dag/tid/plats) */
export async function candidateEvents(): Promise<KnownEvent[]> {
  const list = await recentEvents();
  try {
    const { nextEvent } = await import("./autoNews");
    const n = await nextEvent();
    if (n?.date && n.time) list.push({ date: n.date, time: n.time, endTime: n.endTime ?? null, location: n.location ?? null });
  } catch {
    // laget.se nås inte – de kända evenemangen räcker
  }
  return list;
}

export async function enrichMatchTime<T extends MatchTimeFields>(m: T): Promise<T> {
  try {
    return applyEvent(m, pickEvent(await candidateEvents(), m.matchStartTime, m.matchEndTime));
  } catch {
    return m;
  }
}
