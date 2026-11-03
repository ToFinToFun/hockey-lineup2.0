import { describe, expect, it } from "vitest";
import { isCampaignMonth, themeLogoPath, BUILTIN_LOGO_VERSION } from "./campaign";

describe("kampanjmånaden (november, svensk tid)", () => {
  it("gäller november och bara november", () => {
    expect(isCampaignMonth("2026-11-01")).toBe(true);
    expect(isCampaignMonth("2026-11-30")).toBe(true);
    expect(isCampaignMonth("2026-12-01")).toBe(false);
    expect(isCampaignMonth("2026-10-31")).toBe(false);
    expect(isCampaignMonth(new Date("2026-10-31T23:30:00Z"))).toBe(true); // 00:30 1 nov i Sverige
    expect(isCampaignMonth(new Date("2026-11-30T23:30:00Z"))).toBe(false); // 00:30 1 dec i Sverige
    expect(isCampaignMonth("inte ett datum")).toBe(false);
  });
  it("loggans adress: uppladdad eller inbyggd", () => {
    expect(themeLogoPath({ id: 1, builtin: "movember", hasLogo: false, updatedAt: "2026-11-01T00:00:00Z" })).toBe(`/images/campaigns/movember.png?v=${BUILTIN_LOGO_VERSION}`);
    expect(themeLogoPath({ id: 4, builtin: null, hasLogo: true, updatedAt: "2026-11-01T00:00:00Z" })).toMatch(/^\/api\/media\/themes\/4\/logo\?v=\d+$/);
    expect(themeLogoPath({ id: 5, builtin: null, hasLogo: false, updatedAt: "2026-11-01T00:00:00Z" })).toBeNull();
  });
});
