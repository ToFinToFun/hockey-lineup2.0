import { describe, expect, it } from "vitest";
import { applyLineupPatch, getLineupSnapshot, resetLineupCacheForTests } from "./lineupSync";
import { listPlayers } from "./playersDb";
import { saveOpponent, addOpponentPlayer, deleteOpponent } from "./opponents";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("uppställning mot motståndare (datamodell)", () => {
  it("motståndarens spelare på lag B, aldrig i vår trupp eller vårt register", async () => {
    const oppId = await saveOpponent({ name: "Testmotståndare" });
    const pid = await addOpponentPlayer(oppId, { name: "Motspelare Ett", number: "7", position: "C" });
    const oppPlayer = { id: `opp-${pid}`, name: "Motspelare Ett", number: "7", position: "C", isOpponent: true };
    const setup = { mode: "external", opponentId: oppId, ourName: null, ourLogo: "club" };

    await applyLineupPatch(`opp-1-${Date.now()}`, [{ t: "field", key: "setup", value: setup } as never, { t: "slot", slot: "team-b-fwd-1-c", player: oppPlayer as never }]);
    let { doc } = await getLineupSnapshot();
    expect(doc.setup.mode).toBe("external");
    expect(doc.lineup["team-b-fwd-1-c"]?.id).toBe(`opp-${pid}`);
    expect(doc.players.some((p) => p.id === `opp-${pid}`)).toBe(false);
    expect((await listPlayers()).some((p) => p.id === `opp-${pid}`)).toBe(false);

    // Läses rätt från databasen (ny inläsning)
    resetLineupCacheForTests();
    ({ doc } = await getLineupSnapshot());
    expect(doc.lineup["team-b-fwd-1-c"]).toMatchObject({ id: `opp-${pid}`, name: "Motspelare Ett", isOpponent: true });

    // Tas den bort från platsen hamnar den inte i vår trupp
    await applyLineupPatch(`opp-2-${Date.now()}`, [{ t: "slot", slot: "team-b-fwd-1-c", player: null }]);
    ({ doc } = await getLineupSnapshot());
    expect(doc.players.some((p) => p.id === `opp-${pid}`)).toBe(false);

    // Tillbaka till internmatch
    await applyLineupPatch(`opp-3-${Date.now()}`, [{ t: "field", key: "setup", value: { mode: "internal", opponentId: null, ourName: null, ourLogo: "club" } } as never]);
    expect((await getLineupSnapshot()).doc.setup.mode).toBe("internal");
    await deleteOpponent(oppId);
  });
});
