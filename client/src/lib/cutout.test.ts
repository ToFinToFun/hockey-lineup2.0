import { describe, expect, it } from "vitest";
import { sharpenMask } from "./cutout";

describe("friläggningsmask", () => {
  it("osäkra värden dras isär, säkra behålls", () => {
    expect(sharpenMask(0)).toBe(0);
    expect(sharpenMask(60)).toBe(0);
    expect(sharpenMask(255)).toBe(255);
    expect(sharpenMask(200)).toBe(255);
    expect(sharpenMask(128)).toBeGreaterThan(100);
    expect(sharpenMask(128)).toBeLessThan(160);
  });
});
