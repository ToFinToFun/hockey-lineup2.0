import { describe, expect, it } from "vitest";
import { squareCrop } from "./photoProcess";

describe("profilbildens beskärning", () => {
  it("liggande: mitten", () => expect(squareCrop(1600, 900)).toEqual({ sx: 350, sy: 0, side: 900 }));
  it("stående: mitt i bredd, ovanför mitten i höjd", () => expect(squareCrop(900, 1600)).toEqual({ sx: 0, sy: 210, side: 900 }));
  it("kvadrat: allt", () => expect(squareCrop(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 }));
});
