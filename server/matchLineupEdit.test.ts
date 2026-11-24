import { describe, expect, it, beforeAll, vi } from "vitest";
import { isolatedDatabaseUrl } from "../client/src/test/isolatedDatabase";

/** Redigera uppställningen i efterhand (Lineup → /lineup?match=ID) */
describe.skipIf(!process.env.DATABASE_URL)("matchens uppställning i efterhand", () => {
  let caller: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = await isolatedDatabaseUrl("matchlineup");
    const { appRouter } = await import("./routers");
    caller = appRouter.createCaller({
      session: { role: "admin", expiresAt: Date.now() + 60_000 },
      req: { headers: {}, ip: "127.0.0.1" } as any,
      res: { setHeader: vi.fn() } as any,
    });
    for (const [name, number, position] of [["Anna Anka", "1", "F"], ["Bo Bock", "2", "B"], ["Cia Cool", "3", "F"], ["Dan Dun", "4", "MV"]] as const)
      await caller.players.create({ name, number, position });
  }, 30000);

  it("flyttar, byter lag och tar bort – resultatet ändras aldrig", async () => {
    const reg = await caller.players.list();
    const id = (n: string) => reg.find((p: any) => p.name === n).id;
    const [a, b, c, d] = ["Anna Anka", "Bo Bock", "Cia Cool", "Dan Dun"].map(id);
    const p = (pid: string) => ({ id: pid, name: "x", number: "", position: "F" });
    const matchId = await caller.score.match.save({
      name: "Test 2-1", teamWhiteScore: 2, teamGreenScore: 1,
      goalHistory: [
        { team: "green", scorer: "Bo Bock #2", scorerId: b, timestamp: "20:30" },
        { team: "white", scorer: "Cia Cool #3", scorerId: c, assist: "Anna Anka #1", assistId: a, timestamp: "20:20" },
        { team: "white", scorer: "Anna Anka #1", scorerId: a, timestamp: "20:10" },
      ],
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: { "team-a-fwd-1-c": p(a), "team-a-fwd-1-lw": p(c), "team-b-def-1-1": p(b), "team-b-gk-1": p(d) } },
    }).then((r: any) => r.id ?? r);
    const mid = typeof matchId === "number" ? matchId : (await caller.score.match.list())[0].id;

    // Anna flyttas till Gröna som back, Cia tas bort, Dan står kvar
    const r = await caller.score.match.updateLineup({ id: mid, slots: { "team-b-def-1-2": a, "team-b-def-1-1": b, "team-b-gk-1": d } });
    expect(r.players).toBe(3);
    const m = (await caller.score.match.list()).find((x: any) => x.id === mid);
    expect(Object.fromEntries(Object.entries(m.lineup.lineup).map(([s, v]: any) => [s, v.id]))).toEqual({ "team-b-def-1-2": a, "team-b-def-1-1": b, "team-b-gk-1": d });
    expect([m.teamWhiteScore, m.teamGreenScore]).toEqual([2, 1]);
    // Målen ligger kvar på sina lag; Annas poäng följer henne, Cias mål blir utan målskytt
    expect(m.goalHistory.map((g: any) => [g.team, g.scorerId ?? null, g.assistId ?? null])).toEqual([
      ["green", b, null],
      ["white", null, a],
      ["white", a, null],
    ]);
    expect(m.goalHistory[1].scorer).toBeUndefined();
    expect(m.editedAt).not.toBeNull();
  });

  it("okänd match och felaktiga platser avvisas", async () => {
    await expect(caller.score.match.updateLineup({ id: 999999, slots: {} })).rejects.toThrow(/finns inte/);
    await expect(caller.score.match.updateLineup({ id: 1, slots: { "bänk": "x" } })).rejects.toThrow();
  });
});
