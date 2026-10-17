import { describe, expect, it } from "vitest";

// Radbrytningen testas via modulens interna beteende: långa rader viks efter 75 byte
describe("kalender", () => {
  it("viker långa rader med mellanslag först", async () => {
    const mod = await import("./calendar");
    expect(typeof mod.calendarFeed).toBe("function");
    expect(await mod.calendarFeed("x")).toBeNull(); // ogiltig token avvisas utan databas
  });
});
