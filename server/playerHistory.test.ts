import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { seasonHistory, seasonOf } from "./playerHistory";

const match = (date: string, white: number, green: number, lineup: Record<string, { id: string }>, goals: object[] = []) =>
  ({
    id: 1, name: "M", teamWhiteScore: white, teamGreenScore: green, goalHistory: goals,
    lineup: { teamAName: "VITA", lineup }, matchEndTime: new Date(date), matchStartTime: null, createdAt: new Date(date),
    reviewStatus: "approved",
  }) as unknown as MatchResult;

describe("historik per säsong", () => {
  it("säsongen börjar 1 augusti", () => {
    expect(seasonOf(new Date("2026-07-31"))).toBe("2025/26");
    expect(seasonOf(new Date("2026-08-01"))).toBe("2026/27");
  });

  it("räknar matcher, positioner, lag, resultat, mål och assist per säsong", () => {
    const h = seasonHistory([
      match("2026-09-10", 3, 1, { "team-a-gk-1": { id: "a" }, "team-b-def-1-1": { id: "b" }, "team-a-fwd-1-c": { id: "c" } },
        [{ team: "white", scorerId: "c", assistId: "a" }, { team: "white", scorerId: "c", other: "Självmål" }]),
      match("2026-10-01", 2, 2, { "team-a-fwd-1-lw": { id: "a" }, "team-b-fwd-1-c": { id: "c" } }),
      match("2026-03-01", 0, 1, { "team-a-def-1-2": { id: "a" } }),
    ]);
    const a = h.get("a")!;
    expect(a.map((l) => l.season)).toEqual(["2026/27", "2025/26"]);
    expect(a[0]).toMatchObject({ matches: 2, wins: 1, draws: 1, losses: 0, assists: 1, positions: { MV: 1, B: 0, C: 0, F: 1 }, teams: { white: 2, green: 0 } });
    expect(a[1]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
    expect(h.get("c")![0]).toMatchObject({ matches: 2, goals: 1, positions: { C: 2 }, teams: { white: 1, green: 1 } });
    expect(h.get("b")![0]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
  });
});
