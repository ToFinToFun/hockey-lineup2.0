/**
 * Svenska helgdagar för kalendern i Aktiviteter.
 *
 * - "red": röda dagar enligt lagen (1989:253) om allmänna helgdagar, plus nationaldagen,
 *   samt julafton, midsommarafton och nyårsafton som i praktiken är lediga.
 * - "eve": dagen före en röd dag (t.ex. dagen före julafton) – ofta lediga eller halvdagar.
 */

export type DayMark = { kind: "red" | "eve"; name: string };

/** Påskdagen (gregoriansk kalender, Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const plus = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
/** Första datum från `from` som är veckodagen `weekday` (0 = söndag … 6 = lördag). */
const firstWeekday = (from: string, weekday: number) => {
  const [y, m, d] = from.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return plus(from, (weekday - wd + 7) % 7);
};

const cache = new Map<number, Map<string, DayMark>>();

export function swedishDays(year: number): Map<string, DayMark> {
  const hit = cache.get(year);
  if (hit) return hit;
  const e = easter(year);
  const midsummerEve = firstWeekday(iso(year, 6, 19), 5); // fredag 19–25 juni
  const allSaints = firstWeekday(iso(year, 10, 31), 6); // lördag 31 okt–6 nov
  const red: [string, string][] = [
    [iso(year, 1, 1), "Nyårsdagen"],
    [iso(year, 1, 6), "Trettondedag jul"],
    [plus(e, -2), "Långfredagen"],
    [e, "Påskdagen"],
    [plus(e, 1), "Annandag påsk"],
    [iso(year, 5, 1), "Första maj"],
    [plus(e, 39), "Kristi himmelsfärdsdag"],
    [plus(e, 49), "Pingstdagen"],
    [iso(year, 6, 6), "Sveriges nationaldag"],
    [midsummerEve, "Midsommarafton"],
    [plus(midsummerEve, 1), "Midsommardagen"],
    [allSaints, "Alla helgons dag"],
    [iso(year, 12, 24), "Julafton"],
    [iso(year, 12, 25), "Juldagen"],
    [iso(year, 12, 26), "Annandag jul"],
    [iso(year, 12, 31), "Nyårsafton"],
  ];
  const map = new Map<string, DayMark>();
  for (const [date, name] of red) map.set(date, { kind: "red", name });
  // Dagen före en röd dag (om den inte själv är röd)
  const eveNames: Record<string, string> = {
    Trettondedag_jul: "Trettondagsafton",
    Påskdagen: "Påskafton",
    Första_maj: "Valborgsmässoafton",
    Pingstdagen: "Pingstafton",
    Alla_helgons_dag: "Allhelgonaafton",
  };
  for (const [date, name] of red) {
    const before = plus(date, -1);
    if (map.has(before) || before.slice(0, 4) !== String(year)) continue;
    map.set(before, { kind: "eve", name: eveNames[name.replace(/ /g, "_")] ?? `Dagen före ${name.toLowerCase()}` });
  }
  // 31 december föregår nyårsdagen nästa år – redan röd. Skärtorsdagen före långfredagen kommer med ovan.
  cache.set(year, map);
  return map;
}

/** Röd dag eller dag före röd dag, annars null. */
export function dayMark(date: string): DayMark | null {
  return swedishDays(Number(date.slice(0, 4))).get(date) ?? null;
}
