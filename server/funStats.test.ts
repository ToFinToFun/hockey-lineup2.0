import { describe, expect, it } from "vitest";
import { computeFunStats } from "./funStats";

const reg = new Map([["a", "Anna"], ["b", "Bo"], ["c", "Cia"]]);
const lineup = { lineup: { "team-a-fwd-1-c": { id: "a", name: "Anna" }, "team-a-fwd-1-lw": { id: "b", name: "Bo" }, "team-b-fwd-1-c": { id: "c", name: "Cia" } } };
const m = (id: number, day: number, goals: Array<[string, string?, string?]>) => ({
  id, name: `M${id}`, lineup, plannedMinutes: 60,
  matchStartTime: new Date(2026, 9, day, 20, 0).toISOString(),
  goalHistory: goals.map(([scorer, ts, assist]) => ({ team: "white", scorer, assist, timestamp: ts ?? "20:10:00" })),
});

describe("rolig statistik", () => {
  it("första/sista/sena mål, måltorka och matcher utan poäng", () => {
    const rows = computeFunStats([
      m(1, 1, [["Anna", "20:05:00"], ["Bo", "20:55:00", "Anna"]]),
      m(2, 2, [["Anna", "20:03:00"]]),
      m(3, 3, [["Cia", "20:20:00"]]),
    ], reg);
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get("a")).toMatchObject({ matches: 3, firstGoals: 2, lastGoals: 1, longestDrought: 1, currentDrought: 1, pointless: 1 });
    expect(by.get("b")).toMatchObject({ lastGoals: 1, lateGoals: 1, longestDrought: 2, currentDrought: 2, pointless: 2, longestPointless: 2 });
    expect(by.get("c")).toMatchObject({ firstGoals: 1, longestDrought: 2, currentDrought: 0 });
  });
});
