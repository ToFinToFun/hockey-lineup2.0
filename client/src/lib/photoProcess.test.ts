import { describe, expect, it } from "vitest";
import { portraitCrop } from "./photoProcess";

describe("profilbildens beskärning (stående 3:4)", () => {
  it("liggande bild: mitten i bredd, hela höjden", () => expect(portraitCrop(1600, 900)).toEqual({ sx: 463, sy: 0, sw: 675, sh: 900 }));
  it("hög bild: hela bredden, ovanför mitten i höjd", () => expect(portraitCrop(900, 1600)).toEqual({ sx: 0, sy: 120, sw: 900, sh: 1200 }));
  it("redan 3:4: allt", () => expect(portraitCrop(600, 800)).toEqual({ sx: 0, sy: 0, sw: 600, sh: 800 }));
});
