import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { seasonHistory, seasonOf, setSeasonStart } from "./playerHistory";

const match = (date: string, white: number, green: number, lineup: Record<string, { id: string }>, goals: object[] = []) =>
  ({
    id: 1, name: "M", teamWhiteScore: white, teamGreenScore: green, goalHistory: goals,
    lineup: { teamAName: "VITA", lineup }, matchEndTime: new Date(date), matchStartTime: null, createdAt: new Date(date),
    reviewStatus: "approved",
  }) as unknown as MatchResult;

describe("historik per säsong", () => {

  it("räknar matcher, positioner, lag, resultat, mål och assist per säsong", () => {
    const h = seasonHistory([
      match("2026-09-10", 3, 1, { "team-a-gk-1": { id: "a" }, "team-b-def-1-1": { id: "b" }, "team-a-fwd-1-c": { id: "c" } },
        [{ team: "white", scorerId: "c", assistId: "a" }, { team: "white", scorerId: "c", other: "Självmål" }]),
      match("2026-10-01", 2, 2, { "team-a-fwd-1-lw": { id: "a" }, "team-b-fwd-1-c": { id: "c" } }),
      match("2026-03-01", 0, 1, { "team-a-def-1-2": { id: "a" } }),
    ]);
    const a = h.get("a")!;
    expect(a.map((l) => l.season)).toEqual(["2026/27", "2025/26"]);
    expect(a[0]).toMatchObject({ matches: 2, wins: 1, draws: 1, losses: 0, assists: 1, positions: { MV: 1, B: 0, C: 0, LW: 1, RW: 0 }, teams: { white: 2, green: 0 } });
    expect(a[1]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
    expect(h.get("c")![0]).toMatchObject({ matches: 2, goals: 1, positions: { C: 2 }, teams: { white: 1, green: 1 } });
    expect(h.get("b")![0]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
  });
});

describe("hockeyåret följer försäsongens start (Inställningar → Perioder)", () => {
  it("standard 1 september, svensk tid", () => {
    setSeasonStart("09-01");
    expect(seasonOf(new Date("2026-08-31T12:00:00Z"))).toBe("2025/26");
    expect(seasonOf(new Date("2026-08-31T22:30:00Z"))).toBe("2026/27"); // 00:30 1 sep i Sverige
    expect(seasonOf(new Date("2027-05-01T12:00:00Z"))).toBe("2026/27"); // slutspelet hör till samma år
  });
  it("annan start ger andra gränser – och lagen räknas per hockeyår", () => {
    setSeasonStart("08-15");
    expect(seasonOf(new Date("2026-08-14T12:00:00Z"))).toBe("2025/26");
    expect(seasonOf(new Date("2026-08-15T12:00:00Z"))).toBe("2026/27");
    const h = seasonHistory([
      match("2026-08-20T19:00:00Z", 1, 0, { "team-a-fwd-1-c": { id: "p" } }),
      match("2026-11-12T19:00:00Z", 1, 0, { "team-b-fwd-1-c": { id: "p" } }),
      match("2027-04-20T19:00:00Z", 1, 0, { "team-b-def-1-1": { id: "p" } }),
    ]).get("p")!;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ season: "2026/27", matches: 3, teams: { white: 1, green: 2 } });
    setSeasonStart("09-01");
  });
});
