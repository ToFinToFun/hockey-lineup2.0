import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { applyLineupPatch, getLineupSnapshot } from "./lineupSync";
import { getAllMatchResults } from "./scoreDb";
import { createPlayer, listPlayers } from "./playersDb";

const admin = { req: { ip: "127.0.0.9" } as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!process.env.DATABASE_URL)("match mot motståndare (Score Tracker och sparad match)", () => {
  it("Score Tracker får motståndaren; sparad match räknas inte i statistiken; lagets uppställning sparas", async () => {
    const c = appRouter.createCaller(admin as never);
    if (!(await listPlayers()).some((p) => p.id === "ext-our")) await createPlayer({ id: "ext-our", name: "Vår Spelare" });
    const { id: oppId } = await c.opponents.save({ name: "Externa IF", color: "#123456" });
    const op = await c.opponents.addPlayer({ opponentId: oppId, name: "Deras Spelare", number: "9", position: "C" });
    const setup = { mode: "external", opponentId: oppId, ourName: null, ourLogo: "club" };
    // Börja med ett tomt motståndarlag (oberoende av vad andra tester lämnat kvar)
    const { doc } = await getLineupSnapshot();
    await applyLineupPatch(`ext-clear-${Date.now()}`, Object.keys(doc.lineup).filter((k) => k.startsWith("team-b-")).map((slot) => ({ t: "slot", slot, player: null })) as never);
    await applyLineupPatch(`ext-${Date.now()}`, [
      { t: "field", key: "setup", value: setup } as never,
      { t: "slot", slot: "team-a-fwd-1-c", player: { id: "ext-our", name: "Vår Spelare", number: "", position: "C" } as never },
      { t: "slot", slot: "team-b-fwd-1-c", player: { id: `opp-${op.id}`, name: "Deras Spelare", number: "9", position: "C", isOpponent: true } as never },
    ]);

    const st = await c.lineup.scoreState();
    expect(st.opponent).toMatchObject({ id: oppId, name: "Externa IF", color: "#123456" });

    const name = `ext-match-${Date.now()}`;
    await c.score.match.save({
      name, teamWhiteScore: 2, teamGreenScore: 1, opponentId: oppId,
      goalHistory: [{ team: "white", scorer: "Vår Spelare", scorerId: "ext-our", timestamp: "20:10:00" }],
      lineup: { teamAName: st.teamAName, teamBName: st.teamBName, lineup: st.lineup },
    } as never);

    const all = await getAllMatchResults();
    const withExt = await getAllMatchResults({ includeExternal: true });
    expect(all.some((m) => m.name === name)).toBe(false);
    expect(withExt.find((m) => m.name === name)?.opponentId).toBe(oppId);
    expect((await c.score.match.list()).some((m: { name: string }) => m.name === name)).toBe(true);
    expect(await c.opponents.storedLineup({ id: oppId })).toEqual({ "team-b-fwd-1-c": op.id });

    // städa
    const m = (await c.score.match.list()).find((x: { name: string }) => x.name === name) as { id: number };
    await c.score.match.delete({ id: m.id });
    await applyLineupPatch(`ext2-${Date.now()}`, [
      { t: "field", key: "setup", value: { mode: "internal", opponentId: null, ourName: null, ourLogo: "club" } } as never,
      { t: "slot", slot: "team-a-fwd-1-c", player: null }, { t: "slot", slot: "team-b-fwd-1-c", player: null },
    ]);
    await c.opponents.delete({ id: oppId });
  });
});
