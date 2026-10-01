import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { applyLineupPatch } from "./lineupSync";
import { lockLineup, getActiveLock } from "./lineupLock";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!process.env.DATABASE_URL)("låst lag efter publicering", () => {
  it("Score Tracker får det låsta laget; ändringar i Lineup syns som 'ändrat'; upplåsning och sparad match släpper spärren", async () => {
    const c = appRouter.createCaller(admin as never);
    const p = (id: string, name: string) => ({ id, name, number: "", position: "F" }) as never;
    await applyLineupPatch(`lk-0-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-1-c", player: p("lk1", "Låst Ett") }]);
    await lockLineup("Lagen 1/10 – 20:00");
    // Någon ändrar i Lineup efter publiceringen
    await applyLineupPatch(`lk-1-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-1-c", player: p("lk2", "Ny Spelare") }]);

    const st = await c.lineup.scoreState();
    expect(st.locked).toBe(true);
    expect(st.lineup["team-a-fwd-1-c"]?.id).toBe("lk1");
    const status = await c.lineup.lockStatus();
    expect(status).toMatchObject({ locked: true, changed: true, newsTitle: "Lagen 1/10 – 20:00" });

    await c.lineup.unlock();
    expect((await c.lineup.scoreState()).lineup["team-a-fwd-1-c"]?.id).toBe("lk2");

    // Sparad match släpper spärren
    await lockLineup("x");
    expect(await getActiveLock()).not.toBeNull();
    await c.score.match.save({ name: `lk-match-${Date.now()}`, teamWhiteScore: 0, teamGreenScore: 0, goalHistory: [] } as never);
    expect(await getActiveLock()).toBeNull();

    // Släpps efter 12 timmar
    await lockLineup("x");
    expect(await getActiveLock(new Date(Date.now() + 13 * 3600_000))).toBeNull();
    await c.lineup.unlock();
    await applyLineupPatch(`lk-2-${Date.now()}`, [{ t: "slot", slot: "team-a-fwd-1-c", player: null }]);
  });
});
