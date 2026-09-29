/**
 * Statistikens perioder (försäsong, säsong, slutspel) anges som månad-dag och
 * återkommer varje år. Hockeyåret börjar med försäsongen; perioder som ligger
 * tidigare på året (t.ex. slutspel i april) hör till året efter.
 */
export type PeriodKey = "preseasonFrom" | "preseasonTo" | "seasonFrom" | "seasonTo" | "playoffFrom" | "playoffTo";
export type MonthDayPeriods = Record<PeriodKey, string>; // "MM-DD"

/** "2025-10-01" eller "10-01" → "10-01" */
export function toMonthDay(v: string): string {
  const m = v.match(/(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : v;
}

const iso = (y: number, md: string) => `${y}-${md}`;

/** Konkreta datum för det hockeyår som pågår (eller senast påbörjades) vid `now`. */
export function resolvePeriods(p: MonthDayPeriods, now = new Date()): MonthDayPeriods {
  const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const cycleStart = p.preseasonFrom;
  const cycleYear = today >= cycleStart ? now.getFullYear() : now.getFullYear() - 1;
  const startYear = (md: string) => (md >= cycleStart ? cycleYear : cycleYear + 1);
  const pair = (from: string, to: string) => {
    const y = startYear(from);
    return [iso(y, from), iso(to <= from ? y + 1 : y, to)] as const;
  };
  const [preseasonFrom, preseasonTo] = pair(p.preseasonFrom, p.preseasonTo);
  const [seasonFrom, seasonTo] = pair(p.seasonFrom, p.seasonTo);
  const [playoffFrom, playoffTo] = pair(p.playoffFrom, p.playoffTo);
  return { preseasonFrom, preseasonTo, seasonFrom, seasonTo, playoffFrom, playoffTo };
}
