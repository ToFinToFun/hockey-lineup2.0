import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getMediaPhoto, getPostPhoto, resolvePostPhotos } from "./mediaPosts";
import { getThemeImage } from "./mediaThemes";

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

describe("Media – kampanjens bilder", () => {
  it("behåller, byter ordning och lägger till bilder", () => {
    expect(resolvePostPhotos([{ keep: 1 }, { data: "NY" }, { keep: 0 }], ["A", "B"])).toEqual(["B", "NY", "A"]);
    expect(() => resolvePostPhotos([{ keep: 3 }], ["A"])).toThrow(/saknas/);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Media – kampanj och teman", () => {
  it("Movember finns från start och teman kan sparas med logga och bakgrund", async () => {
    const c = appRouter.createCaller(admin as never);
    const movember = (await c.media.themes.list()).find((t) => t.builtin === "movember")!;
    expect(movember).toMatchObject({ name: "Movember", hasLogo: false, slogan: "Grow together • Change men's health", tags: "#movember" });
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { id } = await c.media.themes.save({ name: "Rosa bandet", accent: "#ec4899", title: "", subtitle: "", slogan: "", tags: "#rosabandet", background: "arena", dim: 50, logo: PNG, photo: JPEG });
    const saved = (await c.media.themes.list()).find((t) => t.id === id)!;
    expect(saved).toMatchObject({ hasLogo: true, hasPhoto: true, accent: "#ec4899" });
    expect((await getThemeImage(id, "logo"))?.mime).toBe("image/png");
    await c.media.themes.save({ id, name: "Rosa bandet", accent: "#ec4899", title: "", subtitle: "", slogan: "", tags: "", background: "arena", dim: 50, photo: null });
    const after = (await c.media.themes.list()).find((t) => t.id === id)!;
    expect(after).toMatchObject({ hasLogo: true, hasPhoto: false }); // loggan behölls
    await expect(c.media.themes.save({ name: "X", accent: "#000000", title: "", subtitle: "", slogan: "", tags: "", background: "arena", dim: 50, photo: PNG })).rejects.toThrow(/JPEG/);
    await expect(appRouter.createCaller(lineupUser as never).media.themes.list()).rejects.toThrow();
    await c.media.themes.delete({ id });
  });

  it("sparar deltagarnas bilder, behåller dem vid ändring och tar bort dem med inlägget", async () => {
    const c = appRouter.createCaller(admin as never);
    const JPEG2 = Buffer.concat([Buffer.from(JPEG, "base64"), Buffer.from([0, 0, 0])]).toString("base64");
    const base = { type: "campaign" as const, title: "Movember: Veckans mustascher", settings: { kind: "campaign" }, caption: "" };
    const { id } = await c.media.save({ ...base, photos: [{ data: JPEG }, { data: JPEG2 }] });
    expect((await c.media.list()).find((p) => p.id === id)?.photoCount).toBe(2);
    // Byt ordning och lägg till en – utan att skicka om de sparade
    await c.media.save({ ...base, id, photos: [{ keep: 1 }, { keep: 0 }, { data: JPEG }] });
    expect((await c.media.list()).find((p) => p.id === id)?.photoCount).toBe(3);
    expect((await getPostPhoto(id, 0))?.toString("base64")).toBe(JPEG2);
    // Sparning utan photos rör inte bilderna
    await c.media.save({ ...base, id, title: "Ny rubrik" });
    expect((await c.media.list()).find((p) => p.id === id)?.photoCount).toBe(3);
    // Som nytt inlägg går det inte att hänvisa till ett annat inläggs bilder
    await expect(c.media.save({ ...base, photos: [{ keep: 0 }] })).rejects.toThrow(/saknas/);
    await expect(c.media.save({ ...base, id, photos: Array.from({ length: 10 }, () => ({ data: JPEG })) })).rejects.toThrow();
    await c.media.delete({ id });
    expect(await getPostPhoto(id, 0)).toBeNull();
  });
});
