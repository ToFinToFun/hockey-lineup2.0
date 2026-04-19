// Auto-fördela v3: Optimal speltidsbalans via calculateDistributions
//
// Prioriteringsordning:
// 1. Favoritposition – MV→MV, B→B, C→C, F→F, IB→resten
// 2. Lagfärg – white→team-a, green→team-b (MV låses till sin lagfärg)
// 3. Kapten/Assisterande – C/A-spelare med lagfärg låses till sitt lag,
//    prioriteras till första kedjan/backparet
// 4. Jämna lag – lika många spelare per lag (±1)
// 5. Speltidsbalans – minimera skillnad i istid mellan positioner
//
// Regler:
// - Bara MV-spelare kan placeras som målvakt
// - MV med lagfärg låses och ändras aldrig
// - C/A med lagfärg låses till sitt lag och placeras i första kedjan/backparet
// - calculateDistributions() bestämmer optimal B/C/F-fördelning per lag
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

/** Sort priority: C first, then A, then others */
function captainSortKey(p: Player): number {
  if (p.captainRole === "C") return 0;
  if (p.captainRole === "A") return 1;
  return 2;
}

/** Is this player locked to their team (has captainRole AND teamColor)? */
function isTeamLocked(p: Player): boolean {
  return !!(p.captainRole && p.teamColor);
}

