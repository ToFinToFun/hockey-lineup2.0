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

describe("parsePasted (Klistra in med övriga fält)", () => {
  it("det nya formatet från Export: text, --- och fälten", async () => {
    const { parsePasted } = await import("./pressText");
    const r = parsePasted(`Vita stängde november med stil

Sista matchen i Mustaschkampens månad blev en uppvisning.

Första stycket.

Andra stycket.

---
Etikett (högst 24 tecken, t.ex. Stålserien eller Lokalsport): Stålserien
Citatrubrik: ”Vi spelade för varandra”
Citat: "Mustascherna kliar, men det var värt det."
Vem: Hampus Bergman Lahti, lagkapten
Bildtext: Kvällens match blev den sista i november.
Byline: Stålbladets redaktion
Kontrollera: Citatet från Hampus Bergman Lahti är påhittat
Kontrollera: Citatrubriken är påhittad`);
    expect(r.headline).toBe("Vita stängde november med stil");
    expect(r.ingress).toBe("Sista matchen i Mustaschkampens månad blev en uppvisning.");
    expect(r.body).toBe("Första stycket.\n\nAndra stycket.");
    expect(r.fields).toEqual({ kicker: "Stålserien", quoteHead: "Vi spelade för varandra", pullQuote: "Mustascherna kliar, men det var värt det.", pullQuoteBy: "Hampus Bergman Lahti, lagkapten", info: "Kvällens match blev den sista i november.", byline: "Stålbladets redaktion" });
    expect(r.verify).toEqual(["Citatet från Hampus Bergman Lahti är påhittat", "Citatrubriken är påhittad"]);
  });

  it("förslagen som AI:n tidigare skrev under kodblocket (punktlista med längdgränser)", async () => {
    const { parsePasted } = await import("./pressText");
    const r = parsePasted(`Rubriken

Ingressen.

Brödtexten.

Övriga fält

* Etikett (högst 24): Stålserien
* Citatrubrik (högst 80): [Citat från lagkapten om varför Mustaschkampen betyder något för laget]
* Citat i marginalen (högst 160): [Citat från en spelare eller ledare om kvällens match eller Mustaschkampen]
   * Vem som sa det (högst 60): [Namn, roll]
* Bildtext (högst 90): Kvällens match blir den sista i november och den sista i Mustaschkampens månad.
* Byline (högst 50): Stålbladets redaktion`);
    expect(r.body).toBe("Brödtexten.");
    expect(r.fields.kicker).toBe("Stålserien");
    expect(r.fields.pullQuoteBy).toBe("[Namn, roll]");
    expect(r.fields.info).toBe("Kvällens match blir den sista i november och den sista i Mustaschkampens månad.");
    expect(r.fields.byline).toBe("Stålbladets redaktion");
    expect(r.verify).toHaveLength(3); // tre platshållare
    expect(r.verify[0]).toMatch(/^Citatrubrik är en platshållare/);
  });

  it("förstasidans puffar och listor under Kontrollera", async () => {
    const { parsePasted } = await import("./pressText");
    const r = parsePasted("**Rubrik**\n\nIngress.\n\n```\nTextrutans rubrik: Om november\nPuff 1: Stålserien | Vita tar ledningen | Två raka segrar\nPuff 3: Bara en rubrik\nKontrollera:\n- Bildtexten är påhittad\n- Svaret i intervjun är påhittat\n```");
    expect(r.headline).toBe("Rubrik");
    expect(r.fields.boxTitle).toBe("Om november");
    expect(r.teasers).toEqual([{ index: 0, kicker: "Stålserien", title: "Vita tar ledningen", sub: "Två raka segrar" }, { index: 2, kicker: "", title: "Bara en rubrik", sub: "" }]);
    expect(r.verify).toEqual(["Bildtexten är påhittad", "Svaret i intervjun är påhittat"]);
  });

  it("för långt kortas och noteras; vanlig text och intervjusvar rörs inte", async () => {
    const { parsePasted } = await import("./pressText");
    const r = parsePasted(`Rubrik\n\nIngress.\n\nHur var matchen?\n– Bra: vi vann.\n\nBildtext: ${"x".repeat(100)}`);
    expect(r.body).toBe("Hur var matchen?\n– Bra: vi vann.");
    expect(r.fields.info).toHaveLength(90);
    expect(r.verify).toEqual(["Bildtext kortades till 90 tecken"]);
  });
});
