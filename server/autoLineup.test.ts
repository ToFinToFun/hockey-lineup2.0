import { describe, expect, it } from "vitest";
import { findMismatch, buildAutoOps } from "./autoLineup";
import { applyOps, emptyDoc } from "../shared/lineupDoc";
import { autoDistribute } from "../client/src/lib/autoDistribute";
import type { Player } from "../client/src/lib/players";

const P = (id: string, position: string, extra: Partial<Player> = {}) => ({ id, name: id.toUpperCase(), number: "", position, ...extra } as Player);

describe("Auto-lag", () => {
  it("hittar anmälda som saknas och spelare som inte kommer", () => {
    const lineup = { "team-a-gk-1": P("a", "MV"), "team-b-gk-1": P("b", "MV") };
    const roster = [P("c", "F"), P("d", "B")];
    const mm = findMismatch(lineup, new Set(["a", "c"]), new Set(["b"]), roster);
    expect(mm.missing.map((p) => p.id)).toEqual(["c"]);
    expect(mm.notComing).toEqual([{ player: lineup["team-b-gk-1"], declined: true }]);
  });
  it("ingen avvikelse när laget stämmer", () => {
    const mm = findMismatch({ "team-a-gk-1": P("a", "MV") }, new Set(["a"]), new Set(), []);
    expect(mm.missing).toHaveLength(0);
    expect(mm.notComing).toHaveLength(0);
  });
  it("gör om laget helt: alla anmälda placeras, övriga i truppen, ingen spelare försvinner", () => {
    const players = [
      P("g1", "MV"), P("g2", "MV"), P("d1", "B"), P("d2", "B"), P("d3", "B"), P("d4", "B"),
      P("c1", "C"), P("c2", "C"), P("f1", "F"), P("f2", "F"), P("f3", "F"), P("f4", "F"), P("x", "F"),
    ].map((p) => ({ ...p, isRegistered: p.id !== "x" }));
    // Utgångsläge: x står i laget (inte anmäld), resten i truppen
    let doc = applyOps(emptyDoc(), players.map((p, index) => ({ t: "rosterUpsert" as const, player: p, index })));
    doc = applyOps(doc, [{ t: "slot", slot: "team-a-gk-1", player: players.find((p) => p.id === "x")! }]);
    const result = autoDistribute(players, {}, { useForBalance: false });
    const next = applyOps(doc, buildAutoOps(players, result));
    const placed = Object.values(next.lineup).map((p) => p.id).sort();
    expect(placed).toEqual(players.filter((p) => p.isRegistered).map((p) => p.id).sort());
    expect(next.players.map((p) => p.id)).toEqual(["x"]);
    expect(new Set([...placed, ...next.players.map((p) => p.id)]).size).toBe(players.length);
  });
});
