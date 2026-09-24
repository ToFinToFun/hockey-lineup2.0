import { describe, expect, it, vi, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { checkAdminPassword, createInviteToken, redeemInvite, readSession, startAdminSession } from "./auth";

beforeAll(() => {
  ENV.cookieSecret = "test-secret-".padEnd(40, "x");
  ENV.adminPassword = "ratt-losenord";
});

function ctx(session: TrpcContext["session"]): TrpcContext {
  return {
    session,
    req: { headers: {}, ip: "1.2.3.4" } as TrpcContext["req"],
    res: { setHeader: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function cookieFrom(res: { setHeader: ReturnType<typeof vi.fn> }): string {
  const header = res.setHeader.mock.calls.at(-1)![1] as string;
  return header.split(";")[0];
}

async function expectCode(p: Promise<unknown>, code: TRPCError["code"]) {
  await expect(p).rejects.toMatchObject({ code });
}

describe("behörighet", () => {
  it("publik användare får inte ändra uppställningen", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expectCode(
      caller.lineup.saveState({ players: [], lineup: {}, teamAName: "A", teamBName: "B" } as any),
      "UNAUTHORIZED"
    );
  });

  it("publik användare får inte se statistik", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expectCode(caller.score.match.list(), "FORBIDDEN");
    await expectCode(caller.scoreStats.seasonStats({}), "FORBIDDEN");
  });

  it("länk-användare får inte radera matcher eller ändra inställningar", async () => {
    const caller = appRouter.createCaller(ctx({ role: "lineup", expiresAt: Date.now() + 60_000 }));
    await expectCode(caller.score.match.delete({ id: 1 }), "FORBIDDEN");
    await expectCode(caller.settings.setPirSettings({ enabled: true }), "FORBIDDEN");
    await expectCode(caller.auth.createInvite(), "FORBIDDEN");
  });

  it("fel lösenord ger ingen session", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expectCode(caller.auth.login({ password: "fel" }), "UNAUTHORIZED");
    expect(checkAdminPassword("ratt-losenord")).toBe(true);
  });
});

describe("sessioner och länkar", () => {
  it("admin-session kan läsas tillbaka från cookien", async () => {
    const res = { setHeader: vi.fn() };
    await startAdminSession(res as any);
    const session = await readSession({ headers: { cookie: cookieFrom(res) } } as any);
    expect(session?.role).toBe("admin");
  });

  it("länk ger lineup-session som löper ut inom 24 h", async () => {
    const { token } = await createInviteToken();
    const res = { setHeader: vi.fn() };
    const result = await redeemInvite(res as any, token);
    expect(result).not.toBeNull();
    expect(result!.expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000);
    const session = await readSession({ headers: { cookie: cookieFrom(res) } } as any);
    expect(session?.role).toBe("lineup");
  });

  it("manipulerad länk avvisas", async () => {
    const { token } = await createInviteToken();
    const res = { setHeader: vi.fn() };
    expect(await redeemInvite(res as any, token.slice(0, -3) + "abc")).toBeNull();
  });
});
