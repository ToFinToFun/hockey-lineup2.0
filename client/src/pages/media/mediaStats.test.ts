import { describe, expect, it } from "vitest";
import { periodRange, statRows } from "./mediaStats";

const periods = { seasonFrom: "2026-10-01", seasonTo: "2027-04-01", playoffFrom: "2027-04-01", playoffTo: "2027-05-01", preseasonFrom: "2026-09-01", preseasonTo: "2026-10-01" };

describe("Media – statistik", () => {
  it("perioder som i statistikmodulen", () => {
    expect(periodRange("season", periods)).toMatchObject({ from: "2026-10-01", label: "Säsong 2026/27" });
    const w = periodRange("week", periods, new Date(2026, 8, 30));
    expect(w).toMatchObject({ from: "2026-09-28", to: "2026-10-04", label: "Vecka 40" });
    expect(periodRange("all", periods)).toEqual({ label: "Totalt" });
  });
  it("topplista med delad placering, utan nollor", () => {
    const s = { topScorers: [
      { name: "A", goals: 5, assists: 2, points: 7, gwg: 1, matches: 4 },
      { name: "B", goals: 3, assists: 4, points: 7, gwg: 0, matches: 5 },
      { name: "C", goals: 0, assists: 1, points: 1, gwg: 0, matches: 2 },
    ], playerRecordGoals: null, playerRecordAssists: null, playerRecordPoints: null, biggestWinWhite: null, biggestWinGreen: null, highestScoringMatch: null };
    expect(statRows("points", s, [], 10).map((r) => `${r.rank} ${r.name} ${r.value}`)).toEqual(["1 A 7", "1 B 7", "3 C 1"]);
    expect(statRows("goals", s, [], 10).map((r) => r.name)).toEqual(["A", "B"]);
    expect(statRows("awards", undefined, [{ title: "Poängkung", emoji: "👑", winner: "A", value: "7 poäng (5+2)" }], 5)[0]).toMatchObject({ name: "A", sub: "Poängkung", value: "7 poäng" });
  });
});

import { cardSlots, lineupHeights } from "@/lib/mediaImages";

describe("Media – layouter", () => {
  it("1 stort kort, 2 bredvid varandra, 3–4 i två rader – alltid 5:7 och inom ytan", () => {
    const one = cardSlots(1, 300, 1290);
    expect(one).toHaveLength(1);
    const two = cardSlots(2, 300, 1290);
    expect(two[0].y).toBe(two[1].y);
    const three = cardSlots(3, 300, 1290);
    expect(three[2].y).toBeGreaterThan(three[0].y);
    for (const r of [...one, ...two, ...three, ...cardSlots(4, 300, 1290)]) {
      expect(r.h / r.w).toBeCloseTo(7 / 5, 3);
      expect(r.y + r.h).toBeLessThanOrEqual(1290 + 0.5);
      expect(r.x).toBeGreaterThanOrEqual(0);
    }
  });
  it("lagbilden: fyra kedjor tar mer plats än tre (då krymps den)", () => {
    const P = (pos: string) => ({ pos, name: "X" });
    const chain = (n: number) => ({ label: `${n}:a kedjan`, players: [P("LW"), P("C"), P("RW")] });
    const three = lineupHeights([chain(1), chain(2), chain(3)], 1);
    const four = lineupHeights([chain(1), chain(2), chain(3), chain(4)], 1);
    expect(four.right).toBeGreaterThan(three.right);
  });
});

import { goalieRows } from "./mediaStats";
describe("målvakter i Media", () => {
  const ice = [
    { name: "Gun", gkMatches: 4, gkWins: 3, shutouts: 1, ga: 6, ga60: 1.5, byPos: { MV: 240 } },
    { name: "Hans", gkMatches: 3, gkWins: 1, shutouts: 0, ga: 9, ga60: 3, byPos: { MV: 180 } },
    { name: "Ida", gkMatches: 1, gkWins: 0, shutouts: 0, ga: 1, ga60: null, byPos: { MV: 20 } },
  ];
  it("insläppta/60: lägst först, de utan tillräckligt med tid i mål är inte med", () => {
    expect(goalieRows("gk_ga60", ice, [], 10).map((r) => `${r.rank} ${r.name} ${r.value}`)).toEqual(["1 Gun 1,5", "2 Hans 3"]);
  });
  it("vinster, nollor och svit", () => {
    expect(goalieRows("gk_wins", ice, [], 10).map((r) => r.name)).toEqual(["Gun", "Hans"]);
    expect(goalieRows("gk_shutouts", ice, [], 10).map((r) => r.name)).toEqual(["Gun"]);
    expect(goalieRows("gk_streak", ice, [{ name: "Hans", gkMatches: 3, max2: 2, current2: 1 }], 10)[0]).toMatchObject({ name: "Hans", value: "2", sub: "3 matcher i mål · pågående 1" });
  });
});
