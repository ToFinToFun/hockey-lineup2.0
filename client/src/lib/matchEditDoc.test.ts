import { describe, expect, it } from "vitest";
import { buildMatchEditDoc, configFromSlots, removedScorers, slotsToSave } from "./matchEditDoc";
import type { Player } from "./players";

const pl = (id: string, name = id): Player => ({ id, name, number: "", position: "F" });
const match = {
  opponentId: null,
  lineup: { lineup: {
    "team-a-gk-1": { id: "g", name: "Gunnar", number: "1", position: "MV" },
    "team-a-def-2-1": { id: "b", name: "Bertil", number: "2", position: "B" },
    "team-b-fwd-3-c": { id: "old", name: "Slutat Spela", number: "9", position: "F" },
  } },
  goalHistory: [
    { team: "white" as const, scorer: "Bertil #2", scorerId: "b", assist: "Slutat Spela #9", assistId: "old" },
    { team: "green" as const, scorer: "Slutat Spela #9", scorerId: "old" },
  ],
};

describe("redigera en sparad matchs uppställning", () => {
  it("bygger uppställningen av matchen, resten av truppen bredvid", () => {
    const doc = buildMatchEditDoc(match, [{ ...pl("g", "Gunnar G"), isRegistered: true }, pl("b"), pl("x")], null);
    expect(doc.lineup["team-a-gk-1"].name).toBe("Gunnar G"); // från truppen
    expect(doc.lineup["team-a-gk-1"].isRegistered).toBeUndefined(); // dagens anmälan gäller inte
    expect(doc.lineup["team-b-fwd-3-c"]).toMatchObject({ id: "old", name: "Slutat Spela" }); // finns inte i truppen längre
    expect(doc.players.map((p) => p.id)).toEqual(["x"]);
    expect(doc.teamAConfig).toEqual({ goalkeepers: 1, defensePairs: 2, forwardLines: 1 });
    expect(doc.teamBConfig).toEqual({ goalkeepers: 1, defensePairs: 1, forwardLines: 3 });
  });

  it("formationen håller sig inom gränserna", () => {
    expect(configFromSlots(["team-a-fwd-9-c", "team-a-gk-5"], "a")).toEqual({ goalkeepers: 2, defensePairs: 1, forwardLines: 4 });
  });

  it("mot andra lag sparas bara vårt lag", () => {
    const l = { "team-a-gk-1": pl("g"), "team-b-gk-1": pl("opp-3"), "team-b-def-1-1": pl("b") };
    expect(slotsToSave(l, true)).toEqual({ "team-a-gk-1": "g" });
    expect(slotsToSave(l, false)).toEqual({ "team-a-gk-1": "g", "team-b-def-1-1": "b" });
  });

  it("varnar bara för borttagna spelare med poäng – lagbyte gör inget", () => {
    expect(removedScorers(match, { "team-b-gk-1": "b", "team-a-def-1-1": "old" }, new Map())).toEqual([]);
    expect(removedScorers(match, { "team-a-def-1-1": "b" }, new Map([["old", "Slutat"]]))).toEqual(["Slutat: 1 mål, 1 assist"]);
  });
});
