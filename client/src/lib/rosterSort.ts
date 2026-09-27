/**
 * Gemensam sortering för alla spelarlistor i Lineup (truppen och "välj spelare").
 *
 * 1. Närvaro: anmälda först, sedan de som inte svarat, sist de som inte kommer.
 * 2. Om en plats valts: spelare vars position passar platsen först.
 * 3. Om en plats valts: lag – waivers (inget lag) först, sedan platsens lag,
 *    sist motståndarlaget. Waivers kan spela var som helst.
 * 4. Namn (svensk ordning).
 *
 * Exempel, tom back i Vita: waiver-backar, vita backar, gröna backar,
 * waiver-forwards, vita forwards, gröna forwards – först för anmälda, sedan
 * samma ordning för de som inte svarat och sist för de som inte kommer.
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

export function sortRoster(
  players: Player[],
  preferredPositions?: string[],
  slotTeam?: "white" | "green"
): Player[] {
  const teamRank = (p: Player) => (!p.teamColor ? 0 : p.teamColor === slotTeam ? 1 : 2);
  return [...players].sort((a, b) => {
    const att = attendanceRank(a) - attendanceRank(b);
    if (att !== 0) return att;
    if (preferredPositions?.length) {
      const pa = preferredPositions.includes(a.position) ? 0 : 1;
      const pb = preferredPositions.includes(b.position) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    if (slotTeam) {
      const t = teamRank(a) - teamRank(b);
      if (t !== 0) return t;
    }
    return a.name.localeCompare(b.name, "sv");
  });
}
