import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for lineup-related tRPC endpoints.
 * These test the router procedure definitions and input validation.
 * Database operations are tested through the actual DB (integration tests).
 */

function createPublicContext(): TrpcContext {
  return {
    session: { role: "admin", expiresAt: Date.now() + 60_000 },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("lineup tRPC router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createPublicContext());
  });

  describe("lineup.getState", () => {
    it("should return the current lineup state or null", async () => {
      const result = await caller.lineup.getState();
      // Should return either a state object or null (no state yet)
      if (result !== null) {
        expect(result).toHaveProperty("players");
        expect(result).toHaveProperty("lineup");
        expect(result).toHaveProperty("teamAName");
        expect(result).toHaveProperty("teamBName");
        expect(result).toHaveProperty("version");
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe("lineup.patch", () => {
    it("tillämpar ändringar, räknar upp versionen och är idempotent", async () => {
      const before = await caller.lineup.getState();
      const id = `test-${Date.now()}`;
      const r1 = await caller.lineup.patch({
        id,
        ops: [{ t: "rosterUpsert", player: { id: "pp1", name: "Patch Spelare" }, index: 0 }],
      });
      expect(r1.version).toBe(before.version + 1);
      const again = await caller.lineup.patch({
        id,
        ops: [{ t: "rosterUpsert", player: { id: "pp1", name: "Patch Spelare" }, index: 0 }],
      });
      expect(again).toEqual({ version: r1.version, duplicate: true });
      const after = await caller.lineup.getState();
      expect(after.players.some((p) => p.id === "pp1")).toBe(true);
      expect(after.appliedPatchIds).toContain(id);
    });

    it("avvisar ogiltiga operationer", async () => {
      await expect(
        caller.lineup.patch({ id: "test-invalid-1", ops: [{ t: "field", key: "teamAConfig", value: { goalkeepers: 9, defensePairs: 1, forwardLines: 1 } }] as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("lineup.saveState", () => {
    it("should save a valid lineup state and return a version number", async () => {
      const result = await caller.lineup.saveState({
        players: [
          { id: "p1", name: "Test Player 1", position: "F" },
          { id: "p2", name: "Test Player 2", position: "B" },
        ],
        lineup: {
          "team-a-fwd-1-lw": { id: "p1", name: "Test Player 1", position: "F" },
        },
        teamAName: "VITA",
        teamBName: "GRÖNA",
        teamAConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
        teamBConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
        operation: {
          opType: "movePlayer",
          description: "Test: moved player to slot",
        },
      });

      expect(result).toHaveProperty("version");
      expect(typeof result.version).toBe("number");
      expect(result.version).toBeGreaterThan(0);
    });

    it("should increment version on each save", async () => {
      const result1 = await caller.lineup.saveState({
        players: [],
        lineup: {},
        teamAName: "VITA",
        teamBName: "GRÖNA",
      });

      const result2 = await caller.lineup.saveState({
        players: [],
        lineup: {},
        teamAName: "VITA",
        teamBName: "GRÖNA",
      });

      expect(result2.version).toBeGreaterThan(result1.version);
    });
  });

  describe("savedLineups.create", () => {
    it("should create a saved lineup and return shareId", async () => {
      const result = await caller.savedLineups.create({
        name: "Test Lineup " + Date.now(),
        teamAName: "VITA",
        teamBName: "GRÖNA",
        lineup: {
          "team-a-fwd-1-lw": { id: "p1", name: "Test Player", position: "F" },
        },
      });

      expect(result).toHaveProperty("shareId");
      expect(result).toHaveProperty("id");
      expect(typeof result.shareId).toBe("string");
      expect(result.shareId.length).toBe(12);
      expect(typeof result.id).toBe("number");
    });
  });

  describe("savedLineups.list", () => {
    it("should return an array of saved lineups", async () => {
      const result = await caller.savedLineups.list();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("shareId");
        expect(result[0]).toHaveProperty("name");
        expect(result[0]).toHaveProperty("lineup");
        expect(result[0]).toHaveProperty("favorite");
      }
    });
  });

  describe("savedLineups.getByShareId", () => {
    it("should return a saved lineup by shareId", async () => {
      // First create one
      const created = await caller.savedLineups.create({
        name: "Lookup Test " + Date.now(),
        teamAName: "VITA",
        teamBName: "GRÖNA",
        lineup: {},
      });

      const result = await caller.savedLineups.getByShareId({
        shareId: created.shareId,
      });

      expect(result).not.toBeNull();
      expect(result!.shareId).toBe(created.shareId);
      expect(result!.name).toContain("Lookup Test");
    });

    it("should return null for non-existent shareId", async () => {
      const result = await caller.savedLineups.getByShareId({
        shareId: "nonexistent123",
      });
      expect(result).toBeNull();
    });
  });

  describe("savedLineups.toggleFavorite", () => {
    it("should toggle favorite status", async () => {
      const created = await caller.savedLineups.create({
        name: "Favorite Test " + Date.now(),
        teamAName: "VITA",
        teamBName: "GRÖNA",
        lineup: {},
      });

      const result = await caller.savedLineups.toggleFavorite({ id: created.id });
      expect(result).toEqual({ success: true });

      // Verify it was toggled
      const updated = await caller.savedLineups.getByShareId({
        shareId: created.shareId,
      });
      expect(updated!.favorite).toBe(true);

      // Toggle back
      await caller.savedLineups.toggleFavorite({ id: created.id });
      const toggledBack = await caller.savedLineups.getByShareId({
        shareId: created.shareId,
      });
      expect(toggledBack!.favorite).toBe(false);
    });
  });

  describe("savedLineups.delete", () => {
    it("should delete a saved lineup", async () => {
      const created = await caller.savedLineups.create({
        name: "Delete Test " + Date.now(),
        teamAName: "VITA",
        teamBName: "GRÖNA",
        lineup: {},
      });

      const result = await caller.savedLineups.delete({ id: created.id });
      expect(result).toEqual({ success: true });

      // Verify it's gone
      const deleted = await caller.savedLineups.getByShareId({
        shareId: created.shareId,
      });
      expect(deleted).toBeNull();
    });
  });
});
