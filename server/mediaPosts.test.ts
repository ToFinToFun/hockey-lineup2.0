import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getMediaPhoto } from "./mediaPosts";

const admin = { req: {} as never, res: {} as never, session: { role: "admin" as const, expiresAt: null } };
const lineupUser = { req: {} as never, res: {} as never, session: { role: "lineup" as const, expiresAt: Date.now() + 60_000 } };
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe.skipIf(!process.env.DATABASE_URL)("Media – sparade inlägg", () => {
  it("sparar, uppdaterar, behåller/tar bort bild, listar och tar bort – bara styrelsen", async () => {
    const c = appRouter.createCaller(admin as never);
    const { id } = await c.media.save({ type: "text", title: "Nu börjar serien", settings: { kind: "text", title: "Nu börjar serien" }, caption: "", photoBase64: JPEG });
    expect((await getMediaPhoto(id))?.image.length).toBeGreaterThan(10);
    await c.media.save({ id, type: "text", title: "Nu börjar serien!", settings: { kind: "text", title: "Nu börjar serien!" }, caption: "x" });
    const row = (await c.media.list()).find((p) => p.id === id)!;
    expect(row.title).toBe("Nu börjar serien!");
    expect(row.hasPhoto).toBe(true); // bilden behölls
    await c.media.save({ id, type: "text", title: "Utan bild", settings: {}, caption: "", photoBase64: null });
    expect(await getMediaPhoto(id)).toBeNull();
    await expect(appRouter.createCaller(lineupUser as never).media.list()).rejects.toThrow();
    await c.media.delete({ id });
    expect((await c.media.list()).some((p) => p.id === id)).toBe(false);
  });
});
