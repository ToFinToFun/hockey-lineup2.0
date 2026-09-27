/**
 * Positionsfärger – samma överallt (Lineup, Score Tracker, delad länk).
 * Motsvarar .pos-badge-* i index.css.
 */
export const POSITION_COLORS: Record<string, string> = {
  MV: "#f97316", // orange
  RES: "#f97316",
  B: "#3b82f6", // blå
  C: "#8b5cf6", // lila
  LW: "#06b6d4", // turkos
  RW: "#06b6d4",
  F: "#06b6d4",
  IB: "#a8b8c8", // isblå
};

/** Färger för en platsrad: kant och bricka i positionsfärgen, svag bakgrundston. */
export function positionRowColors(shortLabel: string) {
  const color = POSITION_COLORS[shortLabel];
  if (!color) return { bg: "#ffffff10", text: "#ffffff80", border: "#ffffff20" };
  return { bg: `${color}1f`, text: "#ffffff", border: color };
}

/** C = gul, A = orange (samma som i Lineup). */
export const CAPTAIN_COLORS = { C: "#fde047", A: "#fdba74" } as const;
