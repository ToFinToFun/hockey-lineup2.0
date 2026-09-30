import { describe, expect, it } from "vitest";
import { applyLineupPatch } from "./lineupSync";
import { createPlayer, listPlayers, updatePlayers } from "./playersDb";

describe.skipIf(!process.env.DATABASE_URL)("lagfärgen skrivs inte över av uppställningen", () => {
  it("spelare utan teamColor-fält (t.ex. från en spelad match) behåller sitt lag; uttryckligt null tar bort det", async () => {
    if (!(await listPlayers()).some((p) => p.id === "tg1")) await createPlayer({ id: "tg1", name: "Lag Test" });
    await updatePlayers([{ id: "tg1", fields: { teamColor: "green" } }]);
    // Som när en gammal uppställning laddas: spelarobjektet saknar teamColor
    await applyLineupPatch(`tg-a-${Date.now()}`, [{ t: "slot", slot: "team-b-fwd-3-rw", player: { id: "tg1", name: "Lag Test", number: "", position: "F" } as never }]);
    expect((await listPlayers()).find((p) => p.id === "tg1")?.teamColor).toBe("green");
    // Uttryckligt byte till Waivers i spelarkortet
    await applyLineupPatch(`tg-b-${Date.now()}`, [{ t: "slot", slot: "team-b-fwd-3-rw", player: { id: "tg1", name: "Lag Test", number: "", position: "F", teamColor: null } as never }]);
    expect((await listPlayers()).find((p) => p.id === "tg1")?.teamColor).toBeNull();
    await applyLineupPatch(`tg-c-${Date.now()}`, [{ t: "slot", slot: "team-b-fwd-3-rw", player: null }]);
  });
});
