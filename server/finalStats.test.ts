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
});
