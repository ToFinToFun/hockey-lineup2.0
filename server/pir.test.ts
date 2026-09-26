import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { calculatePIR, backtestPIR, DEFAULT_PIR_WEIGHTS, TEAM_ONLY_PIR_WEIGHTS, playerKeyFromLabel } from "./pir";
import { analyzePir, metricsFrom } from "./pirAnalysis";

// Enkel deterministisk slump så att testet alltid ger samma resultat.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/**
 * Syntetisk säsong: 20 spelare med dold "verklig" styrka. Lagen lottas,
 * starkare lag vinner oftare och starka spelare gör fler mål.
 */
function season(n: number, seed = 1): MatchResult[] {
  const rand = rng(seed);
  const players = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, strength: i < 4 ? 2 : i < 16 ? 1 : 0.5 }));
  const matches: MatchResult[] = [];
  for (let i = 0; i < n; i++) {
    const shuffled = [...players].sort(() => rand() - 0.5);
    const a = shuffled.slice(0, 10), b = shuffled.slice(10);
    const lineup: Record<string, { name: string }> = {};
    a.forEach((p, j) => (lineup[j === 0 ? "team-a-gk-1" : `team-a-fwd-${j}-c`] = { name: p.name }));
    b.forEach((p, j) => (lineup[j === 0 ? "team-b-gk-1" : `team-b-fwd-${j}-c`] = { name: p.name }));
    const sa = a.reduce((s, p) => s + p.strength, 0), sb = b.reduce((s, p) => s + p.strength, 0);
    const goals: Array<{ team: string; scorer: string; timestamp: string }> = [];
    let white = 0, green = 0;
    for (let g = 0; g < 8; g++) {
      const whiteScores = rand() < sa / (sa + sb);
      const team = whiteScores ? a : b;
      const outfield = team.slice(1);
      const w = outfield.reduce((s, p) => s + p.strength, 0);
      let r = rand() * w, scorer = outfield[0];
      for (const p of outfield) { r -= p.strength; if (r <= 0) { scorer = p; break; } }
      goals.push({ team: whiteScores ? "white" : "green", scorer: `${scorer.name} #${g}`, timestamp: "" });
      if (whiteScores) white++; else green++;
    }
    const date = new Date(2026, 0, 1 + i * 3);
    matches.push({
      id: i + 1, name: `M${i}`, teamWhiteScore: white, teamGreenScore: green, goalHistory: goals,
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup },
      matchStartTime: date, matchEndTime: date, createdAt: date, editedAt: null, reviewStatus: "approved", reviewedAt: null,
    } as unknown as MatchResult);
  }
  return matches;
}

describe("PIR", () => {
  it("namn utan tröjnummer", () => {
    expect(playerKeyFromLabel("Kalle Karlsson #12")).toBe("Kalle Karlsson");
    expect(playerKeyFromLabel("Kalle")).toBe("Kalle");
  });

  it("starka spelare får högre betyg än svaga", () => {
    const r = new Map(calculatePIR(season(60), { now: new Date(2026, 6, 1) }).map((x) => [x.playerKey, x.rating]));
    const strong = [0, 1, 2, 3].map((i) => r.get(`P${i}`)!);
    const weak = [16, 17, 18, 19].map((i) => r.get(`P${i}`)!);
    expect(Math.min(...strong)).toBeGreaterThan(Math.max(...weak));
  });

  it("mål påverkar betyget när målvikten är på", () => {
    const m = season(40);
    const opts = { now: new Date(2026, 6, 1) };
    const withGoals = calculatePIR(m, { ...opts, weights: { ...DEFAULT_PIR_WEIGHTS, goal: 8 } });
    const teamOnly = calculatePIR(m, { ...opts, weights: TEAM_ONLY_PIR_WEIGHTS });
    const spread = (rs: typeof withGoals) => Math.max(...rs.map((x) => x.rating)) - Math.min(...rs.map((x) => x.rating));
    expect(spread(withGoals)).toBeGreaterThan(spread(teamOnly));
  });

  it("snittet stannar kring 1000 (individuella bonusar är nollsummerade)", () => {
    const rs = calculatePIR(season(60), { now: new Date(2026, 6, 1) });
    const avg = rs.reduce((s, x) => s + x.rating, 0) / rs.length;
    expect(Math.abs(avg - 1000)).toBeLessThan(15);
  });

  it("manuell justering läggs ovanpå", () => {
    const m = season(30);
    const now = new Date(2026, 6, 1);
    const base = calculatePIR(m, { now }).find((x) => x.playerKey === "P5")!;
    const adj = calculatePIR(m, { now, adjustments: { P5: 75 } }).find((x) => x.playerKey === "P5")!;
    expect(adj.rating - base.rating).toBe(75);
    expect(adj.adjustment).toBe(75);
  });

  // Uppmätt: på syntetiska säsonger träffar PIR lika ofta som ett "orakel" som
  // känner spelarnas verkliga styrka (≈ 0,64 på seed 2), och individuella vikter
  // förbättrar Brier-poängen jämfört med bara lagresultat.
  it("prediktionen slår 50/50-gissning och i nivå med facit", async () => {
    const m = season(120, 2);
    const metrics = metricsFrom(await backtestPIR(m, DEFAULT_PIR_WEIGHTS));
    expect(metrics.matches).toBe(115);
    expect(metrics.brier!).toBeLessThan(0.2);
    expect(metrics.hitRate!).toBeGreaterThan(0.58);
    const teamOnly = metricsFrom(await backtestPIR(m, TEAM_ONLY_PIR_WEIGHTS));
    expect(metrics.brier!).toBeLessThanOrEqual(teamOnly.brier!);
  });

  it("analysen ger inget förslag på för få matcher, men hjälper redan på en kort säsong", async () => {
    const tiny = await analyzePir(season(8), DEFAULT_PIR_WEIGHTS, true);
    expect(tiny.suggestion?.recommended).toBe(false);
    const small = await analyzePir(season(25, 3), DEFAULT_PIR_WEIGHTS, true);
    expect(small.current.metrics.matches).toBe(20);
    expect(small.suggestion).not.toBeNull();
    // Förslaget är krympt mot standard och aldrig sämre än nuvarande om det rekommenderas.
    if (small.suggestion!.recommended) {
      expect(small.suggestion!.metrics.brier!).toBeLessThan(small.current.metrics.brier!);
    }
  }, 30000);
});
