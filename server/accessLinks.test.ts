import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("./scoreDb", () => ({
  getConfigValue: async (k: string) => store.get(k) ?? null,
  setConfigValue: async (k: string, v: string) => { store.set(k, v); },
}));

const { createAccessLink, updateAccessLink, revokeAccessLink, getActiveAccessLink, expiryFromDate } = await import("./accessLinks");
const { router, moduleProcedure, lineupProcedure } = await import("./_core/trpc");

const app = router({
  media: moduleProcedure("media").query(() => "ok"),
  lineup: lineupProcedure.query(() => "ok"),
});
const call = (session: unknown) => app.createCaller({ session } as never);

describe("delade länkar med moduler", () => {
  it("skapas, ändras direkt och kan stängas", async () => {
    const l = await createAccessLink({ name: "Fotograf", modules: ["media", "x" as never], validUntil: null });
    expect(l.modules).toEqual(["media"]);
    expect((await getActiveAccessLink(l.id))?.name).toBe("Fotograf");
    await updateAccessLink(l.id, { modules: ["media", "cards"] });
    expect((await getActiveAccessLink(l.id))?.modules).toEqual(["media", "cards"]);
    await revokeAccessLink(l.id);
    expect(await getActiveAccessLink(l.id)).toBeNull();
  });
  it("giltig till och med vald dag", async () => {
    expect(expiryFromDate("2026-12-24")).toBe(new Date(2026, 11, 25).toISOString());
    const old = await createAccessLink({ name: "Gammal", modules: ["stats"], validUntil: "2020-01-01" });
    expect(await getActiveAccessLink(old.id)).toBeNull();
  });
  it("modulerna styr vad länken når – aldrig Lineup", async () => {
    await expect(call({ role: "access", modules: ["media"] }).media()).resolves.toBe("ok");
    await expect(call({ role: "access", modules: ["cards"] }).media()).rejects.toThrow();
    await expect(call({ role: "access", modules: ["media"] }).lineup()).rejects.toThrow();
    await expect(call({ role: "admin" }).media()).resolves.toBe("ok");
  });
});
