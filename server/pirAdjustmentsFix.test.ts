import { describe, expect, it } from "vitest";
import { fixPirAdjustmentKeys } from "./pirAdjustmentsFix";
import { createPlayer, listPlayers } from "./playersDb";
import { getConfigValue, setConfigValue } from "./scoreDb";

describe.skipIf(!process.env.DATABASE_URL)("PIR-justeringar kopplas till spelar-id", () => {
  it("namn byts mot id; id:n och okända namn lämnas", async () => {
    if (!(await listPlayers()).some((p) => p.id === "pirfix-1")) await createPlayer({ id: "pirfix-1", name: "Pir Fixsson" });
    const before = await getConfigValue("pir_adjustments");
    await setConfigValue("pir_adjustments", JSON.stringify({ "pir fixsson": 25, "pirfix-1": 5, "Ingen Sådan": 10 }));
    const r = await fixPirAdjustmentKeys();
    expect(r).toEqual({ moved: 1, unknown: ["Ingen Sådan"] });
    expect(JSON.parse((await getConfigValue("pir_adjustments"))!)).toEqual({ "pirfix-1": 30, "Ingen Sådan": 10 });
    expect((await fixPirAdjustmentKeys()).moved).toBe(0);
    await setConfigValue("pir_adjustments", before ?? "");
  });
});
