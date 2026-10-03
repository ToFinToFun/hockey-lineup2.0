import { describe, expect, it } from "vitest";
import { ourViewOf } from "./opponentLinks";

describe("vad motståndaren ser av vårt lag", () => {
  it("äldre länkar följer showOurTeam, nya ourView", () => {
    expect(ourViewOf({ showOurTeam: true })).toBe("lineup");
    expect(ourViewOf({ showOurTeam: false })).toBe("none");
    expect(ourViewOf({ showOurTeam: true, ourView: "players" })).toBe("players");
  });
});
