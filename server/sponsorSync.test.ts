import { describe, expect, it } from "vitest";
import { computePlan, normName, suggestPairs, type SiteSponsor } from "./sponsorSync";

const site: SiteSponsor[] = [
  { id: 1, name: "AB Kiruna Bilfrakt", fullName: "AB Kiruna Bilfrakt", active: true, sortOrder: 1, logoVersion: "k1" },
  { id: 2, name: "JLco", fullName: "JLco", active: true, sortOrder: 2, logoVersion: null },
  { id: 3, name: "Lindströms Transport i Luleå AB", fullName: "Lindströms Transport i Luleå AB", active: true, sortOrder: 3, logoVersion: "l1" },
  { id: 4, name: "Polar Management", fullName: "Polar Management", active: true, sortOrder: 4, logoVersion: null },
  { id: 5, name: "Ren", fullName: "Ren", active: true, sortOrder: 5, logoVersion: "r1" },
];
const app = [
  { id: 10, name: "Ren Assistans", active: true, sortOrder: 1, siteId: null, logoVersion: null, hasLogo: true },
  { id: 11, name: "lindstromstransport", active: true, sortOrder: 2, siteId: null, logoVersion: null, hasLogo: true },
  { id: 12, name: "Kirunabilfrakt", active: true, sortOrder: 3, siteId: null, logoVersion: null, hasLogo: true },
  { id: 13, name: "JLco", active: true, sortOrder: 4, siteId: null, logoVersion: null, hasLogo: false },
  { id: 14, name: "Polar Management", active: true, sortOrder: 5, siteId: null, logoVersion: null, hasLogo: false },
];

describe("sponsorer från sajten", () => {
  it("normaliserar namn (AB, å/ä/ö, mellanslag)", () => {
    expect(normName("AB Kiruna Bilfrakt")).toBe("kirunabilfrakt");
    expect(normName("Lindströms Transport i Luleå AB")).toBe("lindstromstransportilulea");
  });

  it("föreslår rätt par för dagens sponsorer", () => {
    const pairs = suggestPairs(app, site);
    expect(Object.fromEntries(pairs)).toEqual({ 10: 5, 11: 3, 12: 1, 13: 2, 14: 4 });
  });

  it("stoppar så länge aktiva sponsorer i appen inte är ihopparade", () => {
    const { blockers, plan } = computePlan(app, site);
    expect(blockers.length).toBeGreaterThan(0);
    expect(plan.filter((p) => p.kind === "create")).toHaveLength(5);
  });

  it("ihopparade: namn och logga följer sajten, inget blockerar", () => {
    const pairs = suggestPairs(app, site);
    const linked = app.map((a) => ({ ...a, siteId: pairs.get(a.id) ?? null }));
    const { blockers, plan } = computePlan(linked, site);
    expect(blockers).toEqual([]);
    expect(plan.filter((p) => p.kind === "create")).toHaveLength(0);
    expect(plan.filter((p) => p.kind === "rename").map((p) => p.text)).toEqual([
      "Byter namn: Kirunabilfrakt → AB Kiruna Bilfrakt",
      "Byter namn: lindstromstransport → Lindströms Transport i Luleå AB",
      "Byter namn: Ren Assistans → Ren",
    ]);
    expect(plan.filter((p) => p.kind === "logo")).toHaveLength(3);
  });

  it("med kortnamn som appens namn och samma loggversion blir det inga ändringar utom ordningen", () => {
    const short = site.map((s) => ({ ...s, name: app.find((a) => suggestPairs(app, site).get(a.id) === s.id)!.name }));
    const linked = app.map((a) => ({ ...a, siteId: suggestPairs(app, site).get(a.id) ?? null, logoVersion: short.find((s) => s.id === suggestPairs(app, site).get(a.id))!.logoVersion }));
    const { plan } = computePlan(linked, short);
    expect(plan.map((p) => p.kind)).toEqual(["order"]);
  });

  it("raderad på sajten → pausas, aldrig borttagen", () => {
    const linked = [{ id: 20, name: "Gammal", active: true, sortOrder: 1, siteId: 99, logoVersion: null, hasLogo: false }];
    const { plan } = computePlan(linked, []);
    expect(plan).toEqual([{ kind: "pause", appId: 20, text: "Pausas (borttagen på sajten): Gammal" }]);
  });
});
