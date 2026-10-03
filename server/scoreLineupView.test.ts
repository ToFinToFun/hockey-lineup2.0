import { describe, expect, it } from "vitest";
import { scoreLineupView } from "./scoreLineupView";
import type { LineupLock } from "./lineupLock";

const lock = (lockedAt: string, publishAt: string | null = null) => ({ lockedAt, publishAt, expiresAt: "2099-01-01T00:00:00Z", newsTitle: "x", doc: {} } as unknown as LineupLock);
const start = new Date("2026-10-06T20:00:00");

describe("scoreLineupView", () => {
  it("publicerat direkt → visas med klicktiden", () => {
    expect(scoreLineupView(lock("2026-10-06T17:00:00"), start, new Date("2026-10-06T17:05:00")).mode).toBe("published");
  });
  it("tidsinställd → publiceras vid inställd tid, inte vid klick", () => {
    const l = lock("2026-10-06T12:00:00", new Date("2026-10-06T18:30:00").toISOString());
    expect(scoreLineupView(l, start, new Date("2026-10-06T18:00:00")).mode).toBe("scheduled");
    expect(scoreLineupView(l, start, new Date("2026-10-06T18:31:00")).mode).toBe("published");
  });
  it("ingen nyhet → live från 75 min före start", () => {
    expect(scoreLineupView(null, start, new Date("2026-10-06T18:40:00")).mode).toBe("hidden");
    expect(scoreLineupView(null, start, new Date("2026-10-06T18:45:00")).mode).toBe("live");
  });
  it("inget evenemang → dolt", () => {
    expect(scoreLineupView(null, null)).toEqual({ mode: "hidden", showFrom: null });
  });
});
