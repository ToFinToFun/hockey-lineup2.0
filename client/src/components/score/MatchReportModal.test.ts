import { describe, expect, it } from "vitest";
import { buildReportData, buildCaption } from "./MatchReportModal";
import { goalsLayout } from "@/lib/matchReportImages";
import { starCandidates, autoStars } from "@/lib/starsOfGame";

const match = {
  id: 3,
  name: "Tisdag 29/9 3-2",
  teamWhiteScore: 3,
  teamGreenScore: 2,
  createdAt: "2026-09-29T20:30:00Z",
  matchEndTime: "2026-09-29T20:30:00Z",
  lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: { "team-a-fwd-1-c": { id: "k", name: "Kalle" }, "team-b-gk-1": { id: "g", name: "Gunnar" } } },
  goalHistory: [
    { team: "white" as const, timestamp: "21:40:10", scorer: "Kalle", sponsor: "Polar" },
    { team: "green" as const, timestamp: "21:30:00", scorer: "Olle", assist: "Kalle", other: "Straff", sponsor: "Ren" },
    { team: "white" as const, timestamp: "21:20:00", scorer: "Kalle", assist: "Pelle", sponsor: "Polar" },
    { team: "green" as const, timestamp: "21:10:00", scorer: "Pelle", other: "Självmål" },
    { team: "white" as const, timestamp: "21:05:00", scorer: "Pelle" },
  ],
};

describe("matchrapport", () => {
  const cands = starCandidates(match);
  const stars = autoStars(cands, match.id).map((k) => cands.find((c) => c.key === k)!);

  it("målen i tidsordning, straff och självmål markerade", () => {
    const d = buildReportData(match, stars, null);
    expect(d.goals.map((g) => g.time)).toEqual(["21:05", "21:10", "21:20", "21:30", "21:40"]);
    expect(d.goals[1].scorer).toBe("Pelle (självmål)");
    expect(d.goals[3].penalty).toBe(true);
    // 3–2 till Vita: Vitas tredje mål (21:40) är matchvinnande
    expect(d.goals.map((g) => g.gwg)).toEqual([false, false, false, false, true]);
    expect(d.whiteName).toBe("Vita");
    expect(d.stars[0]).toEqual({ name: "Kalle", stat: "2G 1A 3TP", gwg: true });
    expect(buildReportData(match, stars, null, [false, true, true]).stars[0]).toEqual({ name: "Kalle", stat: "", gwg: false });
  });

  it("bildtext enligt mallen", () => {
    const text = buildCaption(stars, "Polar", ["#StålstadensSF", "#Gubbhockey"]);
    expect(text.split("\n")[0]).toBe("Kvällens Stars of the Game");
    expect(text).toContain("⭐⭐⭐ Kalle 2G 1A 3TP GWG");
    expect(buildCaption(stars, null, [], [false, true, true])).toContain("⭐⭐⭐ Kalle\n");
    expect(buildReportData(match, stars, null, undefined, "Julmatchen").title).toBe("Julmatchen");
    expect(text).toContain("Dagens mål presenterades av Polar");
    expect(text.endsWith("#StålstadensSF #Gubbhockey")).toBe(true);
  });

  it("målbildens layout: en kolumn upp till 12 mål, sedan två", () => {
    expect(goalsLayout(5)).toMatchObject({ columns: 1, rowH: 118 });
    expect(goalsLayout(12).columns).toBe(1);
    const many = goalsLayout(25);
    expect(many.columns).toBe(2);
    expect(many.top + many.perCol * many.rowH).toBeLessThanOrEqual(1350 - 90);
  });
});
