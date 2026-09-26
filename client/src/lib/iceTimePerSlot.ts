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
import { calculateDistributions } from "@/hooks/useIceTimeCalculator";

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
 * Sammanfattning av speltiden för ett lag, en rad per grupp.
 *
 * Speltid = matchtid × (platser på isen för gruppen ÷ antal spelare i gruppen).
 * Backar: 2 på isen. Centrar: 1. Forwards: 2. Färre än 6 forwards+centrar:
 * alla 5 byter med varandra om 3 platser. Färre än 5 utespelare: alla spelar hela
 * matchen. Blir tiderna ojämna föreslås en jämnare fördelning.
 */
export function generateIceTimeSummary(
  slots: Slot[],
  lineup: Record<string, Player>,
  config: TeamConfig,
  matchTime: number = 60,
): string[] | null {
  const defSlots = slots.filter(s => s.type === "defense");
  const fwdSlots = slots.filter(s => s.type === "forward");

  const totalDef = defSlots.filter(s => lineup[s.id]).length;
  const totalCenters = fwdSlots.filter(s => s.role === "c" && lineup[s.id]).length;
  const totalWings = fwdSlots.filter(s => (s.role === "lw" || s.role === "rw") && lineup[s.id]).length;
  const totalFwdPool = totalCenters + totalWings;
  const totalOutfield = totalDef + totalFwdPool;

  if (totalOutfield === 0) return null;
  if (totalOutfield < 5) {
    return [`${totalOutfield} utespelare – alla spelar hela matchen. KÄMPA!`];
  }

  const lines: string[] = [];
  const times: number[] = [];
  const min = (v: number) => Math.round(v);

  if (totalDef > 0) {
    const t = (2 / totalDef) * matchTime;
    times.push(t);
    lines.push(`Backar: ${totalDef} st · ${min(t)} min var`);
  }

  if (totalFwdPool > 0 && totalFwdPool < 6) {
    const t = (3 / totalFwdPool) * matchTime;
    times.push(t);
    lines.push(`Forwards/centrar: ${totalFwdPool} st byter med varandra · ${min(t)} min var`);
  } else if (totalFwdPool >= 6) {
    const c = totalCenters > 0 ? (1 / totalCenters) * matchTime : 0;
    const w = totalWings > 0 ? (2 / totalWings) * matchTime : 0;
    if (totalCenters) times.push(c);
    if (totalWings) times.push(w);
    const sameSide = totalCenters % config.forwardLines === 0 && totalWings % (config.forwardLines * 2) === 0;
    lines.push(`Centrar: ${totalCenters} st · ${min(c)} min var`);
    lines.push(`Forwards: ${totalWings} st · ${min(w)} min var (${sameSide ? "byter på sin sida" : "byter på båda sidor"})`);
  }

  // Ojämn speltid? Föreslå fördelningen som ger jämnast tid (samma som IceTime).
  const spread = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  if (spread >= 4) {
    const best = calculateDistributions(totalOutfield, matchTime).best;
    if (best && best.maxDifference < spread - 2 &&
        (best.backs !== totalDef || best.centers !== totalCenters || best.forwards !== totalWings)) {
      lines.push(`Jämnare speltid: ${best.backs} backar, ${best.centers} centrar, ${best.forwards} forwards (≈${min(Math.min(best.timePerBack, best.timePerCenter, best.timePerForward))}–${min(Math.max(best.timePerBack, best.timePerCenter, best.timePerForward))} min)`);
    }
  }

  return lines;
}
