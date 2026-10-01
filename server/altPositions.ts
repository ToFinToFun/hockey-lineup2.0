/**
 * Manuell alternativ position (hybridspelare) per spelare, t.ex. en back som
 * också kan spela center. Sparas i app_config "player_alt_positions"
 * (spelar-id → MV/B/C/F) – utan ändring i spelartabellen.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";

const KEY = "player_alt_positions";
export type AltPos = "MV" | "B" | "C" | "F";

export async function getAltPositions(): Promise<Record<string, AltPos>> {
  try {
    const raw = await getConfigValue(KEY);
    return raw ? (JSON.parse(raw) as Record<string, AltPos>) : {};
  } catch {
    return {};
  }
}

export async function setAltPosition(playerId: string, pos: AltPos | null): Promise<Record<string, AltPos>> {
  const map = await getAltPositions();
  if (pos) map[playerId] = pos;
  else delete map[playerId];
  await setConfigValue(KEY, JSON.stringify(map));
  return map;
}
