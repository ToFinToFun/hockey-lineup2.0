import { describe, expect, it } from "vitest";
import { applyLineupPatch, getLineupChangedAt, getLineupSnapshot, resetLineupCacheForTests } from "./lineupSync";

const P = (id: string) => ({ id, name: id.toUpperCase(), number: "", position: "F" }) as never;

describe.skipIf(!process.env.DATABASE_URL)("Lineup: Ändrad …", () => {
  it("ändras bara när en spelare faktiskt placeras, flyttas eller tas ur laget", async () => {
    await applyLineupPatch(`ca-0-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-2-c", player: P("ca1") }]);
    const t1 = await getLineupChangedAt();
    await new Promise((r) => setTimeout(r, 20));
    // Samma spelare på samma plats igen, och ett fält som inte rör uppställningen
    const { doc } = await getLineupSnapshot();
    await applyLineupPatch(`ca-1-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-2-c", player: doc.lineup["team-a-fwd-2-c"] as never }]);
    expect((await getLineupChangedAt())?.getTime()).toBe(t1?.getTime());
    // Omladdning från databasen ändrar inte tiden
    resetLineupCacheForTests();
    const sec = (d: Date | null | undefined) => Math.floor((d?.getTime() ?? 0) / 1000);
    expect(sec(await getLineupChangedAt())).toBe(sec(t1)); // databasen sparar hela sekunder
    // Flytt ger ny tid
    await applyLineupPatch(`ca-2-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-2-c", player: null }, { t: "slot", slot: "team-a-fwd-2-lw", player: P("ca1") }]);
    expect((await getLineupChangedAt())!.getTime()).toBeGreaterThan(t1!.getTime());
    await applyLineupPatch(`ca-3-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-2-lw", player: null }]);
  });
});
