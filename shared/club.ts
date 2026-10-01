/**
 * Klubbens identitet och standardvärden – samma i webbläsaren och på servern.
 *
 * Profilen (shared/clubProfiles/*) ger standardvärdena; det som ställs in under
 * Inställningar → Klubb läggs ovanpå. Koden läser alltid club() i stället för
 * hårdkodade namn, loggor och adresser.
 */
import { stalstadens } from "./clubProfiles/stalstadens";

export interface ClubTeamProfile {
  /** "Vita" */
  name: string;
  /** Kort namn för små ytor, t.ex. "VIT" */
  shortName: string;
  /** Lagets färg (bilder, kort) */
  color: string;
  /** Lagets logga */
  logo: string;
}

export interface ClubProfile {
  id: string;
  /** Visningsnamn, t.ex. "Stålstadens SF" (bilder skriver det i versaler) */
  name: string;
  /** Kortnamn, t.ex. "SSF" */
  shortName: string;
  /** Fullständigt namn, t.ex. "Stålstadens Sportförening" */
  fullName: string;
  /** Startsidans rubrik och underrad */
  hubTitle: string;
  hubSubtitle: string;
  /** Klubbens logga */
  logo: string;
  /** Extra märke för hockeykorten (t.ex. städet) – valfritt */
  crest?: { name: string; url: string };
  /** De två interna lagen (internmatcher). Nycklarna white/green är lagring, namnen är det som visas. */
  teams: { white: ClubTeamProfile; green: ClubTeamProfile };
  /** Standard-hashtags för matchrapport och Media */
  hashtags: string[];
  /** Klubbens vanliga hallar (förslag och tolkning av laget.se) */
  venues: string[];
  /** laget.se: lagets adress (www.laget.se/<slug>) */
  laget: { slug: string };
  /** Appens adress (länkar i mejl m.m.) */
  appUrl: string;
  /** Början på filnamn vid nedladdning, t.ex. "stalstadens-…" */
  fileSlug: string;
}

/** Inställningar som kan ändras i appen (sparas i databasen). */
export type ClubOverrides = Partial<Pick<ClubProfile, "name" | "shortName" | "fullName" | "hubTitle" | "hubSubtitle" | "hashtags" | "venues" | "appUrl">> & {
  teams?: { white?: Partial<Omit<ClubTeamProfile, "logo">>; green?: Partial<Omit<ClubTeamProfile, "logo">> };
  laget?: Partial<ClubProfile["laget"]>;
};

export const CLUB_PROFILES: Record<string, ClubProfile> = { stalstadens };
export const DEFAULT_PROFILE_ID = "stalstadens";

export function profileById(id: string | undefined): ClubProfile {
  return CLUB_PROFILES[id ?? ""] ?? CLUB_PROFILES[DEFAULT_PROFILE_ID];
}

/** Profil + inställningar (tomma värden i inställningarna ignoreras). */
export function mergeClub(base: ClubProfile, o: ClubOverrides | null | undefined): ClubProfile {
  if (!o) return base;
  const pick = <T,>(v: T | undefined, d: T): T => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? d : v);
  const team = (k: "white" | "green") => ({
    ...base.teams[k],
    name: pick(o.teams?.[k]?.name, base.teams[k].name),
    shortName: pick(o.teams?.[k]?.shortName, base.teams[k].shortName),
    color: pick(o.teams?.[k]?.color, base.teams[k].color),
  });
  return {
    ...base,
    name: pick(o.name, base.name),
    shortName: pick(o.shortName, base.shortName),
    fullName: pick(o.fullName, base.fullName),
    hubTitle: pick(o.hubTitle, base.hubTitle),
    hubSubtitle: pick(o.hubSubtitle, base.hubSubtitle),
    appUrl: pick(o.appUrl, base.appUrl),
    hashtags: o.hashtags?.length ? o.hashtags : base.hashtags,
    venues: o.venues?.length ? o.venues : base.venues,
    laget: { slug: pick(o.laget?.slug, base.laget.slug) },
    teams: { white: team("white"), green: team("green") },
  };
}

let current: ClubProfile = CLUB_PROFILES[DEFAULT_PROFILE_ID];

/** Klubben som gäller just nu. */
export const club = (): ClubProfile => current;

export function setClub(c: ClubProfile) {
  current = c;
}

/** Rubrik i bilderna, t.ex. "STÅLSTADENS SF". */
export const clubHeading = () => current.name.toUpperCase();

/** Logga för ett internt lag. */
export const teamLogo = (team: "white" | "green") => current.teams[team].logo;
