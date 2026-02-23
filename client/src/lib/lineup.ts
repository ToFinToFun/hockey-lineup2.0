// Hockey Lineup App – Fasta slots-struktur
// Varje lag har fasta namngivna platser som alltid visas

export type SlotId = string; // t.ex. "team-a-gk-1", "team-a-def-1-1", "team-a-fwd-1-lw"

export interface Slot {
  id: SlotId;
  label: string;          // "Målvakt", "Back 1", "LW" etc.
  shortLabel: string;     // "MV", "B1", "LW" etc.
  groupLabel?: string;    // "Backpar 1", "Kedja 1" etc.
  type: "goalkeeper" | "defense" | "forward";
  role: "gk" | "res-gk" | "def" | "lw" | "c" | "rw";
}

// Generera alla slots för ett lag
export function createTeamSlots(teamId: string): Slot[] {
  const slots: Slot[] = [];

  // Målvakter
  slots.push({
    id: `${teamId}-gk-1`,
    label: "Målvakt",
    shortLabel: "MV",
    type: "goalkeeper",
    role: "gk",
  });
  slots.push({
    id: `${teamId}-gk-2`,
    label: "Reservmålvakt",
    shortLabel: "RES",
    type: "goalkeeper",
    role: "res-gk",
  });

  // Backpar 1–4
  for (let pair = 1; pair <= 4; pair++) {
    const back1 = (pair - 1) * 2 + 1;
    const back2 = back1 + 1;
    slots.push({
      id: `${teamId}-def-${pair}-1`,
      label: `Back ${back1}`,
      shortLabel: `B${back1}`,
      groupLabel: `Backpar ${pair}`,
      type: "defense",
      role: "def",
    });
    slots.push({
      id: `${teamId}-def-${pair}-2`,
      label: `Back ${back2}`,
      shortLabel: `B${back2}`,
      groupLabel: `Backpar ${pair}`,
      type: "defense",
      role: "def",
    });
  }

  // Kedjor 1–4 (LW, C, RW)
  const chainNames = ["1:a kedjan", "2:a kedjan", "3:e kedjan", "4:e kedjan"];
  for (let chain = 1; chain <= 4; chain++) {
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
