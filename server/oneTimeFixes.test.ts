import { describe, expect, it } from "vitest";
import { restoreTeamsFromMatch } from "./oneTimeFixes";
import { createPlayer, listPlayers, updatePlayers } from "./playersDb";
import { saveMatch } from "./scoreDb";

describe.skipIf(!process.env.DATABASE_URL)("engångsrättning av lag", () => {
  it("ger spelarna utan lag laget de spelade i gårdagens match; rör inte de som har lag", async () => {
    const ids = ["otf-w", "otf-g", "otf-keep"];
    const existing = new Set((await listPlayers()).map((p) => p.id));
    for (const id of ids) if (!existing.has(id)) await createPlayer({ id, name: id });
    await updatePlayers([{ id: "otf-w", fields: { teamColor: null } }, { id: "otf-g", fields: { teamColor: null } }, { id: "otf-keep", fields: { teamColor: "green" } }]);
    await saveMatch({
      name: "otf", teamWhiteScore: 2, teamGreenScore: 1, reviewStatus: "approved", matchEndTime: new Date(2031, 0, 5, 23, 40),
      goalHistory: [], lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: {
        "team-a-fwd-1-c": { id: "otf-w", name: "otf-w", number: "", position: "C" },
        "team-b-fwd-1-c": { id: "otf-g", name: "otf-g", number: "", position: "C" },
        "team-a-fwd-1-lw": { id: "otf-keep", name: "otf-keep", number: "", position: "F" },
      } },
    } as never);
    const res = await restoreTeamsFromMatch(new Date(2031, 0, 5, 6), new Date(2031, 0, 6, 6));
    expect(res.restored.map((r) => `${r.id}:${r.team}`).sort()).toEqual(["otf-g:green", "otf-w:white"]);
    const reg = new Map((await listPlayers()).map((p) => [p.id, p.teamColor]));
    expect(reg.get("otf-w")).toBe("white");
    expect(reg.get("otf-g")).toBe("green");
    expect(reg.get("otf-keep")).toBe("green"); // hade lag – oförändrad
  });
});
