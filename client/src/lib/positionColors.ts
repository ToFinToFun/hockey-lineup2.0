/**
 * Positionsfärger – samma överallt (Lineup, Score Tracker, delad länk).
 * Motsvarar .pos-badge-* i index.css.
 */
import { POSITION_BASE_COLORS } from "@shared/positions";

export const POSITION_COLORS: Record<string, string> = {
  ...POSITION_BASE_COLORS,
  RES: POSITION_BASE_COLORS.MV,
  LW: POSITION_BASE_COLORS.F,
  RW: POSITION_BASE_COLORS.F,
};

/** Färger för en platsrad: kant och bricka i positionsfärgen, svag bakgrundston. */
export function positionRowColors(shortLabel: string) {
  const color = POSITION_COLORS[shortLabel];
  if (!color) return { bg: "#ffffff10", text: "#ffffff80", border: "#ffffff20" };
  return { bg: `${color}1f`, text: "#ffffff", border: color };
}

/** C = gul, A = orange (samma som i Lineup). */
export const CAPTAIN_COLORS = { C: "#fde047", A: "#fdba74" } as const;
