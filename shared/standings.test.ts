import { describe, expect, it } from "vitest";
import { series, standings, seasonShort } from "./standings";

const m = (w: number, g: number, d: string) => ({ teamWhiteScore: w, teamGreenScore: g, matchStartTime: d });

describe("tabell och final", () => {
  it("2 p för vinst, 1 för oavgjort; poäng, målskillnad, gjorda mål", () => {
    const rows = standings([m(3, 1, "2026-10-01"), m(2, 2, "2026-10-08"), m(1, 4, "2026-10-15")]);
    expect(rows.map((r) => `${r.team} ${r.gp} ${r.w}-${r.l}-${r.t} ${r.gf}-${r.ga} ${r.diff} ${r.pts}`)).toEqual([
      "green 3 1-1-1 7-6 1 3",
      "white 3 1-1-1 6-7 -1 3",
    ]);
  });
  it("finalen räknar vunna matcher i tidsordning", () => {
    const s = series([m(2, 3, "2027-03-10"), m(4, 1, "2027-03-03"), m(5, 2, "2027-03-17")]);
    expect([s.white, s.green, s.leader]).toEqual([2, 1, "white"]);
    expect(s.matches.map((x) => `${x.white}-${x.green}`)).toEqual(["4-1", "2-3", "5-2"]);
  });
  it("säsongen 26/27 från augusti till juli", () => {
    expect(seasonShort("2027-03-10")).toBe("26/27");
    expect(seasonShort("2026-09-01")).toBe("26/27");
  });
});
