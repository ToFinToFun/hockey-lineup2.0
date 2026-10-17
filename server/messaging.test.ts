import { describe, expect, it } from "vitest";
import { chatWindow } from "./messaging";

const h = 3600000;
const base = { opensDaysBefore: 3, closesHoursBefore: 2, createdAt: new Date(Date.now() - 10 * 86400000) };

describe("chatten per aktivitet", () => {
  it("öppnar när anmälan öppnar och stänger 12 h efter slut", () => {
    const startsAt = new Date(Date.now() + 24 * h);
    const w = chatWindow({ ...base, startsAt, endsAt: new Date(startsAt.getTime() + 2 * h) });
    expect(w.open).toBe(true);
    expect(+w.opensAt).toBe(+startsAt - 3 * 86400000);
    expect(+w.closesAt).toBe(+startsAt + 14 * h);
  });
  it("är stängd innan anmälan öppnat", () => {
    const startsAt = new Date(Date.now() + 5 * 86400000);
    expect(chatWindow({ ...base, startsAt, endsAt: null }).open).toBe(false);
  });
  it("är stängd 12 h efter slut (utan sluttid räknas 2 h)", () => {
    expect(chatWindow({ ...base, startsAt: new Date(Date.now() - 13 * h), endsAt: null }).open).toBe(true);
    expect(chatWindow({ ...base, startsAt: new Date(Date.now() - 15 * h), endsAt: null }).open).toBe(false);
  });
  it("utan öppningstid öppnar den när aktiviteten skapas", () => {
    const w = chatWindow({ ...base, opensDaysBefore: null, startsAt: new Date(Date.now() + 30 * 86400000), endsAt: null });
    expect(w.open).toBe(true);
  });
});
