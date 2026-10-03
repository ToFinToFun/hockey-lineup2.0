import { describe, expect, it } from "vitest";
import { newOpponentNames, parseScorerName } from "./opponents";

describe("motståndarens inskrivna spelare", () => {
  it("läser nummer", () => {
    expect(parseScorerName("Erik Lund #9")).toEqual({ name: "Erik Lund", number: "9" });
    expect(parseScorerName(" Kalle ")).toEqual({ name: "Kalle", number: null });
  });
  it("bara motståndarens mål, nya namn en gång", () => {
    const goals = [
      { team: "green", scorer: "Erik Lund #9", assist: "Kalle" },
      { team: "green", scorer: "erik lund" },
      { team: "white", scorer: "Vår spelare" },
      { team: "green", scorer: "Sparad Spelare" },
    ];
    expect(newOpponentNames(goals, ["Sparad Spelare"])).toEqual([{ name: "Erik Lund", number: "9" }, { name: "Kalle", number: null }]);
  });
});
