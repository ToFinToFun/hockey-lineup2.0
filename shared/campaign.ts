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
