import { describe, expect, it } from "vitest";
import { buildStatsExport, exportInstructions, type StatsExportData } from "./statsExport";
import { splitPasted } from "./pressText";

const empty = { totalMatches: 0, whiteWins: 0, greenWins: 0, draws: 0, totalGoalsWhite: 0, totalGoalsGreen: 0, topScorers: [], starLeaders: [], recentForm: [], biggestWinWhite: null, biggestWinGreen: null, highestScoringMatch: null, goalTypes: [], playerRecordGoals: null, playerRecordAssists: null, playerRecordPoints: null, monthlyMvp: [], monthlyGoalie: [], extraRecords: [] };
const data = {
  period: { label: "Vecka 44", from: "2026-10-26", to: "2026-11-01", includeExternal: false },
  exportedAt: new Date("2026-10-30T10:00:00Z"),
  season: { ...empty, topScorers: [{ name: "Anna Andersson #4", goals: 3, assists: 1, gwg: 1, points: 4, team: "white", matches: 2 }] },
  awards: { awards: [], totalMatches: 2 },
  teams: { totalMatches: 0 },
  standings: { rows: [{ team: "white", gp: 2, w: 2, l: 0, t: 0, gf: 7, ga: 3, diff: 4, pts: 4 }, { team: "green", gp: 2, w: 0, l: 2, t: 0, gf: 3, ga: 7, diff: -4, pts: 0 }], series: { white: 2, green: 0, ties: 0, leader: "white", matches: [] } },
  final: null, ice: [], goalieFun: [], fun: [], venues: [],
  matches: [{ id: 1, start: "2026-10-29T21:00:00.000Z", location: "Coop Arena", opponent: null, title: "", white: 4, green: 2, minutes: 60,
    goals: [{ minute: 12, team: "white", scorer: "Anna Andersson", assist: "Cesar Ceder", type: "", score: "1–0", gwg: false }],
    stars: ["Anna Andersson"], teams: { white: [{ label: "Kedja 1", players: [{ name: "Anna Andersson", pos: "LW", minutes: 20 }] }], green: [] } }],
  players: [{ id: "a", name: "Anna Andersson", number: "4", position: "F", teamColor: null, captainRole: "C", active: true }],
} as unknown as StatsExportData;

describe("Statistik → Export", () => {
  const text = buildStatsExport(data);
  it("perioden, instruktionerna och datan", () => {
    expect(text).toContain("Period: **Vecka 44** (2026-10-26 – 2026-11-01) · 1 matcher");
    expect(text).toContain("## Instruktioner till dig som skriver");
    expect(text).toContain("| 1 | Vita | 2 | 2 | 0 | 0 | 7 | 3 | +4 | 4 |");
    // Lag från statistiken när registret saknar lag, C från registret
    expect(text).toContain("| Anna Andersson | Vita | F | C | 2 | 3 | 1 | 4 | 2 | 1 |");
    expect(text).toContain("#### 2026-10-29 tors kl 22:00 · Coop Arena · Vita 4–2 Gröna (vinst Vita)");
    expect(text).toContain("- 12′ 1–0 Vita: Anna Andersson (Cesar Ceder)");
    expect(text).toContain("Vita: Kedja 1: LW Anna Andersson (20 min)");
  });
  it("inga kontaktuppgifter eller nivåord", () => {
    expect(text).not.toMatch(/@|telefon|personnummer/i);
    expect(exportInstructions()).toContain('Skriv inget om spelnivå');
  });
  it("formatet i instruktionerna fördelas rätt av Klistra in", () => {
    const answer = "Vita tog kommandot\n\nTvå raka segrar och ett lag i form inför helgen.\n\nFörsta stycket.\n\nAndra stycket.";
    expect(splitPasted(answer)).toEqual({ headline: "Vita tog kommandot", ingress: "Två raka segrar och ett lag i form inför helgen.", body: "Första stycket.\n\nAndra stycket." });
  });
});
