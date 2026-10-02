import { describe, expect, it } from "vitest";
import { INTRO_SECONDS, introAngle, visibleSide } from "./videoIntro";

describe("intro 1 – puckflippen", () => {
  it("startar på motsatt lag och landar på det valda", () => {
    for (const land of ["green", "white"] as const) {
      const other = land === "green" ? "white" : "green";
      expect(visibleSide(introAngle(0), land)).toBe(other);
      expect(visibleSide(introAngle(INTRO_SECONDS), land)).toBe(land);
    }
  });
  it("står still i slutet (inget ryck in i intro 2)", () => {
    expect(introAngle(INTRO_SECONDS - 0.2)).toBeCloseTo(introAngle(INTRO_SECONDS), 5);
  });
});
