/**
 * Vad som syns utan inloggning (Inställningar → Åtkomst): Live och Score Tracker.
 * Standard: båda öppna (som tidigare). Stängt = kräver inloggning – som medlem, med
 * styrelsens lösenord eller med en länk.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import type { Session } from "./auth";
import type { MemberSession } from "./memberAuth";

export interface PublicAccess {
  live: boolean;
  score: boolean;
}
const KEY = "public_access";
const DEFAULT: PublicAccess = { live: true, score: true };
let cache: { at: number; v: PublicAccess } | null = null;

export async function getPublicAccess(): Promise<PublicAccess> {
  if (cache && Date.now() - cache.at < 10_000) return cache.v;
  let v = DEFAULT;
  try {
    const raw = await getConfigValue(KEY);
    if (raw) v = { ...DEFAULT, ...(JSON.parse(raw) as Partial<PublicAccess>) };
  } catch {
    /* standard */
  }
  cache = { at: Date.now(), v };
  return v;
}

export async function setPublicAccess(v: PublicAccess) {
  await setConfigValue(KEY, JSON.stringify(v));
  cache = { at: Date.now(), v };
}

/** Inloggad på något sätt: medlem, lösenord eller länk. */
export const loggedIn = (s: Session, m: MemberSession) => !!s || !!m;

/** Score Tracker: öppen, eller inloggad medlem, Admin, Lineup eller länk med Score Tracker/Lineup. */
export async function canScore(s: Session, m: MemberSession) {
  if ((await getPublicAccess()).score) return true;
  if (m) return true;
  return s?.role === "admin" || s?.role === "lineup" || !!s?.modules?.some((x) => x === "score" || x === "lineup");
}

/** Live: öppen, eller inloggad på något sätt. */
export async function canLive(s: Session, m: MemberSession) {
  return (await getPublicAccess()).live || loggedIn(s, m);
}
