/**
 * Gemensam sortering för alla spelarlistor i Lineup (truppen och "välj spelare").
 *
 * 1. Närvaro: anmälda först, sedan de som inte svarat, sist de som inte kommer.
 * 2. Om en plats valts: spelare vars position passar platsen först.
 * 3. Om en plats valts: lag – platsens lag först, sedan waivers (inget lag),
 *    sist motståndarlaget.
 * 4. Namn (svensk ordning).
 *
 * Exempel, tom back i Vita: vita backar, waiver-backar, gröna backar,
 * vita forwards, waiver-forwards, gröna forwards – först för anmälda, sedan
 * samma ordning för de som inte svarat och sist för de som inte kommer.
 * Utan vald plats (truppen): närvaro, sedan namn.
 */
import { club } from "@shared/club";
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
  const teamRank = (p: Player) => (p.teamColor === slotTeam ? 0 : !p.teamColor ? 1 : 2);
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

/** Platsens lagfärg för sorteringen: lagnamnet avgör, annars lag A = vit. */
export function slotTeamColor(teamName: string, teamId?: string): "white" | "green" {
  const n = teamName.toLowerCase();
  if (n.includes(club().teams.white.name.toLowerCase()) || n.includes("vit")) return "white";
  if (n.includes(club().teams.green.name.toLowerCase()) || n.includes("grön")) return "green";
  return teamId === "team-b" ? "green" : "white";
}
