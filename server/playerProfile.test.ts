import { describe, expect, it } from "vitest";
import { lineGroup, playerProfile } from "./playerProfile";

const m = (id: number, day: number, white: number, green: number, lineup: Record<string, string>, goals: Array<{ scorerId?: string; assistId?: string; other?: string }> = []) =>
  ({
    id, name: `Match ${id}`, teamWhiteScore: white, teamGreenScore: green, matchEndTime: new Date(2026, 8, day),
    lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: Object.fromEntries(Object.entries(lineup).map(([s, pid]) => [s, { id: pid, name: pid.toUpperCase() }])) },
    goalHistory: goals,
  }) as never;

const matches = [
  // p1 i Vitas kedja 1 med p2, p3 i Vitas kedja 2, p4 i Gröna
  m(1, 1, 3, 1, { "team-a-fwd-1-c": "p1", "team-a-fwd-1-lw": "p2", "team-a-fwd-2-c": "p3", "team-b-fwd-1-c": "p4" },
    [{ scorerId: "p1", assistId: "p2" }, { scorerId: "p1" }, { scorerId: "p4", other: "Självmål" }]),
  m(2, 8, 2, 2, { "team-a-fwd-1-c": "p1", "team-a-fwd-1-lw": "p2", "team-b-fwd-1-c": "p4" }, [{ assistId: "p1" }]),
  m(3, 15, 1, 4, { "team-b-def-1-1": "p1", "team-b-def-1-2": "p4", "team-a-fwd-1-lw": "p2" }),
  m(4, 22, 5, 0, { "team-a-fwd-3-rw": "p1", "team-a-fwd-3-c": "p2" }),
];

describe("spelarprofil", () => {
  it("linjegrupp ur plats", () => {
    expect(lineGroup("team-a-fwd-2-lw")).toBe("fwd-2");
    expect(lineGroup("team-b-def-1-2")).toBe("def-1");
    expect(lineGroup("team-a-gk-1")).toBe("gk");
  });

  it("matchlogg, form, totalt och rekord", () => {
    const p = playerProfile(matches, "p1");
    expect(p.matchLog.map((e) => e.matchId)).toEqual([4, 3, 2, 1]);
    expect(p.matchLog[1]).toMatchObject({ team: "green", position: "B", own: 4, opp: 1, result: "V" });
    expect(p.form).toBe("VOVV");
    expect(p.totals).toEqual({ matches: 4, wins: 3, draws: 1, losses: 0, goals: 2, assists: 1 });
    expect(p.records.bestMatch).toMatchObject({ points: 2, goals: 2, assists: 0, matchId: 1 });
    expect(p.records.longestWinStreak).toBe(2);
    expect(p.records.longestUnbeaten).toBe(4);
    expect(p.records.currentStreak).toEqual({ result: "V", length: 2 });
    expect(p.records.pointsPerMatch).toBe(0.75);
  });

  it("kemi: kedjekamrater, lagkamrater och motståndare", () => {
    const p = playerProfile(matches, "p1", new Map([["p2", "Pelle"]]));
    const line = p.linemates.find((x) => x.id === "p2")!;
    expect(line).toMatchObject({ name: "Pelle", matches: 3, wins: 2, draws: 1, losses: 0, winPct: 67 }); // match 1, 2 och 4 (kedja 3)
    expect(p.linemates.find((x) => x.id === "p3")).toBeUndefined(); // annan kedja
    expect(p.teammates.find((x) => x.id === "p2")).toMatchObject({ matches: 3, wins: 2 });
    expect(p.teammates.find((x) => x.id === "p4")).toMatchObject({ matches: 1, wins: 1 }); // match 3, samma backpar
    expect(p.opponents.find((x) => x.id === "p4")).toMatchObject({ matches: 2, wins: 1, draws: 1 });
    expect(p.opponents.find((x) => x.id === "p2")).toMatchObject({ matches: 1, wins: 1 });
  });
});
