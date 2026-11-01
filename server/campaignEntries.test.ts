import { describe, expect, it } from "vitest";
import { campaignDates, campaignOpen, CAMPAIGN_LIMITS } from "./campaignEntries";

// Svensk tid: 1 nov 00:30 (= 31 okt 23:30 UTC) räknas som november
describe("Mustaschkampen – öppet 1 nov–5 dec (svensk tid)", () => {
  it("öppnar och stänger på rätt dag", () => {
    expect(campaignOpen(new Date("2026-10-31T22:59:00Z"))).toBe(false); // 23:59 31 okt
    expect(campaignOpen(new Date("2026-10-31T23:30:00Z"))).toBe(true); // 00:30 1 nov
    expect(campaignOpen(new Date("2026-11-20T12:00:00Z"))).toBe(true);
    expect(campaignOpen(new Date("2026-12-05T22:30:00Z"))).toBe(true); // 23:30 5 dec
    expect(campaignOpen(new Date("2026-12-05T23:30:00Z"))).toBe(false); // 00:30 6 dec
    expect(campaignOpen(new Date("2027-03-01T12:00:00Z"))).toBe(false);
  });
  it("perioden som gäller nu eller nästa", () => {
    expect(campaignDates(new Date("2026-08-01T12:00:00Z"))).toEqual({ opens: "2026-11-01", closes: "2026-12-05" });
    expect(campaignDates(new Date("2026-11-15T12:00:00Z"))).toEqual({ opens: "2026-11-01", closes: "2026-12-05" });
    expect(campaignDates(new Date("2026-12-20T12:00:00Z"))).toEqual({ opens: "2027-11-01", closes: "2027-12-05" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Mustaschkampen – bidrag", () => {
  const admin = { req: { headers: { "x-forwarded-for": "10.0.0.1" }, ip: "10.0.0.1" } as never, res: {} as never, session: { role: "admin" as const, expiresAt: null }, member: null };
  const anon = (ip: string) => ({ req: { headers: { "x-forwarded-for": ip }, ip } as never, res: {} as never, session: null, member: null });
  const DEV = "0123456789abcdef0123456789abcdef", OTHER = "fedcba9876543210fedcba9876543210";

  async function jpeg(w: number, h: number) {
    const napi = await import("@napi-rs/canvas");
    const c = napi.createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#4b9cf0"; ctx.fillRect(0, 0, w, h);
    return (await c.encode("jpeg", 90)).toString("base64");
  }

  it("laddar upp (skalas ned), visar bara egna bilder och tar bort egna – styrelsen ser alla", async () => {
    const { appRouter } = await import("./routers");
    const { entryImage, purgeEntries } = await import("./campaignEntries");
    const board = appRouter.createCaller(admin as never);
    const player = await board.players.create({ name: "Mustasch Testsson", number: "77", position: "F" } as never);
    const big = await jpeg(3000, 2000);

    // Styrelsen kan alltid ladda upp; spelarens namn och nummer kommer från truppen
    const { id } = await board.campaign.upload({ device: DEV, playerId: player.id, name: "fel namn", number: null, imageBase64: big });
    const all = await board.campaign.entries();
    const e = all.find((x) => x.id === id)!;
    expect(e).toMatchObject({ name: "Mustasch Testsson", number: "77", playerId: player.id, width: 1080, height: 720 });
    expect((await entryImage(id))!.subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG

    // Utan inloggning: öppet i november, annars stängt
    const a = appRouter.createCaller(anon("10.0.0.2") as never);
    if (campaignOpen()) {
      const r = await a.campaign.upload({ device: OTHER, playerId: null, name: "  Okänd   Gäst ", number: null, imageBase64: await jpeg(400, 600) });
      const st = await a.campaign.status({ device: OTHER });
      expect(st.canUse).toBe(true);
      expect(st.mine.map((m) => m.id)).toEqual([r.id]); // bara den här enhetens
      expect(st.mine[0].name).toBe("Okänd Gäst");
      expect(await entryImage(r.id, DEV)).toBeNull(); // annan enhet ser inte bilden
      expect((await a.campaign.deleteMine({ device: DEV, id: r.id })).ok).toBe(false);
      expect((await a.campaign.deleteMine({ device: OTHER, id: r.id })).ok).toBe(true);
    } else {
      await expect(a.campaign.upload({ device: OTHER, playerId: null, name: "Gäst", number: null, imageBase64: big })).rejects.toThrow(/stängd/);
      expect((await a.campaign.status({ device: OTHER })).canUse).toBe(false);
    }
    // Bara styrelsen (Media) ser alla bidrag
    await expect(a.campaign.entries()).rejects.toThrow();

    // Spärr per enhet och dygn
    for (let i = 1; i < CAMPAIGN_LIMITS.perDevicePerDay; i++) await board.campaign.upload({ device: DEV, playerId: null, name: "Gäst", number: null, imageBase64: await jpeg(20, 20) });
    await expect(board.campaign.upload({ device: DEV, playerId: null, name: "Gäst", number: null, imageBase64: await jpeg(20, 20) })).rejects.toThrow(/per dygn/);
    // Inte en bild
    await expect(board.campaign.upload({ device: OTHER, playerId: null, name: "Gäst", number: null, imageBase64: "aGVqaGVq" })).rejects.toThrow(/läsas/);

    // Gallring efter 90 dagar
    await purgeEntries(new Date(Date.now() + 91 * 24 * 60 * 60 * 1000));
    expect((await board.campaign.entries()).length).toBe(0);
  }, 60_000);
});
