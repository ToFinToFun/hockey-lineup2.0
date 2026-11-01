import { describe, expect, it } from "vitest";
import { cropRect, moveCrop, zoomCrop, peopleColumns, peopleSlots, podiumSlots, modeTexts, winnersSubtitle, MAX_PEOPLE } from "./campaignImages";

describe("kampanjmallen – beskärning", () => {
  it("fyller alltid rutan och håller sig inom bilden", () => {
    for (const [iw, ih] of [[1080, 1350], [1600, 900], [500, 500]]) {
      for (const aspect of [1, 4 / 5]) {
        for (const crop of [{ x: 0, y: 0, z: 1 }, { x: 1, y: 1, z: 3 }, { x: 0.5, y: 0.4, z: 1.7 }, { x: -2, y: 5, z: 9 }]) {
          const r = cropRect(iw, ih, aspect, crop);
          expect(r.sx).toBeGreaterThanOrEqual(0);
          expect(r.sy).toBeGreaterThanOrEqual(0);
          expect(r.sx + r.sw).toBeLessThanOrEqual(iw + 1e-6);
          expect(r.sy + r.sh).toBeLessThanOrEqual(ih + 1e-6);
          expect(r.sw / r.sh).toBeCloseTo(aspect, 6);
        }
      }
    }
  });
  it("zoom 2 visar halva bredden kring mittpunkten", () => {
    const full = cropRect(1000, 1000, 1, { x: 0.5, y: 0.5, z: 1 });
    const zoom = cropRect(1000, 1000, 1, { x: 0.5, y: 0.5, z: 2 });
    expect(zoom.sw).toBeCloseTo(full.sw / 2);
    expect(zoom.sx + zoom.sw / 2).toBeCloseTo(500);
  });
});

describe("kampanjmallen – dra och nyp i förhandsvisningen", () => {
  it("drar bilden åt höger: utsnittet flyttas åt vänster i bilden", () => {
    const c = moveCrop(1000, 1000, 1, { x: 0.5, y: 0.5, z: 2 }, 100, 0);
    expect(c.x).toBeCloseTo(0.4);
    expect(c.y).toBeCloseTo(0.5);
    expect(c.z).toBe(2);
  });
  it("kan inte dras utanför bilden", () => {
    const c = moveCrop(1000, 1000, 1, { x: 0.5, y: 0.5, z: 2 }, 5000, -5000);
    const r = cropRect(1000, 1000, 1, c);
    expect(r.sx).toBe(0);
    expect(r.sy + r.sh).toBeCloseTo(1000);
  });
  it("zoom stannar mellan 1 och 3 och håller mittpunkten", () => {
    expect(zoomCrop(1000, 1000, 1, { x: 0.5, y: 0.5, z: 1 }, 9).z).toBe(3);
    expect(zoomCrop(1000, 1000, 1, { x: 0.5, y: 0.5, z: 2 }, 0.2).z).toBe(1);
    const c = zoomCrop(1000, 1000, 1, { x: 0.3, y: 0.6, z: 1.5 }, 2.5);
    expect(c.x).toBeCloseTo(0.3);
    expect(c.y).toBeCloseTo(0.6);
  });
});

