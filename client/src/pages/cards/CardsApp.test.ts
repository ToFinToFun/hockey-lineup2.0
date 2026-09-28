import { describe, expect, it } from "vitest";
import { cellsFor } from "./CardsApp";
import { autoLevels, photoSourceRect, gradePixels, DEFAULT_SETTINGS } from "@/lib/cardRender";
import { CARD_SKINS } from "@/lib/cardSkins";

const line = (o = {}) => ({ label: "2026/27", matches: 10, goals: 5, assists: 7, points: 12, wins: 6, winPct: 60, goalie: null, ...o });

describe("hockeykort", () => {
  it("statistikrutan för utespelare och målvakt", () => {
    const skater = cellsFor("season", { season: line(), career: line({ label: "Karriär", matches: 30 }), form: "VVF", isGoalie: false });
    expect(skater.title).toBe("Säsong 2026/27");
    expect(skater.cells.map((c) => c.label)).toEqual(["M", "G", "A", "TP", "V%"]);
    expect(skater.cells[3].value).toBe("12");
    const gk = cellsFor("career", { season: line(), career: line({ label: "Karriär", goalie: { matches: 8, gaa: 2.25, shutouts: 2 } }), form: "", isGoalie: true });
    expect(gk.title).toBe("Karriär");
    expect(gk.cells.map((c) => `${c.label}=${c.value}`)).toEqual(["M=8", "GAA=2,3", "Nollor=2", "V%=60%"]);
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