/** Is this player locked to their team (has teamColor, regardless of captain role)? */
function hasTeamColor(p: Player): boolean {
  return !!p.teamColor;
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

  const teamAGoalkeepers: TaggedPlayer[] = [...gkWhite];
  const teamBGoalkeepers: TaggedPlayer[] = [...gkGreen];

  // Distribute neutral goalkeepers: max 2 per team, balance between teams
  for (const gk of gkNeutral) {
    if (teamAGoalkeepers.length <= teamBGoalkeepers.length && teamAGoalkeepers.length < 2) {
      teamAGoalkeepers.push(gk);
    } else if (teamBGoalkeepers.length < 2) {
      teamBGoalkeepers.push(gk);
    }
    // Excess goalkeepers will go to remaining
  }

  // ── Step 3: Distribute outfield players to teams ──
  // Separate by team color. C/A with teamColor are "locked" and cannot be shuffled.
  const ofWhite = outfield.filter(t => t.player.teamColor === "white");
  const ofGreen = outfield.filter(t => t.player.teamColor === "green");
  const ofNeutral = outfield.filter(t => !t.player.teamColor);

  // Shuffle only non-locked neutrals (never shuffle C/A with teamColor)
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

  // If teams are very unbalanced due to team colors, try to move neutrals
  // (only move players WITHOUT teamColor AND without captainRole)
  const rebalance = (bigger: TaggedPlayer[], smaller: TaggedPlayer[]) => {
    while (bigger.length - smaller.length > 1) {
      // Find a neutral non-captain player in the bigger team to move
      const idx = bigger.findIndex(t => !t.player.teamColor && !t.player.captainRole);
      if (idx === -1) {
        // Try neutral captain (shouldn't happen, but fallback)
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

  // ── Step 4: Calculate optimal position distribution per team ──
  function getOptimalConfig(outfieldCount: number, gkCount: number): TeamConfig {
    if (outfieldCount < 5) {
      // Too few players for a full lineup — minimal config
      const def = Math.min(outfieldCount, 2);
      const remaining = outfieldCount - def;
      const cen = Math.min(remaining, 1);
      const fwd = remaining - cen;
      return {
        goalkeepers: Math.min(gkCount, 2),
        defensePairs: Math.max(1, Math.ceil(def / 2)),
        forwardLines: Math.max(1, Math.ceil(Math.max(fwd, 1) / 2)),
      };
    }

    const result = calculateDistributions(outfieldCount, 60);
    if (result.best) {
      return {
        goalkeepers: Math.min(gkCount, 2),
        defensePairs: Math.max(1, Math.ceil(result.best.backs / 2)),
        forwardLines: Math.max(1, Math.ceil(result.best.forwards / 2)),
      };
    }

    // Fallback: simple calculation
    return {
      goalkeepers: Math.min(gkCount, 2),
      defensePairs: Math.max(1, Math.ceil(outfieldCount * 0.4 / 2)),
      forwardLines: Math.max(1, Math.ceil(outfieldCount * 0.4 / 2)),
    };
  }

  const teamAConfig = getOptimalConfig(teamAOutfield.length, teamAGoalkeepers.length);
  const teamBConfig = getOptimalConfig(teamBOutfield.length, teamBGoalkeepers.length);

  // ── Step 5: Create slots and place players ──
  const teamASlots = createTeamSlots("team-a", teamAConfig);
  const teamBSlots = createTeamSlots("team-b", teamBConfig);

  const lineup: Record<string, Player> = {};
  const placed = new Set<string>();

  function fillTeam(slots: Slot[], goalkeepers: TaggedPlayer[], outfield: TaggedPlayer[]) {
    // 5a: Place goalkeepers (C/A goalkeepers first)
    const gkSlots = slots.filter(s => s.type === "goalkeeper");
    const sortedGk = [...goalkeepers].sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    for (let i = 0; i < gkSlots.length && i < sortedGk.length; i++) {
      lineup[gkSlots[i].id] = sortedGk[i].player;
      placed.add(sortedGk[i].player.id);
    }

    // 5b: Separate outfield by preferred position, sort C/A first in each group
    const defenders = outfield
      .filter(t => t.posType === "defense")
      .sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    const centers = outfield
      .filter(t => t.posType === "center")
      .sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    const forwards = outfield
      .filter(t => t.posType === "forward")
      .sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));
    const flexPlayers = outfield
      .filter(t => t.posType === "flex")
      .sort((a, b) => captainSortKey(a.player) - captainSortKey(b.player));

    // 5c: Place defenders on defense slots (C/A first → backpar 1)
    const defSlots = slots.filter(s => s.type === "defense");
    for (let i = 0; i < defSlots.length && i < defenders.length; i++) {
      lineup[defSlots[i].id] = defenders[i].player;
      placed.add(defenders[i].player.id);
    }

    // 5d: Place centers on center slots (C/A first → 1:a kedjan)
    const fwdSlots = slots.filter(s => s.type === "forward");
    const centerSlots = fwdSlots.filter(s => s.role === "c");
    const wingSlots = fwdSlots.filter(s => s.role === "lw" || s.role === "rw");

    for (let i = 0; i < centerSlots.length && i < centers.length; i++) {
      lineup[centerSlots[i].id] = centers[i].player;
      placed.add(centers[i].player.id);
    }

    // 5e: Place forwards on wing slots (C/A first → 1:a kedjan wings)
    for (let i = 0; i < wingSlots.length && i < forwards.length; i++) {
      lineup[wingSlots[i].id] = forwards[i].player;
      placed.add(forwards[i].player.id);
    }

    // 5f: Fill remaining empty slots with unplaced players
    // Priority: flex first (C/A flex first), then overflow from other positions
    const unplacedFlex = flexPlayers.filter(t => !placed.has(t.player.id));
    const unplacedForwards = forwards.filter(t => !placed.has(t.player.id));
    const unplacedCenters = centers.filter(t => !placed.has(t.player.id));
    const unplacedDefenders = defenders.filter(t => !placed.has(t.player.id));

    // Collect all unplaced, C/A first within each group
    const unplaced = [...unplacedFlex, ...unplacedForwards, ...unplacedCenters, ...unplacedDefenders];

    // Collect all empty non-GK slots
    const emptySlots = [
      ...wingSlots.filter(s => !lineup[s.id]),
      ...centerSlots.filter(s => !lineup[s.id]),
      ...defSlots.filter(s => !lineup[s.id]),
    ];

    for (let i = 0; i < emptySlots.length && i < unplaced.length; i++) {
      lineup[emptySlots[i].id] = unplaced[i].player;
      placed.add(unplaced[i].player.id);
    }
  }

  fillTeam(teamASlots, teamAGoalkeepers, teamAOutfield);
  fillTeam(teamBSlots, teamBGoalkeepers, teamBOutfield);

  // Remaining: players that didn't get placed (excess goalkeepers, etc.)
  const remaining = registered.filter(p => !placed.has(p.id));

  return { lineup, remaining, teamAConfig, teamBConfig };
}
