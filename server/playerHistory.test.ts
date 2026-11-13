import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { seasonHistory, seasonOf, teamCountsBetween } from "./playerHistory";

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
    expect(a[0]).toMatchObject({ matches: 2, wins: 1, draws: 1, losses: 0, assists: 1, positions: { MV: 1, B: 0, C: 0, LW: 1, RW: 0 }, teams: { white: 2, green: 0 } });
    expect(a[1]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
    expect(h.get("c")![0]).toMatchObject({ matches: 2, goals: 1, positions: { C: 2 }, teams: { white: 1, green: 1 } });
    expect(h.get("b")![0]).toMatchObject({ matches: 1, losses: 1, positions: { B: 1 } });
  });
});

describe("matcher per lag under hockeyåret", () => {
  const ids = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { id: v }]));
  it("räknar Vita och Gröna mellan försäsongens start och slutspelets slut (båda dagarna med)", () => {
    const ms = [
      match("2026-08-31T19:00:00Z", 1, 0, ids({ "team-a-fwd-1-c": "p1" })), // före försäsongen
      match("2026-09-01T19:00:00Z", 2, 1, ids({ "team-a-fwd-1-c": "p1", "team-b-def-1-1": "p2" })), // första dagen
      match("2026-11-12T20:00:00Z", 1, 3, ids({ "team-b-fwd-1-c": "p1", "team-a-gk-1": "p2" })),
      match("2027-05-01T18:00:00Z", 0, 0, ids({ "team-b-fwd-1-c": "p1" })), // sista dagen
      match("2027-05-02T18:00:00Z", 0, 0, ids({ "team-a-fwd-1-c": "p1" })), // efter slutspelet
    ];
    const t = teamCountsBetween(ms, "2026-09-01", "2027-05-01");
    expect(t.get("p1")).toEqual({ white: 1, green: 2 });
    expect(t.get("p2")).toEqual({ white: 1, green: 1 });
    expect(t.get("p3")).toBeUndefined();
  });
  it("lag A är Gröna när matchen sparats så", () => {
    const m = match("2026-10-01T19:00:00Z", 1, 0, ids({ "team-a-fwd-1-c": "p1" }));
    (m.lineup as { teamAName: string }).teamAName = "Gröna";
    expect(teamCountsBetween([m], "2026-09-01", "2027-05-01").get("p1")).toEqual({ white: 0, green: 1 });
  });
});
