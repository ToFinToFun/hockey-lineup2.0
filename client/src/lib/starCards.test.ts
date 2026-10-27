import { describe, expect, it } from "vitest";
import { starMatchCells, starCardSettings } from "./starCards";

const c = (o = {}) => ({ key: "p", name: "Kalle", team: "white" as const, position: "C" as const, goals: 2, assists: 1, gwg: true, goalsAgainst: null, score: 10, ...o });

describe("Stars of the Game-kort", () => {
  it("matchens siffror: utespelare med GWG och målvakt", () => {
    expect(starMatchCells(c(), true).map((x) => `${x.label}=${x.value}`)).toEqual(["G=2", "A=1", "P=3", "GWG=1"]);
    expect(starMatchCells(c({ gwg: false }), true)).toHaveLength(3);
    expect(starMatchCells(c({ position: "MV", goalsAgainst: 0 }), true).map((x) => `${x.label}=${x.value}`)).toEqual(["GA=0", "SO=1", "RES=W"]);
  });

  it("guldstil, stjärna och matchrad – sparat kort behåller foto-inställningarna", () => {
    const s = starCardSettings({ number: "16", skin: "retro-gron", photo: { zoom: 1.4, x: 0.5, y: 0.3 } }, c(), 1, "Vita 3–2 Gröna", true);
    expect(s.skin).toBe("retro-guld");
    expect(s.starRank).toBe(1);
    expect(s.number).toBe("16");
    expect(s.photo.zoom).toBe(1.4);
    expect(s.statsTitle).toBe("Vita 3–2 Gröna");
    expect(s.placeholderLogo).toBe(false);
    expect(s.logo).toBe("white"); // Vita i matchen
    expect(starCardSettings(null, c({ team: "green" }), 2, "x", false).logo).toBe("green");
    expect(starCardSettings(null, c(), 3, "x", false).placeholderLogo).toBe(true);
  });

  it("position och nummer följer matchen, C/A från kortet", () => {
    const saved = { position: "C", number: "16", captain: "A" as const };
    const s = starCardSettings(saved, c({ position: "LW", number: "63" }), 1, "x", true);
    expect(s.position).toBe("LW");
    expect(s.number).toBe("63");
    expect(s.captain).toBe("A");
    expect(starCardSettings({ position: "C" }, c({ position: "MV" }), 1, "x", true).position).toBe("G");
    // Utanför uppställningen: kortets position och nummer
    const out = starCardSettings(saved, c({ position: "", number: "" }), 1, "x", true);
    expect(out.position).toBe("C");
    expect(out.number).toBe("16");
  });
});
