import { describe, expect, it } from "vitest";
import { pressFacts, headlineSuggestions, articleText, cleanName } from "./pressText";

const report = (goals: Array<[string, string, number, boolean?]>, w: number, g: number) => ({
  whiteName: "Vita", greenName: "Gröna", whiteScore: w, greenScore: g, dateLine: "Tisdag 6/10",
  goals: goals.map(([team, scorer, minute, gwg]) => ({ team, scorer, minute, gwg })),
  stars: [{ name: "Anna #7", stat: "" }, { name: "Bo", stat: "" }, { name: "Cia", stat: "" }],
}) as never;

describe("Stålbladet – texter från matchen", () => {
  it("vändning, hattrick och sent avgörande ger rubrikerna i dramatisk ordning", () => {
    const f = pressFacts(report([["green", "Cia", 2], ["green", "Cia", 9], ["white", "Anna #7", 20], ["green", "Cia", 30], ["white", "Anna #7", 40], ["white", "Bo", 50], ["white", "Anna #7", 58, true]], 4, 3), 60);
    expect(f).toMatchObject({ winner: "Vita", score: "4–3", comebackFrom: 2, lateWinner: true });
    expect(f.hattricks.map((h) => h.name).sort()).toEqual(["Anna", "Cia"]);
    const hs = headlineSuggestions(f, 1);
    expect(hs[0].kicker).toBe("VÄNDNINGEN");
    expect(hs[0].headline).toMatch(/Vita/);
    expect(hs.map((h) => h.kicker)).toContain("DRAMAT");
  });
  it("artikeltexten nämner resultat, plats, matchhjälte och sponsorn", () => {
    const f = pressFacts(report([["white", "Anna #7", 4], ["white", "Bo", 30, true], ["white", "Anna #7", 44]], 3, 0), 60);
    const t = articleText(f, { location: "Coop Arena", sponsor: "Polar", seed: 2 });
    expect(t.ingress).toBe("Vita vann mot Gröna med 3–0 i Coop Arena. Bo gjorde det avgörande målet.");
    expect(t.body).toMatch(/Anna gav Vita ledningen efter 4 minuter/);
    expect(t.body).toMatch(/åka hem mållösa/);
    expect(t.body).toMatch(/presenterades av Polar/);
    expect(headlineSuggestions(f).some((h) => h.kicker === "NOLLAN")).toBe(true);
  });
  it("oavgjort och namn utan nummer", () => {
    const f = pressFacts(report([["white", "Anna #7", 4], ["green", "Bo", 30]], 1, 1));
    expect(f.draw).toBe(true);
    expect(headlineSuggestions(f)[0].headline).toMatch(/1–1|Vita|Ingen/);
    expect(cleanName("Hampus Bergman #16")).toBe("Hampus Bergman");
    expect(cleanName("Bo (självmål)")).toBe("Bo");
  });
});
