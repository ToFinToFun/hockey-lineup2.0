import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createPlayer, listPlayers } from "./playersDb";

const admin = { req: { ip: "127.0.0.7" } as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!process.env.DATABASE_URL)("speltid i statistiken", () => {
  it("räknas på sparade matcher: per position, snitt och P/60", async () => {
    const c = appRouter.createCaller(admin as never);
    const ids = ["it-gk", "it-b1", "it-b2", "it-c", "it-lw", "it-rw"];
    const existing = new Set((await listPlayers()).map((p) => p.id));
    for (const id of ids) if (!existing.has(id)) await createPlayer({ id, name: id.toUpperCase() });
    const name = "33-01-10 Måndag 20:00 1-0";
    for (const old of (await c.score.match.list()).filter((m: { name: string }) => m.name === name)) await c.score.match.delete({ id: (old as { id: number }).id });
    const P = (id: string) => ({ id, name: id.toUpperCase(), number: "", position: "F" });
    await c.score.match.save({
      name, teamWhiteScore: 1, teamGreenScore: 0,
      matchStartTime: new Date(2033, 0, 10, 20, 0).toISOString(), matchEndTime: new Date(2033, 0, 10, 20, 45).toISOString(),
      goalHistory: [{ team: "white", scorer: "IT-C", assist: "IT-LW", timestamp: "20:10:00" }],
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: {
        "team-a-gk-1": P("it-gk"), "team-a-def-1-1": P("it-b1"), "team-a-def-1-2": P("it-b2"),
        "team-a-fwd-1-c": P("it-c"), "team-a-fwd-1-lw": P("it-lw"), "team-a-fwd-1-rw": P("it-rw"),
      } },
    } as never);
    const rows = await c.scoreStats.iceTime({ from: "2033-01-10", to: "2033-01-11" });
    const by = new Map(rows.map((r) => [r.id, r]));
    // 5 utespelare → alla spelar hela matchen (45 min); målvakten 45
    expect(by.get("it-gk")).toMatchObject({ matches: 1, minutes: 45, byPos: { MV: 45, B: 0, C: 0, F: 0 } });
    expect(by.get("it-b1")?.byPos.B).toBe(45);
    expect(by.get("it-c")).toMatchObject({ goals: 1, points: 1, p60: 1.33 });
    expect(by.get("it-lw")).toMatchObject({ assists: 1, byPos: { F: 45 } });
    const m = (await c.score.match.list()).find((x: { name: string }) => x.name === name) as { id: number };
    // Utsatt matchlängd (träningens längd) går före start–avslut
    await c.score.match.update({ id: m.id, plannedMinutes: 90 });
    const rows90 = await c.scoreStats.iceTime({ from: "2033-01-10", to: "2033-01-11" });
    expect(rows90.find((r) => r.id === "it-gk")?.minutes).toBe(90);
    await c.score.match.update({ id: m.id, plannedMinutes: null });
    expect((await c.scoreStats.iceTime({ from: "2033-01-10", to: "2033-01-11" })).find((r) => r.id === "it-gk")?.minutes).toBe(45);
    await c.score.match.delete({ id: m.id });
  });
});
