import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { saveMatch } from "./scoreDb";
import { createPlayer, listPlayers } from "./playersDb";
import { getCardSource } from "./playerCards";

const hasDb = !!process.env.DATABASE_URL;
const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
const lineupUser = { req: {} as never, res: {} as never, session: { role: "lineup" as const, expiresAt: Date.now() + 60_000 } };
// Minsta giltiga JPEG-huvud räcker för kontrollen i servern
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe.skipIf(!hasDb)("hockeykort", () => {
  it("statistik för kortet: säsong, karriär, form och målvakt", async () => {
    const existing = new Set((await listPlayers()).map((p) => p.id));
    for (const id of ["ka", "kb"]) if (!existing.has(id)) await createPlayer({ id, name: id.toUpperCase() });
    const now = new Date();
    await saveMatch({
      name: "kort-1", teamWhiteScore: 2, teamGreenScore: 0, reviewStatus: "approved", matchEndTime: now,
      goalHistory: [{ team: "white", timestamp: "20:00:00", scorer: "KA", scorerId: "ka" }],
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: {
        "team-a-fwd-1-c": { id: "ka", name: "KA", number: "", position: "C" },
        "team-b-gk-1": { id: "kb", name: "KB", number: "", position: "MV" },
      } },
    } as never);
    const caller = appRouter.createCaller(admin as never);
    const a = await caller.cards.stats({ playerId: "ka" });
    expect(a.season.matches).toBeGreaterThanOrEqual(1);
    expect(a.season.goals).toBeGreaterThanOrEqual(1);
    expect(a.isGoalie).toBe(false);
    const b = await caller.cards.stats({ playerId: "kb" });
    expect(b.isGoalie).toBe(true);
    expect(b.season.goalie?.matches).toBeGreaterThanOrEqual(1);
  });

  it("sparar foto och val, uppdaterar bara valen, och är bara för styrelsen", async () => {
    const caller = appRouter.createCaller(admin as never);
    await caller.cards.save({ playerId: "ka", settings: { skin: "gron" }, sourceBase64: JPEG });
    await caller.cards.save({ playerId: "ka", settings: { skin: "svart" } });
    const list = await caller.cards.list();
    expect(list.find((c) => c.playerId === "ka")?.settings).toEqual({ skin: "svart" });
    expect((await getCardSource("ka"))?.image.length).toBeGreaterThan(10);
    await expect(caller.cards.save({ playerId: "kb", settings: {} })).rejects.toThrow(/foto/);
    await expect(appRouter.createCaller(lineupUser as never).cards.list()).rejects.toThrow();
    await caller.cards.delete({ playerId: "ka" });
    expect(await getCardSource("ka")).toBeNull();
  });
});
