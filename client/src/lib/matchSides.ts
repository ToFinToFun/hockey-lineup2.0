/**
 * Lagen i en match som de ska visas: internmatch (Vita/Gröna från klubben) eller
 * mot motståndare (vårt lag = "white" i lagringen, motståndaren = "green").
 */
import { club, teamLogo } from "@shared/club";
import { teamName } from "@shared/teams";
import type { MatchSetup } from "@shared/matchSetup";

export interface SideInfo { name: string; logo: string | null; color: string }
export interface OpponentInfo { id: number; name: string; color: string; logoUrl: string | null; shortName?: string | null }

export function matchSides(setup: MatchSetup | null | undefined, opponent: OpponentInfo | null | undefined, teamAName?: string): { white: SideInfo; green: SideInfo; external: boolean } {
  if (setup?.mode === "external") {
    const c = club();
    const ourLogo = setup.ourLogo === "white" ? c.teams.white.logo : setup.ourLogo === "green" ? c.teams.green.logo : c.logo;
    return {
      external: true,
      white: { name: setup.ourName || teamAName || c.name, logo: ourLogo, color: c.teams.white.color },
      green: { name: opponent?.name ?? "Motståndare", logo: opponent?.logoUrl ?? null, color: opponent?.color ?? "#ef4444" },
    };
  }
  return {
    external: false,
    white: { name: teamName("white"), logo: teamLogo("white"), color: club().teams.white.color },
    green: { name: teamName("green"), logo: teamLogo("green"), color: club().teams.green.color },
  };
}
