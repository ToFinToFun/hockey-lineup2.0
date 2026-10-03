import { describe, expect, it } from "vitest";
import { starCounts } from "./starStats";

const lineup = (ids: string[]) => ({
  teamAName: "VITA", teamBName: "GRÖNA",
  lineup: Object.fromEntries(ids.map((id, i) => [i % 2 ? `team-b-fwd-1-c${i}` : `team-a-fwd-1-c${i}`, { id, name: id.toUpperCase(), number: String(i + 1), position: "F" }])),
});

describe("stjärnor per spelare", () => {
  it("räknar sparade stjärnor med fördelning och poäng", () => {
    const m = (id: number, stars: string[]) => ({ id, teamWhiteScore: 1, teamGreenScore: 0, goalHistory: [], lineup: lineup(["a", "b", "c", "d"]), report: { stars } });
    const r = starCounts([m(1, ["a", "b", "c"]), m(2, ["a", "c", "b"]), m(3, ["b", "a", "d"])]);
    const a = r.find((x) => x.key === "a")!;
    expect(a).toMatchObject({ stars3: 2, stars2: 1, stars1: 0, total: 3, points: 8 });
    expect(r[0].key).toBe("a");
    expect(r.find((x) => x.key === "d")).toMatchObject({ stars1: 1, total: 1 });
  });
});
