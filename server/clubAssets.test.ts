import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { club } from "../shared/club";
import { serverCanvas } from "./serverCanvas";
import { canvasEnv } from "../shared/canvasEnv";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
// 1×1 genomskinlig PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe.skipIf(!process.env.DATABASE_URL)("klubbens loggor", () => {
  it("uppladdad logga går före profilens fil, ritas på servern och kan återställas", async () => {
    const c = appRouter.createCaller(admin as never);
    await c.club.setLogo({ key: "white", base64: PNG });
    expect(club().teams.white.logo).toMatch(/^\/api\/club\/logo\/white\?v=\d+$/);
    expect((await c.club.logos()).white).toBeGreaterThan(0);
    await serverCanvas();
    const img = await canvasEnv().loadImage(club().teams.white.logo);
    expect(img.width).toBe(1);
    await c.club.resetLogo({ key: "white" });
    expect(club().teams.white.logo).toBe("/images/logo-white.png");
    await expect(c.club.setLogo({ key: "green", base64: "R0lGODlhAQABAAAAACw=" })).rejects.toThrow(/PNG eller JPEG/);
  });
});
