// Auto-fördela v4: Smart placement med mostPlayedPosition
//
// Prioriteringsordning:
// 1. Favoritposition – MV→MV, B→B, C→C, F→F, IB→resten
// 2. mostPlayedPosition – Om en slot saknar spelare, leta efter spelare
//    vars mostPlayedPosition matchar (t.ex. F med mostPlayed=C → C-slot)
// 3. Lagfärg – white→team-a, green→team-b (MV låses till sin lagfärg)
// 4. Kapten/Assisterande – C/A-spelare med lagfärg låses till sitt lag,
//    prioriteras till första kedjan/backparet
// 5. Jämna lag – lika många spelare per lag (±1)
// 6. Speltidsbalans – minimera skillnad i istid mellan positioner
//
// Regler:
// - Bara MV-spelare kan placeras som målvakt
// - MV med lagfärg låses och ändras aldrig
// - C/A med lagfärg låses till sitt lag och placeras i första kedjan/backparet
// - Config anpassas till faktiskt antal spelare per position (inga tomma grupper)
// - Minimum per lag: 2B + 1C + 1LW + 1RW (om tillräckligt med spelare)
// - Shuffle-läge: omfördelar neutrala icke-C/A spelare men behåller låsta

import type { Player } from "./players";
import type { Slot, TeamConfig } from "./lineup";
import { createTeamSlots } from "./lineup";
import { calculateDistributions } from "@/hooks/useIceTimeCalculator";

