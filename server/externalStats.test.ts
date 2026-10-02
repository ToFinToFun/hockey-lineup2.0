import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createPlayer, listPlayers } from "./playersDb";

const admin = { req: { ip: "127.0.0.8" } as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!process.env.DATABASE_URL)("statistik med matcher mot andra lag", () => {
  it("av som standard; med valet räknas våra spelare men aldrig motståndarens; lagsiffror bara internt; resultat mot laget", async () => {
    const c = appRouter.createCaller(admin as never);
    if (!(await listPlayers()).some((p) => p.id === "xs-our")) await createPlayer({ id: "xs-our", name: "Xs Vår" });
    const { id: oppId } = await c.opponents.save({ name: "Statistiklaget", color: "#aa0000" });
    const day = { from: "2032-03-01", to: "2032-03-02" };
    const name = "32-03-01 Måndag 20:00 2-1";
    for (const old of (await c.score.match.list()).filter((m: { name: string }) => m.name === name)) await c.score.match.delete({ id: (old as { id: number }).id });
    await c.score.match.save({
      name, teamWhiteScore: 2, teamGreenScore: 1, opponentId: oppId,
      matchStartTime: new Date(2032, 2, 1, 20).toISOString(), matchEndTime: new Date(2032, 2, 1, 21).toISOString(),
      goalHistory: [
        { team: "white", scorer: "Xs Vår", scorerId: "xs-our", timestamp: "20:10:00" },
        { team: "green", scorer: "Deras Skytt", scorerId: "opp-999", assist: "Deras Passare", timestamp: "20:20:00" },
        { team: "white", scorer: "Xs Vår", scorerId: "xs-our", timestamp: "20:30:00" },
      ],
      lineup: { teamAName: "STÅLSTADENS SF", teamBName: "STATISTIKLAGET", lineup: { "team-a-fwd-1-c": { id: "xs-our", name: "Xs Vår", number: "", position: "C" } } },
    } as never);

    const off = await c.scoreStats.seasonStats(day);
    expect(off.topScorers.some((p: { name: string }) => p.name === "Xs Vår")).toBe(false);

    const on = await c.scoreStats.seasonStats({ ...day, includeExternal: true });
    expect(on.topScorers.find((p: { name: string }) => p.name === "Xs Vår")?.goals).toBe(2);
    expect(on.topScorers.some((p: { name: string }) => p.name.startsWith("Deras"))).toBe(false);
    expect(on.whiteWins).toBe(0); // lagsiffror bara för internmatcher

    const rec = (await c.scoreStats.opponentRecords(day)).find((r) => r.opponentId === oppId);
    expect(rec).toMatchObject({ matches: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 1 });
    expect(rec?.ourScorers[0]).toMatchObject({ name: "Xs Vår", goals: 2 });
    expect(rec?.theirScorers.map((l) => l.name).sort()).toEqual(["Deras Passare", "Deras Skytt"]);

    const m = (await c.score.match.list()).find((x: { name: string }) => x.name === name) as { id: number };
    await c.score.match.delete({ id: m.id });
    await c.opponents.delete({ id: oppId });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("statistik per hall", () => {
  it("matcher, vinster och bästa poänggörare per hall", async () => {
    const c = appRouter.createCaller(admin as never);
    const day = { from: "2033-01-10", to: "2033-01-12" };
    const mk = async (name: string, d: number, w: number, g: number, loc: string, scorer: string) => c.score.match.save({
      name, teamWhiteScore: w, teamGreenScore: g, location: loc,
      matchStartTime: new Date(2033, 0, d, 20).toISOString(), matchEndTime: new Date(2033, 0, d, 21).toISOString(),
      goalHistory: [{ team: "white", scorer, timestamp: "20:10:00" }],
    } as never);
    for (const old of (await c.score.match.list()).filter((m: { name: string }) => m.name.startsWith("hall-"))) await c.score.match.delete({ id: (old as { id: number }).id });
    await mk("hall-1", 10, 3, 1, "Hallen A", "Hallskytt");
    await mk("hall-2", 11, 1, 2, "Hallen A", "Hallskytt");
    await mk("hall-3", 11, 2, 2, "Hallen B", "Annan");
    const v = await c.scoreStats.venueStats(day);
    const a = v.find((x) => x.venue === "Hallen A");
    expect(a).toMatchObject({ matches: 2, whiteWins: 1, greenWins: 1, draws: 0, goalsPerMatch: 3.5 });
    expect(a?.top[0]).toMatchObject({ name: "Hallskytt", goals: 2 });
    expect(v.find((x) => x.venue === "Hallen B")?.draws).toBe(1);
    for (const old of (await c.score.match.list()).filter((m: { name: string }) => m.name.startsWith("hall-"))) await c.score.match.delete({ id: (old as { id: number }).id });
  });
});
