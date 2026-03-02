// Auto-fördela: Fördelar anmälda spelare på två lag
//
// Regler:
// 1. Prioritera spelarens position (MV→målvakt, B→back, F/C→forward)
// 2. Respektera lagtillhörighet (white→team-a, green→team-b)
// 3. Spelare utan lagtillhörighet fördelas jämnt
// 4. Bara MV-spelare kan spela målvakt
// 5. IB-spelare kan spela vart som helst UTOM målvakt
// 6. Fördela lika många spelare i båda lagen så gott det går

import type { Player, Position } from "./players";
import type { Slot, TeamConfig } from "./lineup";
import { createTeamSlots } from "./lineup";

interface DistributeResult {
  lineup: Record<string, Player>;  // slotId → Player
  remaining: Player[];              // Spelare som inte fick plats
  teamAConfig: TeamConfig;
  teamBConfig: TeamConfig;
}

// Beräkna optimal TeamConfig baserat på antal spelare per position
function calculateTeamConfig(
  goalkeepers: number,
  defenders: number,
  forwards: number,
): TeamConfig {
  return {
    goalkeepers: Math.min(2, Math.max(1, goalkeepers)),
    defensePairs: Math.min(4, Math.max(1, Math.ceil(defenders / 2))),
    forwardLines: Math.min(4, Math.max(1, Math.ceil(forwards / 3))),
  };
}

