import { describe, expect, it } from "vitest";
import { seriesDates, signupWindow, sortAttendees, stockholmParts, stockholmToDate, weekdayOf } from "./activities";

describe("svensk tid", () => {
  it("vintertid är UTC+1 och sommartid UTC+2", () => {
    expect(stockholmToDate("2026-12-01", "21:00").toISOString()).toBe("2026-12-01T20:00:00.000Z");
    expect(stockholmToDate("2026-06-01", "21:00").toISOString()).toBe("2026-06-01T19:00:00.000Z");
  });
  it("dagarna kring bytet till vintertid (25 okt 2026)", () => {
    expect(stockholmToDate("2026-10-24", "21:00").toISOString()).toBe("2026-10-24T19:00:00.000Z");
    expect(stockholmToDate("2026-10-25", "21:00").toISOString()).toBe("2026-10-25T20:00:00.000Z");
  });
  it("går tillbaka till samma datum och klockslag", () => {
    const d = stockholmToDate("2026-03-29", "22:15");
    expect(stockholmParts(d)).toMatchObject({ date: "2026-03-29", time: "22:15", weekday: 6 });
  });
});

describe("återkommande", () => {
  it("veckodagar mellan två datum", () => {
    expect(weekdayOf("2026-10-20")).toBe(1); // tisdag
    expect(seriesDates("2026-10-19", "2026-11-01", [1, 3])).toEqual(["2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"]);
  });
  it("tomt när till ligger före från", () => {
    expect(seriesDates("2026-11-01", "2026-10-01", [1])).toEqual([]);
  });
});

describe("anmälan", () => {
  it("öppnar och stänger relativt starten", () => {
    const w = signupWindow({ startsAt: "2026-10-20T19:00:00.000Z", opensDaysBefore: 7, closesHoursBefore: 2 });
    expect(w.opensAt?.toISOString()).toBe("2026-10-13T19:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
  it("målvakter först, sedan bokstavsordning oavsett position", () => {
    const sorted = sortAttendees([
      { name: "Östen", position: "F" },
      { name: "Bertil", position: "MV" },
      { name: "Anna", position: "B" },
      { name: "Adam", position: "MV" },
      { name: "Åsa", position: "C" },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Adam", "Bertil", "Anna", "Åsa", "Östen"]);
  });
});
