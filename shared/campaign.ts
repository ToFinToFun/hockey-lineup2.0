/**
 * Kampanjteman (Mustaschkampen m.fl.) – det som både appen och servern behöver.
 */

/**
 * Inbyggda loggornas version: höjs när en inbyggd logga byts, så att
 * telefonernas cache (servicearbetaren hämtar bilder från cachen först) inte
 * visar en äldre. 5 = Mustaschkampen-loggan (2026-11-01).
 */
export const BUILTIN_LOGO_VERSION = 5;

/** Loggans adress: uppladdad logga, annars temats inbyggda (null = ingen) */
export function themeLogoPath(t: { id: number; builtin: string | null; hasLogo: boolean; updatedAt: Date | string } | null | undefined): string | null {
  if (!t) return null;
  if (t.hasLogo) return `/api/media/themes/${t.id}/logo?v=${new Date(t.updatedAt).getTime()}`;
  return t.builtin ? `/images/campaigns/${t.builtin}.png?v=${BUILTIN_LOGO_VERSION}` : null;
}

/**
 * Kampanjmånaden (november, svensk tid): då kan kampanjens logga följa med i
 * matchrapporten, laget.se-nyheten och Score Tracker. Datumet är matchens
 * eller evenemangets (så att en novembermatch får loggan även om rapporten görs i december).
 */
export function isCampaignMonth(date: Date | string | null | undefined = new Date()): boolean {
  const d = date instanceof Date ? date : date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date) : new Date();
  if (Number.isNaN(d.getTime())) return false;
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", month: "numeric" }).format(d);
  return Number(month) === 11;
}
