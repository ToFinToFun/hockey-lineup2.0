/**
 * PIR-justeringar ska vara kopplade till spelarens id (PIR räknar per id).
 * Äldre justeringar kan vara sparade med spelarens namn – de byts här mot id
 * när namnet (eller namnet i laget.se) matchar exakt en spelare. Körs vid start;
 * gör inget när allt redan är id:n.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import { listPlayers } from "./playersDb";

const KEY = "pir_adjustments";

export async function fixPirAdjustmentKeys(): Promise<{ moved: number; unknown: string[] }> {
  const raw = await getConfigValue(KEY).catch(() => null);
  if (!raw) return { moved: 0, unknown: [] };
  let adj: Record<string, number>;
  try { adj = JSON.parse(raw) as Record<string, number>; } catch { return { moved: 0, unknown: [] }; }
  const players = await listPlayers();
  const ids = new Set(players.map((p) => p.id));
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = new Map<string, string[]>();
  for (const p of players) {
    for (const n of [p.name, p.lagetName].filter(Boolean) as string[]) {
      const k = norm(n);
      byName.set(k, [...(byName.get(k) ?? []), p.id]);
    }
  }
  const out: Record<string, number> = {};
  let moved = 0;
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(adj)) {
    if (ids.has(key)) { out[key] = (out[key] ?? 0) + value; continue; }
    const match = [...new Set(byName.get(norm(key)) ?? [])];
    if (match.length === 1) {
      out[match[0]] = (out[match[0]] ?? 0) + value;
      moved++;
    } else {
      out[key] = value; // behålls som den är – syns i loggen
      unknown.push(key);
    }
  }
  if (moved) await setConfigValue(KEY, JSON.stringify(out));
  return { moved, unknown };
}
