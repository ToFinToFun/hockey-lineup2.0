/**
 * Vad ändras i uppställningen? Används för Auto: förhandsvisning före och
 * besked efter ("Klart! 2 spelare lades till, 1 togs bort, 3 flyttades").
 */
import type { Player } from "./players";

export interface LineupDiff {
  added: Player[];
  removed: Player[];
  /** Flyttade inom samma lag (annan plats) */
  moved: Player[];
  /** Flyttade till det andra laget */
  switched: Player[];
}

const team = (slot: string) => slot.slice(0, 6); // "team-a" / "team-b"

export function diffLineups(before: Record<string, Player>, after: Record<string, Player>): LineupDiff {
  const where = (l: Record<string, Player>) => new Map(Object.entries(l).map(([slot, p]) => [p.id, { slot, p }]));
  const b = where(before), a = where(after);
  const diff: LineupDiff = { added: [], removed: [], moved: [], switched: [] };
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y) diff.added.push(x.p);
    else if (team(y.slot) !== team(x.slot)) diff.switched.push(x.p);
    else if (y.slot !== x.slot) diff.moved.push(x.p);
  }
  for (const [id, y] of b) if (!a.has(id)) diff.removed.push(y.p);
  return diff;
}

export const isEmptyDiff = (d: LineupDiff) => !d.added.length && !d.removed.length && !d.moved.length && !d.switched.length;

const names = (ps: Player[]) => (ps.length <= 4 ? ps.map((p) => p.name).join(", ") : `${ps.slice(0, 3).map((p) => p.name).join(", ")} m.fl.`);

/** Förhandsvisning: "lägga till 2 spelare (A, B)" … en rad per sak. */
export function previewLines(d: LineupDiff): string[] {
  const out: string[] = [];
  if (d.added.length) out.push(`• Lägga till ${d.added.length} spelare: ${names(d.added)}`);
  if (d.removed.length) out.push(`• Ta bort ${d.removed.length} spelare: ${names(d.removed)}`);
  if (d.switched.length) out.push(`• Flytta ${d.switched.length} spelare till andra laget: ${names(d.switched)}`);
  if (d.moved.length) out.push(`• Flytta ${d.moved.length} spelare inom laget`);
  return out;
}

/** Besked efteråt: "Klart! 2 spelare lades till, 1 spelare togs bort, 3 bytte lag." */
export function doneMessage(d: LineupDiff): string {
  if (isEmptyDiff(d)) return "Klart! Inga förändringar gjordes.";
  const parts: string[] = [];
  if (d.added.length) parts.push(`${d.added.length} spelare lades till`);
  if (d.removed.length) parts.push(`${d.removed.length} spelare togs bort`);
  if (d.switched.length) parts.push(`${d.switched.length} bytte lag`);
  if (d.moved.length) parts.push(`${d.moved.length} flyttades inom laget`);
  return `Klart! ${parts.join(", ")}.`;
}
