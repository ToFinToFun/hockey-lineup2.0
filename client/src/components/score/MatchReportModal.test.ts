import { describe, expect, it } from "vitest";
import { buildReportData, buildCaption } from "./MatchReportModal";
import { goalsLayout } from "@/lib/matchReportImages";

const match = {
  name: "Tisdag 29/9 3-2",
  teamWhiteScore: 3,
  teamGreenScore: 2,
  createdAt: "2026-09-29T20:30:00Z",
  matchEndTime: "2026-09-29T20:30:00Z",
  lineup: { teamAName: "VITA", teamBName: "GRÖNA" },
  // Nyast först, som Score Tracker sparar
  goalHistory: [
    { team: "white" as const, timestamp: "21:40:10", scorer: "Kalle", sponsor: "Polar" },
    { team: "green" as const, timestamp: "21:30:00", scorer: "Olle", assist: "Kalle", other: "Straff", sponsor: "Ren" },
    { team: "white" as const, timestamp: "21:20:00", scorer: "Kalle", assist: "Pelle", sponsor: "Polar" },
    { team: "green" as const, timestamp: "21:10:00", scorer: "Pelle", other: "Självmål" },
    { team: "white" as const, timestamp: "21:05:00", scorer: "Pelle" },
  ],
};

describe("matchrapport", () => {
  it("målen i tidsordning, straff och självmål markerade", () => {
    const d = buildReportData(match, () => null);
    expect(d.goals.map((g) => g.time)).toEqual(["21:05", "21:10", "21:20", "21:30", "21:40"]);
    expect(d.goals[1].scorer).toBe("Pelle (självmål)");
    expect(d.goals[3].penalty).toBe(true);
    expect(d.whiteName).toBe("Vita");
    expect(d.greenName).toBe("Gröna");
  });

  it("poängbäst och sponsorer (flest först); självmål ger inga poäng", () => {
    const d = buildReportData(match, (n) => (n === "Polar" ? "data:x" : null));
    expect(d.topScorer).toEqual({ name: "Kalle", goals: 2, assists: 1 });
    expect(d.sponsors).toEqual([{ name: "Polar", logo: "data:x" }, { name: "Ren", logo: null }]);
  });

  it("bildtext med resultat, målskyttar och sponsorer", () => {
    const text = buildCaption(buildReportData(match, () => null));
    expect(text).toContain("Vita 3–2 Gröna");
    expect(text).toContain("Mål: Kalle 2, Pelle, Olle");
    expect(text).toContain("Målen presenterades av Polar, Ren.");
  });

  it("målbildens layout: en kolumn upp till 12 mål, sedan två", () => {
    expect(goalsLayout(5)).toMatchObject({ columns: 1, rowH: 118 });
    expect(goalsLayout(12).columns).toBe(1);
    const many = goalsLayout(25);
    expect(many.columns).toBe(2);
    expect(many.perCol).toBe(13);
    expect(many.top + many.perCol * many.rowH).toBeLessThanOrEqual(1350 - 90);
  });
});
