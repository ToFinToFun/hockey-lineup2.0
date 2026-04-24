// Auto-fördela v5: Smart placement med mostPlayedPosition
//
// AUTO-läge (shuffle=false):
// 1. Favoritposition – MV→MV, B→B, C→C, F→F, IB→resten
// 2. mostPlayedPosition – Om en slot saknar spelare, leta efter spelare
//    vars mostPlayedPosition matchar (t.ex. F med mostPlayed=C → C-slot)
// 3. Lagfärg – white→team-a, green→team-b (alla med lagfärg låses)
// 4. Kapten/Assisterande – C/A prioriteras till första kedjan/backparet
// 5. Jämna lag – lika många spelare per lag (±1)
//
// SLUMPA-läge (shuffle=true):
// Samma smarta positionsplacering som Auto, MEN:
// - Lagfärg ignoreras — alla spelare behandlas som neutrala
// - UNDANTAG: Kapten (C) och Assisterande (A) med lagfärg är låsta till sitt lag
// - Alla neutrala spelare shufflas med Fisher-Yates innan lagfördelning
// - Inom varje lag shufflas positionsgrupperna för slotplacering
// - Resultat: två jämna lag med rätt positioner, men spelarna blandas fritt

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

/** Is this player a captain (C or A) with a team color? */
function isLockedCaptain(p: Player): boolean {
  return !!(p.captainRole && (p.captainRole === "C" || p.captainRole === "A") && p.teamColor);
}

interface TaggedPlayer {
  player: Player;
  posType: PosType;
}

