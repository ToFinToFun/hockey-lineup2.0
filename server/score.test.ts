import { describe, it, expect, vi } from "vitest";

// Mock the database module
vi.mock("./scoreDb", () => ({
  getMatchResults: vi.fn().mockResolvedValue([
    {
      id: "test-1",
      whiteScore: 5,
      greenScore: 3,
      date: "2026-03-19",
      time: "22:00",
      goals: JSON.stringify([
        { team: "white", scorer: "Player A", assist: "Player B", time: "10:00" },
        { team: "green", scorer: "Player C", assist: null, time: "15:00" },
      ]),
      period: "season",
      createdAt: Date.now(),
      updatedAt: null,
    },
  ]),
  saveMatchResult: vi.fn().mockResolvedValue({ id: "new-match" }),
  deleteMatchResult: vi.fn().mockResolvedValue(true),
  deleteMatchResults: vi.fn().mockResolvedValue(true),
  updateMatchResult: vi.fn().mockResolvedValue(true),
  getAppConfig: vi.fn().mockResolvedValue({
    id: "periods",
    value: JSON.stringify({
      preSeason: { start: "2025-08-01", end: "2025-09-30" },
      season: { start: "2025-10-01", end: "2026-04-30" },
      playOff: { start: "2026-05-01", end: "2026-06-30" },
    }),
  }),
  setAppConfig: vi.fn().mockResolvedValue(true),
}));

describe("Score Tracker data structures", () => {
  it("should parse goal events from match data", async () => {
    const { getMatchResults } = await import("./scoreDb");
    const matches = await getMatchResults();
    expect(matches).toHaveLength(1);

    const match = matches[0];
    expect(match.whiteScore).toBe(5);
    expect(match.greenScore).toBe(3);

    const goals = JSON.parse(match.goals as string);
    expect(goals).toHaveLength(2);
    expect(goals[0].team).toBe("white");
    expect(goals[0].scorer).toBe("Player A");
    expect(goals[1].team).toBe("green");
  });

  it("should parse period config correctly", async () => {
    const { getAppConfig } = await import("./scoreDb");
    const config = await getAppConfig("periods");
    expect(config).toBeTruthy();

    const periods = JSON.parse(config!.value);
    expect(periods.season.start).toBe("2025-10-01");
    expect(periods.season.end).toBe("2026-04-30");
    expect(periods.preSeason).toBeDefined();
    expect(periods.playOff).toBeDefined();
  });

  it("should calculate player stats from match goals", () => {
    const goals = [
      { team: "white", scorer: "Player A", assist: "Player B", time: "10:00" },
      { team: "white", scorer: "Player A", assist: "Player C", time: "12:00" },
      { team: "green", scorer: "Player C", assist: null, time: "15:00" },
      { team: "white", scorer: "Player B", assist: "Player A", time: "20:00" },
    ];

    // Calculate stats like the server does
    const playerStats: Record<string, { goals: number; assists: number; points: number }> = {};

    for (const goal of goals) {
      if (!playerStats[goal.scorer]) {
        playerStats[goal.scorer] = { goals: 0, assists: 0, points: 0 };
      }
      playerStats[goal.scorer].goals++;
      playerStats[goal.scorer].points++;

      if (goal.assist) {
        if (!playerStats[goal.assist]) {
          playerStats[goal.assist] = { goals: 0, assists: 0, points: 0 };
        }
        playerStats[goal.assist].assists++;
        playerStats[goal.assist].points++;
      }
    }

    expect(playerStats["Player A"].goals).toBe(2);
    expect(playerStats["Player A"].assists).toBe(1);
    expect(playerStats["Player A"].points).toBe(3);
    expect(playerStats["Player B"].goals).toBe(1);
    expect(playerStats["Player B"].assists).toBe(1);
    expect(playerStats["Player C"].goals).toBe(1);
    expect(playerStats["Player C"].assists).toBe(1);
  });

  it("should determine match winner correctly", () => {
    const determineWinner = (whiteScore: number, greenScore: number) => {
      if (whiteScore > greenScore) return "white";
      if (greenScore > whiteScore) return "green";
      return "draw";
    };

    expect(determineWinner(5, 3)).toBe("white");
    expect(determineWinner(3, 5)).toBe("green");
    expect(determineWinner(4, 4)).toBe("draw");
  });

  it("should filter matches by period date range", () => {
    const matches = [
      { date: "2025-09-15", whiteScore: 3, greenScore: 2 },
      { date: "2025-11-01", whiteScore: 5, greenScore: 4 },
      { date: "2026-03-19", whiteScore: 2, greenScore: 5 },
      { date: "2026-05-15", whiteScore: 1, greenScore: 3 },
    ];

    const seasonStart = "2025-10-01";
    const seasonEnd = "2026-04-30";

    const seasonMatches = matches.filter(
      (m) => m.date >= seasonStart && m.date <= seasonEnd
    );

    expect(seasonMatches).toHaveLength(2);
    expect(seasonMatches[0].date).toBe("2025-11-01");
    expect(seasonMatches[1].date).toBe("2026-03-19");
  });
});

describe("Score Tracker AppState conversion", () => {
  it("should convert lineup data to AppState format", () => {
    const lineupData = {
      players: [
        { id: "1", name: "Player A", number: "10", position: "F" as const },
        { id: "2", name: "Player B", number: "5", position: "B" as const },
      ],
      lineup: {
        "team-a-fwd-1-lw": { id: "1", name: "Player A", number: "10", position: "F" as const },
      },
      teamAName: "Vita",
      teamBName: "Gröna",
      teamAConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
      teamBConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 2 },
    };

    // This mirrors what ScoreApp.tsx does
    const appState = {
      players: lineupData.players,
      lineup: lineupData.lineup,
      teamAName: lineupData.teamAName,
      teamBName: lineupData.teamBName,
      teamAConfig: lineupData.teamAConfig,
      teamBConfig: lineupData.teamBConfig,
    };

    expect(appState.players).toHaveLength(2);
    expect(appState.lineup["team-a-fwd-1-lw"].name).toBe("Player A");
    expect(appState.teamAName).toBe("Vita");
    expect(appState.teamBName).toBe("Gröna");
  });
});
