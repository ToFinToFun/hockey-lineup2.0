import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { saveMatch } from "./scoreDb";
import { createPlayer, listPlayers } from "./playersDb";

const hasDb = !!process.env.DATABASE_URL;
const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };

describe.skipIf(!hasDb)("PIR-förklaring", () => {
  it("delar upp betyget och ger utveckling över tid", async () => {
    const lineup = (a: string[], b: string[]) => ({
      teamAName: "VITA", teamBName: "GRÖNA",
      lineup: Object.fromEntries([
        ...a.map((id, i) => [`team-a-fwd-${i + 1}-c`, { id, name: id.toUpperCase(), number: "", position: "F" }]),
        ...b.map((id, i) => [`team-b-fwd-${i + 1}-c`, { id, name: id.toUpperCase(), number: "", position: "F" }]),
      ]),
    });
    const existing = new Set((await listPlayers()).map((p) => p.id));
    for (const id of ["xa", "xb", "xc", "xd"]) if (!existing.has(id)) await createPlayer({ id, name: id.toUpperCase() });
    for (let i = 0; i < 5; i++) {
      await saveMatch({
        name: `pir-explain-${i}`, teamWhiteScore: 3, teamGreenScore: 1, reviewStatus: "approved",
        matchEndTime: new Date(2026, 7, 1 + i * 7), goalHistory: [{ team: "white", timestamp: "20:00:00", scorer: "XA", scorerId: "xa" }],
        lineup: lineup(["xa", "xb"], ["xc", "xd"]),
      } as never);
    }
    const caller = appRouter.createCaller(admin as never);
    const e = await caller.pir.explain({ id: "xa" });
    expect(e).not.toBeNull();
    expect(e!.history.length).toBeGreaterThanOrEqual(5);
    expect(e!.history.every((h) => h.result === "V")).toBe(true);
    expect(e!.rating).toBe(e!.teamOnlyRating + e!.individual + e!.adjustment);
    expect(e!.individual).toBeGreaterThan(0); // xa gjorde mål i varje match
  });
});
