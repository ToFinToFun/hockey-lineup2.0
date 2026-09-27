// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { PlayerList } from "./PlayerList";
import { PlayerStatsSection } from "./PlayerCard";
import type { Player } from "@/lib/players";

afterEach(cleanup);
vi.mock("./PlayerPhoto", () => ({ PlayerPhoto: () => null }));

const p = (id: string, name: string, position: Player["position"], extra: Partial<Player> = {}): Player =>
  ({ id, name, number: "", position, teamColor: null, captainRole: null, ...extra }) as Player;

const players: Player[] = [
  p("1", "Adam Forward", "F", { teamColor: "green", isRegistered: true }),
  p("2", "Bertil Back", "B", { teamColor: "white", isRegistered: true }),
  p("3", "Cesar Back", "B", { teamColor: "green", isRegistered: true }),
  p("4", "David Back", "B", { teamColor: "green" }),
];

const noop = () => {};
const baseProps = {
  players,
  onAddPlayer: noop, onDeletePlayer: noop, onChangePosition: noop, onChangeTeamColor: noop,
  onChangeNumber: noop, onChangeName: noop, onChangeCaptainRole: noop, onChangeRegistered: noop,
  onChangeGamesPlayed: noop,
};

describe("PlayerList – vald plats (desktop)", () => {
  it("sorterar för platsen och placerar spelaren vid klick", () => {
    const onPick = vi.fn();
    render(
      <DndContext>
        <PlayerList
          {...baseProps}
          targetSlot={{ slotType: "defense", slotLabel: "B", teamName: "GRÖNA", teamId: "team-b" }}
          onPickForTarget={onPick}
          onCancelTarget={noop}
        />
      </DndContext>
    );
    expect(screen.getByText(/Välj spelare till/)).toBeTruthy();
    const rows = screen.getAllByTitle(/Anmäld|Kommer inte|Inte svarat/);
    const order = rows.map((r) => r.textContent ?? "");
    // Anmälda gröna backar först, sedan anmälda vita backar, sedan anmälda forwards, sist ej svarat
    expect(order[0]).toContain("Cesar Back");
    expect(order[1]).toContain("Bertil Back");
    expect(order[2]).toContain("Adam Forward");
    expect(order[3]).toContain("David Back");
    fireEvent.click(rows[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "3" }));
  });

  it("utan vald plats: vanlig sortering och klick gör inget", () => {
    render(<DndContext><PlayerList {...baseProps} /></DndContext>);
    expect(screen.queryByText(/Välj spelare till/)).toBeNull();
    const order = screen.getAllByTitle(/Anmäld|Kommer inte|Inte svarat/).map((r) => r.textContent ?? "");
    expect(order[0]).toContain("Adam Forward");
  });
});

describe("PlayerStatsSection", () => {
  it("visar säsong och totalt med poäng och vinstprocent", () => {
    const player = p("9", "Test", "F", {
      statsSeason: { label: "2026/27", matches: 4, wins: 3, draws: 0, losses: 1, goals: 2, assists: 1 },
      statsTotal: { matches: 10, wins: 5, draws: 1, losses: 4, goals: 6, assists: 4 },
    });
    render(<PlayerStatsSection player={player} />);
    expect(screen.getByText("2026/27")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("10", { selector: "span.font-semibold" })).toBeTruthy();
  });
});
