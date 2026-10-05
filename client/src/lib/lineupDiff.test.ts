import { describe, expect, it } from "vitest";
import { diffLineups, doneMessage, previewLines, isEmptyDiff } from "./lineupDiff";

const p = (id: string) => ({ id, name: id.toUpperCase(), number: "", position: "F" as const });

describe("vad Auto ändrar", () => {
  it("inga förändringar", () => {
    const l = { "team-a-fwd-1-c": p("a"), "team-b-fwd-1-c": p("b") };
    const d = diffLineups(l, { ...l });
    expect(isEmptyDiff(d)).toBe(true);
    expect(doneMessage(d)).toBe("Klart! Inga förändringar gjordes.");
  });
  it("lägger till, tar bort, byter lag och flyttar inom laget", () => {
    const before = { "team-a-fwd-1-c": p("a"), "team-a-fwd-1-lw": p("b"), "team-b-fwd-1-c": p("c"), "team-b-def-1-1": p("d") };
    const after = { "team-a-fwd-1-rw": p("b"), "team-b-fwd-1-c": p("a"), "team-b-def-1-1": p("d"), "team-a-def-1-1": p("e") };
    const d = diffLineups(before, after);
    expect(d.added.map((x) => x.id)).toEqual(["e"]);
    expect(d.removed.map((x) => x.id)).toEqual(["c"]);
    expect(d.switched.map((x) => x.id)).toEqual(["a"]);
    expect(d.moved.map((x) => x.id)).toEqual(["b"]);
    expect(doneMessage(d)).toBe("Klart! 1 spelare lades till, 1 spelare togs bort, 1 bytte lag, 1 flyttades inom laget.");
    expect(previewLines(d)).toEqual([
      "• Lägga till 1 spelare: E",
      "• Ta bort 1 spelare: C",
      "• Flytta 1 spelare till andra laget: A",
      "• Flytta 1 spelare inom laget",
    ]);
  });
});
