import { describe, expect, it, beforeAll, vi } from "vitest";
import { isolatedDatabaseUrl } from "../client/src/test/isolatedDatabase";

const hasDb = !!process.env.DATABASE_URL;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!hasDb)("spelarregistret", () => {
  let caller: any;
  let sync: typeof import("./lineupSync");

  beforeAll(async () => {
    process.env.DATABASE_URL = await isolatedDatabaseUrl("registry");
    const { appRouter } = await import("./routers");
    sync = await import("./lineupSync");
    caller = appRouter.createCaller({
      session: { role: "admin", expiresAt: Date.now() + 60_000 },
      req: { headers: {}, ip: "127.0.0.1" } as any,
      res: { setHeader: vi.fn() } as any,
    });
    // Utgångsläge: två spelare i truppen
    await caller.lineup.patch({ id: "seed-patch-1", ops: [
      { t: "rosterUpsert", player: { id: "r1", name: "Kalle Kula", number: "10", position: "F" }, index: 0 },
      { t: "rosterUpsert", player: { id: "r2", name: "Lisa Lind", number: "4", position: "B" }, index: 1 },
    ] });
    await wait(400);
  }, 30000);

  const reg = async (id: string) => (await caller.players.list()).find((p: any) => p.id === id);
  const docPlayer = async (id: string) => {
    const s = await caller.lineup.getState();
    return [...s.players, ...Object.values(s.lineup)].find((p: any) => p.id === id) as any;
  };

  it("nya spelare i Lineup hamnar i registret som ej medlem", async () => {
    expect(await reg("r1")).toMatchObject({ name: "Kalle Kula", number: "10", isMember: false, active: true });
  });

  it("namnbyte i Lineup uppdaterar registret och sparar gamla namnet som alias", async () => {
    await caller.lineup.patch({ id: "rename-patch-1", ops: [{ t: "rosterUpsert", player: { id: "r1", name: "Karl Kula", number: "10", position: "F" }, index: 0 }] });
    await wait(200);
    const r = await reg("r1");
    expect(r.name).toBe("Karl Kula");
    expect(r.aliases).toContain("Kalle Kula #10");
  });

  it("ändring i registret slår igenom i uppställningen", async () => {
    await caller.players.update({ id: "r2", fields: { number: "44", teamColor: "green", isMember: true } });
    await wait(600);
    expect(await docPlayer("r2")).toMatchObject({ number: "44", teamColor: "green", isMember: true });
  });

  it("ny aktiv spelare i registret dyker upp i truppen, inaktiv försvinner", async () => {
    const created = await caller.players.create({ name: "Nils Ny", number: "77", position: "C" });
    await wait(600);
    expect(await docPlayer(created.id)).toMatchObject({ name: "Nils Ny" });
    await caller.players.update({ id: created.id, fields: { active: false } });
    await wait(600);
    expect(await docPlayer(created.id)).toBeUndefined();
    expect(await reg(created.id)).toMatchObject({ active: false }); // finns kvar i registret
  });

  it("statistiken följer spelaren vid namn- och nummerbyte", async () => {
    await caller.score.match.save({
      name: "Test", teamWhiteScore: 1, teamGreenScore: 0,
      goalHistory: [{ team: "white", scorer: "Karl Kula #10", scorerId: "r1", timestamp: "20:00" }],
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: { "team-a-fwd-1-c": { id: "r1", name: "Karl Kula", number: "10", position: "F" }, "team-b-def-1-1": { id: "r2", name: "Lisa Lind", number: "44", position: "B" } } },
    });
    await caller.players.update({ id: "r1", fields: { name: "Karl Kulan", number: "11" } });
    await wait(200);
    const [m] = await caller.score.match.list();
    expect(m.goalHistory[0].scorer).toBe("Karl Kulan #11");
    expect(m.lineup.lineup["team-a-fwd-1-c"].name).toBe("Karl Kulan");
  });

  it("sammanslagning: historik och alias samlas, dubbletten försvinner ur truppen", async () => {
    const dup = await caller.players.create({ name: "Lisa Lind", number: "4", position: "B" });
    await wait(600);
    const issues = await caller.players.issues();
    expect(issues.duplicates.some((g: any[]) => g.some((p) => p.id === dup.id))).toBe(true);
    await caller.players.merge({ fromId: dup.id, intoId: "r2" });
    await wait(600);
    expect(await docPlayer(dup.id)).toBeUndefined();
    expect((await reg(dup.id)).mergedInto).toBe("r2");
  });

  it("import: förhandsgranskning ändrar inget, genomförande gör det, saknade flaggas som ej medlem", async () => {
    const rows = [
      { name: "Karl Kulan", number: "12", isMember: true },
      { name: "Olle Ohlsson", number: "5", position: "B" as const },
    ];
    const preview = await caller.players.importPreview({ rows, markMissingAsNonMember: true });
    expect(preview.plan.find((c: any) => c.kind === "update")?.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "number", to: "12" })])
    );
    expect(preview.plan.some((c: any) => c.kind === "new" && c.name === "Olle Ohlsson")).toBe(true);
    expect(preview.plan.some((c: any) => c.kind === "missing" && c.id === "r2")).toBe(true);
    expect((await reg("r1")).number).toBe("11"); // oförändrat

    const res = await caller.players.importApply({ rows, markMissingAsNonMember: true });
    expect(res.created).toBe(1);
    expect((await reg("r1")).number).toBe("12");
    expect((await reg("r2")).isMember).toBe(false);
    expect((await reg("r2")).active).toBe(true); // finns kvar, bara flaggad
  });
});
