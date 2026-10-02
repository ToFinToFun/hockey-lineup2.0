import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkReload";

describe("isChunkLoadError", () => {
  it("känner igen webbläsarnas felmeddelanden", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Home-abc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
