import { describe, expect, it } from "vitest";
import { teamSuggestions, applyTeams } from "./teamRecovery";
import { createPlayer, listPlayers, updatePlayers } from "./playersDb";
import { saveMatch } from "./scoreDb";

describe.skipIf(!process.env.DATABASE_URL)("återställ lag", () => {
  it("förslag utifrån laget spelaren oftast spelat i, och återställning", async () => {
    const existing = new Set((await listPlayers()).map((p) => p.id));
    if (!existing.has("rec1")) await createPlayer({ id: "rec1", name: "Återställ Ett" });
    await updatePlayers([{ id: "rec1", fields: { teamColor: null, active: true } }]);
    for (let i = 0; i < 4; i++) {
      await saveMatch({
        name: `rec-${i}`, teamWhiteScore: 1, teamGreenScore: 2, reviewStatus: "approved", matchEndTime: new Date(2026, 8, 1 + i),
        goalHistory: [], lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: { "team-b-fwd-1-c": { id: "rec1", name: "Återställ Ett", number: "", position: "C" } } },
      } as never);
    }
    const s = (await teamSuggestions()).find((x) => x.playerId === "rec1");
    expect(s).toMatchObject({ teamColor: "green", source: "matches" });
    await applyTeams([{ playerId: "rec1", teamColor: "green" }]);
    expect((await listPlayers()).find((p) => p.id === "rec1")?.teamColor).toBe("green");
    expect((await teamSuggestions()).some((x) => x.playerId === "rec1")).toBe(false);
  });
});
