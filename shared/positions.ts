/**
 * Positionernas namn och färger – gemensamt för klient och server.
 * Servern skickar dem till sajtens medlemsregister (integrationen, "begrepp"), så att
 * registret använder samma namn och färger som appen.
 */
export type PositionCode = "MV" | "B" | "F" | "C" | "IB";

export const POSITION_NAMES: Record<PositionCode, string> = {
  MV: "Målvakt",
  B: "Back",
  F: "Forward",
  C: "Center",
  IB: "Ice Box",
};

/** Motsvarar .pos-badge-* i client/src/index.css */
export const POSITION_BASE_COLORS: Record<PositionCode, string> = {
  MV: "#f97316", // orange
  B: "#3b82f6", // blå
  C: "#8b5cf6", // lila
  F: "#06b6d4", // turkos
  IB: "#a8b8c8", // isblå
};

/** Spelare utan lag */
export const WAIVERS = { name: "Waivers", shortName: "W", color: "#8c8c8c" } as const;

/**
 * Positionerna som de VISAS (NHL): G, D, C, F, LW, RW. Koderna i databasen är oförändrade (MV, B …).
 * Använd posLabel() överallt där en position skrivs ut.
 */
export const POSITION_ABBR: Record<string, string> = { MV: "G", RES: "G", B: "D", C: "C", F: "F", LW: "LW", RW: "RW", IB: "IB" };
export const posLabel = (code: string | null | undefined): string => (code ? (POSITION_ABBR[code] ?? code) : "");