describe("kampanjmallen – deltagarnas rutnät", () => {
  it("kolumner per antal", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(peopleColumns)).toEqual([1, 2, 3, 2, 3, 3, 4, 4, 3]);
  });
  it("1–9 bilder: lika stora, inom ytan, utan överlapp och centrerade", () => {
    const top = 300, bottom = 1100, label = (w: number) => w * 0.18;
    for (let n = 1; n <= MAX_PEOPLE; n++) {
      const slots = peopleSlots(n, top, bottom, { labelH: label });
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(s.w).toBeCloseTo(slots[0].w);
        expect(s.x).toBeGreaterThanOrEqual(50 - 1e-6);
        expect(s.x + s.w).toBeLessThanOrEqual(1030 + 1e-6);
        expect(s.y).toBeGreaterThanOrEqual(top - 1e-6);
        expect(s.y + s.h + label(s.w)).toBeLessThanOrEqual(bottom + 1e-6);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = slots[i], b = slots[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h + label(a.w) <= b.y || b.y + b.h + label(b.w) <= a.y;
        expect(apart).toBe(true);
      }
      // Varje rad är centrerad kring mitten
      const rows = new Map<number, typeof slots>();
      for (const s of slots) rows.set(Math.round(s.y), [...(rows.get(Math.round(s.y)) ?? []), s]);
      for (const row of rows.values()) {
        const mid = (row[0].x + row[row.length - 1].x + row[row.length - 1].w) / 2;
        expect(mid).toBeCloseTo(540);
      }
    }
  });
  it("tio bilder eller fler ritas som nio", () => {
    expect(peopleSlots(12, 300, 1100)).toHaveLength(MAX_PEOPLE);
    expect(peopleSlots(0, 300, 1100)).toHaveLength(0);
  });
  it("före/efter: två stående bilder bredvid varandra", () => {
    const [a, b] = peopleSlots(2, 300, 1000, { aspect: 4 / 5, maxW: 470 });
    expect(a.h / a.w).toBeCloseTo(5 / 4);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.w).toBeLessThanOrEqual(470);
  });
});

describe("kampanjmallen – vinnare", () => {
  it("prispallen: ettan störst i mitten och högst, alla på samma golv, inom ytan", () => {
    for (const n of [1, 2, 3]) {
      const top = 280, floor = 1060, nameH = 66;
      const slots = podiumSlots(n, top, floor, nameH);
      expect(slots.map((x) => x.place)).toEqual([0, 1, 2].slice(0, n));
      const [first, ...rest] = slots;
      for (const s of slots) {
        expect(s.h / s.w).toBeCloseTo(1.25);
        expect(s.y + s.h + nameH + s.blockH).toBeCloseTo(floor); // står på golvet
        expect(s.x).toBeGreaterThanOrEqual(50 - 1e-6);
        expect(s.x + s.w).toBeLessThanOrEqual(1030 + 1e-6);
        expect(s.y - s.w * 0.3).toBeGreaterThanOrEqual(top - 1); // plats för guldmustaschen
      }
      for (const r of rest) {
        expect(r.w).toBeLessThan(first.w);
        expect(r.y).toBeGreaterThan(first.y); // ettan står högst
      }
      if (n === 3) {
        const byX = [...slots].sort((a, b) => a.x - b.x).map((x) => x.place);
        expect(byX).toEqual([1, 0, 2]); // tvåan vänster, ettan mitten, trean höger
      }
    }
  });
  it("Vinnaren/Vinnarna med året", () => {
    expect(winnersSubtitle(1, 2026)).toBe("Vinnaren 2026");
    expect(winnersSubtitle(3, 2026)).toBe("Vinnarna 2026");
  });
  it("förvalda texter per läge: rubrik, underrubrik (slogan) och ramen nederst", () => {
    const t = { name: "Mustaschkampen", title: "Var med i Mustaschkampen", subtitle: "Tillsammans mot prostatacancer", slogan: "Mer forskning räddar fler liv" };
    expect(modeTexts("news", t)).toEqual({ title: "Var med i Mustaschkampen", subtitle: "Mer forskning räddar fler liv", slogan: "Tillsammans mot prostatacancer" });
    expect(modeTexts("people", t)).toEqual({ title: "Tillsammans mot prostatacancer", subtitle: "Mer forskning räddar fler liv", slogan: "Deltagare" });
    expect(modeTexts("beforeafter", t).slogan).toBe("Före och efter");
    expect(modeTexts("winners", t, 2, 2026)).toEqual({ title: "Tillsammans mot prostatacancer", subtitle: "Mer forskning räddar fler liv", slogan: "Vinnarna 2026" });
  });
});
