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
});
