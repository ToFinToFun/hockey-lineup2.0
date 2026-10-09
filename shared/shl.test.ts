import { describe, expect, it } from "vitest";
import { canCall, matchRow, refreshAfter, shlSeason, shortTeam, standingRow } from "./shl";

describe("SHL från extern källa", () => {
  it("svenska kortnamn", () => {
    expect(shortTeam("Lulea HF")).toBe("Luleå");
    expect(shortTeam("Skelleftea AIK")).toBe("Skellefteå");
    expect(shortTeam("Frolunda HC")).toBe("Frölunda");
    expect(shortTeam("HV 71")).toBe("HV71");
    expect(shortTeam("Nytt Lag HC")).toBe("Nytt Lag");
  });
  const base = { position: 1, team: { name: "Lulea HF" }, gamesPlayed: 10, scoredGoals: 30, receivedGoals: 20 };
  it("poäng 3/2/1 när wins inte räknar övertidssegrar", () => {
    // 5 + 2 + 1 + 2 = 10 matcher
    const r = standingRow({ ...base, wins: 5, winsOvertime: 2, losesOvertime: 1, loses: 2 });
    expect(r).toMatchObject({ w: 5, otw: 2, otl: 1, l: 2, pts: 20, team: "Luleå" });
  });
  it("poäng 3/2/1 när wins räknar med övertidssegrar", () => {
    // wins 7 (varav 2 OT), loses 3 (varav 1 OT) = 10 matcher
    const r = standingRow({ ...base, wins: 7, winsOvertime: 2, losesOvertime: 1, loses: 3 });
    expect(r).toMatchObject({ w: 5, l: 2, pts: 20 });
  });
  it("match: status och resultat", () => {
    const m = matchRow({ id: 1, date: "2026-10-09T17:00:00Z", homeTeam: { name: "Lulea HF" }, awayTeam: { name: "Brynas IF" }, state: { description: "Finished after over time", score: { current: "3 - 2" } } });
    expect(m).toMatchObject({ home: "Luleå", away: "Brynäs", homeScore: 3, awayScore: 2, status: "finished" });
    expect(matchRow({ id: 2, date: "x", homeTeam: { name: "A" }, awayTeam: { name: "B" }, state: { description: "2nd period", score: { current: "1 - 0" } } }).status).toBe("live");
    expect(matchRow({ id: 3, date: "x", homeTeam: { name: "A" }, awayTeam: { name: "B" }, state: { description: "Not started", score: {} } })).toMatchObject({ status: "scheduled", homeScore: null });
  });
  it("säsong", () => {
    expect(shlSeason(new Date("2026-10-09"))).toBe(2026);
    expect(shlSeason(new Date("2027-02-01"))).toBe(2026);
  });
  it("anropstak per dygn", () => {
    expect(canCall({ day: "2026-10-09", calls: 89, remaining: null }, "2026-10-09", 90)).toBe(true);
    expect(canCall({ day: "2026-10-09", calls: 90, remaining: null }, "2026-10-09", 90)).toBe(false);
    expect(canCall({ day: "2026-10-09", calls: 10, remaining: 2 }, "2026-10-09", 90)).toBe(false);
    expect(canCall({ day: "2026-10-08", calls: 90, remaining: 0 }, "2026-10-09", 90)).toBe(true);
  });
  it("tätare hämtning när en match pågår", () => {
    const now = new Date("2026-10-09T17:30:00Z");
    const live = [matchRow({ id: 1, date: "2026-10-09T17:00:00Z", homeTeam: { name: "A" }, awayTeam: { name: "B" }, state: { description: "1st period" } })];
    expect(refreshAfter("matches", 19, live, now)).toBe(10);
    expect(refreshAfter("matches", 12, [], now)).toBe(180);
    expect(refreshAfter("table", 3, [], now)).toBe(24 * 60);
  });
});
