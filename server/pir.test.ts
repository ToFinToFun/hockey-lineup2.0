import { describe, expect, it } from "vitest";
import type { MatchResult } from "../drizzle/schema";
import { calculatePIR, backtestPIR, DEFAULT_PIR_WEIGHTS, TEAM_ONLY_PIR_WEIGHTS } from "./pir";
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
    const lineup: Record<string, { id: string; name: string; number: string; position: string }> = {};
    a.forEach((p, j) => (lineup[j === 0 ? "team-a-gk-1" : `team-a-fwd-${j}-c`] = { id: p.name, name: p.name, number: "", position: "F" }));
    b.forEach((p, j) => (lineup[j === 0 ? "team-b-gk-1" : `team-b-fwd-${j}-c`] = { id: p.name, name: p.name, number: "", position: "F" }));
    const sa = a.reduce((s, p) => s + p.strength, 0), sb = b.reduce((s, p) => s + p.strength, 0);
    const goals: Array<{ team: "white" | "green"; scorer: string; scorerId: string; timestamp: string }> = [];
    let white = 0, green = 0;
    for (let g = 0; g < 8; g++) {
      const whiteScores = rand() < sa / (sa + sb);
      const team = whiteScores ? a : b;
      const outfield = team.slice(1);
      const w = outfield.reduce((s, p) => s + p.strength, 0);
      let r = rand() * w, scorer = outfield[0];
      for (const p of outfield) { r -= p.strength; if (r <= 0) { scorer = p; break; } }
      goals.push({ team: whiteScores ? "white" : "green", scorer: scorer.name, scorerId: scorer.name, timestamp: "" });
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

describe("Formpilen", () => {
  it("formTrend: senaste 3 mot eget snitt, 0 under 5 matcher", async () => {
    const { formTrend } = await import("./pir");
    const v = (xs: number[]) => xs.map((value) => ({ value }));
    expect(formTrend(v([5, 5, 5, 5]))).toBe(0); // för få matcher
    expect(formTrend(v([0, 0, 0, 0, 0]))).toBe(0);
    // tidigare snitt (2, 4) = 3 → tre matcher "brukar" ge 9; senaste tre gav 30
    expect(formTrend(v([2, 4, 10, 10, 10]))).toBe(30 - 9);
    expect(formTrend(v([10, 10, 0, 0, 0]))).toBe(0 - 30);
  });

  it("en spelare som gör mål i de senaste matcherna får stigande pil", () => {
    const now = new Date(2026, 6, 1);
    const m = season(12);
    // P10 gör tre mål i var och en av sina tre senaste matcher som utespelare
    let left = 3;
    for (const match of [...m].reverse()) {
      if (left === 0) break;
      const lineup = (match.lineup as any).lineup as Record<string, { id: string }>;
      const slot = Object.keys(lineup).find((k) => lineup[k].id === "P10");
      if (!slot || slot.includes("-gk-")) continue;
      const team = slot.startsWith("team-a") ? "white" : "green";
      for (let i = 0; i < 3; i++) (match.goalHistory as any[]).push({ team, scorer: "P10", scorerId: "P10", timestamp: "" });
      if (team === "white") match.teamWhiteScore += 3; else match.teamGreenScore += 3;
      left--;
    }
    const before = calculatePIR(season(12), { now }).find((x) => x.playerKey === "P10")!;
    const r = calculatePIR(m, { now }).find((x) => x.playerKey === "P10")!;
    expect(r.outfieldTrend! - before.outfieldTrend!).toBeGreaterThan(25);
    expect(r.outfieldTrendLabel).toBe("rising");
  });

  it("utan trendberäkning blir trenden 0", () => {
    const r = calculatePIR(season(12), { now: new Date(2026, 6, 1), skipTrend: true });
    expect(r.every((x) => x.trend === 0)).toBe(true);
  });
});

describe("Rollbetyg och backar", () => {
  const now = new Date(2026, 6, 1);
  function mk(i: number, white: Record<string, string>, green: Record<string, string>, ws: number, gs: number, goals: Array<[string, "white" | "green"]> = []): MatchResult {
    const lineup: Record<string, { id: string; name: string }> = {};
    for (const [slot, id] of Object.entries(white)) lineup[`team-a-${slot}`] = { id, name: id };
    for (const [slot, id] of Object.entries(green)) lineup[`team-b-${slot}`] = { id, name: id };
    const date = new Date(2026, 5, 1 + i);
    return {
      id: i + 1, name: `M${i}`, teamWhiteScore: ws, teamGreenScore: gs,
      goalHistory: goals.map(([id, team]) => ({ team, scorer: id, scorerId: id, timestamp: "" })),
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup },
      matchStartTime: date, matchEndTime: date, createdAt: date, editedAt: null, reviewStatus: "approved", reviewedAt: null,
    } as unknown as MatchResult;
  }

  it("målvakts- och utespelarbetyg räknas var för sig", () => {
    // X står i mål och förlorar stort, spelar ute och vinner
    const ms: MatchResult[] = [];
    for (let i = 0; i < 8; i++) {
      const gk = i % 2 === 0;
      const white = gk ? { "gk-1": "X", "fwd-1-c": "A", "def-1-1": "B" } : { "gk-1": "G1", "fwd-1-c": "X", "def-1-1": "B" };
      const green = { "gk-1": "G2", "fwd-1-c": "C", "def-1-1": "D" };
      ms.push(gk ? mk(i, white, green, 1, 7) : mk(i, white, green, 5, 1, [["X", "white"]]));
    }
    const x = calculatePIR(ms, { now }).find((r) => r.playerKey === "X")!;
    expect(x.goalkeeperMatchesPlayed).toBe(4);
    expect(x.outfieldMatchesPlayed).toBe(4);
    expect(x.goalkeeperRating!).toBeLessThan(1000);
    expect(x.outfieldRating!).toBeGreaterThan(1000);
    expect(x.goalkeeperRating).not.toBe(x.outfieldRating);
  });

  it("en back utan poäng straffas inte för att forwards gör målen", () => {
    // Jämna matcher; forwards gör alla mål, backarna inga
    const ms: MatchResult[] = [];
    for (let i = 0; i < 10; i++) {
      const white = { "gk-1": "G1", "fwd-1-c": "F1", "fwd-1-lw": "F2", "def-1-1": "D1", "def-1-2": "D2" };
      const green = { "gk-1": "G2", "fwd-1-c": "F3", "fwd-1-lw": "F4", "def-1-1": "D3", "def-1-2": "D4" };
      const whiteWins = i % 2 === 0;
      ms.push(mk(i, white, green, whiteWins ? 3 : 2, whiteWins ? 2 : 3, [
        ["F1", "white"], ["F2", "white"], ["F3", "green"], ["F4", "green"], [whiteWins ? "F1" : "F3", whiteWins ? "white" : "green"],
      ]));
    }
    const r = new Map(calculatePIR(ms, { now }).map((x) => [x.playerKey, x.outfieldRating!]));
    for (const d of ["D1", "D2", "D3", "D4"]) expect(Math.abs(r.get(d)! - 1000)).toBeLessThan(10);
  });
});
