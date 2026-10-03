import { describe, expect, it } from "vitest";
import { listAsSlots } from "./opponentList";
import { generateLineupText } from "./lineupText";
import { teamColumns } from "./lagetNews";
import { normalizeSetup } from "@shared/matchSetup";
import type { Player } from "./players";

const P = (id: string, name: string, number: string, position: string) => ({ id, name, number, position } as Player);
const players = [P("opp-3", "Fwd Ett", "17", "F"), P("opp-1", "Målis", "1", "MV"), P("opp-2", "Back", "4", "B"), P("opp-4", "Center", "9", "C")];

describe("motståndaren som lista", () => {
  it("sorteras MV, B, forwards och delas i Målvakter/Backar/Forwards utan kedjor", () => {
    const { slots, lineup } = listAsSlots(players);
    expect(slots.map((s) => lineup[s.id].name)).toEqual(["Målis", "Back", "Center", "Fwd Ett"]);
    const cols = teamColumns(slots, lineup);
    expect(cols.left.map((s) => s.title)).toEqual(["Målvakter", "Backar"]);
    expect(cols.right[0].groups).toHaveLength(1);
    expect(cols.right[0].groups[0].label).toBeFalsy();
  });
  it("nyhetstexten listar spelarna med position och nummer", () => {
    const { slots, lineup } = listAsSlots(players);
    const text = generateLineupText({ teamAName: "OSS", teamBName: "DEM" } as never, [], slots, {}, lineup);
    expect(text).toContain("MV   Målis #1");
    expect(text).toContain("F    Fwd Ett #17");
  });
  it("listan sparas i matchinställningen", () => {
    expect(normalizeSetup({ mode: "external", opponentId: 1, ourName: null, ourLogo: "club", oppList: [2, 2, 5] }).oppList).toEqual([2, 5]);
    expect(normalizeSetup({ mode: "external", opponentId: 1, ourName: null, ourLogo: "club" }).oppList).toBeNull();
  });
});
