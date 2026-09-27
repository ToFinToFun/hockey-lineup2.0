import { describe, expect, it } from "vitest";
import { processPixels, visibleBounds } from "./logoProcess";

const px = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());

describe("loggbearbetning", () => {
  it("vit bakgrund blir genomskinlig, färg behålls", () => {
    const d = px([255, 255, 255, 255], [200, 30, 30, 255], [230, 230, 230, 255]);
    processPixels(d, { removeWhite: true, makeWhite: false });
    expect(d[3]).toBe(0);
    expect(d[7]).toBe(255);
    expect(d[11]).toBeGreaterThan(0);
    expect(d[11]).toBeLessThan(255);
  });

  it("gör synliga pixlar vita", () => {
    const d = px([10, 20, 30, 200]);
    processPixels(d, { removeWhite: false, makeWhite: true });
    expect(Array.from(d)).toEqual([255, 255, 255, 200]);
  });

  it("hittar den synliga rutan", () => {
    // 3x3 med en synlig pixel i mitten
    const d = new Uint8ClampedArray(3 * 3 * 4);
    d[(1 * 3 + 1) * 4 + 3] = 255;
    expect(visibleBounds(d, 3, 3)).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(visibleBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});
