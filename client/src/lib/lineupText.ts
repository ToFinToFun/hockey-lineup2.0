/**
 * Laguppställningen som ren text, för att klistra in i chatt (t.ex. lagets gruppchatt).
 * Används av både Score Tracker och Lineup.
 */
import { type AppState, type Slot, createTeamSlots, groupSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import { type Player } from "@/lib/players";

export function generateLineupText(
  lineupState: AppState,
  teamASlots: Slot[],
  teamBSlots: Slot[],
  teamALineup: Record<string, Player>,
  teamBLineup: Record<string, Player>
): string {
  const formatTeam = (
    teamName: string,
    slots: Slot[],
    lineup: Record<string, Player>
  ): string => {
    const lines: string[] = [];
    lines.push(teamName.toUpperCase());
    lines.push("");

    const sections: Slot["type"][] = ["goalkeeper", "defense", "forward"];

    for (const sectionType of sections) {
      const sectionSlots = slots.filter((s) => s.type === sectionType);
      const filled = sectionSlots.filter((s) => lineup[s.id]);
      if (filled.length === 0) continue;

      const groups = groupSlots(sectionSlots);
      let isFirstGroup = true;
      for (const group of groups) {
        const filledInGroup = group.slots.filter((s) => lineup[s.id]);
        if (filledInGroup.length === 0) continue;

        if (!isFirstGroup) {
          lines.push("");
        }

        for (const slot of filledInGroup) {
          const p = lineup[slot.id];
          if (!p) continue;
          const pos = slot.shortLabel.padEnd(3);
          const captain = p.captainRole ? ` (${p.captainRole})` : "";
          const num = p.number ? ` #${p.number}` : "";
          lines.push(`${pos}  ${p.name}${num}${captain}`);
        }
        isFirstGroup = false;
      }

      lines.push("");
    }

    return lines.join("\n");
  };

  const teamA = formatTeam(
    lineupState.teamAName,
    teamASlots,
    teamALineup
  );
  const teamB = formatTeam(
    lineupState.teamBName,
    teamBSlots,
    teamBLineup
  );

  return [teamA, teamB].join("\n");
}

/** Bygger texten direkt från uppställningens tillstånd. */
export function lineupStateToText(state: Pick<AppState, "teamAName" | "teamBName" | "teamAConfig" | "teamBConfig" | "lineup">): string {
  const teamASlots = createTeamSlots("team-a", state.teamAConfig ?? MAX_TEAM_CONFIG);
  const teamBSlots = createTeamSlots("team-b", state.teamBConfig ?? MAX_TEAM_CONFIG);
  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  for (const [slotId, player] of Object.entries(state.lineup ?? {})) {
    if (slotId.startsWith("team-a-")) teamALineup[slotId] = player as Player;
    else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player as Player;
  }
  return generateLineupText(state as AppState, teamASlots, teamBSlots, teamALineup, teamBLineup);
}

/** Delar via telefonens dela-meny om den finns, annars kopieras till urklipp. */
export async function shareOrCopy(data: { text?: string; url?: string; title?: string }): Promise<"shared" | "copied"> {
  if (typeof navigator !== "undefined" && navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "shared";
    }
  }
  await navigator.clipboard.writeText(data.url ?? data.text ?? "");
  return "copied";
}
