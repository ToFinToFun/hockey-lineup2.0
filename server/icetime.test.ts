/**
 * Tests for IceTime calculator logic
 * (Pure frontend logic, but we test it here since it's a shared hook)
 */
import { describe, it, expect } from "vitest";

// Import the pure calculation function (not the React hook)
import {
  calculateDistributions,
  formatTime,
  POSITION_LIMITS,
} from "../client/src/hooks/useIceTimeCalculator";

describe("IceTime Calculator", () => {
  describe("calculateDistributions", () => {
    it("returns error for fewer than 5 players", () => {
      const result = calculateDistributions(4, 60);
      expect(result.isValid).toBe(false);
      expect(result.best).toBeNull();
      expect(result.distributions).toHaveLength(0);
      expect(result.errorMessage).toContain("5");
    });

    it("returns error for more than 20 players", () => {
      const result = calculateDistributions(21, 60);
      expect(result.isValid).toBe(false);
      expect(result.best).toBeNull();
      expect(result.distributions).toHaveLength(0);
      expect(result.errorMessage).toContain("20");
    });

    it("returns valid distributions for 10 players", () => {
      const result = calculateDistributions(10, 60);
      expect(result.isValid).toBe(true);
      expect(result.best).not.toBeNull();
      expect(result.distributions.length).toBeGreaterThan(0);
      expect(result.totalPlayers).toBe(10);
      expect(result.matchTime).toBe(60);
    });

    it("best distribution for 10 players has equal time (perfect)", () => {
      const result = calculateDistributions(10, 60);
      expect(result.best).not.toBeNull();
      // 4B + 2C + 4F = 10, all get 30 min → maxDifference = 0
      expect(result.best!.backs).toBe(4);
      expect(result.best!.centers).toBe(2);
      expect(result.best!.forwards).toBe(4);
      expect(result.best!.maxDifference).toBe(0);
    });

    it("best distribution for 15 players has equal time (perfect)", () => {
      const result = calculateDistributions(15, 60);
      expect(result.best).not.toBeNull();
      // 6B + 3C + 6F = 15, all get 20 min → maxDifference = 0
      expect(result.best!.backs).toBe(6);
      expect(result.best!.centers).toBe(3);
      expect(result.best!.forwards).toBe(6);
      expect(result.best!.maxDifference).toBe(0);
    });

    it("distributions are sorted by maxDifference ascending", () => {
      const result = calculateDistributions(11, 60);
      for (let i = 1; i < result.distributions.length; i++) {
        expect(result.distributions[i].maxDifference).toBeGreaterThanOrEqual(
          result.distributions[i - 1].maxDifference
        );
      }
    });

    it("all distributions sum to totalPlayers", () => {
      const result = calculateDistributions(12, 60);
      for (const dist of result.distributions) {
        expect(dist.backs + dist.centers + dist.forwards).toBe(12);
      }
    });

    it("all distributions respect position limits", () => {
      const result = calculateDistributions(13, 60);
      for (const dist of result.distributions) {
        expect(dist.backs).toBeGreaterThanOrEqual(POSITION_LIMITS.backs.min);
        expect(dist.backs).toBeLessThanOrEqual(POSITION_LIMITS.backs.max);
        expect(dist.centers).toBeGreaterThanOrEqual(POSITION_LIMITS.centers.min);
        expect(dist.centers).toBeLessThanOrEqual(POSITION_LIMITS.centers.max);
        expect(dist.forwards).toBeGreaterThanOrEqual(POSITION_LIMITS.forwards.min);
        expect(dist.forwards).toBeLessThanOrEqual(POSITION_LIMITS.forwards.max);
      }
    });

    it("uses default matchTime of 60 when not specified", () => {
      const result = calculateDistributions(10);
      expect(result.matchTime).toBe(60);
      expect(result.best!.timePerBack).toBe(30);
    });

    it("works with custom matchTime", () => {
      const result = calculateDistributions(10, 90);
      expect(result.matchTime).toBe(90);
      // 4B, 2/4 * 90 = 45 min per back
      expect(result.best!.timePerBack).toBe(45);
    });

    it("ranks distributions starting from 1", () => {
      const result = calculateDistributions(11, 60);
      expect(result.distributions[0].rank).toBe(1);
      expect(result.distributions[result.distributions.length - 1].rank).toBe(
        result.distributions.length
      );
    });

    it("handles edge case of exactly 5 players (no valid distribution)", () => {
      // 5 players: min is 3B + 2C + 3F = 8, so 5 has no valid combo
      const result = calculateDistributions(5, 60);
      expect(result.isValid).toBe(true); // isValid is true (>= MIN_PLAYERS)
      expect(result.distributions).toHaveLength(0); // but no valid distributions
      expect(result.best).toBeNull();
    });
  });

  describe("formatTime", () => {
    it("formats whole minutes", () => {
      expect(formatTime(30)).toBe("30 min");
    });

    it("formats minutes with seconds", () => {
      expect(formatTime(24.5)).toBe("24:30 min");
    });

    it("formats zero minutes", () => {
      expect(formatTime(0)).toBe("0 min");
    });

    it("pads seconds with leading zero", () => {
      // 20.1 min = 20 min 6 sec
      expect(formatTime(20.1)).toBe("20:06 min");
    });
  });
});
