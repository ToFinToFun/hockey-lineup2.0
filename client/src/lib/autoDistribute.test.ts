import { describe, it, expect } from "vitest";
import { autoDistribute } from "./autoDistribute";
import type { Player } from "./players";

function makePlayer(id: string, position: Player["position"], opts?: Partial<Player>): Player {
  return {
    id,
    number: "",
    name: `Player ${id}`,
    position,
    isRegistered: true,
    ...opts,
  };
}

describe("autoDistribute", () => {
  it("places goalkeepers only in goalkeeper slots", () => {
    const players: Player[] = [
      makePlayer("mv1", "MV"),
      makePlayer("mv2", "MV"),
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
    ];

    const result = autoDistribute(players, {});

    // Check that MV players are in goalkeeper slots
    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (player.position === "MV") {
        expect(slotId).toMatch(/gk/);
      }
    }
  });

  it("respects team color affiliation (white → team-a, green → team-b)", () => {
    const players: Player[] = [
      makePlayer("f1", "F", { teamColor: "white" }),
      makePlayer("f2", "F", { teamColor: "green" }),
      makePlayer("f3", "F", { teamColor: "white" }),
      makePlayer("f4", "F", { teamColor: "green" }),
    ];

    const result = autoDistribute(players, {});

    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (player.teamColor === "white") {
        expect(slotId).toMatch(/^team-a/);
      } else if (player.teamColor === "green") {
        expect(slotId).toMatch(/^team-b/);
      }
    }
  });

  it("distributes neutral players evenly across teams", () => {
    const players: Player[] = [
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
      makePlayer("f3", "F"),
      makePlayer("f4", "F"),
      makePlayer("f5", "F"),
      makePlayer("f6", "F"),
    ];

    const result = autoDistribute(players, {});

    let teamACount = 0;
    let teamBCount = 0;
    for (const slotId of Object.keys(result.lineup)) {
      if (slotId.startsWith("team-a")) teamACount++;
      else if (slotId.startsWith("team-b")) teamBCount++;
    }

    // Should be roughly equal (within 1)
    expect(Math.abs(teamACount - teamBCount)).toBeLessThanOrEqual(1);
  });

  it("only places registered players", () => {
    const players: Player[] = [
      makePlayer("f1", "F", { isRegistered: true }),
      makePlayer("f2", "F", { isRegistered: false }),
      makePlayer("f3", "F", { isRegistered: undefined }),
    ];

    const result = autoDistribute(players, {});

    const placedIds = new Set(Object.values(result.lineup).map(p => p.id));
    expect(placedIds.has("f1")).toBe(true);
    expect(placedIds.has("f2")).toBe(false);
    expect(placedIds.has("f3")).toBe(false);
  });

  it("IB players can play anywhere except goalkeeper", () => {
    const players: Player[] = [
      makePlayer("ib1", "IB"),
      makePlayer("ib2", "IB"),
      makePlayer("ib3", "IB"),
    ];

    const result = autoDistribute(players, {});

    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (player.position === "IB") {
        expect(slotId).not.toMatch(/gk/);
      }
    }
  });

  it("places defenders in defense slots", () => {
    const players: Player[] = [
      makePlayer("b1", "B"),
      makePlayer("b2", "B"),
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
    ];

    const result = autoDistribute(players, {});

    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (player.position === "B") {
        expect(slotId).toMatch(/def/);
      }
    }
  });

  it("handles a full team with all positions", () => {
    const players: Player[] = [
      makePlayer("mv1", "MV"),
      makePlayer("mv2", "MV"),
      makePlayer("b1", "B"),
      makePlayer("b2", "B"),
      makePlayer("b3", "B"),
      makePlayer("b4", "B"),
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
      makePlayer("f3", "F"),
      makePlayer("c1", "C"),
      makePlayer("c2", "C"),
      makePlayer("c3", "C"),
      makePlayer("ib1", "IB"),
      makePlayer("ib2", "IB"),
    ];

    const result = autoDistribute(players, {});

    // All registered players should be placed
    const placedCount = Object.keys(result.lineup).length;
    expect(placedCount).toBe(14);
    expect(result.remaining).toHaveLength(0);
  });

  it("returns remaining players that don't fit", () => {
    // 20 players but limited slots
    const players: Player[] = Array.from({ length: 20 }, (_, i) =>
      makePlayer(`f${i}`, "F")
    );

    const result = autoDistribute(players, {});

    // Should have some placed and some remaining
    const totalPlaced = Object.keys(result.lineup).length;
    expect(totalPlaced + result.remaining.length).toBe(20);
  });

  it("prioritizes Center players on C-slots", () => {
    const players: Player[] = [
      makePlayer("c1", "C"),
      makePlayer("c2", "C"),
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
      makePlayer("f3", "F"),
      makePlayer("f4", "F"),
    ];

    const result = autoDistribute(players, {});

    // C-players should be on C-slots (role: "c" → slot id contains "-c")
    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (slotId.match(/fwd-\d+-c$/)) {
        // C-slots should have C-players when available
        expect(player.position).toBe("C");
      }
    }
  });

  it("places F players on wing slots (LW/RW) when centers are available", () => {
    const players: Player[] = [
      makePlayer("c1", "C"),
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
    ];

    const result = autoDistribute(players, {});

    // F-players should prefer LW/RW slots
    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (player.position === "F") {
        expect(slotId).toMatch(/fwd-\d+-(lw|rw)/);
      }
    }
  });

  it("does not place non-MV players in goalkeeper slots", () => {
    const players: Player[] = [
      makePlayer("f1", "F"),
      makePlayer("f2", "F"),
      makePlayer("b1", "B"),
      makePlayer("ib1", "IB"),
    ];

    const result = autoDistribute(players, {});

    for (const [slotId, player] of Object.entries(result.lineup)) {
      if (slotId.includes("gk")) {
        expect(player.position).toBe("MV");
      }
    }
  });
});
