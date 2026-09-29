import { describe, expect, it } from "vitest";
import { autoNewsPhase, eventStart, buildNews } from "./autoNews";
import { applyLineupPatch } from "./lineupSync";

describe("automatisk nyhet – tider", () => {
  const start = eventStart("2026-09-29", "20:00")!;
  it("starttid ur evenemanget", () => {
    expect(start.getHours()).toBe(20);
    expect(eventStart("2026-09-29", undefined)).toBeNull();
  });
  it("förhandsvisning 15 min före publicering, publicering 45 min före start", () => {
    const at = (h: number, m: number) => new Date(2026, 8, 29, h, m);
    expect(autoNewsPhase(at(18, 50), start, 45)).toBe("wait");
    expect(autoNewsPhase(at(19, 0), start, 45)).toBe("preview");
    expect(autoNewsPhase(at(19, 15), start, 45)).toBe("publish");
    expect(autoNewsPhase(at(19, 59), start, 45)).toBe("publish");
    expect(autoNewsPhase(at(20, 0), start, 45)).toBe("past");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("automatisk nyhet – bygger nyheten på servern", () => {
  it("rubrik, text med sponsorrad, bild och antal anmälda i uppställningen", async () => {
    const p = (i: number, reg: boolean) => ({ id: `an-${i}`, name: `Auto ${i}`, number: String(i), position: "F", ...(reg ? { isRegistered: true } : {}) });
    await applyLineupPatch(`an-${Date.now()}`, [
      { t: "slot", slot: "team-a-fwd-1-c", player: p(1, true) as never },
      { t: "slot", slot: "team-b-fwd-1-c", player: p(2, true) as never },
      { t: "slot", slot: "team-a-fwd-1-lw", player: p(3, false) as never },
    ]);
    const news = await buildNews({ date: "2026-09-29", time: "20:00", location: "Arenan" });
    expect(news.title).toBe("Lagen 29/9 – Arenan 20:00");
    expect(news.body).toContain("<b>");
    expect(news.image.length).toBeGreaterThan(20_000);
    expect(news.registeredPlaced).toBeGreaterThanOrEqual(2);
  });
});
