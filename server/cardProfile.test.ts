import { describe, expect, it } from "vitest";
import { saveMatch } from "./scoreDb";
import { createPlayer, listPlayers } from "./playersDb";
import { saveCard } from "./playerCards";
import { getPlayerPhoto } from "./playerPhotos";
import { refreshLiveProfile, refreshAllLiveProfiles } from "./cardProfile";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("profilkort som följer statistiken", () => {
  it("ritas på servern, hoppar över när inget ändrats och ritas om efter ny match", async () => {
    const existing = new Set((await listPlayers()).map((p) => p.id));
    if (!existing.has("lp1")) await createPlayer({ id: "lp1", name: "Live Spelare" });
    const { createCanvas } = await import("@napi-rs/canvas");
    const c = createCanvas(600, 800);
    const g = c.getContext("2d");
    g.fillStyle = "#557799"; g.fillRect(0, 0, 600, 800);
    const jpeg = (await c.encode("jpeg", 80)).toString("base64");

    await saveCard("lp1", { skin: "retro-svart", name: "Live Spelare", number: "9", statsMode: "season" }, jpeg, true);
    expect(await refreshLiveProfile("lp1", true)).toBe(true);
    const first = await getPlayerPhoto("lp1");
    expect(first?.image.length).toBeGreaterThan(5000);
    expect(first!.image.length).toBeLessThan(160_000);
    expect(await refreshLiveProfile("lp1")).toBe(false); // oförändrat

    await saveMatch({
      name: "live-1", teamWhiteScore: 1, teamGreenScore: 0, reviewStatus: "approved", matchEndTime: new Date(),
      goalHistory: [{ team: "white", timestamp: "20:00:00", scorer: "Live Spelare", scorerId: "lp1" }],
      lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup: { "team-a-fwd-1-c": { id: "lp1", name: "Live Spelare", number: "9", position: "C" } } },
    } as never);
    expect(await refreshAllLiveProfiles()).toBeGreaterThanOrEqual(1); // statistiken ändrades
    expect(await refreshLiveProfile("lp1")).toBe(false);
  });
});
