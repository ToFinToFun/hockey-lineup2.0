import { describe, it, expect } from "vitest";
import { findGoalLinks, similarity, type LinkGoal, type LinkParticipant, type LinkPlayer } from "./goalLinking";

const players: LinkPlayer[] = [
  { id: "jerry", name: "Jerry Paasovaara", number: "63" },
  { id: "oscar", name: "Oscar Palmqvist", number: "12" },
  { id: "johanS", name: "Johan Sandman", number: "5" },
  { id: "johanH", name: "Johan Hellgren", number: "7" },
  { id: "nils", name: "Nils Sundström", number: "", lagetName: "Nils-Torsten Sundström" },
];
const parts: LinkParticipant[] = [
  { matchId: 1, playerId: "jerry", team: "green" },
  { matchId: 1, playerId: "oscar", team: "green" },
  { matchId: 1, playerId: "johanS", team: "white" },
  { matchId: 1, playerId: "johanH", team: "white" },
];
let n = 0;
const goal = (o: Partial<LinkGoal>): LinkGoal => ({
  id: ++n, matchId: 1, team: "green", goalType: null, scorerId: null, scorerName: null, assistId: null, assistName: null, ...o,
});
const run = (goals: LinkGoal[], extra: Partial<Parameters<typeof findGoalLinks>[0]> = {}) =>
  findGoalLinks({ goals, participants: parts, players, ...extra });

describe("findGoalLinks", () => {
  it("kopplar gammal felstavning till spelaren i samma lag", () => {
    const links = run([goal({ scorerName: "Jery Pasovara #63" })]);
    expect(links).toMatchObject([{ field: "scorerId", playerId: "jerry" }]);
  });

  it("kopplar via exakt namn/etikett, även om spelaren saknas i uppställningen", () => {
    const links = run([goal({ team: "white", matchId: 2, scorerName: "Oscar Palmqvist #12", assistName: "Nils-Torsten Sundström" })]);
    expect(links.map((l) => [l.field, l.playerId, l.how])).toEqual([["scorerId", "oscar", "exakt"], ["assistId", "nils", "exakt"]]);
  });

  it("namnbyte i appen: det gamla namnet kopplas till spelaren", () => {
    const links = run([goal({ matchId: 3, scorerName: "Jery P" })], { renames: [{ id: "jerry", oldNames: ["Jery P"] }] });
    expect(links).toMatchObject([{ playerId: "jerry", how: "namnbyte" }]);
  });

  it("gästspelare och för osäkra namn lämnas okopplade", () => {
    expect(run([goal({ scorerName: "Kalle Gäst" })])).toEqual([]);
    // "Johan" passar två spelare i vita lika bra
    expect(run([goal({ team: "white", scorerName: "Johan" })])).toEqual([]);
  });

  it("kopplar aldrig till en spelare i andra laget", () => {
    // Jerry står i Gröna – ett vitt mål med liknande namn kopplas inte
    expect(run([goal({ team: "white", scorerName: "Jery Pasovara" })])).toEqual([]);
  });

  it("självmål: målskytten hör till motståndarlaget", () => {
    const links = run([goal({ team: "white", goalType: "Självmål", scorerName: "Jery Pasovara" })]);
    expect(links).toMatchObject([{ playerId: "jerry" }]);
  });

  it("match mot annat lag: motståndarens mål kopplas aldrig, inte ens med samma namn", () => {
    const ext = new Set([9]);
    expect(run([goal({ matchId: 9, team: "green", scorerName: "Oscar Palmqvist" })], { externalMatchIds: ext })).toEqual([]);
    expect(run([goal({ matchId: 9, team: "white", scorerName: "Oscar Palmqvist" })], { externalMatchIds: ext }))
      .toMatchObject([{ playerId: "oscar" }]);
  });

  it("samma spelare blir inte både målskytt och assist, och befintliga ID rörs inte", () => {
    const links = run([goal({ scorerId: "jerry", assistName: "Jerry Paasovaara" })]);
    expect(links).toEqual([]);
  });

  it("likhet ignorerar accenter och skiljetecken", () => {
    expect(similarity("Nils-Torsten Sundstrom", "Nils Torsten Sundström")).toBe(1);
  });
});
