// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { playerProfile } from "../../../../server/playerProfile";

afterEach(cleanup);

const m = (id: number, day: number, white: number, green: number, lineup: Record<string, string>, goals: Array<{ scorerId?: string; assistId?: string }> = []) =>
  ({
    id, name: `Match ${id}`, teamWhiteScore: white, teamGreenScore: green, matchEndTime: new Date(2026, 8, day),
    lineup: { teamAName: "VITA", lineup: Object.fromEntries(Object.entries(lineup).map(([s, pid]) => [s, { id: pid, name: pid }])) },
    goalHistory: goals,
  }) as never;
const matches = Array.from({ length: 12 }, (_, i) =>
  m(i + 1, i + 1, i % 3, 1, { "team-a-fwd-1-c": "p1", "team-a-fwd-1-lw": "p2", "team-b-fwd-1-c": "p3" }, i % 2 ? [{ scorerId: "p1", assistId: "p2" }] : [])
);
const profiles: Record<string, unknown> = {
  p1: playerProfile(matches, "p1", new Map([["p2", "Pelle Andersson"], ["p3", "Olle Berg"]])),
  p2: playerProfile(matches, "p2", new Map([["p1", "Kalle Carlsson"]])),
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    players: { profile: { useQuery: ({ id }: { id: string }, opts?: { enabled?: boolean }) =>
      opts?.enabled === false || !id ? { isLoading: false, data: undefined } : { isLoading: false, data: profiles[id] } } },
  },
}));
vi.mock("@/components/PlayerPhoto", () => ({ PlayerPhoto: () => null }));

import { PlayerProfileView } from "./PlayerProfile";

describe("PlayerProfileView", () => {
  it("visar sammanfattning, rekord, kemi, matchlogg och jämförelse", () => {
    const all = [
      { id: "p1", name: "Kalle Carlsson", number: "10", position: "C", teamColor: "white" },
      { id: "p2", name: "Pelle Andersson", number: "11", position: "F", teamColor: "white" },
    ];
    render(<PlayerProfileView player={all[0]} all={all} />);
    expect(screen.getByText("Rekord")).toBeTruthy();
    expect(screen.getByText("Kemi")).toBeTruthy();
    expect(screen.getByText("Matchlogg (12)")).toBeTruthy();
    expect(screen.getAllByText("Pelle Andersson").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Visa alla 12"));
    expect(screen.getByText("Visa färre")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });
    expect(screen.getByText(/I samma lag: 12 matcher/)).toBeTruthy();
  });
});
