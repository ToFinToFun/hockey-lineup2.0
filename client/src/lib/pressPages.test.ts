import { describe, expect, it } from "vitest";
import { toParagraphs } from "./pressPages";

describe("toParagraphs (radbrytningar som skrivna)", () => {
  it("Enter = ny rad utan luft, tom rad = nytt stycke med luft", () => {
    expect(toParagraphs("Rad ett\nRad två\n\nNytt stycke")).toEqual([
      { text: "Rad ett", bold: false, gap: false },
      { text: "Rad två", bold: false, gap: false },
      { text: "Nytt stycke", bold: false, gap: true },
    ]);
  });
  it("intervju: frågan i fetstil och svaret direkt under, även med tom rad emellan (mejl)", () => {
    expect(toParagraphs("Hej! Hur mår du?\n\n– Bra.\n\nOch laget?\n– Starkt.", true)).toEqual([
      { text: "Hej! Hur mår du?", bold: true, gap: false },
      { text: "– Bra.", bold: false, gap: false },
      { text: "Och laget?", bold: true, gap: true },
      { text: "– Starkt.", bold: false, gap: false },
    ]);
  });
  it("frågor utan tomma rader får ändå luft före", () => {
    expect(toParagraphs("Fråga?\n– Svar\nFråga två?\n– Svar två", true).map((p) => p.gap)).toEqual([false, false, true, false]);
  });
});
