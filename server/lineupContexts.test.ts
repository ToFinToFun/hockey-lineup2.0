import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("./scoreDb", () => ({
  getConfigValue: async (k: string) => store.get(k) ?? null,
  setConfigValue: async (k: string, v: string) => { store.set(k, v); },
}));

const { saveLineupContext, getLineupContext } = await import("./lineupContexts");
const { contextKeyOf } = await import("../shared/matchSetup");

describe("matchens sparade uppställning", () => {
  it("nyckel per match", () => {
    expect(contextKeyOf({ mode: "internal", opponentId: null })).toBe("internal");
    expect(contextKeyOf({ mode: "external", opponentId: 7 })).toBe("opp-7");
  });
  it("mot motståndare sparas bara vårt lag; internmatch och extern blandas inte", async () => {
    await saveLineupContext("internal", { slots: { "team-a-gk-1": "a", "team-b-gk-1": "b" }, teamAConfig: 1, teamBConfig: 2 });
    await saveLineupContext("opp-7", { slots: { "team-a-gk-1": "c", "team-b-gk-1": "d" }, teamAConfig: 3, teamBConfig: 4 });
    expect((await getLineupContext("internal"))?.slots).toEqual({ "team-a-gk-1": "a", "team-b-gk-1": "b" });
    expect((await getLineupContext("opp-7"))?.slots).toEqual({ "team-a-gk-1": "c" });
    expect(await getLineupContext("opp-8")).toBeNull();
  });
});
