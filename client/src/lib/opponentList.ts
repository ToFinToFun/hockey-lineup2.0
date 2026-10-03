/**
 * Motståndaren som lista (utan platser): spelarna görs om till "platser" per
 * position utan kedjor, så att nyhetsbilden, nyhetstexten och Score Tracker
 * kan visa dem med samma kod som en vanlig uppställning.
 */
import type { Slot } from "@/lib/lineup";
import type { Player } from "@/lib/players";

const ORDER: Record<string, number> = { MV: 0, B: 1, C: 2, LW: 3, RW: 3, F: 3 };
const TYPE = (pos: string): Slot["type"] => (pos === "MV" ? "goalkeeper" : pos === "B" ? "defense" : "forward");
const ROLE = (pos: string): Slot["role"] => (pos === "MV" ? "gk" : pos === "B" ? "def" : pos === "C" ? "c" : pos === "RW" ? "rw" : "lw");

/** Sortering: målvakter, backar, forwards – sedan nummer */
export function sortList<T extends { position?: string | null; number?: string | null; name: string }>(players: T[]): T[] {
  const num = (n?: string | null) => (n && /^\d+$/.test(n) ? Number(n) : 999);
  return [...players].sort((a, b) => (ORDER[a.position || "F"] ?? 3) - (ORDER[b.position || "F"] ?? 3) || num(a.number) - num(b.number) || a.name.localeCompare(b.name, "sv"));
}

export function listAsSlots(players: Player[], teamId = "team-b"): { slots: Slot[]; lineup: Record<string, Player> } {
  const slots: Slot[] = [];
  const lineup: Record<string, Player> = {};
  sortList(players).forEach((p, i) => {
    const pos = (p.position || "F").toUpperCase();
    const id = `${teamId}-list-${i}`;
    // Tom grupp = ingen rubrik som "Backpar 1" – bara Målvakter/Backar/Forwards
    slots.push({ id, label: pos, shortLabel: pos, groupLabel: "", type: TYPE(pos), role: ROLE(pos) });
    lineup[id] = p;
  });
  return { slots, lineup };
}
