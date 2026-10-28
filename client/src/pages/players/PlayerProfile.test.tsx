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
    pir: { player: { useQuery: ({ id }: { id: string }) => ({ isLoading: false, data: id === "p1" ? {
      outfieldRating: 1062, outfieldTrendLabel: "rising", outfieldMatchesPlayed: 12, outfieldConfidence: 1, outfieldRank: { rank: 2, of: 30 },
      goalkeeperRating: null, goalkeeperRank: null, adjustment: 0,
    } : null }) },
      // PIR över tid (kurvan under PIR-rutorna)
      history: { useQuery: () => ({ isLoading: false, data: { outfield: [
        { matchId: 1, date: "2026-09-01T20:00:00Z", rating: 1012, result: "V", score: [4, 2], provisional: false },
        { matchId: 2, date: "2026-09-08T20:00:00Z", rating: 1062, result: "V", score: [5, 1], provisional: false },
      ], goalkeeper: [] } }) } },
    players: { list: { useQuery: () => ({ isLoading: false, data: [] }) }, profile: { useQuery: ({ id }: { id: string }, opts?: { enabled?: boolean }) =>
      opts?.enabled === false || !id ? { isLoading: false, data: undefined } : { isLoading: false, data: profiles[id] } } },
    cards: { list: { useQuery: () => ({ isLoading: false, data: [] }) }, stats: { useQuery: () => ({ isLoading: false, data: undefined }) } },
    // Uppskattad speltid (Statistik → Speltid)
    scoreStats: { iceTime: { useQuery: () => ({ isLoading: false, data: [
      { id: "p1", name: "Ett", matches: 10, minutes: 412, byPos: { MV: 0, B: 300, C: 112, F: 0 }, goals: 5, assists: 3, points: 8, perMatch: 41, p60: 1.17, gkMatches: 0, ga: 0, ga60: null, shutouts: 0, gkWins: 0 },
    ] }) } },
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
    expect(screen.getByText("PIR")).toBeTruthy();
    expect(screen.getByText(/#2 av 30/)).toBeTruthy();
    // Kurvan: två matcher, +50 sedan första
    expect(screen.getByRole("img", { name: /PIR över tid som utespelare: från 1012 till 1062/ })).toBeTruthy();
    expect(screen.getByText(/\+50 sedan 1\/9/)).toBeTruthy();
    expect(screen.getByText("Speltid")).toBeTruthy();
    expect(screen.getByText("6 h 52 min")).toBeTruthy();
    expect(screen.getByText("Kemi")).toBeTruthy();
    expect(screen.getByText("Matchlogg (12)")).toBeTruthy();
    expect(screen.getAllByText("Pelle Andersson").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Visa alla 12"));
    expect(screen.getByText("Visa färre")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });
    expect(screen.getByText(/I samma lag: 12 matcher/)).toBeTruthy();
  });
});
