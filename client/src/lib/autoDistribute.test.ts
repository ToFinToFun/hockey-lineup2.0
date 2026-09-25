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

  // ─── Regler från styrelsen (v2.3) ────────────────────────────────────────

  const teamOf = (lineup: Record<string, Player>, id: string) =>
    Object.entries(lineup).find(([, p]) => p.id === id)?.[0].slice(0, 6);
  const sizes = (lineup: Record<string, Player>) => ({
    a: Object.keys(lineup).filter(k => k.startsWith("team-a")).length,
    b: Object.keys(lineup).filter(k => k.startsWith("team-b")).length,
  });
  const strong = { pir: 1200, pirOutfield: 1200, pirMatchesPlayed: 10 };
  const weak = { pir: 800, pirOutfield: 800, pirMatchesPlayed: 10 };

  it("jämnt antal spelare per lag räknat med målvakter", () => {
    const players = [
      makePlayer("mv1", "MV"), makePlayer("mv2", "MV"), makePlayer("mv3", "MV"),
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`f${i}`, i % 2 ? "F" : "B")),
    ];
    const { a, b } = sizes(autoDistribute(players, {}).lineup);
    expect(a + b).toBe(12);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it("backar och forwards fördelas jämnt mellan lagen", () => {
    const players = [
      ...["b1", "b2", "b3", "b4"].map(id => makePlayer(id, "B")),
      ...["f1", "f2", "f3", "f4"].map(id => makePlayer(id, "F")),
    ];
    const { lineup } = autoDistribute(players, {});
    const inA = (ids: string[]) => ids.filter(id => teamOf(lineup, id) === "team-a").length;
    expect(inA(["b1", "b2", "b3", "b4"])).toBe(2);
    expect(inA(["f1", "f2", "f3", "f4"])).toBe(2);
  });

  it("lagtillhörighet går före jämnt antal", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => makePlayer(`w${i}`, "F", { teamColor: "white" })),
      makePlayer("n1", "F"),
    ];
    const { lineup } = autoDistribute(players, {});
    for (let i = 0; i < 5; i++) expect(teamOf(lineup, `w${i}`)).toBe("team-a");
    expect(teamOf(lineup, "n1")).toBe("team-b");
  });

  it("PIR balanserar lagen: starka och svaga delas lika", () => {
    const players = [
      ...["s1", "s2", "s3", "s4"].map(id => makePlayer(id, "F", strong)),
      ...["w1", "w2", "w3", "w4"].map(id => makePlayer(id, "F", weak)),
    ];
    const { lineup } = autoDistribute(players, {});
    const strongInA = ["s1", "s2", "s3", "s4"].filter(id => teamOf(lineup, id) === "team-a").length;
    expect(strongInA).toBe(2);
  });

  it("målvakt som även spelat ute blir utespelare när två rena målvakter finns", () => {
    const players = [
      makePlayer("mv1", "MV"), makePlayer("mv2", "MV"),
      makePlayer("mvx", "MV", { mostPlayedPosition: "B" }),
      ...["b1", "b2", "f1", "f2"].map((id, i) => makePlayer(id, i < 2 ? "B" : "F")),
    ];
    const { lineup } = autoDistribute(players, {});
    const slotOf = (id: string) => Object.entries(lineup).find(([, p]) => p.id === id)?.[0] ?? "";
    expect(slotOf("mv1")).toMatch(/-gk-/);
    expect(slotOf("mv2")).toMatch(/-gk-/);
    expect(slotOf("mvx")).not.toMatch(/-gk-/);
    expect(slotOf("mvx")).not.toBe("");
  });

  it("ny spelare med manuell justering räknas som stark", () => {
    const players = [
      makePlayer("new", "F", { pirMatchesPlayed: 0, pir: 1000, pirAdjustment: 300 }),
      makePlayer("s1", "F", strong),
      makePlayer("w1", "F", weak), makePlayer("w2", "F", weak),
    ];
    const { lineup } = autoDistribute(players, {});
    // Den justerade nya spelaren och den starka ska hamna i olika lag.
    expect(teamOf(lineup, "new")).not.toBe(teamOf(lineup, "s1"));
  });
});
