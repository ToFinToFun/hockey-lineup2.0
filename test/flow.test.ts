/**
 * Hela flödet (steg 0 i docs/PLAN-lag-och-motstandare.md):
 * uppställning i Lineup → match sparad från Score Tracker → matchhistorik → statistik.
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import { createPlayer, listPlayers } from "../server/playersDb";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!process.env.DATABASE_URL)("hela flödet", () => {
  it("uppställning → match → historik → statistik", async () => {
    const c = appRouter.createCaller(admin as never);
    const existing = new Set((await listPlayers()).map((p) => p.id));
    for (const [id, name] of [["flow-w", "Flöde Vit"], ["flow-g", "Flöde Grön"]]) if (!existing.has(id)) await createPlayer({ id, name, number: "7" });

    // Lineup: en spelare i varje lag
    await c.lineup.patch({ clientId: "flow", id: `flow-patch-${Date.now()}`, ops: [
      { t: "slot", slot: "team-a-fwd-1-c", player: { id: "flow-w", name: "Flöde Vit", number: "7", position: "C" } },
      { t: "slot", slot: "team-b-fwd-1-c", player: { id: "flow-g", name: "Flöde Grön", number: "7", position: "C" } },
    ] } as never);
    const state = await c.lineup.getState();
    expect(state.lineup["team-a-fwd-1-c"]?.id).toBe("flow-w");

    // Rensa ev. match från en tidigare körning (samma datum)
    for (const old of (await c.score.match.list()).filter((x: { name: string }) => x.name === "31-06-01 Söndag 20:00 2-1")) {
      await c.score.match.delete({ id: (old as { id: number }).id });
    }

    // Score Tracker sparar matchen (med uppställningen som den var)
    const end = new Date(2031, 5, 1, 21, 30);
    await c.score.match.save({
      name: "31-06-01 Söndag 20:00 2-1", teamWhiteScore: 2, teamGreenScore: 1,
      goalHistory: [
        { team: "white", scorer: "Flöde Vit #7", scorerId: "flow-w", timestamp: "20:10:00" },
        { team: "green", scorer: "Flöde Grön #7", scorerId: "flow-g", timestamp: "20:20:00" },
        { team: "white", scorer: "Flöde Vit #7", scorerId: "flow-w", timestamp: "20:30:00" },
      ],
      matchStartTime: new Date(2031, 5, 1, 20, 0).toISOString(), matchEndTime: end.toISOString(), location: "Testhallen",
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: state.lineup },
    } as never);

    // Matchhistoriken
    const list = await c.score.match.list();
    const m = list.find((x: { name: string }) => x.name === "31-06-01 Söndag 20:00 2-1") as { id: number; location?: string } | undefined;
    expect(m).toBeTruthy();
    expect(m!.location).toBe("Testhallen");

    // Statistiken för dagen (sparad av styrelsen = godkänd direkt)
    const stats = await c.scoreStats.seasonStats({ from: "2031-06-01", to: "2031-06-02" });
    const w = stats.topScorers.find((p: { name: string }) => p.name.startsWith("Flöde Vit"));
    expect(w?.goals).toBe(2);
  });
});
