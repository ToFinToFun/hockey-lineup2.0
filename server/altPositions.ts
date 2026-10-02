/**
 * Alternativ position (hybridspelare) per spelare, t.ex. en back som också
 * kan spela center. Sparas i spelarregistret (players.altPosition).
 * Tidigare sparades den i app_config "player_alt_positions" – flyttas en gång
 * vid start (migrateAltPositionsFromConfig).
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import { listPlayers, updatePlayers } from "./playersDb";

export type AltPos = "MV" | "B" | "C" | "F";
const OLD_KEY = "player_alt_positions";

export async function getAltPositions(): Promise<Record<string, AltPos>> {
  const out: Record<string, AltPos> = {};
  for (const p of await listPlayers()) if (p.altPosition) out[p.id] = p.altPosition as AltPos;
  return out;
}

export async function setAltPosition(playerId: string, pos: AltPos | null): Promise<Record<string, AltPos>> {
  await updatePlayers([{ id: playerId, fields: { altPosition: pos } }]);
  return getAltPositions();
}

/** En gång: flytta värden från den gamla inställningen till spelarregistret. */
export async function migrateAltPositionsFromConfig(): Promise<number> {
  const raw = await getConfigValue(OLD_KEY).catch(() => null);
  if (!raw) return 0;
  let map: Record<string, AltPos> = {};
  try { map = JSON.parse(raw) as Record<string, AltPos>; } catch { /* trasigt – töms */ }
  const ids = new Set((await listPlayers()).map((p) => p.id));
  const updates = Object.entries(map).filter(([id, pos]) => ids.has(id) && ["MV", "B", "C", "F"].includes(pos)).map(([id, pos]) => ({ id, fields: { altPosition: pos } }));
  if (updates.length) await updatePlayers(updates);
  await setConfigValue(OLD_KEY, "");
  return updates.length;
}
