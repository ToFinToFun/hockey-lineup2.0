import { describe, expect, it } from "vitest";
import { applyOps, diffDocs, emptyDoc, normalizeDoc, type LineupDoc, type Player } from "./lineupDoc";

const P = (id: string, extra: Partial<Player> = {}): Player =>
  ({ id, name: `Spelare ${id}`, number: id, position: "F", ...extra }) as Player;

function doc(partial: Partial<LineupDoc> = {}): LineupDoc {
  return {
    ...emptyDoc(),
    teamAConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
    teamBConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
    ...partial,
  };
}

/** Simulerar servern: tillämpar patchar i ankomstordning. */
function server(start: LineupDoc, ...patches: LineupDoc[][]) {
  return patches.reduce((d, [before, after]) => applyOps(d, diffDocs(before, after)), start);
}

function where(d: LineupDoc, id: string): string[] {
  const out = Object.entries(d.lineup).filter(([, p]) => p.id === id).map(([s]) => s);
  if (d.players.some((p) => p.id === id)) out.push("trupp");
  return out;
}

const A1 = "team-a-fwd-1-lw";
const A2 = "team-a-fwd-1-c";
const B1 = "team-b-fwd-1-lw";

describe("synkmodellen", () => {
  it("diff + apply återskapar målet", () => {
    const start = doc({ players: [P("1"), P("2"), P("3")] });
    const next = doc({ players: [P("3")], lineup: { [A1]: P("1"), [B1]: P("2") }, teamAName: "Vita" });
    expect(applyOps(start, diffDocs(start, next))).toEqual(normalizeDoc(next));
  });

  it("två användare flyttar olika spelare samtidigt – båda flyttarna finns kvar", () => {
    const start = doc({ players: [P("1"), P("2")] });
    const user1 = doc({ players: [P("2")], lineup: { [A1]: P("1") } });
    const user2 = doc({ players: [P("1")], lineup: { [B1]: P("2") } });
    const result = server(start, [start, user1], [start, user2]);
    expect(where(result, "1")).toEqual([A1]);
    expect(where(result, "2")).toEqual([B1]);
  });

  it("två användare flyttar samma spelare – sista vinner, ingen dubblett", () => {
    const start = doc({ players: [P("1")] });
    const user1 = doc({ lineup: { [A1]: P("1") } });
    const user2 = doc({ lineup: { [B1]: P("1") } });
    expect(where(server(start, [start, user1], [start, user2]), "1")).toEqual([B1]);
  });

  it("två spelare till samma plats – den undanträngda hamnar i truppen, försvinner inte", () => {
    const start = doc({ players: [P("1"), P("2")] });
    const user1 = doc({ players: [P("2")], lineup: { [A1]: P("1") } });
    const user2 = doc({ players: [P("1")], lineup: { [A1]: P("2") } });
    const result = server(start, [start, user1], [start, user2]);
    expect(where(result, "2")).toEqual([A1]);
    expect(where(result, "1")).toEqual(["trupp"]);
  });

  it("byte mellan två platser", () => {
    const start = doc({ lineup: { [A1]: P("1"), [A2]: P("2") } });
    const next = doc({ lineup: { [A1]: P("2"), [A2]: P("1") } });
    const result = applyOps(start, diffDocs(start, next));
    expect(where(result, "1")).toEqual([A2]);
    expect(where(result, "2")).toEqual([A1]);
  });

  it("minskad formation flyttar spelare från borttagna platser till truppen", () => {
    const L2 = "team-a-fwd-2-lw";
    const start = doc({ lineup: { [L2]: P("9") } });
    const result = applyOps(start, [{ t: "field", key: "teamAConfig", value: { goalkeepers: 1, defensePairs: 2, forwardLines: 1 } }]);
    expect(where(result, "9")).toEqual(["trupp"]);
  });

  it("ändrad formation hos en användare och placering i ny kedja hos en annan", () => {
    const L3 = "team-a-fwd-3-c";
    const start = doc({ players: [P("5")] });
    const grown = doc({ players: [P("5")], teamAConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 3 } });
    const placed = doc({ teamAConfig: grown.teamAConfig, lineup: { [L3]: P("5") } });
    const result = server(start, [start, grown], [grown, placed]);
    expect(where(result, "5")).toEqual([L3]);
  });

  it("framräknade fält (PIR) synkas inte", () => {
    const start = doc({ players: [P("1")] });
    const next = doc({ players: [P("1", { pir: 1234, mostPlayedPosition: "C" } as Partial<Player>)] });
    expect(diffDocs(start, next)).toEqual([]);
  });

  it("normalisering tar bort dubbletter och ogiltiga platser", () => {
    const d = normalizeDoc({ ...doc(), players: [P("1")], lineup: { [A1]: P("1"), "team-a-fwd-4-c": P("2") } });
    expect(where(d, "1")).toEqual([A1]);
    expect(where(d, "2")).toEqual(["trupp"]);
  });
});
