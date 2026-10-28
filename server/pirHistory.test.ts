import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { pirHistoryAll } from "./pirHistory";

function mk(i: number, white: Record<string, string>, green: Record<string, string>, ws: number, gs: number): MatchResult {
  const lineup: Record<string, { id: string; name: string }> = {};
  for (const [slot, id] of Object.entries(white)) lineup[`team-a-${slot}`] = { id, name: id };
  for (const [slot, id] of Object.entries(green)) lineup[`team-b-${slot}`] = { id, name: id };
  const date = new Date(2026, 8, 1 + i * 7);
  return {
    id: i + 1, name: `M${i}`, teamWhiteScore: ws, teamGreenScore: gs, goalHistory: [],
    lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup },
    matchStartTime: date, matchEndTime: date, createdAt: date, editedAt: null, reviewStatus: "approved", reviewedAt: null,
  } as unknown as MatchResult;
}

describe("PIR över tid", () => {
  it("en punkt per match i rätt roll, preliminär före tredje matchen", async () => {
    const ms: MatchResult[] = [];
    for (let i = 0; i < 6; i++) {
      const gk = i === 4; // X står i mål en gång
      const white = gk ? { "gk-1": "X", "fwd-1-c": "A" } : { "gk-1": "G1", "fwd-1-c": "X" };
      ms.push(mk(i, white, { "gk-1": "G2", "fwd-1-c": "B" }, 3, 1));
    }
    const h = (await pirHistoryAll(ms)).get("X")!;
    expect(h.outfield).toHaveLength(5);
    expect(h.goalkeeper).toHaveLength(1);
    expect(h.outfield.map((p) => p.provisional)).toEqual([true, true, false, false, false]);
    expect(h.outfield.every((p) => p.result === "V" && p.score[0] === 3)).toBe(true);
    // Vinst varje match: betyget stiger
    expect(h.outfield[4].rating).toBeGreaterThan(h.outfield[0].rating);
    // Datumordning
    expect([...h.outfield].sort((a, b) => a.date.localeCompare(b.date))).toEqual(h.outfield);
  });
});
