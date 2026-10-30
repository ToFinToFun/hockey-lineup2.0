import { describe, expect, it } from "vitest";
import { teamRoster } from "./finalStats";

const match = (teamAName: string, a: string[], b: string[]) => ({
  lineup: { teamAName, lineup: Object.fromEntries([...a.map((id, i) => [`team-a-fwd-1-${i}`, { id }]), ...b.map((id, i) => [`team-b-fwd-1-${i}`, { id }])]) },
}) as never;

describe("mästarlaget", () => {
  it("räknar matcher per lag (lag A kan vara Vita eller Gröna) och kräver minst N", () => {
    const ms = [match("Vita", ["p1", "p2"], ["p3"]), match("Gröna", ["p3"], ["p1"]), match("Vita", ["p1"], ["p2"])];
    const names = new Map([["p1", { name: "Ett", number: "1" }], ["p2", { name: "Två", number: null }]]);
    expect(teamRoster(ms, "white", names, 2).map((r) => `${r.name} ${r.matches}`)).toEqual(["Ett 3"]);
    expect(teamRoster(ms, "white", names, 1).map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(teamRoster(ms, "green", names, 2).map((r) => r.id)).toEqual(["p3"]);
  });
  it("C först, sedan A (alltid med), sedan flest matcher", () => {
    const ms = [match("Vita", ["p1", "p2", "p4"], []), match("Vita", ["p1", "p4"], []), match("Vita", ["p4"], [])];
    const names = new Map<string, { name: string; number: string | null; captainRole?: string | null; teamColor?: string | null }>([
      ["p1", { name: "Ett", number: "1" }], ["p2", { name: "Två", number: null, captainRole: "A" }],
      ["p4", { name: "Fyra", number: null }], ["p5", { name: "Kapten", number: null, captainRole: "C", teamColor: "white" }],
      ["p6", { name: "Annan C", number: null, captainRole: "C", teamColor: "green" }],
    ]);
    expect(teamRoster(ms, "white", names, 2).map((r) => r.name)).toEqual(["Kapten", "Två", "Fyra", "Ett"]);
  });
});
