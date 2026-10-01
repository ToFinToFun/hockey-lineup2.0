/**
 * Funktionsflaggor (app_config "features"). Nya delar som byggs i steg kan
 * ligga avstängda tills de hänger ihop – se docs/PLAN-lag-och-motstandare.md.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";

export interface Features {
  /** Matcher mot andra lag (motståndarregister m.m.) – beta */
  opponents: boolean;
}
const DEFAULTS: Features = { opponents: false };

export async function getFeatures(): Promise<Features> {
  try {
    const raw = await getConfigValue("features");
    return { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Features>) : {}) };
  } catch {
    return DEFAULTS;
  }
}

export async function setFeatures(patch: Partial<Features>): Promise<Features> {
  const next = { ...(await getFeatures()), ...patch };
  await setConfigValue("features", JSON.stringify(next));
  return next;
}
