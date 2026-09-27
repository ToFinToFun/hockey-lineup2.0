/**
 * Sponsorer – gemensamt för server och klient.
 *
 * Säsongen för sponsorexponering börjar 1 juni (räknarna nollas då).
 * Två räknare per sponsor: mål i matcher (Score Tracker) och
 * laguppställningar (nyheten till laget.se). Vid val tas den sponsor som
 * visats minst i den aktuella räknaren; vid lika slumpas det.
 */

/** 0-indexerad månad: 5 = juni */
export const SPONSOR_SEASON_START_MONTH = 5;

export interface SponsorCounts {
  matches: number;
  lineups: number;
}

export interface Sponsor {
  id: number;
  name: string;
  /** PNG som data-URL, eller null om sponsorn bara visas som text */
  logo: string | null;
  active: boolean;
  sortOrder: number;
  /** Innevarande säsong */
  counts: SponsorCounts;
  /** Förra säsongen (för statistik) */
  previous: SponsorCounts;
}

/** Början på sponsorsäsongen som `date` tillhör (1 juni kl 00:00 lokal tid). */
export function sponsorSeasonStart(date: Date = new Date()): Date {
  const y = date.getMonth() >= SPONSOR_SEASON_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(y, SPONSOR_SEASON_START_MONTH, 1);
}

/** "2026/27" */
export function sponsorSeasonLabel(start: Date): string {
  const y = start.getFullYear();
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * Välj den aktiva sponsor som visats minst. `extra` lägger till visningar som
 * ännu inte finns på servern (t.ex. mål i pågående match).
 */
export function pickLeastShown<T extends Pick<Sponsor, "name" | "active">>(
  sponsors: T[],
  countOf: (s: T) => number,
  random: () => number = Math.random
): T | null {
  const active = sponsors.filter((s) => s.active);
  if (active.length === 0) return null;
  const min = Math.min(...active.map(countOf));
  const tied = active.filter((s) => countOf(s) === min);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
}
