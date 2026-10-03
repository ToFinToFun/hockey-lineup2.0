import { describe, expect, it } from "vitest";
import { ourViewOf } from "./opponentLinks";

describe("vad motståndaren ser av vårt lag", () => {
  it("äldre länkar följer showOurTeam, nya ourView", () => {
    expect(ourViewOf({ showOurTeam: true })).toBe("lineup");
    expect(ourViewOf({ showOurTeam: false })).toBe("none");
    expect(ourViewOf({ showOurTeam: true, ourView: "players" })).toBe("players");
  });
});

import { linkExpiry } from "./opponentLinks";
describe("länkens giltighet", () => {
  it("slutar ett dygn efter matchdagen", () => {
    const e = linkExpiry({ matchDate: "2026-11-07" });
    expect(e).toEqual(new Date(2026, 10, 9, 0, 0, 0));
  });
  it("utan matchdag: antal dagar", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(linkExpiry({ days: 7 }, now).getTime() - now.getTime()).toBe(7 * 86_400_000);
  });
});
