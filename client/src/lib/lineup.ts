// Hockey Lineup App – Dynamisk slots-struktur
// Varje lag kan ha 1–2 MV, 1–4 backpar, 1–4 kedjor

export type SlotId = string; // t.ex. "team-a-gk-1", "team-a-def-1-1", "team-a-fwd-1-lw"

export interface Slot {
  id: SlotId;
  label: string;          // "Målvakt", "Back 1", "LW" etc.
  shortLabel: string;     // "MV", "B1", "LW" etc.
  groupLabel?: string;    // "Backpar 1", "Kedja 1" etc.
  type: "goalkeeper" | "defense" | "forward";
  role: "gk" | "res-gk" | "def" | "lw" | "c" | "rw";
}

export interface TeamConfig {
  goalkeepers: number; // 1–2
  defensePairs: number; // 1–4
  forwardLines: number; // 1–4
}

export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  goalkeepers: 1,
  defensePairs: 1,
  forwardLines: 1,
};

export const MAX_TEAM_CONFIG: TeamConfig = {
  goalkeepers: 2,
  defensePairs: 4,
  forwardLines: 4,
};

// Generera slots baserat på konfiguration
export function createTeamSlots(teamId: string, config?: TeamConfig): Slot[] {
  const { goalkeepers, defensePairs, forwardLines } = config ?? DEFAULT_TEAM_CONFIG;
  const slots: Slot[] = [];

  // Målvakter
  slots.push({
    id: `${teamId}-gk-1`,
    label: "Målvakt",
    shortLabel: "MV",
    type: "goalkeeper",
    role: "gk",
  });
  if (goalkeepers >= 2) {
    slots.push({
      id: `${teamId}-gk-2`,
      label: "Reservmålvakt",
      shortLabel: "RES",
      type: "goalkeeper",
      role: "res-gk",
    });
  }

  // Backpar
  for (let pair = 1; pair <= defensePairs; pair++) {
    const back1 = (pair - 1) * 2 + 1;
    const back2 = back1 + 1;
    slots.push({
      id: `${teamId}-def-${pair}-1`,
      label: `Back ${back1}`,
      shortLabel: "B",
      groupLabel: `Backpar ${pair}`,
      type: "defense",
      role: "def",
    });
    slots.push({
      id: `${teamId}-def-${pair}-2`,
      label: `Back ${back2}`,
      shortLabel: "B",
      groupLabel: `Backpar ${pair}`,
      type: "defense",
      role: "def",
    });
  }

  // Kedjor (LW, C, RW)
  const chainNames = ["1:a kedjan", "2:a kedjan", "3:e kedjan", "4:e kedjan"];
  for (let chain = 1; chain <= forwardLines; chain++) {
    slots.push({
      id: `${teamId}-fwd-${chain}-lw`,
      label: "Vänsterforward",
      shortLabel: "LW",
      groupLabel: chainNames[chain - 1],
      type: "forward",
      role: "lw",
    });
    slots.push({
      id: `${teamId}-fwd-${chain}-c`,
      label: "Center",
      shortLabel: "C",
      groupLabel: chainNames[chain - 1],
      type: "forward",
      role: "c",
    });
    slots.push({
      id: `${teamId}-fwd-${chain}-rw`,
      label: "Högerforward",
      shortLabel: "RW",
      groupLabel: chainNames[chain - 1],
      type: "forward",
      role: "rw",
    });
  }

  return slots;
}

// Gruppera slots efter groupLabel
export function groupSlots(slots: Slot[]): { groupLabel: string; slots: Slot[] }[] {
  const groups: Map<string, Slot[]> = new Map();

  for (const slot of slots) {
    const key = slot.groupLabel ?? slot.label;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(slot);
  }

  return Array.from(groups.entries()).map(([groupLabel, slots]) => ({
    groupLabel,
    slots,
  }));
}

// AppState type used by Score Tracker to represent the full lineup state
import type { Player } from "./players";

export interface AppState {
  players: Player[];
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
  deletedPlayerIds?: string[];
  teamAConfig?: TeamConfig;
  teamBConfig?: TeamConfig;
}
