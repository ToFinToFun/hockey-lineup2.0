/**
 * Klubbens inställningar på servern: profil (CLUB_PROFILE, standard
 * "stalstadens") + det som ändrats under Inställningar → Klubb (app_config
 * "club_settings"). Laddas vid start och när inställningarna sparas.
 */
import { club, mergeClub, profileById, setClub, type ClubOverrides, type ClubProfile } from "../shared/club";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { listClubAssets, type ClubAssetKey } from "./clubAssets";

const KEY = "club_settings";

export async function getClubOverrides(): Promise<ClubOverrides> {
  try {
    const raw = await getConfigValue(KEY);
    return raw ? (JSON.parse(raw) as ClubOverrides) : {};
  } catch {
    return {};
  }
}

export async function loadClub(): Promise<ClubProfile> {
  const base = profileById(process.env.CLUB_PROFILE);
  const c = withUploadedLogos(mergeClub(base, await getClubOverrides().catch(() => ({}))), await listClubAssets().catch(() => ({})));
  setClub(c);
  return c;
}

/** Uppladdade loggor ersätter profilens filer (adress med ?v= så att cachen byts vid ny bild). */
export function withUploadedLogos(c: ClubProfile, assets: Partial<Record<ClubAssetKey, number>>): ClubProfile {
  const url = (k: ClubAssetKey) => `/api/club/logo/${k}?v=${assets[k]}`;
  return {
    ...c,
    logo: assets.club ? url("club") : c.logo,
    crest: assets.crest ? { name: c.crest?.name ?? "Klubbens märke", url: url("crest") } : c.crest,
    teams: {
      white: { ...c.teams.white, logo: assets.white ? url("white") : c.teams.white.logo },
      green: { ...c.teams.green, logo: assets.green ? url("green") : c.teams.green.logo },
    },
  };
}

export async function saveClubOverrides(o: ClubOverrides): Promise<ClubProfile> {
  await setConfigValue(KEY, JSON.stringify(o));
  return loadClub();
}

/** Appens adress: APP_URL i miljön, annars klubbens. */
export const appUrl = () => (process.env.APP_URL ?? club().appUrl).replace(/\/$/, "");
