import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("./scoreDb", () => ({
  getConfigValue: async (k: string) => store.get(k) ?? null,
  setConfigValue: async (k: string, v: string) => { store.set(k, v); },
}));
const L = await import("./liveMatch");

beforeEach(() => { store.clear(); L.__resetLiveForTest(); });

describe("live", () => {
  it("en enhet sänder; en annan måste ta över", async () => {
    expect((await L.startLive("enhet-aaaa", false)).ok).toBe(true);
    expect(await L.startLive("enhet-bbbb", false)).toEqual({ ok: false, reason: "busy" });
    expect(await L.pushLive("enhet-bbbb", { whiteScore: 1, greenScore: 0, goals: [], matchStartTime: null, endTime: null })).toBe(false);
    expect((await L.startLive("enhet-bbbb", true)).ok).toBe(true);
    expect(await L.pushLive("enhet-bbbb", { whiteScore: 1, greenScore: 0, goals: [{ team: "white", timestamp: "22:20" }], matchStartTime: null, endTime: "23:15" })).toBe(true);
    expect((await L.currentSession())?.whiteScore).toBe(1);
  });
  it("unika tittare räknas anonymt; koderna raderas vid slut, antalet sparas", async () => {
    await L.startLive("enhet-aaaa", false);
    await L.touchViewer("1.1.1.1", "ua");
    await L.touchViewer("1.1.1.1", "ua");
    await L.touchViewer("2.2.2.2", "ua");
    expect(L.watchingNow()).toBe(2);
    await L.endLive("enhet-aaaa");
    const s = await L.currentSession();
    expect(s?.uniqueViewers).toBe(2);
    expect(s?.viewerHashes).toBeUndefined();
    expect(s?.salt).toBeUndefined();
    expect(L.isAfter(s)).toBe(true);
  });
  it("kommentarer: en per 10 s, max 50 per tittare och match, inget filter", async () => {
    await L.startLive("enhet-aaaa", false);
    const v = (await L.touchViewer("1.1.1.1", "ua"))!;
    expect((await L.postComment(v, "", "Fan vad bra!")).ok).toBe(true);
    const r = await L.postComment(v, "", "igen");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("wait");
    const list = await L.listComments((await L.currentSession())!.id);
    expect(list[0]).toMatchObject({ name: "Anonym", text: "Fan vad bra!" });
    expect("viewer" in list[0]).toBe(false);
  });
  it("Läktaren avstängd: inga kommentarer", async () => {
    await L.setLiveConfig({ laktaren: false });
    await L.startLive("enhet-aaaa", false);
    const v = (await L.touchViewer("1.1.1.1", "ua"))!;
    expect((await L.postComment(v, "A", "hej")).ok).toBe(false);
  });
});
