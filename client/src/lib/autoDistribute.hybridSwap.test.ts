import { describe, it, expect } from "vitest";
import { autoDistribute } from "./autoDistribute";
import type { Player } from "./players";

function p(id: string, position: Player["position"], opts?: Partial<Player>): Player {
  return { id, number: "", name: id, position, isRegistered: true, teamColor: "white", ...opts };
}

/** Vita från skärmdumpen 2026-10-11: tre backar på två backplatser, en tom centerplats. */
function vita(order: "sandmanFirst" | "scholsFirst"): Player[] {
  const backs = [
    p("sandman", "B", { altPosition: "C" }),
    p("bjorling", "B"),
    p("schols", "B", { altPosition: "MV" }),
  ];
  if (order === "scholsFirst") backs.reverse();
  return [
    p("robin", "MV"),
    ...backs,
    p("alexander", "F"),
    p("marcus", "F"),
  ];
}

/** Fullt grönt lag så att antalet redan är jämnt och vita stannar i Vita. */
const grona = (): Player[] => [
  p("g-mv", "MV", { teamColor: "green" }),
  p("g-b1", "B", { teamColor: "green" }), p("g-b2", "B", { teamColor: "green" }),
  p("g-c", "C", { teamColor: "green" }),
  p("g-f1", "F", { teamColor: "green" }), p("g-f2", "F", { teamColor: "green" }),
];

const slotOf = (lineup: Record<string, Player>, id: string) =>
  Object.entries(lineup).find(([, pl]) => pl.id === id)?.[0];

describe("autoDistribute – byte via hybridspelare", () => {
  for (const order of ["sandmanFirst", "scholsFirst"] as const) {
    it(`back/center blir center, back/MV blir back (${order})`, () => {
      const { lineup, remaining } = autoDistribute([...vita(order), ...grona()], {});
      expect(remaining).toHaveLength(0);
      expect(slotOf(lineup, "sandman")).toBe("team-a-fwd-1-c");
      expect(slotOf(lineup, "schols")).toMatch(/^team-a-def-/);
      expect(slotOf(lineup, "bjorling")).toMatch(/^team-a-def-/);
      expect(slotOf(lineup, "robin")).toMatch(/^team-a-gk/);
    });
  }

  it("byter inte när en som blivit över själv passar på den tomma platsen", () => {
    const players = [
      p("mv", "MV"),
      p("b1", "B", { altPosition: "C" }),
      p("b2", "B"),
      p("b3", "B", { secondaryPosition: "C" }),
      p("f1", "F"),
      p("f2", "F"),
    ];
    const { lineup } = autoDistribute([...players, ...grona()], {});
    // b1 och b2 tar backplatserna, b3 passar som C (historik) och tar centern direkt.
    expect(slotOf(lineup, "b3")).toBe("team-a-fwd-1-c");
    expect(slotOf(lineup, "b1")).toMatch(/^team-a-def-/);
  });

  it("flyttar hellre en vanlig spelare än lagkaptenen", () => {
    const players = [
      p("mv", "MV"),
      p("kapten", "B", { altPosition: "C", captainRole: "C" }),
      p("hybrid", "B", { altPosition: "C" }),
      p("back", "B", { altPosition: "MV" }),
      p("f1", "F"),
      p("f2", "F"),
    ];
    const { lineup } = autoDistribute([...players, ...grona()], {});
    expect(slotOf(lineup, "hybrid")).toBe("team-a-fwd-1-c");
    expect(slotOf(lineup, "kapten")).toMatch(/^team-a-def-/);
  });

  it("ingen hybrid: oförändrat beteende, alla får ändå plats", () => {
    const players = [p("mv", "MV"), p("b1", "B"), p("b2", "B"), p("b3", "B"), p("f1", "F"), p("f2", "F")];
    const { lineup, remaining } = autoDistribute([...players, ...grona()], {});
    expect(remaining).toHaveLength(0);
    expect(Object.keys(lineup)).toHaveLength(12);
  });
});
