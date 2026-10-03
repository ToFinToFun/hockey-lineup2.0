/**
 * Uppställningen per match: internmatchen och varje motståndare har sin egen
 * sparade uppställning, så att de inte blandas när man växlar i Lineup
 * (t.ex. internmatcher fram till en extern match om en månad).
 *
 * Nyckel "internal" = båda lagen i internmatchen; "opp-<id>" = vårt lag (lag A)
 * mot det laget (motståndarens sida sparas på laget, opponents.lineup/lineupList).
 * Sparas i app_config "lineup_contexts". Spelarna sparas som id – namn och
 * nummer hämtas från registret när de visas.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";

export interface LineupContext {
  /** plats → spelar-id (vårt register) */
  slots: Record<string, string>;
  teamAConfig?: unknown;
  teamBConfig?: unknown;
  savedAt: string;
}

const KEY = "lineup_contexts";
export { contextKeyOf } from "../shared/matchSetup";

async function readAll(): Promise<Record<string, LineupContext>> {
  try {
    const raw = await getConfigValue(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getLineupContext(key: string): Promise<LineupContext | null> {
  return (await readAll())[key] ?? null;
}

export async function saveLineupContext(key: string, ctx: Omit<LineupContext, "savedAt">) {
  const all = await readAll();
  // Motståndare: bara vårt lag (lag A) – deras sida sparas på laget
  const slots = key === "internal" ? ctx.slots : Object.fromEntries(Object.entries(ctx.slots).filter(([k]) => k.startsWith("team-a-")));
  all[key] = { slots, teamAConfig: ctx.teamAConfig, ...(key === "internal" ? { teamBConfig: ctx.teamBConfig } : {}), savedAt: new Date().toISOString() };
  await setConfigValue(KEY, JSON.stringify(all));
}
