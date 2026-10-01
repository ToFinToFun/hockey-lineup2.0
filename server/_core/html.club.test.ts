import { describe, expect, it } from "vitest";
import { applyClubNames } from "./html";
import { mergeClub, profileById } from "../../shared/club";

describe("klubbens namn i titel och manifest", () => {
  const base = profileById("stalstadens");
  it("oförändrat för standardklubben", () => {
    expect(applyClubNames('{"name":"Stålstadens Sportförening"}', base, base)).toBe('{"name":"Stålstadens Sportförening"}');
  });
  it("byts mot aktuell klubbs namn", () => {
    const other = mergeClub(base, { name: "Testklubben IF", fullName: "Testklubben Idrottsförening", hubTitle: "Testklubben" });
    expect(applyClubNames('{"name":"Stålstadens Sportförening","short_name":"Stålstadens","description":"Stålstadens SF – app"}', base, other))
      .toBe('{"name":"Testklubben Idrottsförening","short_name":"Testklubben","description":"Testklubben IF – app"}');
    expect(applyClubNames("<title>Stålstadens App</title>", base, other)).toBe("<title>Testklubben App</title>");
  });
});
