import { describe, expect, it } from "vitest";
import { pirAllowed } from "./pirAccess";

describe("Vem ser PIR", () => {
  const admin = { role: "admin", expiresAt: null } as never;
  const stats = { role: "link", modules: ["stats"], expiresAt: null } as never;
  const lineup = { role: "lineup", expiresAt: null } as never;
  const score = { role: "link", modules: ["score"], expiresAt: null } as never;

  it("standard: bara styrelsen", () => {
    expect(pirAllowed(admin, "board")).toBe(true);
    expect(pirAllowed(stats, "board")).toBe(false);
    expect(pirAllowed(lineup, "board")).toBe(false);
    expect(pirAllowed(null as never, "board")).toBe(false);
  });

  it("öppnat: alla med Statistik, Spelare, Kort eller Lineup", () => {
    expect(pirAllowed(stats, "access")).toBe(true);
    expect(pirAllowed(lineup, "access")).toBe(true);
    expect(pirAllowed(score, "access")).toBe(false);
    expect(pirAllowed(null as never, "access")).toBe(false);
  });
});
