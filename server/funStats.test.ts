import { describe, expect, it } from "vitest";
import { computeFunStats } from "./funStats";

const reg = new Map([["a", "Anna"], ["b", "Bo"], ["c", "Cia"]]);
const lineup = { lineup: { "team-a-fwd-1-c": { id: "a", name: "Anna" }, "team-a-fwd-1-lw": { id: "b", name: "Bo" }, "team-b-fwd-1-c": { id: "c", name: "Cia" } } };
const m = (id: number, day: number, goals: Array<[string, string?, string?]>) => ({
  id, name: `M${id}`, lineup, plannedMinutes: 60,
  matchStartTime: new Date(2026, 9, day, 20, 0).toISOString(),
  // I tidsordning här, sparas som i appen: det senaste målet först
  goalHistory: goals.map(([scorer, ts, assist]) => ({ team: "white", scorer, assist, timestamp: ts ?? "20:10:00" })).reverse(),
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

import { computeGoalieFun } from "./funStats";
describe("sviter: målvakter för sig", () => {
  const reg2 = new Map([["a", "Anna"], ["g", "Gun"], ["h", "Hans"]]);
  const lu = (gkWhite: string) => ({ teamAName: "Vita", lineup: { "team-a-gk-1": { id: gkWhite }, ...(gkWhite === "a" ? { "team-a-fwd-1-c": { id: "g" } } : { "team-a-fwd-1-c": { id: "a" } }), "team-b-gk-1": { id: "h" } } });
  const mm = (id: number, day: number, gkWhite: string, w: number, g: number) => ({
    id, name: `M${id}`, lineup: lu(gkWhite), matchStartTime: new Date(2026, 9, day, 20, 0).toISOString(),
    goalHistory: [...Array(w).fill({ team: "white" }), ...Array(g).fill({ team: "green" })],
  });
  it("utespelarnas sviter räknar inte matcher i mål; pågående svit utan poäng", () => {
    const rows = computeFunStats([mm(1, 1, "g", 1, 0), mm(2, 2, "a", 0, 0), mm(3, 3, "g", 0, 2)], reg2);
    const anna = rows.find((r) => r.id === "a")!;
    expect(anna.matches).toBe(2); // match 2 stod Anna i mål
    expect(anna.currentPointless).toBe(2);
    expect(rows.find((r) => r.id === "g")!.matches).toBe(1); // Gun spelade ute i match 2
  });
  it("målvakter: matcher i rad med högst 1/2/3 insläppta och vinster i rad", () => {
    const rows = computeGoalieFun([mm(1, 1, "g", 3, 1), mm(2, 2, "g", 2, 2), mm(3, 3, "g", 4, 3), mm(4, 4, "g", 1, 0)], reg2);
    const gun = rows.find((r) => r.id === "g")!;
    expect(gun).toMatchObject({ gkMatches: 4, max1: 1, max2: 2, max3: 4, current2: 1, winStreak: 2, currentWins: 2 });
    const hans = rows.find((r) => r.id === "h")!;
    expect(hans).toMatchObject({ gkMatches: 4, winStreak: 0 });
  });
});
