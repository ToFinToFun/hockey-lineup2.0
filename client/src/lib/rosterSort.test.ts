import { describe, expect, it } from "vitest";
import { sortRoster, positionsForSlot } from "./rosterSort";
import type { Player } from "./players";

const p = (name: string, position: string, extra: Partial<Player> = {}) => ({ id: name, name, number: "", position, ...extra }) as Player;

describe("gemensam sortering av spelarlistor", () => {
  const list = [
    p("Örjan", "F", { isRegistered: true }),
    p("Anna", "B", { isDeclined: true }),
    p("Bertil", "B"),
    p("Cecilia", "B", { isRegistered: true }),
    p("David", "F"),
  ];

  it("närvaro först (anmäld, ej svarat, kommer inte), sedan namn", () => {
    expect(sortRoster(list).map((x) => x.name)).toEqual(["Cecilia", "Örjan", "Bertil", "David", "Anna"]);
  });

  it("vald plats: passande position först inom varje närvarogrupp", () => {
    const forLw = sortRoster(list, positionsForSlot("forward", "LW"));
    expect(forLw.map((x) => x.name)).toEqual(["Örjan", "Cecilia", "David", "Bertil", "Anna"]);
    expect(positionsForSlot("defense")).toEqual(["B"]);
    expect(positionsForSlot("goalkeeper")).toEqual(["MV"]);
    expect(positionsForSlot("forward", "C")).toEqual(["C"]);
  });

  it("tom back i Vita: waiver-, vita, gröna backar, sedan forwards i samma lagordning", () => {
    const players = [
      p("Gf", "F", { isRegistered: true, teamColor: "green" }),
      p("Vf", "F", { isRegistered: true, teamColor: "white" }),
      p("Wf", "F", { isRegistered: true }),
      p("Gb", "B", { isRegistered: true, teamColor: "green" }),
      p("Vb", "B", { isRegistered: true, teamColor: "white" }),
      p("Wb", "B", { isRegistered: true }),
      p("Ejsvar", "B", { teamColor: "white" }),
    ];
    expect(sortRoster(players, positionsForSlot("defense"), "white").map((x) => x.name))
      .toEqual(["Wb", "Vb", "Gb", "Wf", "Vf", "Gf", "Ejsvar"]);
  });
});
