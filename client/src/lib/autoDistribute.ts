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

// Fisher-Yates shuffle
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Huvudfunktion: fördela anmälda spelare
// shuffle: om true, slumpas neutrala spelares lagfördelning
export function autoDistribute(
  allPlayers: Player[],
  existingLineup: Record<string, Player>,
  options?: { shuffle?: boolean },
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
  const teamAPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "center" | "forward" | "flex" }[] = [];
  const teamBPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "center" | "forward" | "flex" }[] = [];
  const neutralPlayers: { player: Player; preferredType: "goalkeeper" | "defense" | "center" | "forward" | "flex" }[] = [];

  function categorize(player: Player): "goalkeeper" | "defense" | "center" | "forward" | "flex" {
    switch (player.position) {
      case "MV": return "goalkeeper";
      case "B": return "defense";
      case "C": return "center";
      case "F": return "forward";
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
  const positionPriority: Record<string, number> = { goalkeeper: 0, defense: 1, center: 2, forward: 3, flex: 4 };
  neutralPlayers.sort((a, b) => positionPriority[a.preferredType] - positionPriority[b.preferredType]);

  // Om shuffle är aktivt, slumpa ordningen inom varje positionsgrupp
  if (options?.shuffle) {
    const groups: Record<string, typeof neutralPlayers> = {};
    for (const np of neutralPlayers) {
      if (!groups[np.preferredType]) groups[np.preferredType] = [];
      groups[np.preferredType].push(np);
    }
    neutralPlayers.length = 0;
    for (const type of ["goalkeeper", "defense", "center", "forward", "flex"]) {
      if (groups[type]) {
        neutralPlayers.push(...shuffleArray(groups[type]));
      }
    }
  }

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
      else if (p.preferredType === "forward" || p.preferredType === "center") fwd++;
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

    // Fyll forwards: Center-spelare på C-slots först, sedan F-spelare på LW/RW
    const fwdSlots = slots.filter(s => s.type === "forward");
    const centerSlots = fwdSlots.filter(s => s.role === "c");
    const wingSlots = fwdSlots.filter(s => s.role === "lw" || s.role === "rw");

    // Placera C-spelare på C-slots
    const centerPlayers = players.filter(p => p.preferredType === "center" && !placed.has(p.player.id));
    for (let i = 0; i < centerSlots.length && i < centerPlayers.length; i++) {
      lineup[centerSlots[i].id] = centerPlayers[i].player;
      placed.add(centerPlayers[i].player.id);
    }

    // Placera F-spelare på LW/RW-slots först
    const fPlayers = players.filter(p => p.preferredType === "forward" && !placed.has(p.player.id));
    for (let i = 0; i < wingSlots.length && i < fPlayers.length; i++) {
      lineup[wingSlots[i].id] = fPlayers[i].player;
      placed.add(fPlayers[i].player.id);
    }

    // Kvarvarande F-spelare på tomma C-slots
    const remainingF = players.filter(p => p.preferredType === "forward" && !placed.has(p.player.id));
    const emptyCenterSlots = centerSlots.filter(s => !lineup[s.id]);
    for (let i = 0; i < emptyCenterSlots.length && i < remainingF.length; i++) {
      lineup[emptyCenterSlots[i].id] = remainingF[i].player;
      placed.add(remainingF[i].player.id);
    }

    // Kvarvarande C-spelare på tomma wing-slots
    const remainingC = players.filter(p => p.preferredType === "center" && !placed.has(p.player.id));
    const emptyWingSlots = wingSlots.filter(s => !lineup[s.id]);
    for (let i = 0; i < emptyWingSlots.length && i < remainingC.length; i++) {
      lineup[emptyWingSlots[i].id] = remainingC[i].player;
      placed.add(remainingC[i].player.id);
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

    // Om det finns kvar forwards/centers som inte fick plats, fyll i back-slots
    const remainingFwd = players.filter(p => (p.preferredType === "forward" || p.preferredType === "center") && !placed.has(p.player.id));
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
