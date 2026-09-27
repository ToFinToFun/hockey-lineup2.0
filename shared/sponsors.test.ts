import { describe, expect, it } from "vitest";
import { pickLeastShown, sponsorSeasonLabel, sponsorSeasonStart } from "./sponsors";

describe("sponsorsäsong", () => {
  it("börjar 1 juni", () => {
    expect(sponsorSeasonStart(new Date(2026, 8, 27))).toEqual(new Date(2026, 5, 1));
    expect(sponsorSeasonStart(new Date(2027, 4, 31))).toEqual(new Date(2026, 5, 1));
    expect(sponsorSeasonStart(new Date(2027, 5, 1))).toEqual(new Date(2027, 5, 1));
    expect(sponsorSeasonLabel(new Date(2026, 5, 1))).toBe("2026/27");
  });
});

describe("pickLeastShown", () => {
  const list = [
    { name: "A", active: true, n: 3 },
    { name: "B", active: true, n: 1 },
    { name: "C", active: false, n: 0 },
    { name: "D", active: true, n: 1 },
  ];
  it("väljer den aktiva som visats minst, slumpar vid lika", () => {
    expect(pickLeastShown(list, (s) => s.n, () => 0)?.name).toBe("B");
    expect(pickLeastShown(list, (s) => s.n, () => 0.99)?.name).toBe("D");
  });
  it("inga aktiva ger null", () => {
    expect(pickLeastShown([{ name: "X", active: false }], () => 0)).toBeNull();
  });
});