interface DistributeResult {
  lineup: Record<string, Player>;
  remaining: Player[];
  teamAConfig: TeamConfig;
  teamBConfig: TeamConfig;
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

type PosType = "goalkeeper" | "defense" | "center" | "forward" | "flex";

function categorize(p: Player): PosType {
  switch (p.position) {
    case "MV": return "goalkeeper";
    case "B": return "defense";
    case "C": return "center";
    case "F": return "forward";
    case "IB": return "flex";
  }
}

/** What position could this player fill based on mostPlayedPosition? */
function mostPlayedPosType(p: Player): PosType | null {
  const mpp = p.mostPlayedPosition;
  if (!mpp || mpp === p.position) return null; // same as favorite, no alternative
  switch (mpp) {
    case "MV": return "goalkeeper";
    case "B": return "defense";
    case "C": return "center";
    case "F": case "LW": case "RW": return "forward";
    case "IB": return "flex";
    default: return null;
  }
}

/** Sort priority: C first, then A, then others */
function captainSortKey(p: Player): number {
  if (p.captainRole === "C") return 0;
  if (p.captainRole === "A") return 1;
  return 2;
}

interface TaggedPlayer {
  player: Player;
  posType: PosType;
}

export function autoDistribute(
  allPlayers: Player[],
  _existingLineup: Record<string, Player>,
  options?: { shuffle?: boolean },
): DistributeResult {
  // ── Step 1: Collect registered players ──
  const playersInLineup = new Set(Object.values(_existingLineup).map(p => p.id));
  const registered = allPlayers.filter(p => p.isRegistered && !playersInLineup.has(p.id));

  const tagged: TaggedPlayer[] = registered.map(p => ({ player: p, posType: categorize(p) }));

  // ── Step 2: Separate goalkeepers ──
  const goalkeepers = tagged.filter(t => t.posType === "goalkeeper");
  const outfield = tagged.filter(t => t.posType !== "goalkeeper");

  // Goalkeepers: locked by team color, then distribute neutrals
  const gkWhite = goalkeepers.filter(t => t.player.teamColor === "white");
  const gkGreen = goalkeepers.filter(t => t.player.teamColor === "green");
  const gkNeutral = options?.shuffle
    ? shuffleArray(goalkeepers.filter(t => !t.player.teamColor))
    : goalkeepers.filter(t => !t.player.teamColor);

  // Sort neutral goalkeepers: pure goalkeepers first (no outfield experience),
  // then those with outfield experience (they can be placed as outfield instead)
  const sortedGkNeutral = [...gkNeutral].sort((a, b) => {
    const aHasOutfield = a.player.mostPlayedPosition && a.player.mostPlayedPosition !== "MV";
    const bHasOutfield = b.player.mostPlayedPosition && b.player.mostPlayedPosition !== "MV";
    if (!aHasOutfield && bHasOutfield) return -1;
    if (aHasOutfield && !bHasOutfield) return 1;
    return 0;
  });

  // If multiple locked GKs on same team, keep only 1 (prefer pure GK over versatile)
  const sortByPureGk = (arr: TaggedPlayer[]) => [...arr].sort((a, b) => {
    const aHas = a.player.mostPlayedPosition && a.player.mostPlayedPosition !== "MV";
    const bHas = b.player.mostPlayedPosition && b.player.mostPlayedPosition !== "MV";
    if (!aHas && bHas) return -1;
    if (aHas && !bHas) return 1;
    return 0;
  });

  const teamAGoalkeepers: TaggedPlayer[] = sortByPureGk(gkWhite).slice(0, 1);
  const teamBGoalkeepers: TaggedPlayer[] = sortByPureGk(gkGreen).slice(0, 1);

  // Distribute neutral goalkeepers: max 1 per team
  for (const gk of sortedGkNeutral) {
    if (teamAGoalkeepers.length <= teamBGoalkeepers.length && teamAGoalkeepers.length < 1) {
      teamAGoalkeepers.push(gk);
    } else if (teamBGoalkeepers.length < 1) {
      teamBGoalkeepers.push(gk);
    }
  }

  // Handle excess goalkeepers: re-categorize as outfield if they have outfield experience
  const allAssignedGk = new Set([
    ...teamAGoalkeepers.map(t => t.player.id),
    ...teamBGoalkeepers.map(t => t.player.id),
  ]);
  const excessGk = goalkeepers.filter(t => !allAssignedGk.has(t.player.id));

  const gkToOutfield: TaggedPlayer[] = [];
  for (const gk of excessGk) {
    const mpp = gk.player.mostPlayedPosition;
    if (mpp && mpp !== "MV") {
      let newPosType: PosType = "flex";
      if (mpp === "B") newPosType = "defense";
      else if (mpp === "C") newPosType = "center";
      else if (mpp === "F" || mpp === "LW" || mpp === "RW") newPosType = "forward";
      gkToOutfield.push({ player: gk.player, posType: newPosType });
    }
    // Pure goalkeepers (no outfield experience) stay as excess → remaining
  }

  // ── Step 3: Distribute outfield players to teams ──
  const allOutfield = [...outfield, ...gkToOutfield];

  const ofWhite = allOutfield.filter(t => t.player.teamColor === "white");
  const ofGreen = allOutfield.filter(t => t.player.teamColor === "green");
  const ofNeutral = allOutfield.filter(t => !t.player.teamColor);

  const neutralsToDistribute = options?.shuffle ? shuffleArray(ofNeutral) : [...ofNeutral];

  const teamAOutfield: TaggedPlayer[] = [...ofWhite];
  const teamBOutfield: TaggedPlayer[] = [...ofGreen];

  // Distribute neutrals to balance teams
  for (const np of neutralsToDistribute) {
    if (teamAOutfield.length <= teamBOutfield.length) {
      teamAOutfield.push(np);
    } else {
      teamBOutfield.push(np);
    }
  }

  // Rebalance if teams are very unbalanced
  const rebalance = (bigger: TaggedPlayer[], smaller: TaggedPlayer[]) => {
    while (bigger.length - smaller.length > 1) {
      const idx = bigger.findIndex(t => !t.player.teamColor && !t.player.captainRole);
      if (idx === -1) {
        const idx2 = bigger.findIndex(t => !t.player.teamColor);
        if (idx2 === -1) break;
        smaller.push(bigger.splice(idx2, 1)[0]);
      } else {
        smaller.push(bigger.splice(idx, 1)[0]);
      }
    }
  };

  if (teamAOutfield.length > teamBOutfield.length + 1) {
    rebalance(teamAOutfield, teamBOutfield);
  } else if (teamBOutfield.length > teamAOutfield.length + 1) {
    rebalance(teamBOutfield, teamAOutfield);
  }

  // ── Step 4: Calculate optimal config per team, sized to actual players ──
  function getOptimalConfig(teamOutfield: TaggedPlayer[], gkCount: number): TeamConfig {
    const count = teamOutfield.length;

    if (count < 5) {
      // Too few for full lineup — create minimal config that fits actual players
      const def = Math.min(count, 2);
      const remaining = count - def;
      const fwd = Math.max(remaining, 0);
      return {
        goalkeepers: Math.min(gkCount, 1),
        defensePairs: 1,
        forwardLines: Math.max(1, Math.ceil(fwd / 3)),
      };
    }

    const result = calculateDistributions(count, 60);
    if (result.best) {
      return {
        goalkeepers: Math.min(gkCount, 1),
        defensePairs: Math.max(1, Math.ceil(result.best.backs / 2)),
        forwardLines: Math.max(1, Math.ceil(result.best.forwards / 3)),
      };
    }

    // Fallback
    return {
      goalkeepers: Math.min(gkCount, 1),
      defensePairs: Math.max(1, Math.ceil(count * 0.4 / 2)),
      forwardLines: Math.max(1, Math.ceil(count * 0.4 / 3)),
    };
  }

  const teamAConfig = getOptimalConfig(teamAOutfield, teamAGoalkeepers.length);
  const teamBConfig = getOptimalConfig(teamBOutfield, teamBGoalkeepers.length);

  // ── Step 5: Create slots and place players ──
  const teamASlots = createTeamSlots("team-a", teamAConfig);
  const teamBSlots = createTeamSlots("team-b", teamBConfig);

  const lineup: Record<string, Player> = {};
  const placed = new Set<string>();

  function fillTeam(slots: Slot[], goalkeepers: TaggedPlayer[], outfield: TaggedPlayer[], doShuffle: boolean) {
    // 5a: Place goalkeepers
    const gkSlots = slots.filter(s => s.type === "goalkeeper");
    const sortedGk = [...goalkeepers].sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    for (let i = 0; i < gkSlots.length && i < sortedGk.length; i++) {
      lineup[gkSlots[i].id] = sortedGk[i].player;
      placed.add(sortedGk[i].player.id);
    }

    // 5b: Separate outfield by preferred position
    // In shuffle mode: fully randomize within each position group
    // In auto mode: sort C/A first for deterministic placement
    let defenders = outfield.filter(t => t.posType === "defense");
    let centers = outfield.filter(t => t.posType === "center");
    let forwards = outfield.filter(t => t.posType === "forward");
    let flexPlayers = outfield.filter(t => t.posType === "flex");

    if (doShuffle) {
      defenders = shuffleArray(defenders);
      centers = shuffleArray(centers);
      forwards = shuffleArray(forwards);
      flexPlayers = shuffleArray(flexPlayers);
    } else {
      defenders.sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
      centers.sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
      forwards.sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
      flexPlayers.sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    }

    // 5c: Place defenders on defense slots
    const defSlots = slots.filter(s => s.type === "defense");
    for (let i = 0; i < defSlots.length && i < defenders.length; i++) {
      lineup[defSlots[i].id] = defenders[i].player;
      placed.add(defenders[i].player.id);
    }

    // 5d: Place centers on center slots
    const fwdSlots = slots.filter(s => s.type === "forward");
    const centerSlots = fwdSlots.filter(s => s.role === "c");
    const wingSlots = fwdSlots.filter(s => s.role === "lw" || s.role === "rw");

    for (let i = 0; i < centerSlots.length && i < centers.length; i++) {
      lineup[centerSlots[i].id] = centers[i].player;
      placed.add(centers[i].player.id);
    }

    // 5e: Place forwards on wing slots
    for (let i = 0; i < wingSlots.length && i < forwards.length; i++) {
      lineup[wingSlots[i].id] = forwards[i].player;
      placed.add(forwards[i].player.id);
    }

    // ── 5f: Gap-filling with mostPlayedPosition ──
    // Check for empty critical slots and try to fill them with players
    // whose mostPlayedPosition matches, before doing generic overflow
    let allUnplaced = [...flexPlayers, ...forwards, ...centers, ...defenders]
      .filter(t => !placed.has(t.player.id));
    if (doShuffle) allUnplaced = shuffleArray(allUnplaced);

    // Fill empty center slots with players whose mostPlayedPosition is C
    const emptyCenterSlots = centerSlots.filter(s => !lineup[s.id]);
    for (const slot of emptyCenterSlots) {
      // First: look for unplaced players with mostPlayedPosition = C
      const candidate = allUnplaced.find(t =>
        !placed.has(t.player.id) &&
        t.player.mostPlayedPosition === "C"
      );
      if (candidate) {
        lineup[slot.id] = candidate.player;
        placed.add(candidate.player.id);
      }
    }

    // Fill empty wing slots with players whose mostPlayedPosition is F/LW/RW
    const emptyWingSlots = wingSlots.filter(s => !lineup[s.id]);
    for (const slot of emptyWingSlots) {
      const candidate = allUnplaced.find(t =>
        !placed.has(t.player.id) &&
        (t.player.mostPlayedPosition === "F" ||
         t.player.mostPlayedPosition === "LW" ||
         t.player.mostPlayedPosition === "RW")
      );
      if (candidate) {
        lineup[slot.id] = candidate.player;
        placed.add(candidate.player.id);
      }
    }

    // Fill empty defense slots with players whose mostPlayedPosition is B
    const emptyDefSlots = defSlots.filter(s => !lineup[s.id]);
    for (const slot of emptyDefSlots) {
      const candidate = allUnplaced.find(t =>
        !placed.has(t.player.id) &&
        t.player.mostPlayedPosition === "B"
      );
      if (candidate) {
        lineup[slot.id] = candidate.player;
        placed.add(candidate.player.id);
      }
    }

    // 5g: Fill remaining empty slots with any unplaced players (generic overflow)
    let stillUnplaced = allUnplaced.filter(t => !placed.has(t.player.id));
    if (doShuffle) stillUnplaced = shuffleArray(stillUnplaced);

    const allEmptySlots = [
      ...wingSlots.filter(s => !lineup[s.id]),
      ...centerSlots.filter(s => !lineup[s.id]),
      ...defSlots.filter(s => !lineup[s.id]),
    ];

    for (let i = 0; i < allEmptySlots.length && i < stillUnplaced.length; i++) {
      lineup[allEmptySlots[i].id] = stillUnplaced[i].player;
      placed.add(stillUnplaced[i].player.id);
    }
  }

  const doShuffle = options?.shuffle ?? false;
  fillTeam(teamASlots, teamAGoalkeepers, teamAOutfield, doShuffle);
  fillTeam(teamBSlots, teamBGoalkeepers, teamBOutfield, doShuffle);

  // ── Step 6: Trim empty groups from config ──
  // If a defense pair or forward line has zero players placed, reduce the config
  function trimConfig(config: TeamConfig, slots: Slot[]): TeamConfig {
    const defSlots = slots.filter(s => s.type === "defense");
    const fwdSlots = slots.filter(s => s.type === "forward");

    // Count how many defense pairs have at least 1 player
    let usedDefPairs = 0;
    for (let pair = 0; pair < config.defensePairs; pair++) {
      const pairSlots = defSlots.filter(s => {
        const match = s.id.match(/def-(\d+)-/);
        return match && parseInt(match[1]) === pair + 1;
      });
      if (pairSlots.some(s => lineup[s.id])) usedDefPairs++;
    }

    // Count how many forward lines have at least 1 player
    let usedFwdLines = 0;
    for (let line = 0; line < config.forwardLines; line++) {
      const lineSlots = fwdSlots.filter(s => {
        const match = s.id.match(/fwd-(\d+)-/);
        return match && parseInt(match[1]) === line + 1;
      });
      if (lineSlots.some(s => lineup[s.id])) usedFwdLines++;
    }

    return {
      goalkeepers: config.goalkeepers,
      defensePairs: Math.max(1, usedDefPairs),
      forwardLines: Math.max(1, usedFwdLines),
    };
  }

  const trimmedTeamAConfig = trimConfig(teamAConfig, teamASlots);
  const trimmedTeamBConfig = trimConfig(teamBConfig, teamBSlots);

  // If config was trimmed, we need to rebuild slots and re-map lineup entries
  // to the new slot IDs (since trimming may remove slot groups)
  function rebuildIfNeeded(
    originalConfig: TeamConfig,
    trimmedConfig: TeamConfig,
    originalSlots: Slot[],
    teamPrefix: string,
  ): Slot[] {
    if (
      originalConfig.defensePairs === trimmedConfig.defensePairs &&
      originalConfig.forwardLines === trimmedConfig.forwardLines
    ) {
      return originalSlots; // No change needed
    }

    // Collect placed players from original slots in order
    const newSlots = createTeamSlots(teamPrefix as "team-a" | "team-b", trimmedConfig);

    // Map players from old slots to new slots by type and order
    const oldGkPlayers = originalSlots.filter(s => s.type === "goalkeeper" && lineup[s.id]).map(s => lineup[s.id]);
    const oldDefPlayers = originalSlots.filter(s => s.type === "defense" && lineup[s.id]).map(s => lineup[s.id]);
    const oldFwdPlayers = originalSlots.filter(s => s.type === "forward" && lineup[s.id]).map(s => lineup[s.id]);

    // Remove old entries
    for (const s of originalSlots) {
      delete lineup[s.id];
    }

    // Place into new slots
    const newGkSlots = newSlots.filter(s => s.type === "goalkeeper");
    const newDefSlots = newSlots.filter(s => s.type === "defense");
    const newFwdSlots = newSlots.filter(s => s.type === "forward");
    const newCenterSlots = newFwdSlots.filter(s => s.role === "c");
    const newWingSlots = newFwdSlots.filter(s => s.role === "lw" || s.role === "rw");

    for (let i = 0; i < newGkSlots.length && i < oldGkPlayers.length; i++) {
      lineup[newGkSlots[i].id] = oldGkPlayers[i];
    }

    for (let i = 0; i < newDefSlots.length && i < oldDefPlayers.length; i++) {
      lineup[newDefSlots[i].id] = oldDefPlayers[i];
    }

    // For forwards, separate centers and wings
    const oldCenterPlayers = oldFwdPlayers.filter(p => p.position === "C" || (p.mostPlayedPosition === "C" && p.position !== "F"));
    const oldWingPlayers = oldFwdPlayers.filter(p => !oldCenterPlayers.includes(p));

    for (let i = 0; i < newCenterSlots.length && i < oldCenterPlayers.length; i++) {
      lineup[newCenterSlots[i].id] = oldCenterPlayers[i];
    }

    // Wings + remaining centers that didn't fit
    const remainingCenters = oldCenterPlayers.slice(newCenterSlots.length);
    const allWings = [...oldWingPlayers, ...remainingCenters];
    for (let i = 0; i < newWingSlots.length && i < allWings.length; i++) {
      lineup[newWingSlots[i].id] = allWings[i];
    }

    return newSlots;
  }

  rebuildIfNeeded(teamAConfig, trimmedTeamAConfig, teamASlots, "team-a");
  rebuildIfNeeded(teamBConfig, trimmedTeamBConfig, teamBSlots, "team-b");

  // Remaining: players that didn't get placed
  const remaining = registered.filter(p => !placed.has(p.id));

  return { lineup, remaining, teamAConfig: trimmedTeamAConfig, teamBConfig: trimmedTeamBConfig };
}
