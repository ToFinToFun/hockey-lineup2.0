import { describe, expect, it } from "vitest";
import { pressFacts, headlineSuggestions, articleText, cleanName, splitPasted, excerpt } from "./pressText";

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
  it("hattrick i oavgjord match: ingen 'vann med', ingen 'sköt sönder'", () => {
    const g: Array<[string, string, number]> = [["white", "Johan Andman", 5], ["green", "Bo", 8], ["white", "Johan Andman", 20], ["green", "Bo", 25], ["white", "Johan Andman", 40], ["green", "Cia", 50]];
    const f = pressFacts(report(g, 3, 3), 60);
    for (let seed = 0; seed < 6; seed++) {
      const h = headlineSuggestions(f, seed).find((x) => x.kicker === "HATTRICK")!;
      expect(h.sub).toBe("Vita och Gröna delade på poängen – 3–3");
      expect(h.headline).not.toMatch(/sköt sönder/);
      for (const x of headlineSuggestions(f, seed)) expect(x.sub).not.toMatch(/vann med/);
    }
  });
  it("hattrick i förlorande lag: inte 'sköt sönder' motståndaren", () => {
    const f = pressFacts(report([["green", "Cia", 3], ["green", "Cia", 9], ["green", "Cia", 30], ["white", "Anna #7", 33], ["white", "Bo", 40], ["white", "Anna #7", 45], ["white", "Bo", 58]], 4, 3), 60);
    for (let seed = 0; seed < 6; seed++) expect(headlineSuggestions(f, seed).find((x) => x.kicker === "HATTRICK")!.headline).not.toMatch(/sköt sönder/);
  });
  it("oavgjort och namn utan nummer", () => {
    const f = pressFacts(report([["white", "Anna #7", 4], ["green", "Bo", 30]], 1, 1));
    expect(f.draw).toBe(true);
    expect(headlineSuggestions(f)[0].headline).toMatch(/1–1|Vita|Ingen/);
    expect(cleanName("Hampus Bergman #16")).toBe("Hampus Bergman");
    expect(cleanName("Bo (självmål)")).toBe("Bo");
  });
});

describe("splitPasted (inklistrat från mejl)", () => {
  const MAIL = `Lokalpressen ringde och ville ha en intervju..... 🙂

...........

Kapten Bergman Lahti om frånvaron, Vitas form och ryktena om nyförvärv

Efter en övertygande premiär mot Gröna har Vitas lagkapten Hampus Bergman Lahti lyst med sin frånvaro.

Hej Hampus! Har Vita svårt att prestera utan sin lagkapten?

– Svar...`;
  it("rubrik, ingress och brödtext med tomma rader", () => {
    const r = splitPasted(MAIL.split("...........")[1]);
    expect(r.headline).toBe("Kapten Bergman Lahti om frånvaron, Vitas form och ryktena om nyförvärv");
    expect(r.ingress).toMatch(/^Efter en övertygande premiär/);
    expect(r.body).toBe("Hej Hampus! Har Vita svårt att prestera utan sin lagkapten?\n\n– Svar...");
  });
  it("utan tomma rader (enkla radbrytningar)", () => {
    const r = splitPasted("Rubriken\nIngressen här.\nFråga ett?\n– Svar ett\nFråga två?\n– Svar två");
    expect(r).toEqual({ headline: "Rubriken", ingress: "Ingressen här.", body: "Fråga ett?\n– Svar ett\nFråga två?\n– Svar två" });
  });
  it("börjar texten med en fråga blir allt brödtext", () => {
    expect(splitPasted("Hur mår du?\n– Bra")).toEqual({ headline: "", ingress: "", body: "Hur mår du?\n– Bra" });
  });
});

describe("excerpt (förstasidan som första bild)", () => {
  it("hela stycken och fråga tillsammans med svaret", () => {
    const t = "Fråga ett om säsongen?\n\n– Svar ett med lite text.\n\nFråga två?\n\n– Svar två " + "x ".repeat(300);
    expect(excerpt(t, 60)).toBe("Fråga ett om säsongen?\n\n– Svar ett med lite text.");
  });
  it("kort text blir hel", () => {
    expect(excerpt("Ett stycke.\n\nTvå stycken.", 500)).toBe("Ett stycke.\n\nTvå stycken.");
  });
  it("ett för långt första stycke kortas vid en mening", () => {
    const r = excerpt("Första meningen är här. " + "Ord ".repeat(400), 100);
    expect(r).toBe("Första meningen är här. …");
  });
});
