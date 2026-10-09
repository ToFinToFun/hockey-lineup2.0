import { describe, expect, it } from "vitest";
import { computeExtraRecords } from "./routers/scoreStats";

const m = (name: string, w: number, g: number, goals: string[], start = "2026-10-01T18:00:00.000Z") => ({
  name: `${name} ${w}-${g}`, teamWhiteScore: w, teamGreenScore: g, matchStartTime: start, createdAt: start,
  // Målen anges i tidsordning men sparas som i appen: det senaste först
  goalHistory: goals.map((t, i) => ({ team: t.split("@")[0], timestamp: t.split("@")[1] ?? `20:${String(10 + i).padStart(2, "0")}:00`, scorer: `S${i}` })).reverse(),
});

describe("fler rekord", () => {
  it("flest mål av ett lag, största vändningen, snabbaste målet, vinstsviter och målvakter", () => {
    const start = new Date(2026, 9, 1, 20, 0).toISOString();
    const recs = computeExtraRecords([
      m("A", 3, 2, ["green@20:02:00", "green", "white", "white", "white"], start), // vita vände 0–2
      m("B", 6, 1, ["white", "white", "white", "white", "white", "white", "green"], start),
      m("C", 2, 1, ["white", "green", "white"], start),
    ], [{ name: "Målis", gkMatches: 3, shutouts: 2, ga60: 1.5 }]);
    const by = Object.fromEntries(recs.map((r) => [r.key, r]));
    expect(by.team_goals).toMatchObject({ value: "6 mål", who: "Vita" });
    expect(by.comeback).toMatchObject({ value: "Från 2 måls underläge", who: "Vita" });
    expect(by.fastest).toMatchObject({ value: "Efter 2 min", who: "S0" });
    expect(by.streak_white).toMatchObject({ value: "3 vinster i rad" });
    expect(by.shutouts).toMatchObject({ who: "Målis", value: "2 nollor" });
    expect(by.ga60).toMatchObject({ who: "Målis" });
  });
});
