import { describe, expect, it } from "vitest";
import { applyLineupPatch, getLineupChangedAt, getLineupSnapshot } from "./lineupSync";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Ändrad-tid för uppställningen", () => {
  it("sätts när en spelare placeras, inte när bara lagnamnet ändras", async () => {
    const { doc } = await getLineupSnapshot();
    const before = await getLineupChangedAt();
    await applyLineupPatch(`name-${Date.now()}`, [{ t: "field", key: "teamAName", value: doc.teamAName }]);
    expect((await getLineupChangedAt())?.getTime() ?? null).toBe(before?.getTime() ?? null);

    const player = { id: `chg-${Date.now()}`, name: "Ändra Test", number: "1", position: "F" } as never;
    await applyLineupPatch(`slot-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-1-c", player }]);
    const after = await getLineupChangedAt();
    expect(after).not.toBeNull();
    expect(after!.getTime()).toBeGreaterThanOrEqual(Date.now() - 5000);
    await applyLineupPatch(`clear-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-1-c", player: null }]);
  });
});
