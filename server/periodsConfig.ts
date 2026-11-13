/**
 * Perioderna (säsong, slutspel, försäsong) som månad-dag som återkommer varje år,
 * och de konkreta datumen för det pågående hockeyåret. Används av statistiken,
 * Inställningar → Perioder och hockeykorten.
 */
import { getAllConfig } from "./scoreDb";
import { resolvePeriods, toMonthDay, type MonthDayPeriods } from "../shared/periods";

export const DEFAULT_PERIODS = {
  season_from: "2025-10-01", season_to: "2026-04-01",
  playoff_from: "2026-04-01", playoff_to: "2026-05-01",
  preseason_from: "2025-09-01", preseason_to: "2025-10-01",
};

export async function getCurrentPeriods(now = new Date()) {
  const config = await getAllConfig();
  const v = (k: keyof typeof DEFAULT_PERIODS) => config[k] ?? DEFAULT_PERIODS[k];
  const recurring: MonthDayPeriods = {
    seasonFrom: toMonthDay(v("season_from")), seasonTo: toMonthDay(v("season_to")),
    playoffFrom: toMonthDay(v("playoff_from")), playoffTo: toMonthDay(v("playoff_to")),
    preseasonFrom: toMonthDay(v("preseason_from")), preseasonTo: toMonthDay(v("preseason_to")),
  };
  return { ...resolvePeriods(recurring, now), recurring };
}
