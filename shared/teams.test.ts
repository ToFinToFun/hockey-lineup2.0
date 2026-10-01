import { describe, expect, it } from "vitest";
import { isTeamAWhite, teamName, defaultTeamNames, normalizeTeamKey } from "./teams";
import { club, setClub, mergeClub, profileById } from "./club";

describe("lagen", () => {
  it("Stålstadens: samma regler som tidigare", () => {
    expect(isTeamAWhite("VITA")).toBe(true);
    expect(isTeamAWhite("Vita laget")).toBe(true);
    expect(isTeamAWhite("GRÖNA")).toBe(false);
    expect(isTeamAWhite("Lag A")).toBe(false);
    expect(isTeamAWhite(undefined)).toBe(true);
    expect(defaultTeamNames()).toEqual({ teamAName: "VITA", teamBName: "GRÖNA" });
    expect(teamName("green")).toBe("Gröna");
    expect(normalizeTeamKey("vita")).toBe("white");
    expect(normalizeTeamKey("Green")).toBe("green");
    expect(normalizeTeamKey("x")).toBeNull();
  });
  it("annan klubb med Röda/Blå", () => {
    const before = club();
    setClub(mergeClub(profileById("stalstadens"), { teams: { white: { name: "Röda" }, green: { name: "Blå" } } }));
    expect(isTeamAWhite("RÖDA")).toBe(true);
    expect(isTeamAWhite("BLÅ")).toBe(false);
    expect(defaultTeamNames()).toEqual({ teamAName: "RÖDA", teamBName: "BLÅ" });
    expect(normalizeTeamKey("Blå")).toBe("green");
    setClub(before);
  });
});
