import { describe, expect, it, beforeAll } from "vitest";

const KEY = "k".repeat(40);
const OLD = "o".repeat(40);
const PORT = 31877;
let mod: typeof import("./integration");

beforeAll(async () => {
  process.env.INTEGRATION_KEY = KEY;
  process.env.INTEGRATION_KEY_PREVIOUS = OLD;
  process.env.INTEGRATION_PORT = String(PORT);
  mod = await import("./integration");
  mod.startIntegrationServer("test");
  await new Promise(r => setTimeout(r, 100));
});

describe("integration med sajten", () => {
  it("godtar bara rätt nyckel (nuvarande eller föregående)", () => {
    expect(mod.keyAccepted(`Bearer ${KEY}`)).toBe(true);
    expect(mod.keyAccepted(`Bearer ${OLD}`)).toBe(true);
    expect(mod.keyAccepted("Bearer fel")).toBe(false);
    expect(mod.keyAccepted(KEY)).toBe(false);
    expect(mod.keyAccepted(undefined)).toBe(false);
  });

  it("interna porten kräver nyckel och allt är avstängt", async () => {
    const no = await fetch(`http://127.0.0.1:${PORT}/internal/v1/ping`);
    expect(no.status).toBe(401);
    const yes = await fetch(`http://127.0.0.1:${PORT}/internal/v1/ping`, { headers: { authorization: `Bearer ${KEY}` } });
    expect(yes.status).toBe(200);
    const body = await yes.json();
    expect(body.apiVersion).toBe(1);
    expect(Object.values(body.modes).every(m => m === "off")).toBe(true);
  });

  it("utan sajtens adress säger pingen vad som saknas", async () => {
    expect(await mod.pingSite()).toEqual({ ok: false, error: "SITE_INTERNAL_URL saknas" });
  });
});