export function autoDistribute(
  allPlayers: Player[],
  _existingLineup: Record<string, Player>,
  options?: { shuffle?: boolean; useForBalance?: boolean },
): DistributeResult {
  const doShuffle = options?.shuffle ?? false;
  const usePirForBalance = options?.useForBalance ?? true;

  // ── Step 1: Collect registered players ──
  const playersInLineup = new Set(Object.values(_existingLineup).map(p => p.id));
  const registered = allPlayers.filter(p => p.isRegistered && !playersInLineup.has(p.id));

  const tagged: TaggedPlayer[] = registered.map(p => ({ player: p, posType: categorize(p) }));

  // ── Step 2: Separate goalkeepers ──
  // Categorize goalkeepers:
  //   "pure" = never played outfield (no mostPlayedPosition or mostPlayedPosition === "MV")
  //   "versatile" = has played outfield (mostPlayedPosition !== "MV")
  // Priority: pure MV MUST be goalkeeper (can't play outfield).
  //           versatile MV can be placed as outfield if not needed as GK.
  const goalkeepers = tagged.filter(t => t.posType === "goalkeeper");
  const outfield = tagged.filter(t => t.posType !== "goalkeeper");

  const isVersatileGk = (t: TaggedPlayer) =>
    !!(t.player.mostPlayedPosition && t.player.mostPlayedPosition !== "MV");

  const pureGk = goalkeepers.filter(t => !isVersatileGk(t));
  const versatileGk = goalkeepers.filter(t => isVersatileGk(t));

  // In shuffle mode: only C/A captains are locked to their team color
  // In auto mode: all players with team color are locked
  const isGkLocked = (t: TaggedPlayer, color: "white" | "green") => {
    if (doShuffle) {
      return t.player.teamColor === color && isLockedCaptain(t.player);
    }
    return t.player.teamColor === color;
  };

  const isGkNeutral = (t: TaggedPlayer) => {
    if (doShuffle) {
      return !isLockedCaptain(t.player);
    }
    return !t.player.teamColor;
  };

  // Build team goalkeeper lists — prioritize pure GK over versatile
  // Step 2a: Place locked goalkeepers first (prefer pure over versatile)
  const sortByPureGk = (arr: TaggedPlayer[]) => [...arr].sort((a, b) => {
    const aVersatile = isVersatileGk(a);
    const bVersatile = isVersatileGk(b);
    if (!aVersatile && bVersatile) return -1; // pure first
    if (aVersatile && !bVersatile) return 1;
    return 0;
  });

  const gkWhiteLocked = sortByPureGk(goalkeepers.filter(t => isGkLocked(t, "white")));
  const gkGreenLocked = sortByPureGk(goalkeepers.filter(t => isGkLocked(t, "green")));
  const gkNeutralAll = goalkeepers.filter(t => isGkNeutral(t));

  // Start with max 1 locked GK per team
  const teamAGoalkeepers: TaggedPlayer[] = gkWhiteLocked.slice(0, 1);
  const teamBGoalkeepers: TaggedPlayer[] = gkGreenLocked.slice(0, 1);

  // Step 2b: Sort neutral GKs — pure first so they get GK spots
  // In shuffle mode: shuffle within pure and versatile groups separately,
  // but always try pure GKs first
  const neutralPure = gkNeutralAll.filter(t => !isVersatileGk(t));
  const neutralVersatile = gkNeutralAll.filter(t => isVersatileGk(t));
  const sortedGkNeutral = doShuffle
    ? [...shuffleArray(neutralPure), ...shuffleArray(neutralVersatile)]
    : [...neutralPure, ...neutralVersatile];

  // Distribute neutral goalkeepers: max 1 per team
  for (const gk of sortedGkNeutral) {
    if (teamAGoalkeepers.length <= teamBGoalkeepers.length && teamAGoalkeepers.length < 1) {
      teamAGoalkeepers.push(gk);
    } else if (teamBGoalkeepers.length < 1) {
      teamBGoalkeepers.push(gk);
    }
  }

  // Step 2c: Handle excess goalkeepers
  const allAssignedGk = new Set([
    ...teamAGoalkeepers.map(t => t.player.id),
    ...teamBGoalkeepers.map(t => t.player.id),
  ]);
  const excessGk = goalkeepers.filter(t => !allAssignedGk.has(t.player.id));

  // Versatile excess GKs → re-categorize as outfield players
  const gkToOutfield: TaggedPlayer[] = [];
  // Pure excess GKs → place as reserve goalkeeper (2nd GK slot)
  const gkToReserve: TaggedPlayer[] = [];

  for (const gk of excessGk) {
    if (isVersatileGk(gk)) {
      const mpp = gk.player.mostPlayedPosition!;
      let newPosType: PosType = "flex";
      if (mpp === "B") newPosType = "defense";
      else if (mpp === "C") newPosType = "center";
      else if (mpp === "F" || mpp === "LW" || mpp === "RW") newPosType = "forward";
      gkToOutfield.push({ player: gk.player, posType: newPosType });
    } else {
      // Pure GK with no outfield experience → try to place as reserve MV
      gkToReserve.push(gk);
    }
  }

  // Distribute reserve GKs: add as 2nd goalkeeper to teams that only have 1
  const reserveOrder = doShuffle ? shuffleArray(gkToReserve) : [...gkToReserve];
  for (const gk of reserveOrder) {
    // Prefer the team with fewer goalkeepers
    if (teamAGoalkeepers.length <= teamBGoalkeepers.length && teamAGoalkeepers.length < 2) {
      teamAGoalkeepers.push(gk);
      allAssignedGk.add(gk.player.id);
    } else if (teamBGoalkeepers.length < 2) {
      teamBGoalkeepers.push(gk);
      allAssignedGk.add(gk.player.id);
    }
    // If both teams already have 2 GKs, this pure GK stays unplaced → remaining
  }

  // ── Step 3: Distribute outfield players to teams ──
  const allOutfield = [...outfield, ...gkToOutfield];

  // In shuffle mode: only C/A captains are locked, everyone else is neutral
  // In auto mode: all players with team color are locked
  const isOfLocked = (t: TaggedPlayer, color: "white" | "green") => {
    if (doShuffle) {
      return t.player.teamColor === color && isLockedCaptain(t.player);
    }
    return t.player.teamColor === color;
  };

  const isOfNeutral = (t: TaggedPlayer) => {
    if (doShuffle) {
      return !isLockedCaptain(t.player);
    }
    return !t.player.teamColor;
  };

  const ofWhite = allOutfield.filter(t => isOfLocked(t, "white"));
  const ofGreen = allOutfield.filter(t => isOfLocked(t, "green"));
  const ofNeutral = allOutfield.filter(t => isOfNeutral(t));

  // Shuffle neutrals before distributing to teams
  const neutralsToDistribute = doShuffle ? shuffleArray(ofNeutral) : [...ofNeutral];

  const teamAOutfield: TaggedPlayer[] = [...ofWhite];
  const teamBOutfield: TaggedPlayer[] = [...ofGreen];

  // Helper: get role-aware PIR for a player (goalkeeper PIR for MV, outfield PIR for others, fallback to overall)
  const getEffectivePir = (t: TaggedPlayer): number => {
    const p = t.player;
    if (t.posType === 'goalkeeper' && p.pirGoalkeeper != null) return p.pirGoalkeeper;
    if (t.posType !== 'goalkeeper' && p.pirOutfield != null) return p.pirOutfield;
    return p.pir ?? 1000;
  };

  // Helper: sum of PIR for a team (using role-aware PIR)
  const teamPirSum = (team: TaggedPlayer[]) =>
    team.reduce((sum, t) => sum + getEffectivePir(t), 0);

  // Check if any neutral has PIR data — if so, use PIR-balanced distribution
  const hasPirData = usePirForBalance && neutralsToDistribute.some(t => t.player.pir != null || t.player.pirOutfield != null);

  if (hasPirData) {
    // Sort neutrals by PIR descending (strongest first) for greedy balancing
    const sorted = [...neutralsToDistribute].sort((a, b) => getEffectivePir(b) - getEffectivePir(a));
    for (const np of sorted) {
      const sumA = teamPirSum(teamAOutfield);
      const sumB = teamPirSum(teamBOutfield);
      // Assign to the team with lower total PIR, but also keep count balanced (max ±1)
      const countDiff = teamAOutfield.length - teamBOutfield.length;
      if (countDiff > 1) {
        teamBOutfield.push(np);
      } else if (countDiff < -1) {
        teamAOutfield.push(np);
      } else if (sumA <= sumB) {
        teamAOutfield.push(np);
      } else {
        teamBOutfield.push(np);
      }
    }
  } else {
    // Fallback: simple count-based distribution
    for (const np of neutralsToDistribute) {
      if (teamAOutfield.length <= teamBOutfield.length) {
        teamAOutfield.push(np);
      } else {
        teamBOutfield.push(np);
      }
    }
  }

  // Rebalance if teams are very unbalanced (count-wise)
  // When PIR data exists, also try to balance PIR sum by swapping movable players
  const rebalance = (bigger: TaggedPlayer[], smaller: TaggedPlayer[]) => {
    while (bigger.length - smaller.length > 1) {
      const canMove = (t: TaggedPlayer) => {
        if (doShuffle) return !isLockedCaptain(t.player);
        return !t.player.teamColor && !t.player.captainRole;
      };
      const canMoveFallback = (t: TaggedPlayer) => {
        if (doShuffle) return !isLockedCaptain(t.player);
        return !t.player.teamColor;
      };

      // If PIR data exists, pick the movable player that best balances PIR
      if (hasPirData) {
        const movable = bigger
          .map((t, i) => ({ t, i, canMove: canMove(t) || canMoveFallback(t) }))
          .filter(x => x.canMove);
        if (movable.length === 0) break;

        const targetDiff = 0; // ideal PIR difference
        let bestIdx = movable[0].i;
        let bestScore = Infinity;
        for (const m of movable) {
          const newBigSum = teamPirSum(bigger) - getEffectivePir(m.t);
          const newSmallSum = teamPirSum(smaller) + getEffectivePir(m.t);
          const score = Math.abs(newBigSum - newSmallSum - targetDiff);
          if (score < bestScore) {
            bestScore = score;
            bestIdx = m.i;
          }
        }
        smaller.push(bigger.splice(bestIdx, 1)[0]);
      } else {
        const idx = bigger.findIndex(canMove);
        if (idx === -1) {
          const idx2 = bigger.findIndex(canMoveFallback);
          if (idx2 === -1) break;
          smaller.push(bigger.splice(idx2, 1)[0]);
        } else {
          smaller.push(bigger.splice(idx, 1)[0]);
        }
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
      // result.best.forwards = only wings (2 ice slots)
      // result.best.centers = centers (1 ice slot)
      // forwardLines must accommodate BOTH centers and wings
      // Each forward line has 3 slots: 1 center + 2 wings
      const totalForwardLinePlayers = result.best.centers + result.best.forwards;
      return {
        goalkeepers: Math.min(gkCount, 1),
        defensePairs: Math.max(1, Math.ceil(result.best.backs / 2)),
        forwardLines: Math.max(1, Math.ceil(totalForwardLinePlayers / 3)),
      };
    }

    // Fallback: use 40% for defense, 60% for forwards
    const defCount = Math.round(count * 0.4);
    const fwdCount = count - defCount;
    return {
      goalkeepers: Math.min(gkCount, 1),
      defensePairs: Math.max(1, Math.ceil(defCount / 2)),
      forwardLines: Math.max(1, Math.ceil(fwdCount / 3)),
    };
  }

  const teamAConfig = getOptimalConfig(teamAOutfield, teamAGoalkeepers.length);
  const teamBConfig = getOptimalConfig(teamBOutfield, teamBGoalkeepers.length);

  // ── Step 5: Create slots and place players ──
  const teamASlots = createTeamSlots("team-a", teamAConfig);
  const teamBSlots = createTeamSlots("team-b", teamBConfig);

  const lineup: Record<string, Player> = {};
  const placed = new Set<string>();

  function fillTeam(slots: Slot[], goalkeepers: TaggedPlayer[], outfield: TaggedPlayer[]) {
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

  fillTeam(teamASlots, teamAGoalkeepers, teamAOutfield);
  fillTeam(teamBSlots, teamBGoalkeepers, teamBOutfield);

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
