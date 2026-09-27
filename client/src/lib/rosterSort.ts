/**
 * Gemensam sortering för alla spelarlistor i Lineup (truppen och "välj spelare").
 *
 * 1. Närvaro: anmälda först, sedan de som inte svarat, sist de som inte kommer.
 * 2. Om en plats valts: spelare vars position passar platsen först.
 * 3. Namn (svensk ordning).
 */
import type { Player } from "@/lib/players";

const attendanceRank = (p: Player) => (p.isRegistered ? 0 : p.isDeclined ? 2 : 1);

/** Positioner som passar en plats, t.ex. LW → F. */
export function positionsForSlot(slotType: string, slotLabel?: string): string[] {
  if (slotType === "goalkeeper") return ["MV"];
  if (slotType === "defense") return ["B"];
  if (slotLabel === "C") return ["C"];
  return ["F"];
}

export function sortRoster(players: Player[], preferredPositions?: string[]): Player[] {
  return [...players].sort((a, b) => {
    const att = attendanceRank(a) - attendanceRank(b);
    if (att !== 0) return att;
    if (preferredPositions?.length) {
      const pa = preferredPositions.includes(a.position) ? 0 : 1;
      const pb = preferredPositions.includes(b.position) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return a.name.localeCompare(b.name, "sv");
  });
}
