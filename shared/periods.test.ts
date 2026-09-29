import { describe, expect, it } from "vitest";
import { resolvePeriods, toMonthDay } from "./periods";

const P = { preseasonFrom: "09-01", preseasonTo: "10-01", seasonFrom: "10-01", seasonTo: "04-01", playoffFrom: "04-01", playoffTo: "05-01" };

describe("återkommande perioder", () => {
  it("under hösten: hela hockeyåret framåt", () => {
    expect(resolvePeriods(P, new Date(2026, 8, 29))).toEqual({
      preseasonFrom: "2026-09-01", preseasonTo: "2026-10-01",
      seasonFrom: "2026-10-01", seasonTo: "2027-04-01",
      playoffFrom: "2027-04-01", playoffTo: "2027-05-01",
    });
  });
  it("på våren och sommaren: hockeyåret som började förra hösten", () => {
    expect(resolvePeriods(P, new Date(2027, 3, 15)).seasonFrom).toBe("2026-10-01");
    expect(resolvePeriods(P, new Date(2027, 6, 1)).playoffTo).toBe("2027-05-01");
  });
  it("gamla datum med år blir månad-dag", () => {
    expect(toMonthDay("2025-10-01")).toBe("10-01");
    expect(toMonthDay("10-01")).toBe("10-01");
  });
});
