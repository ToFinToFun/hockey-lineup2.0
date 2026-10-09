import { describe, it, expect } from "vitest";
import { autoDistribute } from "./autoDistribute";
import type { Player } from "./players";

/** Enkel fast slump så att fallen går att återskapa */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const POS = ["MV", "B", "C", "F", "IB"] as const;
const MPP = [undefined, "B", "C", "F", "LW", "RW", "MV"];

function roster(seed: number): Player[] {
  const r = rng(seed);
  const n = 6 + Math.floor(r() * 30); // 6–35 anmälda
  return Array.from({ length: n }, (_, i) => {
    const pos = r() < 0.08 ? "MV" : POS[1 + Math.floor(r() * 4)];
    return {
      id: `p${seed}-${i}`, number: "", name: `P${i}`, position: pos as Player["position"], isRegistered: true,
      teamColor: r() < 0.3 ? "white" : r() < 0.43 ? "green" : undefined,
      captainRole: r() < 0.05 ? "C" : r() < 0.05 ? "A" : undefined,
      mostPlayedPosition: MPP[Math.floor(r() * MPP.length)],
      altPosition: r() < 0.1 ? ["B", "C", "F"][Math.floor(r() * 3)] : null,
    } as Player;
  });
}

describe("Auto: alla anmälda placeras ut", () => {
  it("ingen anmäld spelare blir kvar utanför när lagen har plats (1 000 slumpade trupper)", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const players = roster(seed);
      for (const shuffle of [false, true]) {
        const res = autoDistribute(players, {}, { shuffle });
        const inLineup = new Set(Object.values(res.lineup).map((p) => p.id));
        const missing = players.filter((p) => !inLineup.has(p.id));
        // Max: 2 målvakter + 8 backar + 12 forwards per lag
        if (missing.length && players.length <= 44) failures.push(`seed ${seed}${shuffle ? " (slumpa)" : ""}: ${players.length} anmälda, ${missing.length} saknas (${missing.map((p) => p.position).join(",")})`);
        // "Kvar" ska stämma med vilka som faktiskt saknas
        expect(res.remaining.map((p) => p.id).sort()).toEqual(missing.map((p) => p.id).sort());
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});
