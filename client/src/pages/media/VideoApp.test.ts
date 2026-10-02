import { describe, expect, it } from "vitest";
import { goalsWithScore, starLine } from "./VideoApp";
import { defaultShow, safeArea } from "@/lib/videoGraphics";

describe("Media → Video", () => {
  it("ställningen efter varje mål räknas i tidsordning (historiken är nyast först)", () => {
    const m = { id: 1, name: "", teamWhiteScore: 1, teamGreenScore: 2, createdAt: "", goalHistory: [
      { team: "green" as const, scorer: "C" }, { team: "white" as const, scorer: "B" }, { team: "green" as const, scorer: "A", assist: "X" },
    ] };
    expect(goalsWithScore(m).map((g) => `${g.score} ${g.scorer}`)).toEqual(["0–1 A", "1–1 B", "1–2 C"]);
  });
  it("stjärnans rad", () => {
    const base = { key: "a", name: "A", number: "1", team: "green" as const, gwg: false, score: 0 };
    expect(starLine({ ...base, position: "C", goals: 2, assists: 1, goalsAgainst: null })).toBe("2 mål · 1 assist");
    expect(starLine({ ...base, position: "MV", goals: 0, assists: 0, goalsAgainst: 0 })).toBe("Hållen nolla");
  });
  it("standardval per kategori och säkra ytan i Reel-läget", () => {
    expect(defaultShow("goal").overlay.score).toBe(true);
    expect(defaultShow("result").overlay.nameBar).toBe(false);
    expect(safeArea("reel")).toMatchObject({ top: 269, bottom: 1248 });
  });
});

import { matchStatCells } from "./VideoApp";
describe("matchens statistik", () => {
  const base = { key: "a", name: "A", number: "1", gwg: false, score: 0 };
  it("utespelare med stjärna", () => {
    const r = matchStatCells({ ...base, team: "green", position: "C", goals: 2, assists: 1, goalsAgainst: null }, { teamWhiteScore: 3, teamGreenScore: 5 }, 1);
    expect(r.cells.map((c) => `${c.label}:${c.value}`)).toEqual(["G:2", "A:1", "PTS:3", "RES:V", "STJÄRNA:★★★"]);
  });
  it("målvakt utan stjärna", () => {
    const r = matchStatCells({ ...base, team: "white", position: "MV", goals: 0, assists: 0, goalsAgainst: 0 }, { teamWhiteScore: 2, teamGreenScore: 0 }, null);
    expect(r.cells.map((c) => `${c.label}:${c.value}`)).toEqual(["GA:0", "NOLLA:JA", "RES:V"]);
  });
});
