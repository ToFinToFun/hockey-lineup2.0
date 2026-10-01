import { describe, expect, it } from "vitest";
import { secondaryFromStats, posGroup } from "./altPosition";

describe("alternativ position", () => {
  it("vanligaste andra position om den är minst X % (VF/HF räknas som F)", () => {
    expect(secondaryFromStats("B", { B: 6, C: 3, F: 1 }, 20)).toMatchObject({ pos: "C" });
    expect(secondaryFromStats("F", { LW: 4, RW: 3, C: 2, B: 1 }, 20)).toMatchObject({ pos: "C" });
    expect(secondaryFromStats("B", { B: 9, C: 1 }, 20)).toBeNull(); // 10 % < 20 %
    expect(secondaryFromStats("B", { B: 2, C: 2 }, 20)).toBeNull(); // för få matcher
    expect(secondaryFromStats("B", { B: 6, C: 3 }, 0)).toBeNull(); // avstängt
    expect(secondaryFromStats("C", { C: 5, LW: 1, RW: 1 }, 20)).toMatchObject({ pos: "F" }); // 2/7 ≈ 29 %
  });
  it("positionsgrupper", () => {
    expect(posGroup("RW")).toBe("F");
    expect(posGroup("IB")).toBeNull();
  });
});
