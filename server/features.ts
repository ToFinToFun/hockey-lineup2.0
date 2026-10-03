/**
 * Funktionsflaggor (app_config "features"). Nya delar som byggs i steg kan
 * ligga avstängda tills de hänger ihop – se docs/PLAN-lag-och-motstandare.md.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";

export interface Features {
  /** Matcher mot andra lag – lyft ur beta i v2.53.0, alltid på */
  opponents: boolean;
}
const DEFAULTS: Features = { opponents: true };

export async function getFeatures(): Promise<Features> {
  try {
    const raw = await getConfigValue("features");
    // Matcher mot andra lag är inte längre beta: alltid på, oavsett tidigare sparat val
    return { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Features>) : {}), opponents: true };
  } catch {
    return DEFAULTS;
  }
}

export async function setFeatures(patch: Partial<Features>): Promise<Features> {
  const next = { ...(await getFeatures()), ...patch };
  await setConfigValue("features", JSON.stringify(next));
  return next;
}
