import { describe, expect, it } from "vitest";
import { starMatchCells, starCardSettings } from "./starCards";

const c = (o = {}) => ({ key: "p", name: "Kalle", team: "white" as const, position: "C" as const, goals: 2, assists: 1, gwg: true, goalsAgainst: null, score: 10, ...o });

describe("Stars of the Game-kort", () => {
  it("matchens siffror: utespelare med GWG och målvakt", () => {
    expect(starMatchCells(c(), true).map((x) => `${x.label}=${x.value}`)).toEqual(["G=2", "A=1", "PTS=3", "GWG=1"]);
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
});
