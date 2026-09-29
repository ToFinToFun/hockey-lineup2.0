import { describe, expect, it } from "vitest";
import { resolveMatchStart, matchName, elapsedMinutes } from "./matchTiming";

describe("matchens starttid och namn", () => {
  const ev = { eventDate: "2026-09-29", eventTime: "22:15" };
  it("träningstiden används – även när Avsluta trycks efter midnatt", () => {
    const r = resolveMatchStart(ev, null, new Date(2026, 8, 30, 0, 40));
    expect(r.source).toBe("event");
    expect(matchName(r.start, 3, 2)).toBe("26-09-29 Tisdag 22:15 3-2");
  });
  it("evenemang för långt bort → första målet eller uppskattning", () => {
    const now = new Date(2026, 8, 29, 21, 10);
    expect(resolveMatchStart({ eventDate: "2026-10-01", eventTime: "20:00" }, null, now).source).toBe("estimate");
    expect(matchName(resolveMatchStart(null, null, now).start, 0, 0)).toBe("26-09-29 Tisdag 20:00 0-0");
    expect(resolveMatchStart(null, new Date(2026, 8, 29, 20, 7).toISOString(), now).source).toBe("goal");
  });
  it("uppskattningen efter midnatt får rätt dag", () => {
    const r = resolveMatchStart(null, null, new Date(2026, 8, 30, 0, 20));
    expect(matchName(r.start, 1, 1)).toBe("26-09-29 Tisdag 23:00 1-1");
  });
  it("minuter in i matchen, även över midnatt", () => {
    const start = new Date(2026, 8, 29, 22, 15);
    expect(elapsedMinutes("22:27:40", start)).toBe(12);
    expect(elapsedMinutes("00:05:00", start)).toBe(110);
    expect(elapsedMinutes("21:00:00", start)).toBeNull();
    expect(elapsedMinutes(undefined, start)).toBeNull();
  });
});
