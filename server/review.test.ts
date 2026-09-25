import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getAllMatchResults } from "./scoreDb";

// Kräver databas (DATABASE_URL). Hoppas över annars.
const hasDb = !!process.env.DATABASE_URL;

function ctx(role: "admin" | null, ip = "10.0.0.1"): TrpcContext {
  return {
    session: role ? { role, expiresAt: Date.now() + 60_000 } : null,
    req: { headers: {}, ip } as TrpcContext["req"],
    res: { setHeader: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const match = (name: string) => ({
  name,
  teamWhiteScore: 3,
  teamGreenScore: 1,
  goalHistory: [{ team: "white", scorer: "Test", timestamp: "20:00:00" }],
});

describe.skipIf(!hasDb)("granskning av matcher", () => {
  const admin = appRouter.createCaller(ctx("admin"));
  let publicName = "";

  beforeAll(async () => {
    publicName = `publik-${Date.now()}`;
    await appRouter.createCaller(ctx(null)).score.match.save(match(publicName));
    await admin.score.match.save(match(`admin-${Date.now()}`));
  });

  it("match sparad utan inloggning väntar och räknas inte i statistiken", async () => {
    const all = await admin.score.match.list();
    const saved = all.find((m) => m.name === publicName)!;
    expect(saved.reviewStatus).toBe("pending");
    expect((await getAllMatchResults()).some((m) => m.name === publicName)).toBe(false);
  });

  it("styrelsens match godkänns direkt", async () => {
    const all = await admin.score.match.list();
    expect(all.find((m) => m.name.startsWith("admin-"))!.reviewStatus).toBe("approved");
  });

  it("godkänd match räknas i statistiken", async () => {
    const saved = (await admin.score.match.list()).find((m) => m.name === publicName)!;
    await admin.score.match.review({ ids: [saved.id], status: "approved" });
    expect((await getAllMatchResults()).some((m) => m.name === publicName)).toBe(true);
  });

  it("orimliga värden avvisas", async () => {
    await expect(
      appRouter.createCaller(ctx(null)).score.match.save({ ...match("x"), teamWhiteScore: 5000 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("massinskick från samma IP stoppas", async () => {
    const caller = appRouter.createCaller(ctx(null, "10.9.9.9"));
    for (let i = 0; i < 20; i++) await caller.score.match.save(match(`spam-${i}`));
    await expect(caller.score.match.save(match("spam-21"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
