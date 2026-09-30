import { describe, expect, it } from "vitest";
import { cellsFor } from "./CardsApp";
import { autoLevels, photoSourceRect, gradePixels, DEFAULT_SETTINGS } from "@shared/cardRender";
import { CARD_SKINS } from "@shared/cardSkins";

const line = (o = {}) => ({ label: "2026/27", matches: 10, goals: 5, assists: 7, points: 12, wins: 6, winPct: 60, goalie: null, ...o });

describe("hockeykort", () => {
  it("statistikrutan för utespelare och målvakt", () => {
    const skater = cellsFor("season", { season: line(), career: line({ label: "Totalt", matches: 30 }), form: "VVF", isGoalie: false });
    expect(skater.title).toBe("Säsong 2026/27");
    expect(skater.cells.map((c) => c.label)).toEqual(["GP", "G", "A", "PTS", "W%"]);
    expect(skater.cells[3].value).toBe("12");
    const gk = cellsFor("career", { season: line(), career: line({ label: "Totalt", goalie: { matches: 8, gaa: 2.25, shutouts: 2 } }), form: "", isGoalie: true });
    expect(gk.title).toBe("Totalt");
    expect(gk.cells.map((c) => `${c.label}=${c.value}`)).toEqual(["GP=8", "GAA=2,3", "SO=2", "W%=60%"]);
    expect(cellsFor("none", undefined).cells).toEqual([]);
  });

  it("autonivåer lyfter mörka foton och dämpar ljusa", () => {
    const dark = new Uint8ClampedArray(400).fill(40);
    const bright = new Uint8ClampedArray(400).fill(230);
    expect(autoLevels(dark).brightness).toBeGreaterThan(1);
    expect(autoLevels(bright).brightness).toBeLessThan(1);
  });

  it("beskärningen håller sig inom fotot", () => {
    const r = photoSourceRect(1200, 800, 710, 1010, { zoom: 2, x: 0, y: 1 });
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.sh).toBeLessThanOrEqual(800 + 1e-6);
    expect(r.sw / r.sh).toBeCloseTo(710 / 1010, 5);
  });

  it("färgtoningen drar fotot mot stilens färger", () => {
    const px = new Uint8ClampedArray([200, 40, 40, 255]); // rött
    gradePixels(px, DEFAULT_SETTINGS, CARD_SKINS[0]); // gröna stilen
    expect(px[1]).toBeGreaterThan(40); // mer grönt
    expect(px[0]).toBeLessThan(200); // mindre rött
  });
});

import { resolveLogo, skinById } from "@shared/cardSkins";

describe("lagmärken", () => {
  it("stilens standard, eget val eller inget", () => {
    expect(resolveLogo("auto", skinById("retro-svart"))?.id).toBe("anvil");
    expect(resolveLogo(undefined, skinById("retro-gron"))?.id).toBe("green");
    expect(resolveLogo("white", skinById("retro-svart"))?.id).toBe("white");
    expect(resolveLogo("none", skinById("retro-svart"))).toBeNull();
  });
});

import { defaultStatsTitle, currentSeasonLabel } from "./CardsApp";

describe("automatiska rubriker", () => {
  it("säsong, karriär och form", () => {
    expect(currentSeasonLabel(new Date(2026, 8, 28))).toBe("2026/27");
    expect(currentSeasonLabel(new Date(2027, 2, 1))).toBe("2026/27");
    expect(defaultStatsTitle("season")).toMatch(/^Säsong \d{4}\/\d{2}$/);
    expect(defaultStatsTitle("career")).toBe("Totalt");
    expect(defaultStatsTitle("form")).toBe("Form");
    expect(defaultStatsTitle("none")).toBe("");
  });
});

describe("färgtoning", () => {
  it("0 = ingen toning, högre = mer mot stilens färger", () => {
    const base = () => new Uint8ClampedArray([200, 40, 40, 255]);
    const none = base();
    gradePixels(none, { ...DEFAULT_SETTINGS, adjust: { ...DEFAULT_SETTINGS.adjust, tint: 0 } }, CARD_SKINS[0]);
    expect(Array.from(none)).toEqual([200, 40, 40, 255]);
    const normal = base();
    gradePixels(normal, DEFAULT_SETTINGS, CARD_SKINS[0]);
    const strong = base();
    gradePixels(strong, { ...DEFAULT_SETTINGS, adjust: { ...DEFAULT_SETTINGS.adjust, tint: 2 } }, CARD_SKINS[0]);
    expect(strong[0]).toBeLessThan(normal[0]); // mindre rött ju starkare toning
  });

  it("nytt kort utan spelare är retro svart", () => {
    expect(DEFAULT_SETTINGS.skin).toBe("retro-svart");
  });
});

describe("specialkort", () => {
  it("guldstilen finns och har folieglans", () => {
    const gold = skinById("retro-guld");
    expect(gold.id).toBe("retro-guld");
    expect(gold.foil).toBe(true);
    expect(resolveLogo("auto", gold)?.id).toBe("anvil");
  });
});
