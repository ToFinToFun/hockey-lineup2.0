import { describe, expect, it } from "vitest";
import { starCandidates, autoStars, starLine } from "./starsOfGame";

const lineup = {
  teamAName: "VITA",
  lineup: {
    "team-a-gk-1": { id: "gkW", name: "Linus Carbin" },
    "team-a-fwd-1-lw": { id: "p1", name: "Jerry Paasovaara", number: "63" },
    "team-a-def-1-1": { id: "p2", name: "Hampus Bergman" },
    "team-b-gk-1": { id: "gkG", name: "Robert Romanowski" },
    "team-b-fwd-1-c": { id: "p3", name: "Teddie Storm" },
  },
};

describe("Stars of the Game", () => {
  it("poäng, matchvinnande mål och målvakt med hållen nolla", () => {
    const goals = [
      { team: "white" as const, scorer: "Jerry Paasovaara #63", scorerId: "p1" },
      { team: "white" as const, scorer: "Hampus Bergman", assist: "Jerry Paasovaara #63", assistId: "p1" },
    ];
    const c = starCandidates({ teamWhiteScore: 2, teamGreenScore: 0, goalHistory: goals, lineup });
    const stars = autoStars(c, 1);
    expect(stars[0]).toBe("gkW"); // hållen nolla + vinst
    expect(stars).toContain("p1");
    expect(stars).toContain("p2");
    const p1 = c.find((x) => x.key === "p1")!;
    expect(starLine(p1)).toBe("Jerry Paasovaara (VF) 1G 1A 2TP");
    expect(starLine(p1, { position: false, stats: false })).toBe("Jerry Paasovaara");
    expect(starLine(c.find((x) => x.key === "gkW")!)).toBe("Linus Carbin (M) Shutout");
    expect(starLine(c.find((x) => x.key === "gkG")!)).toBe("Robert Romanowski (M) 2 GA");
  });

  it("fyller på med slumpade spelare, samma slump för samma match", () => {
    const c = starCandidates({ teamWhiteScore: 1, teamGreenScore: 1, goalHistory: [], lineup });
    expect(autoStars(c, 7)).toHaveLength(3);
    expect(autoStars(c, 7)).toEqual(autoStars(c, 7));
  });

  it("målskytt utanför uppställningen blir kandidat", () => {
    const c = starCandidates({ teamWhiteScore: 1, teamGreenScore: 0, goalHistory: [{ team: "white", scorer: "Gäst Spelare" }], lineup });
    expect(c.find((x) => x.name === "Gäst Spelare")?.goals).toBe(1);
  });
});
