// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { queueMatch, getPendingMatches, flushPendingMatches } from "./offlineScore";

describe("offline-kön", () => {
  beforeEach(() => localStorage.clear());

  it("skickar köade matcher och tömmer kön", async () => {
    queueMatch({ name: "A" });
    queueMatch({ name: "B" });
    const sent: string[] = [];
    expect(await flushPendingMatches(async (p) => { sent.push(p.name as string); })).toBe(2);
    expect(sent).toEqual(["A", "B"]);
    expect(getPendingMatches()).toHaveLength(0);
  });

  it("behåller matchen vid 'för många anrop' och serverfel", async () => {
    queueMatch({ name: "A" });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushPendingMatches(async () => { throw Object.assign(new Error("x"), { data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } }); });
    expect(getPendingMatches()).toHaveLength(1);
    await flushPendingMatches(async () => { throw Object.assign(new Error("x"), { data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } }); });
    expect(getPendingMatches()).toHaveLength(1);
  });

  it("tar bort en match som servern avvisar permanent", async () => {
    queueMatch({ name: "A" });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushPendingMatches(async () => { throw Object.assign(new Error("x"), { data: { code: "BAD_REQUEST", httpStatus: 400 } }); });
    expect(getPendingMatches()).toHaveLength(0);
  });
});
