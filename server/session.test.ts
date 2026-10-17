import { describe, expect, it } from "vitest";
import { canLineup, hasModule, isAdmin, mergeSessions } from "./auth";

describe("behörighet: kaka + medlem", () => {
  it("utan medlemsbehörighet gäller kakan som den är", () => {
    const link = { role: "access" as const, expiresAt: 1, modules: ["media" as const], via: "link" as const };
    expect(mergeSessions(link, null)).toBe(link);
    expect(mergeSessions(null, null)).toBeNull();
  });
  it("medlem med Admin blir Admin", () => {
    const s = mergeSessions(null, { memberId: 2, admin: true, modules: [] });
    expect(isAdmin(s)).toBe(true);
    expect(s?.memberId).toBe(2);
    expect(s?.via).toBe("member");
  });
  it("moduler från länk och medlem läggs ihop", () => {
    const s = mergeSessions({ role: "access", expiresAt: 1, modules: ["media"], via: "link" }, { memberId: 3, admin: false, modules: ["activities"] });
    expect(hasModule(s, "media")).toBe(true);
    expect(hasModule(s, "activities")).toBe(true);
    expect(isAdmin(s)).toBe(false);
  });
  it("gammal Lineup-länk + medlem behåller Lineup", () => {
    const s = mergeSessions({ role: "lineup", expiresAt: 1, via: "invite" }, { memberId: 3, admin: false, modules: ["stats"] });
    expect(canLineup(s)).toBe(true);
    expect(hasModule(s, "stats")).toBe(true);
  });
  it("lösenordet är redan Admin – medlemmen läggs bara till", () => {
    const s = mergeSessions({ role: "admin", expiresAt: 1, via: "password" }, { memberId: 4, admin: false, modules: ["media"] });
    expect(isAdmin(s)).toBe(true);
    expect(s?.memberId).toBe(4);
  });
  it("Lineup som modul ger Lineup", () => {
    expect(canLineup({ role: "access", expiresAt: 1, modules: ["lineup"] })).toBe(true);
    expect(canLineup({ role: "access", expiresAt: 1, modules: ["media"] })).toBe(false);
  });
});