// Huvudfunktion: fördela anmälda spelare
export function autoDistribute(
  allPlayers: Player[],
  existingLineup: Record<string, Player>,
): DistributeResult {
  // Filtrera ut anmälda spelare som är i spelartruppen (inte redan i ett lag)
  const playersInLineup = new Set(Object.values(existingLineup).map(p => p.id));
  const registered = allPlayers.filter(p => p.isRegistered && !playersInLineup.has(p.id));

  // Kategorisera spelare
  const goalkeepers = registered.filter(p => p.position === "MV");
  const defenders = registered.filter(p => p.position === "B");
  const forwards = registered.filter(p => p.position === "F" || p.position === "C");
  const iceBox = registered.filter(p => p.position === "IB");

  // Beräkna hur många spelare vi har per position för varje lag
  // Steg 1: Fördela spelare med lagtillhörighet
  const teamAPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "forward" | "flex" }[] = [];
  const teamBPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "forward" | "flex" }[] = [];
  const neutralPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "forward" | "flex" }[] = [];

  function categorize(player: Player): "goalkeeper" | "defense" | "forward" | "flex" {
    switch (player.position) {
      case "MV": return "goalkeeper";
      case "B": return "defense";
      case "F": case "C": return "forward";
      case "IB": return "flex";
    }
  }

  for (const p of registered) {
    const type = categorize(p);
    if (p.teamColor === "white") {
      teamAPlayers.push({ player: p, preferredType: type });
    } else if (p.teamColor === "green") {
      teamBPlayers.push({ player: p, preferredType: type });
    } else {
      neutralPlayers.push({ player: p, preferredType: type });
    }
  }

  // Steg 2: Fördela neutrala spelare jämnt
  // Sortera neutrala: MV först, sedan B, sedan F/C, sedan IB
  const positionPriority: Record<string, number> = { goalkeeper: 0, defense: 1, forward: 2, flex: 3 };
  neutralPlayers.sort((a, b) => positionPriority[a.preferredType] - positionPriority[b.preferredType]);

  for (const np of neutralPlayers) {
    // Fördela till laget med färre spelare
    if (teamAPlayers.length <= teamBPlayers.length) {
      teamAPlayers.push(np);
    } else {
      teamBPlayers.push(np);
    }
  }

  // Steg 3: Beräkna optimal config för varje lag
  function countByType(players: { preferredType: string }[]) {
    let gk = 0, def = 0, fwd = 0;
    for (const p of players) {
      if (p.preferredType === "goalkeeper") gk++;
      else if (p.preferredType === "defense") def++;
      else if (p.preferredType === "forward") fwd++;
      else {
        // Flex (IB) - räkna som forward för config-beräkning
        fwd++;
      }
    }
    return { gk, def, fwd };
  }

  const countA = countByType(teamAPlayers);
  const countB = countByType(teamBPlayers);

  const teamAConfig = calculateTeamConfig(countA.gk, countA.def, countA.fwd);
  const teamBConfig = calculateTeamConfig(countB.gk, countB.def, countB.fwd);

  // Steg 4: Skapa slots och fyll i
  const teamASlots = createTeamSlots("team-a", teamAConfig);
  const teamBSlots = createTeamSlots("team-b", teamBConfig);

  const lineup: Record<string, Player> = {};
  const placed = new Set<string>();

  function fillTeam(
    slots: Slot[],
    players: { player: Player; preferredType: string }[],
  ) {
    // Fyll målvakter först
    const gkSlots = slots.filter(s => s.type === "goalkeeper");
    const gkPlayers = players.filter(p => p.preferredType === "goalkeeper");
    for (let i = 0; i < gkSlots.length && i < gkPlayers.length; i++) {
      lineup[gkSlots[i].id] = gkPlayers[i].player;
      placed.add(gkPlayers[i].player.id);
    }

    // Fyll backar
    const defSlots = slots.filter(s => s.type === "defense");
    const defPlayers = players.filter(p => p.preferredType === "defense" && !placed.has(p.player.id));
    for (let i = 0; i < defSlots.length && i < defPlayers.length; i++) {
      lineup[defSlots[i].id] = defPlayers[i].player;
      placed.add(defPlayers[i].player.id);
    }

    // Fyll forwards
    const fwdSlots = slots.filter(s => s.type === "forward");
    const fwdPlayers = players.filter(p => p.preferredType === "forward" && !placed.has(p.player.id));
    for (let i = 0; i < fwdSlots.length && i < fwdPlayers.length; i++) {
      lineup[fwdSlots[i].id] = fwdPlayers[i].player;
      placed.add(fwdPlayers[i].player.id);
    }

    // Fyll IB-spelare i kvarvarande platser (inte målvakt)
    const flexPlayers = players.filter(p => p.preferredType === "flex" && !placed.has(p.player.id));
    const emptyNonGkSlots = [
      ...defSlots.filter(s => !lineup[s.id]),
      ...fwdSlots.filter(s => !lineup[s.id]),
    ];
    for (let i = 0; i < emptyNonGkSlots.length && i < flexPlayers.length; i++) {
      lineup[emptyNonGkSlots[i].id] = flexPlayers[i].player;
      placed.add(flexPlayers[i].player.id);
    }

    // Om det finns kvar forwards som inte fick plats i forward-slots, fyll i back-slots
    const remainingFwd = players.filter(p => p.preferredType === "forward" && !placed.has(p.player.id));
    const emptyDefSlots = defSlots.filter(s => !lineup[s.id]);
    for (let i = 0; i < emptyDefSlots.length && i < remainingFwd.length; i++) {
      lineup[emptyDefSlots[i].id] = remainingFwd[i].player;
      placed.add(remainingFwd[i].player.id);
    }

    // Om det finns kvar backar som inte fick plats i back-slots, fyll i forward-slots
    const remainingDef = players.filter(p => p.preferredType === "defense" && !placed.has(p.player.id));
    const emptyFwdSlots = fwdSlots.filter(s => !lineup[s.id]);
    for (let i = 0; i < emptyFwdSlots.length && i < remainingDef.length; i++) {
      lineup[emptyFwdSlots[i].id] = remainingDef[i].player;
      placed.add(remainingDef[i].player.id);
    }

    // Slutligen: kvarvarande IB/flex som inte fick plats
    const stillFlex = players.filter(p => !placed.has(p.player.id));
    const allEmptyNonGk = [...defSlots, ...fwdSlots].filter(s => !lineup[s.id]);
    for (let i = 0; i < allEmptyNonGk.length && i < stillFlex.length; i++) {
      lineup[allEmptyNonGk[i].id] = stillFlex[i].player;
      placed.add(stillFlex[i].player.id);
    }
  }

  fillTeam(teamASlots, teamAPlayers);
  fillTeam(teamBSlots, teamBPlayers);

  // Kvarvarande spelare som inte fick plats
  const remaining = registered.filter(p => !placed.has(p.id));

  return { lineup, remaining, teamAConfig, teamBConfig };
}
