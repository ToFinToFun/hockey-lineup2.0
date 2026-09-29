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
    expect(starLine(p1)).toBe("Jerry Paasovaara #63 (VF) 1G 1A 2TP");
    // Hampus gjorde 1–0 = matchvinnande (slutet 2–0) och får dubbla poäng
    const p2 = c.find((x) => x.key === "p2")!;
    expect(p2.gwg).toBe(true);
    expect(starLine(p2, { position: false })).toBe("Hampus Bergman 1G 0A 1TP GWG");
    expect(starLine(p1, { position: false, stats: false })).toBe("Jerry Paasovaara #63");
    expect(starLine(c.find((x) => x.key === "gkW")!)).toBe("Linus Carbin (M) 0 GA");
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


describe("namn och nummer", () => {
  it("nummer från uppställningen; utan nummer inget # (inte heller ett ensamt #)", () => {
    const lineup2 = { teamAName: "VITA", lineup: {
      "team-a-fwd-1-c": { id: "n1", name: "Med Nummer", number: "12" },
      "team-a-fwd-1-lw": { id: "n2", name: "Utan Nummer", number: "" },
    } };
    const c = starCandidates({ teamWhiteScore: 2, teamGreenScore: 0, lineup: lineup2, goalHistory: [
      { team: "white", scorer: "Utan Nummer #", scorerId: "n2" },
      { team: "white", scorer: "Gäst #7" },
    ] });
    expect(starLine(c.find((x) => x.key === "n1")!, { position: false, stats: false })).toBe("Med Nummer #12");
    expect(starLine(c.find((x) => x.key === "n2")!, { position: false, stats: false })).toBe("Utan Nummer");
    const guest = c.find((x) => x.name === "Gäst")!;
    expect(guest.number).toBe("7");
  });
});
