import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { club } from "../shared/club";
import { findKnownVenue } from "./lagetSe";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
const anon = { req: {} as never, res: {} as never, session: null };

describe.skipIf(!process.env.DATABASE_URL)("klubbens inställningar", () => {
  it("standard är profilen; ändringar slår igenom direkt och går att återställa", async () => {
    const c = appRouter.createCaller(admin as never);
    await c.club.set({});
    expect((await appRouter.createCaller(anon as never).club.get()).club.name).toBe("Stålstadens SF");

    await c.club.set({ name: "Testklubben IF", venues: ["Testhallen A"], laget: { slug: "Testklubben" }, teams: { white: { name: "Röda", color: "#dc2626" } } });
    expect(club().name).toBe("Testklubben IF");
    expect(club().teams.white.name).toBe("Röda");
    expect(club().laget.slug).toBe("Testklubben");
    expect(findKnownVenue("<p>Samling i Testhallen - A</p>")).toBe("Testhallen A");

    await c.club.set({});
    expect(club().name).toBe("Stålstadens SF");
    expect(club().venues).toContain("Coop Arena C-Hallen");
    await expect(appRouter.createCaller(anon as never).club.set({ name: "x" })).rejects.toThrow();
  });
});
