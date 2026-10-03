// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(cleanup);
(globalThis as any).__APP_VERSION__ = "9.9.9";
(globalThis as any).__BUILD_DATE__ = "2026-09-28";

vi.mock("@/lib/trpc", () => {
  const q = (data: unknown) => ({ data, isLoading: false, error: null });
  const m = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data: undefined });
  const ratings = [{ playerKey: "p1", name: "Kalle", label: "Kalle #9", rating: 1060, outfieldRating: 1060, goalkeeperRating: null, matchesPlayed: 12, adjustment: 0 }];
  return {
    trpc: {
      useUtils: () => new Proxy({}, { get: () => new Proxy({}, { get: () => ({ invalidate: vi.fn() }) }) }),
      pir: {
        getConfig: { useQuery: () => q({
          weights: { goal: 3, assist: 2, goalkeeper: 2, halfLifeDays: 90 }, adjustments: {}, defaults: { goal: 3, assist: 2, goalkeeper: 2, halfLifeDays: 90 },
          thresholds: { minMatchesShow: 3, fullConfidence: 10, newcomerMatches: 10, backtestWarmup: 5, minMatchesForSuggestion: 6 },
          thresholdDefaults: { minMatchesShow: 3, fullConfidence: 10, newcomerMatches: 10, backtestWarmup: 5, minMatchesForSuggestion: 6 },
          thresholdLimits: { minMatchesShow: [1, 20], fullConfidence: [1, 50], newcomerMatches: [0, 50], backtestWarmup: [1, 30], minMatchesForSuggestion: [3, 50] },
        }) },
        analysis: { useQuery: () => q({ current: { metrics: { matches: 20, hitRate: 0.6, brier: 0.22, coverage: 0.8, calibration: [] } }, teamOnly: { brier: 0.24, hitRate: 0.55 } }) },
        getRatings: { useQuery: () => q(ratings) },
        explain: { useQuery: () => q({ playerKey: "p1", rating: 1060, teamOnlyRating: 1030, individual: 30, adjustment: 0,
          history: [{ matchId: 1, date: "2026-09-01T20:00:00Z", rating: 1010, result: "V" }, { matchId: 2, date: "2026-09-08T20:00:00Z", rating: 1060, result: "V" }] }) },
        setWeights: { useMutation: m }, setAdjustment: { useMutation: m }, setThresholds: { useMutation: m },
      },
      score: { config: { getPeriods: { useQuery: () => q({ seasonFrom: "2026-09-01", seasonTo: "2027-04-30", playoffFrom: "2027-05-01", playoffTo: "2027-05-31", preseasonFrom: "2026-08-01", preseasonTo: "2026-08-31", recurring: { seasonFrom: "09-01", seasonTo: "04-30", playoffFrom: "05-01", playoffTo: "05-31", preseasonFrom: "08-01", preseasonTo: "08-31" } }) }, updatePeriods: { useMutation: m } } },
      laget: {
        newsAccount: { useQuery: () => q({ name: "Styrelsen", adminUrl: "https://admin.laget.se/x" }) },
        autoNews: { useQuery: () => q({ config: { enabled: false, minutesBefore: 45, minPlayers: 10 }, status: { at: "", eventDate: null, message: "Hoppade över 28/9 – bara 8 anmälda", ok: false } }) },
        setAutoNews: { useMutation: m },
      },
      club: { get: { useQuery: () => q({ club: {}, overrides: {}, features: { opponents: false } }) } },
      notifications: {
        get: { useQuery: () => q({ smtpConfigured: false, from: null, types: [{ id: "matchPending", label: "Match väntar på godkännande" }], recipients: [] }) },
        set: { useMutation: m }, test: { useMutation: m },
      },
      settings: { testLagetSeConnection: { useMutation: m } },
      system: { database: { useQuery: () => q(undefined) } },
    },
  };
});
vi.mock("../sponsors/SponsorsApp", () => ({ SponsorsPanel: () => <p>Sponsorpanel</p> }));
let search = "";
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>, useSearch: () => search, useLocation: () => ["/installningar", vi.fn()] }));

import SettingsApp from "./SettingsApp";

describe("Inställningar", () => {
  const show = (flik: string) => { search = flik ? `flik=${flik}` : ""; return render(<SettingsApp />); };
  it("startsidan visar delarna i grupper", () => {
    const r = show("");
    for (const t of ["Klubb och lag", "Match och data", "Kopplingar", "Åtkomst", "Motståndare", "PIR", "laget.se", "Notiser", "Om"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    r.unmount();
  });
  it("varje del öppnas via ?flik=", () => {
    let r = show("pir");
    expect(screen.getByText("Så fungerar PIR")).toBeTruthy();
    fireEvent.click(screen.getByText("Kalle"));
    expect(screen.getByText(/Varför 1060/)).toBeTruthy();
    expect(screen.getAllByText("+30").length).toBe(2); // lagresultat och egna insatser
    r.unmount();
    r = show("perioder");
    expect(screen.getByText("Grundserien", { exact: false })).toBeTruthy();
    r.unmount();
    r = show("laget");
    expect(screen.getByText("Styrelsen")).toBeTruthy();
    expect(screen.getByText("Automatisk nyhet")).toBeTruthy();
    expect(screen.getByText(/bara 8 anmälda/)).toBeTruthy();
    r.unmount();
    r = show("notiser");
    expect(screen.getByText(/Utgående e-post är inte inställd/)).toBeTruthy();
    r.unmount();
    r = show("om");
    expect(screen.getByText(/v9\.9\.9/)).toBeTruthy();
    r.unmount();
    r = show("sponsorer");
    expect(screen.getByText("Sponsorpanel")).toBeTruthy();
    r.unmount();
  });
});
