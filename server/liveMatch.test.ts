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

describe("ingen avslutar", () => {
  it("avslutas 30 min efter sluttiden eller efter 90 min utan uppdatering", async () => {
    const base = { id: "x", deviceId: "d", startedAt: "2026-10-06T20:00:00", updatedAt: "2026-10-06T22:00:00", endedAt: null, whiteScore: 0, greenScore: 0, goals: [], matchStartTime: "2026-10-06T20:00:00", hearts: { white: 0, green: 0 }, uniqueViewers: 0 };
    expect(L.shouldAutoEnd({ ...base, endTime: "22:00" }, new Date("2026-10-06T22:20:00").getTime())).toBe(false);
    expect(L.shouldAutoEnd({ ...base, endTime: "22:00" }, new Date("2026-10-06T22:31:00").getTime())).toBe(true);
    expect(L.shouldAutoEnd({ ...base, endTime: null }, new Date("2026-10-06T23:20:00").getTime())).toBe(false);
    expect(L.shouldAutoEnd({ ...base, endTime: null }, new Date("2026-10-06T23:31:00").getTime())).toBe(true);
  });
});

describe("automatiskt avslutad sparas i historiken", () => {
  it("anropar sparningen en gång och kommer ihåg matchens id", async () => {
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    store.set("live_session", JSON.stringify({ id: "s1", deviceId: "d", startedAt: old, updatedAt: old, endedAt: null, whiteScore: 2, greenScore: 1, goals: [], matchStartTime: old, endTime: null, hearts: { white: 3, green: 1 }, uniqueViewers: 0, salt: "x", viewerHashes: ["a", "b"] }));
    L.__resetLiveForTest();
    const saved: number[] = [];
    L.setLiveAutoEndHandler(async (s) => { saved.push(s.whiteScore); return 42; });
    const s = await L.currentSession();
    expect(s?.endedAt).toBeTruthy();
    expect(s?.uniqueViewers).toBe(2);
    expect(s?.autoSavedMatchId).toBe(42);
    await L.currentSession();
    expect(saved).toEqual([2]);
  });
  it("styrelsen: nedräkning, avsluta sändningen nu (sparar ingen match) och stäng slutvisningen nu", async () => {
    const saved: string[] = [];
    L.setLiveAutoEndHandler(async (sess) => { saved.push(sess.id); return 77; });
    await L.startLive("enhet-aaaa", false);
    // Matchen startade nyss och slutar om en timme (hela minuter)
    const start = new Date(); start.setSeconds(0, 0);
    const endD = new Date(start.getTime() + 60 * 60_000);
    const hhmm = `${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}`;
    await L.pushLive("enhet-aaaa", { whiteScore: 2, greenScore: 1, goals: [], matchStartTime: start.toISOString(), endTime: hhmm });
    let s = (await L.currentSession())!;
    // 30 min efter sluttiden eller 90 min utan uppdatering – det som kommer först
    const end = endD.getTime() + 30 * 60_000;
    expect(L.autoEndAt(s)).toBe(Math.min(end, new Date(s.updatedAt).getTime() + 90 * 60_000));
    expect(L.removeAt(s)).toBeNull();

    expect(await L.endLiveNow()).toBe(true);
    s = (await L.currentSession())!;
    expect(saved).toEqual([]); // bara sändningen – ingen match sparas
    expect(s.autoSavedMatchId ?? null).toBeNull();
    expect(L.autoEndAt(s)).toBeNull();
    expect(L.removeAt(s)).toBe(new Date(s.endedAt!).getTime() + 30 * 60_000);
    expect(L.isAfter(s)).toBe(true);

    expect(await L.dismissLive()).toBe(true);
    s = (await L.currentSession())!;
    expect(L.isAfter(s)).toBe(false);
    expect(L.removeAt(s)).toBeNull();
    expect(await L.dismissLive()).toBe(false);
  });
});
