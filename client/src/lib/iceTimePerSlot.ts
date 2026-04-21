/**
 * iceTimePerSlot – Calculate estimated ice time per slot in a team lineup.
 *
 * Rules (60 min match):
 * - Goalkeepers: 60 / number_of_goalkeepers
 * - Defenders: Always 2 on ice → (2 / total_defenders) × 60
 * - Forwards/Centers:
 *   - 3 on ice (1C + 2W)
 *   - If total forwards+centers < 6 → all in one pool: (3 / total) × 60
 *   - If total forwards+centers >= 6 → centers share 1 slot, forwards share 2 slots
 * - If fewer than 5 outfield players → everyone plays 60 min (no rotation)
 */

import type { Slot, TeamConfig } from "./lineup";
import type { Player } from "./players";

export interface SlotIceTime {
  slotId: string;
  minutes: number; // estimated minutes (rounded to nearest integer)
}

export function calculateSlotIceTimes(
  slots: Slot[],
  lineup: Record<string, Player>,
  config: TeamConfig,
  matchTime: number = 60,
): Map<string, number> {
  const result = new Map<string, number>();

  // Count filled slots by type
  const gkSlots = slots.filter(s => s.type === "goalkeeper");
  const defSlots = slots.filter(s => s.type === "defense");
  const fwdSlots = slots.filter(s => s.type === "forward");

  const filledGk = gkSlots.filter(s => lineup[s.id]);
  const filledDef = defSlots.filter(s => lineup[s.id]);
  const filledFwd = fwdSlots.filter(s => lineup[s.id]);

  const filledCenters = fwdSlots.filter(s => s.role === "c" && lineup[s.id]);
  const filledWings = fwdSlots.filter(s => (s.role === "lw" || s.role === "rw") && lineup[s.id]);

  const totalDef = filledDef.length;
  const totalCenters = filledCenters.length;
  const totalWings = filledWings.length;
  const totalFwdPool = totalCenters + totalWings;
  const totalOutfield = totalDef + totalFwdPool;

  // Goalkeeper ice time
  const gkTime = filledGk.length > 0 ? matchTime / filledGk.length : matchTime;
  for (const slot of gkSlots) {
    if (lineup[slot.id]) {
      result.set(slot.id, Math.round(gkTime));
    }
  }

  // If fewer than 5 outfield players, everyone plays full time
  if (totalOutfield < 5) {
    for (const slot of [...defSlots, ...fwdSlots]) {
      if (lineup[slot.id]) {
        result.set(slot.id, matchTime);
      }
    }
    return result;
  }

  // Defender ice time: 2 on ice at all times
  const defTime = totalDef > 0 ? (2 / totalDef) * matchTime : 0;
  for (const slot of defSlots) {
    if (lineup[slot.id]) {
      result.set(slot.id, Math.round(defTime));
    }
  }

  // Forward/Center ice time
  if (totalFwdPool < 6) {
    // All forwards and centers in one pool sharing 3 ice slots
    const poolTime = totalFwdPool > 0 ? (3 / totalFwdPool) * matchTime : 0;
    for (const slot of fwdSlots) {
      if (lineup[slot.id]) {
        result.set(slot.id, Math.round(poolTime));
      }
    }
  } else {
    // Centers share 1 ice slot, wings/forwards share 2 ice slots
    const centerTime = totalCenters > 0 ? (1 / totalCenters) * matchTime : 0;
    const wingTime = totalWings > 0 ? (2 / totalWings) * matchTime : 0;

    for (const slot of filledCenters) {
      result.set(slot.id, Math.round(centerTime));
    }
    for (const slot of filledWings) {
      result.set(slot.id, Math.round(wingTime));
    }
  }

  return result;
}

/**
 * Generate a human-readable summary of ice time rotation for a team.
 * Returns null if no outfield players are filled.
 */
export function generateIceTimeSummary(
  slots: Slot[],
  lineup: Record<string, Player>,
  config: TeamConfig,
  matchTime: number = 60,
): string | null {
  const defSlots = slots.filter(s => s.type === "defense");
  const fwdSlots = slots.filter(s => s.type === "forward");

  const filledDef = defSlots.filter(s => lineup[s.id]);
  const filledCenters = fwdSlots.filter(s => s.role === "c" && lineup[s.id]);
  const filledWings = fwdSlots.filter(s => (s.role === "lw" || s.role === "rw") && lineup[s.id]);

  const totalDef = filledDef.length;
  const totalCenters = filledCenters.length;
  const totalWings = filledWings.length;
  const totalFwdPool = totalCenters + totalWings;
  const totalOutfield = totalDef + totalFwdPool;

  if (totalOutfield === 0) return null;

  // Fewer than 5 outfield players — everyone plays full time
  if (totalOutfield < 5) {
    return `Idag ${totalOutfield} utespelare \u2014 alla spelar hela matchen. K\u00c4MPA!`;
  }

  // Forward/Center pool logic
  if (totalFwdPool < 6) {
    // All in one pool
    const poolTime = totalFwdPool > 0 ? Math.round((3 / totalFwdPool) * matchTime) : 0;
    return `Idag ${totalFwdPool} forwards/centrar byter med varandra \u2014 ${poolTime} min speltid var`;
  }

  // Split pools: centers vs wings
  const centerTime = totalCenters > 0 ? Math.round((1 / totalCenters) * matchTime) : 0;
  const wingTime = totalWings > 0 ? Math.round((2 / totalWings) * matchTime) : 0;

  // Check if even rotation is possible (centers and wings divide evenly per line)
  const numLines = config.forwardLines;
  const evenCenters = totalCenters % numLines === 0;
  const evenWings = totalWings % (numLines * 2) === 0;
  const isEvenRotation = evenCenters && evenWings;

  if (isEvenRotation) {
    return `Idag ${totalWings} forwards (${wingTime} min) och ${totalCenters} centrar (${centerTime} min). C byter med C, F med sin F p\u00e5 sin sida`;
  }

  return `Idag ${totalWings} forwards (${wingTime} min) och ${totalCenters} centrar (${centerTime} min). C byter med C, F med F p\u00e5 b\u00e5da sidorna`;
}
