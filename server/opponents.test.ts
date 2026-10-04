import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
const lineupUser = { req: {} as never, res: {} as never, session: { role: "lineup" as const, expiresAt: Date.now() + 60_000 } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe.skipIf(!process.env.DATABASE_URL)("motståndarregistret", () => {
  it("skapa lag med logga och spelare, ändra, arkivera och ta bort – bara styrelsen", async () => {
    const c = appRouter.createCaller(admin as never);
    const { id } = await c.opponents.save({ name: "Kalix HC", shortName: "KHC", color: "#dc2626", logoBase64: PNG });
    const p1 = await c.opponents.addPlayer({ opponentId: id, name: "Anders Andersson", number: "9", position: "C" });
    await c.opponents.addPlayer({ opponentId: id, name: "Bertil Berg", position: "MV" });
    await c.opponents.updatePlayer({ opponentId: id, id: p1.id, number: "19" });

    const o = await c.opponents.get({ id });
    expect(o).toMatchObject({ name: "Kalix HC", shortName: "KHC", color: "#dc2626", playerCount: 2 });
    expect(o.logoUrl).toMatch(new RegExp(`^/api/opponents/${id}/logo\\?v=\\d+$`));
    expect(o.players.find((p) => p.id === p1.id)?.number).toBe("19");

    // Loggan behålls när bara namnet ändras
    await c.opponents.save({ id, name: "Kalix Hockey" });
    expect((await c.opponents.get({ id })).logoUrl).not.toBeNull();

    await c.opponents.save({ id, name: "Kalix Hockey", archived: true });
    expect((await c.opponents.list()).some((x) => x.id === id)).toBe(false);
    expect((await c.opponents.list({ includeArchived: true })).some((x) => x.id === id)).toBe(true);

    await expect(appRouter.createCaller(lineupUser as never).opponents.list()).rejects.toThrow();
    await c.opponents.delete({ id });
    await expect(c.opponents.get({ id })).rejects.toThrow(/finns inte/);
  });

  it("matcher mot andra lag är alltid påslaget (beta-flaggan borttagen)", async () => {
    const c = appRouter.createCaller(admin as never);
    await c.club.setFeatures({ opponents: false });
    expect((await c.club.get()).features.opponents).toBe(true);
  });
});
