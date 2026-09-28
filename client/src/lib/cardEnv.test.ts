// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { browserCardEnv } from "@shared/cardRender";

describe("hockeykortets webbläsarmiljö", () => {
  it("skapar en riktig canvas (och anropar inte sig själv)", () => {
    const spy = vi.spyOn(document, "createElement");
    const c = browserCardEnv.createCanvas(750, 1050);
    expect(spy).toHaveBeenCalledWith("canvas");
    expect(c.width).toBe(750);
    expect(c.height).toBe(1050);
  });
});
