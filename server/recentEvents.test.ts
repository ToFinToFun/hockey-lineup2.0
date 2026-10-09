import { describe, expect, it } from "vitest";
import { applyEvent, pickEvent, type KnownEvent } from "./recentEvents";

const tue: KnownEvent = { date: "2026-10-06", time: "22:15", endTime: "23:15", location: "Coop Arena C-Hallen" };
const thu: KnownEvent = { date: "2026-10-08", time: "20:00", endTime: "21:00", location: "Sunderby ishall" };
const d = (s: string) => new Date(s);

describe("matchens tid och plats från träningen", () => {
  it("hittar träningen även när laget.se redan visar nästa (matchen sparas efter träningen)", () => {
    expect(pickEvent([thu, tue], null, d("2026-10-06T23:20:00"))).toEqual(tue);
  });

  it("väljer träningen närmast starttiden klienten angav", () => {
    const early: KnownEvent = { date: "2026-10-06", time: "19:00", endTime: "20:00", location: "Annan hall" };
    expect(pickEvent([early, tue], d("2026-10-06T22:20:00"), d("2026-10-06T23:20:00"))).toEqual(tue);
  });

  it("ingen träning inom 6 h före slutet: inget ändras", () => {
    expect(pickEvent([tue], null, d("2026-10-07T12:00:00"))).toBeNull();
    const m = { name: "x", teamWhiteScore: 1, teamGreenScore: 0, matchStartTime: null, matchEndTime: d("2026-10-07T12:00:00"), location: null, plannedMinutes: null };
    expect(applyEvent(m, null)).toBe(m);
  });

  it("sätter starttid, namn, plats och längd – utan att skriva över det klienten skickade", () => {
    const base = { name: "26-10-06 Tisdag 22:00 3-2", teamWhiteScore: 3, teamGreenScore: 2, matchStartTime: d("2026-10-06T22:00:00"), matchEndTime: d("2026-10-06T23:20:00"), location: null, plannedMinutes: null };
    const r = applyEvent(base, tue);
    expect(r.matchStartTime).toEqual(d("2026-10-06T22:15:00"));
    expect(r.name).toBe("26-10-06 Tisdag 22:15 3-2");
    expect(r.location).toBe("Coop Arena C-Hallen");
    expect(r.plannedMinutes).toBe(60);
    const own = applyEvent({ ...base, name: "Julmatchen", location: "Bortaplan", plannedMinutes: 75 }, tue);
    expect(own).toMatchObject({ name: "Julmatchen", location: "Bortaplan", plannedMinutes: 75 });
  });
});
