/**
 * Uppskattad speltid per plats – samma regler som i Lineup
 * (client/src/lib/iceTimePerSlot.ts), men utan avrundning och bara utifrån
 * platsernas id, så att den kan räknas på sparade matcher i efterhand.
 *
 * - Målvakter delar matchen lika.
 * - Backar: 2 på isen.
 * - Forwards+centrar: färre än 6 → alla delar 3 platser; annars centrar 1, ytter 2.
 * - Färre än 5 utespelare: alla spelar hela matchen.
 */
export type IcePos = "MV" | "B" | "C" | "F";

export function slotKind(slotId: string): { team: "a" | "b"; pos: IcePos; wing: boolean } | null {
  const m = slotId.match(/^team-([ab])-(gk|def|fwd)-/);
  if (!m) return null;
  const team = m[1] as "a" | "b";
  if (m[2] === "gk") return { team, pos: "MV", wing: false };
  if (m[2] === "def") return { team, pos: "B", wing: false };
  const isC = /-c$/.test(slotId);
  return { team, pos: isC ? "C" : "F", wing: !isC };
}

/** Minuter per plats för ett lag (slotIds = lagets fyllda platser). */
export function iceTimeBySlot(slotIds: string[], matchMinutes = 60): Map<string, number> {
  const out = new Map<string, number>();
  const kinds = slotIds.map((id) => ({ id, k: slotKind(id) })).filter((x) => x.k) as Array<{ id: string; k: NonNullable<ReturnType<typeof slotKind>> }>;
  const gk = kinds.filter((x) => x.k.pos === "MV");
  const def = kinds.filter((x) => x.k.pos === "B");
  const c = kinds.filter((x) => x.k.pos === "C");
  const w = kinds.filter((x) => x.k.pos === "F");
  for (const x of gk) out.set(x.id, matchMinutes / gk.length);
  const outfield = def.length + c.length + w.length;
  if (outfield < 5) {
    for (const x of [...def, ...c, ...w]) out.set(x.id, matchMinutes);
    return out;
  }
  for (const x of def) out.set(x.id, (2 / def.length) * matchMinutes);
  const pool = c.length + w.length;
  if (pool < 6) {
    for (const x of [...c, ...w]) out.set(x.id, (3 / pool) * matchMinutes);
  } else {
    for (const x of c) out.set(x.id, (1 / c.length) * matchMinutes);
    for (const x of w) out.set(x.id, (2 / w.length) * matchMinutes);
  }
  return out;
}

/** Matchens längd i minuter från start/slut (15–240 min), annars 60. */
export function matchMinutes(start: Date | string | null | undefined, end: Date | string | null | undefined): number {
  if (!start || !end) return 60;
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return d >= 15 && d <= 240 ? Math.round(d) : 60;
}
