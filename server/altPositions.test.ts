import { describe, expect, it } from "vitest";
import { getAltPositions, setAltPosition, migrateAltPositionsFromConfig } from "./altPositions";
import { createPlayer, listPlayers } from "./playersDb";
import { setConfigValue, getConfigValue } from "./scoreDb";

describe.skipIf(!process.env.DATABASE_URL)("alternativ position i spelarregistret", () => {
  it("flyttas från den gamla inställningen och kan ändras", async () => {
    for (const id of ["alt-1", "alt-2"]) if (!(await listPlayers()).some((p) => p.id === id)) await createPlayer({ id, name: id });
    await setAltPosition("alt-1", null);
    await setAltPosition("alt-2", null);
    await setConfigValue("player_alt_positions", JSON.stringify({ "alt-1": "C", "finns-inte": "B" }));
    expect(await migrateAltPositionsFromConfig()).toBe(1);
    expect((await getAltPositions())["alt-1"]).toBe("C");
    expect(await getConfigValue("player_alt_positions")).toBeFalsy();
    expect(await migrateAltPositionsFromConfig()).toBe(0); // bara en gång
    await setAltPosition("alt-2", "B");
    expect((await listPlayers()).find((p) => p.id === "alt-2")?.altPosition).toBe("B");
    await setAltPosition("alt-1", null);
    await setAltPosition("alt-2", null);
  });
});
