import { describe, expect, it } from "vitest";
import { correctLineupFromGoals } from "./lineupCorrection";
import { seasonHistory } from "./playerHistory";
import { calculatePIR } from "./pir";

const match = (lineup: Record<string, string>, goals: Array<{ team: "white" | "green"; scorerId?: string; assistId?: string; other?: string }>, white = 3, green = 1) =>
  ({
    id: 1, name: "M", teamWhiteScore: white, teamGreenScore: green, reviewStatus: "approved",
    matchEndTime: new Date(2026, 8, 20), createdAt: new Date(2026, 8, 20), matchStartTime: null,
    lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: Object.fromEntries(Object.entries(lineup).map(([s, id]) => [s, { id, name: id }])) },
    goalHistory: goals,
  }) as never;

const slots = (m: unknown) => Object.entries((m as { lineup: { lineup: Record<string, { id: string }> } }).lineup.lineup).map(([s, p]) => `${s}=${p.id}`).sort();

describe("rättad uppställning utifrån målen", () => {
  it("spelare som gjort mål för andra laget flyttas dit, med samma position", () => {
    const m = correctLineupFromGoals(match({ "team-a-fwd-1-c": "p1", "team-b-def-1-1": "p2" }, [{ team: "green", scorerId: "p1" }]));
    expect(slots(m)).toEqual(["team-b-def-1-1=p2", "team-b-moved-p1-fwd-0-c=p1"]);
    expect(m.lineupCorrection).toEqual({ moved: ["p1"], added: [], excluded: [] });
  });

  it("mål för båda lagen: tas bort ur uppställningen (ingen vinst/förlust eller PIR)", () => {
    const m = correctLineupFromGoals(match({ "team-a-fwd-1-c": "p1", "team-b-gk-1": "p2" }, [{ team: "white", scorerId: "p1" }, { team: "green", assistId: "p1" }]));
    expect(slots(m)).toEqual(["team-b-gk-1=p2"]);
    expect(m.lineupCorrection?.excluded).toEqual(["p1"]);
    const hist = seasonHistory([m] as never).get("p1");
    expect(hist).toBeDefined();
    expect(hist![0]).toMatchObject({ matches: 0, wins: 0, losses: 0, goals: 1, assists: 1 });
  });

  it("saknad målskytt läggs till i målets lag", () => {
    const m = correctLineupFromGoals(match({ "team-a-gk-1": "p2" }, [{ team: "white", scorerId: "p9" }]));
    expect(slots(m)).toContain("team-a-moved-p9-fwd-0-c=p9");
    expect(m.lineupCorrection?.added).toEqual(["p9"]);
  });

  it("stämmer redan eller självmål: oförändrad", () => {
    const ok = match({ "team-a-fwd-1-c": "p1" }, [{ team: "white", scorerId: "p1" }]);
    expect(correctLineupFromGoals(ok)).toBe(ok);
    const own = match({ "team-a-fwd-1-c": "p1" }, [{ team: "green", scorerId: "p1", other: "Självmål" }]);
    expect(correctLineupFromGoals(own)).toBe(own);
  });

  it("PIR räknar flyttad spelare till vinnande laget", () => {
    const raw = match({ "team-a-fwd-1-c": "p1", "team-a-gk-1": "a1", "team-b-gk-1": "b1", "team-b-fwd-1-c": "b2" }, [{ team: "green", scorerId: "p1" }], 1, 4);
    const fixed = correctLineupFromGoals(raw);
    const p1 = calculatePIR([fixed] as never).find((r) => r.playerKey === "p1");
    expect(p1?.wins).toBe(1);
    expect(p1?.losses).toBe(0);
  });
});
