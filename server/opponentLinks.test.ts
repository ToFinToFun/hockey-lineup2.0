import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { applyLineupPatch, getLineupSnapshot } from "./lineupSync";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
const anon = { req: {} as never, res: {} as never, session: null };

describe.skipIf(!process.env.DATABASE_URL)("motståndarens delningslänk", () => {
  it("laget fyller i spelare och uppställning; ser vårt lag bara om vi valt det; länken kan stängas", async () => {
    const a = appRouter.createCaller(admin as never);
    const pub = appRouter.createCaller(anon as never);
    const { id: oppId } = await a.opponents.save({ name: "Länklaget" });
    const other = await a.opponents.save({ name: "Annat lag" });
    const otherP = await a.opponents.addPlayer({ opponentId: other.id, name: "Främling" });

    const hidden = await a.opponents.createLink({ opponentId: oppId, showOurTeam: false, days: 7 });
    // Laget lägger till spelare och ställer upp – innan vi valt dem i Lineup
    const p1 = await pub.opponentLink.addPlayer({ token: hidden.token, name: "Länk Spelare", number: "5", position: "C" });
    await pub.opponentLink.setSlot({ token: hidden.token, slot: "team-b-fwd-1-c", playerId: p1.id });
    await pub.opponentLink.saveTeam({ token: hidden.token, name: "Länklaget IF", color: "#123456" });
    let v = await pub.opponentLink.view({ token: hidden.token });
    expect(v.opponent.name).toBe("Länklaget IF");
    expect(v.lineup["team-b-fwd-1-c"]).toBe(p1.id);
    expect(v.live).toBe(false);
    expect(v.ours).toBeNull();
    await expect(pub.opponentLink.setSlot({ token: hidden.token, slot: "team-a-fwd-1-c", playerId: p1.id })).rejects.toThrow(/Ogiltig plats/);
    await expect(pub.opponentLink.setSlot({ token: hidden.token, slot: "team-b-fwd-1-lw", playerId: otherP.id })).rejects.toThrow(/finns inte i laget/);
    expect(await a.opponents.storedLineup({ id: oppId })).toEqual({ "team-b-fwd-1-c": p1.id });

    // Vi väljer laget i Lineup → deras ändringar går direkt in i uppställningen
    await applyLineupPatch(`lnk-${Date.now()}`, [{ t: "field", key: "setup", value: { mode: "external", opponentId: oppId, ourName: null, ourLogo: "club" } } as never]);
    const p2 = await pub.opponentLink.addPlayer({ token: hidden.token, name: "Andra Spelaren", position: "MV" });
    await pub.opponentLink.setSlot({ token: hidden.token, slot: "team-b-gk-1", playerId: p2.id });
    expect((await getLineupSnapshot()).doc.lineup["team-b-gk-1"]?.name).toBe("Andra Spelaren");
    await pub.opponentLink.updatePlayer({ token: hidden.token, id: p2.id, name: "Andra Spelaren Nytt" });
    expect((await getLineupSnapshot()).doc.lineup["team-b-gk-1"]?.name).toBe("Andra Spelaren Nytt");

    // Länk som visar vårt lag
    const shown = await a.opponents.createLink({ opponentId: oppId, showOurTeam: true, days: 7 });
    v = await pub.opponentLink.view({ token: shown.token });
    expect(v.live).toBe(true);
    expect(v.ours).not.toBeNull();
    expect((await pub.opponentLink.view({ token: hidden.token })).ours).toBeNull();

    // Stängd länk
    await a.opponents.revokeLink({ token: hidden.token });
    await expect(pub.opponentLink.view({ token: hidden.token })).rejects.toThrow(/ogiltig/);

    await applyLineupPatch(`lnk2-${Date.now()}`, [{ t: "field", key: "setup", value: { mode: "internal", opponentId: null, ourName: null, ourLogo: "club" } } as never,
      { t: "slot", slot: "team-b-gk-1", player: null }]);
    await a.opponents.delete({ id: oppId });
    await a.opponents.delete({ id: other.id });
  });
});
