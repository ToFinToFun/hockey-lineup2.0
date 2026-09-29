import { describe, expect, it } from "vitest";
import { teamGroups, eventLine } from "./MediaApp";

describe("Media – data från Lineup och laget.se", () => {
  const doc = {
    teamAName: "VITA", teamBName: "GRÖNA",
    teamAConfig: { goalkeepers: 1, defensePairs: 1, forwardLines: 1 },
    teamBConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
    lineup: {
      "team-b-gk-1": { id: "g", name: "Vide", number: "30", position: "MV" },
      "team-b-def-1-1": { id: "d1", name: "Jimmy", number: "", position: "B" },
      "team-b-fwd-1-c": { id: "c", name: "Teddie", number: "9", position: "C", captainRole: "C" },
      "team-a-fwd-1-lw": { id: "w", name: "Vit Spelare", number: "5", position: "F" },
    },
  } as never;
  it("bara det valda lagets spelare, grupperade, med position, nummer och C/A", () => {
    const g = teamGroups(doc, "green");
    expect(g.name).toBe("Gröna");
    expect(g.groups.map((x) => x.label)).toEqual(["Målvakt", "Backpar 1", "1:a kedjan"]);
    expect(g.groups[0].players[0]).toMatchObject({ pos: "MV", name: "Vide", number: "30" });
    expect(g.groups[1].players[0].number).toBeUndefined();
    expect(g.groups[2].players[0]).toMatchObject({ pos: "C", captain: "C" });
    expect(teamGroups(doc, "white").groups.flatMap((x) => x.players.map((p) => p.name))).toEqual(["Vit Spelare"]);
  });
  it("datumraden av evenemanget", () => {
    expect(eventLine({ eventDate: "2026-09-29", eventTime: "22:15", eventLocation: "Arenan" })).toBe("Tisdag 29/9 · Arenan 22:15");
    expect(eventLine(null)).toBe("");
  });
});
