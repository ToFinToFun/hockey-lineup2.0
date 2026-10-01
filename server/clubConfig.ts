/**
 * Klubbens inställningar på servern: profil (CLUB_PROFILE, standard
 * "stalstadens") + det som ändrats under Inställningar → Klubb (app_config
 * "club_settings"). Laddas vid start och när inställningarna sparas.
 */
import { club, mergeClub, profileById, setClub, type ClubOverrides, type ClubProfile } from "../shared/club";
import { getConfigValue, setConfigValue } from "./scoreDb";

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
  const c = mergeClub(base, await getClubOverrides().catch(() => ({})));
  setClub(c);
  return c;
}

export async function saveClubOverrides(o: ClubOverrides): Promise<ClubProfile> {
  await setConfigValue(KEY, JSON.stringify(o));
  return loadClub();
}

/** Appens adress: APP_URL i miljön, annars klubbens. */
export const appUrl = () => (process.env.APP_URL ?? club().appUrl).replace(/\/$/, "");
