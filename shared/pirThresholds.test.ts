import { describe, expect, it, afterEach } from "vitest";
import { sanitizeThresholds, setPirThresholds, pirThresholds, DEFAULT_PIR_THRESHOLDS } from "./pirThresholds";
import { hasPirHistory } from "../client/src/lib/pirValue";

afterEach(() => setPirThresholds(null));
describe("PIR-gränser", () => {
  it("standard och gränser", () => {
    expect(sanitizeThresholds(null)).toEqual(DEFAULT_PIR_THRESHOLDS);
    expect(sanitizeThresholds({ minMatchesShow: 0, fullConfidence: 999 })).toMatchObject({ minMatchesShow: 1, fullConfidence: 50 });
  });
  it("visningsgränsen styr när betyget används", () => {
    const p = { pir: 1100, pirMatchesPlayed: 4 } as never;
    expect(hasPirHistory(p)).toBe(true);
    setPirThresholds({ minMatchesShow: 5 });
    expect(pirThresholds().minMatchesShow).toBe(5);
    expect(hasPirHistory(p)).toBe(false);
  });
});
