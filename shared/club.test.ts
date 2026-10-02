import { describe, expect, it } from "vitest";
import { mergeClub, profileById, club, setClub, clubHeading, teamLogo } from "./club";

describe("klubbprofil", () => {
  it("standard är Stålstadens profil", () => {
    expect(profileById(undefined).name).toBe("Stålstadens SF");
    expect(profileById("finns-inte").id).toBe("stalstadens");
    expect(clubHeading()).toBe("STÅLSTADENS SF");
    expect(teamLogo("green")).toBe("/images/logo-green.png");
  });
  it("inställningar läggs ovanpå profilen; tomma fält ignoreras", () => {
    const c = mergeClub(profileById("stalstadens"), { name: "Testklubben IF", shortName: "", teams: { white: { name: "Röda", color: "#dc2626" } } });
    expect(c.name).toBe("Testklubben IF");
    expect(c.shortName).toBe("SSF");
    expect(c.teams.white).toMatchObject({ name: "Röda", color: "#dc2626", logo: "/images/logo-white.png" });
    expect(c.teams.green.name).toBe("Gröna");
    const before = club();
    setClub(c);
    expect(clubHeading()).toBe("TESTKLUBBEN IF");
    setClub(before);
  });
});
