import { describe, expect, it } from "vitest";
import { matchLog } from "./statsExport";

const start = new Date("2026-10-22T20:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60000).toISOString();
// goalHistory sparas med senaste målet först (shared/goalOrder.ts)
const match = {
  id: 7, name: "26-10-22 Torsdag 22:00 2-1", teamWhiteScore: 2, teamGreenScore: 1,
  matchStartTime: start, matchEndTime: new Date(start.getTime() + 60 * 60000), plannedMinutes: 60, location: "Coop Arena C-Hallen", opponentId: null,
  goalHistory: [
    { team: "white", scorer: "Anna A #4", scorerId: "a", timestamp: at(50) },
    { team: "green", scorer: "Bo B", scorerId: "b", assist: "Gustav G", other: "Straff", timestamp: at(30) },
    { team: "white", scorer: "Anna A", scorerId: "a", assist: "Cesar C", assistId: "c", timestamp: at(9.5) },
  ],
  lineup: { teamAName: "VITA", lineup: {
    "team-a-gk-1": { id: "g1", name: "Mats M" },
    "team-a-fwd-1-c": { id: "c", name: "Cesar C" }, "team-a-fwd-1-lw": { id: "a", name: "Anna A #4" },
    "team-a-def-1-1": { id: "d", name: "Dan D" },
    "team-b-fwd-1-c": { id: "b", name: "Bo B" }, "team-b-gk-1": { id: "g2", name: "Gustav G" },
  } },
};
const registry = new Map([["a", "Anna Andersson"], ["c", "Cesar Ceder"], ["b", "Bo Berg"], ["g1", "Mats Målvakt"], ["d", "Dan Dahl"], ["g2", "Gustav Grön"]]);

describe("matchLog (Statistik → Export)", () => {
  const [m] = matchLog([match], registry, new Map());
  it("målen i tidsordning med minut, ställning, typ och matchvinnande mål", () => {
    expect(m.goals.map((g) => [g.minute, g.score, g.scorer, g.assist, g.type, g.gwg])).toEqual([
      [10, "1–0", "Anna Andersson", "Cesar Ceder", "", false],
      [31, "1–1", "Bo Berg", "Gustav G", "Straff", false],
      [51, "2–1", "Anna Andersson", "", "", true],
    ]);
  });
  it("lagen per kedja med registrets namn, position och speltid", () => {
    expect(m.teams.white.map((l) => l.label)).toEqual(["Målvakt", "Kedja 1", "Backpar 1"]);
    expect(m.teams.white[1].players.map((p) => `${p.pos} ${p.name}`)).toEqual(["C Cesar Ceder", "LW Anna Andersson"]);
    expect(m.teams.white[0].players[0].minutes).toBe(60);
    expect(m.teams.green.map((l) => l.label)).toEqual(["Målvakt", "Kedja 1"]);
  });
  it("plats, resultat och stjärnor", () => {
    expect(m).toMatchObject({ id: 7, location: "Coop Arena C-Hallen", white: 2, green: 1, opponent: null, minutes: 60 });
    expect(m.stars.length).toBeGreaterThan(0);
  });
  it("motståndarens namn för externa matcher", () => {
    const [x] = matchLog([{ ...match, opponentId: 3 }], registry, new Map([[3, "Bodens HF"]]));
    expect(x.opponent).toBe("Bodens HF");
  });
});
