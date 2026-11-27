import { describe, expect, it, beforeAll, vi } from "vitest";
import { isolatedDatabaseUrl } from "../client/src/test/isolatedDatabase";
import { mergeOptions, pollOpen } from "./polls";

describe("omröstningar – regler", () => {
  it("alternativen behåller sina id:n när de ändras", () => {
    const old = [{ id: 1, text: "A" }, { id: 2, text: "B" }];
    expect(mergeOptions(old, [{ id: 2, text: " B2 " }, { text: "C" }, { text: "  " }])).toEqual([{ id: 2, text: "B2" }, { id: 3, text: "C" }]);
  });
  it("öppen tills den stängs eller tiden gått ut", () => {
    const now = new Date("2026-12-01T12:00:00Z");
    expect(pollOpen({ closed: false, closesAt: null }, now)).toBe(true);
    expect(pollOpen({ closed: true, closesAt: null }, now)).toBe(false);
    expect(pollOpen({ closed: false, closesAt: new Date("2026-12-01T11:59:00Z") }, now)).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("omröstningar – rösta utan inloggning", () => {
  const D1 = "0123456789abcdef0123456789abcdef", D2 = "fedcba9876543210fedcba9876543210";
  const ctx = (session: unknown, member: unknown = null, ip = "10.0.0.1") => ({ session, member, req: { headers: { "x-forwarded-for": ip }, ip } as any, res: { setHeader: vi.fn() } as any });
  let admin: any, anon: any, appRouter: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = await isolatedDatabaseUrl("polls");
    ({ appRouter } = await import("./routers"));
    admin = appRouter.createCaller(ctx({ role: "admin", expiresAt: Date.now() + 60_000 }) as never);
    anon = appRouter.createCaller(ctx(null) as never);
  }, 30000);

  it("skapa, rösta, ändra, ta bort – resultatet syns efter man svarat", async () => {
    await expect(anon.polls.save({ kind: "poll", title: "X", description: null, options: [{ text: "a" }], multi: false, closesAt: null })).rejects.toThrow();
    const { id } = await admin.polls.save({ kind: "poll", title: "Julavslutning – vilken dag?", description: "Is + mat", options: [{ text: "Fre 12" }, { text: "Lör 13" }, { text: "" }], multi: false, closesAt: null });
    expect((await anon.polls.summary()).map((p: any) => p.title)).toEqual(["Julavslutning – vilken dag?"]);

    let [p] = await anon.polls.list({ device: D1 });
    expect(p.options.map((o: any) => o.text)).toEqual(["Fre 12", "Lör 13"]);
    expect(p.counts).toBeNull(); // inte svarat än
    expect(p.names).toBeNull();
    const [fre, lor] = p.options.map((o: any) => o.id);

    await expect(anon.polls.vote({ device: D1, pollId: id, choices: [fre, lor] })).rejects.toThrow(/Välj/); // ett val
    await anon.polls.vote({ device: D1, pollId: id, choices: [lor] });
    await anon.polls.vote({ device: D2, pollId: id, choices: [lor] });
    await anon.polls.vote({ device: D1, pollId: id, choices: [fre] }); // ändrar sin röst
    [p] = await anon.polls.list({ device: D1 });
    expect(p.mine).toEqual([fre]);
    expect(p.counts).toEqual({ [fre]: 1, [lor]: 1 });
    expect(p.voters).toBe(2);

    expect((await anon.polls.unvote({ device: D2, pollId: id })).ok).toBe(true);
    [p] = await anon.polls.list({ device: D2 });
    expect([p.mine, p.counts, p.voters]).toEqual([null, null, 1]);

    // Stängd: inga fler svar, resultatet syns för alla
    await admin.polls.setClosed({ id, closed: true });
    await expect(anon.polls.vote({ device: D2, pollId: id, choices: [lor] })).rejects.toThrow(/stängd/);
    [p] = await anon.polls.list({ device: D2 });
    expect(p.counts).toEqual({ [fre]: 1, [lor]: 0 });
    expect(await anon.polls.summary()).toEqual([]);
    await admin.polls.delete({ id });
    expect(await admin.polls.list({ device: D1 })).toEqual([]);
  });

  it("inloggad medlem: svaret följer med mellan telefonerna och admin ser namnet", async () => {
    await admin.players.create({ name: "Medlem Testsson", number: "12", position: "F", externalId: "4711" });
    const member = appRouter.createCaller(ctx(null, { sid: "s", memberId: 4711 }) as never);
    const { id } = await admin.polls.save({ kind: "interest", title: "Nya tröjor", description: null, options: [{ text: "En" }, { text: "Två" }], multi: true, closesAt: null });
    const [a, b] = (await member.polls.list({ device: D1 }))[0].options.map((o: any) => o.id);
    await member.polls.vote({ device: D1, pollId: id, choices: [a, b] });
    await member.polls.vote({ device: D2, pollId: id, choices: [b] }); // annan telefon – samma svar ändras
    const [mine] = await member.polls.list({ device: D2 });
    expect([mine.mine, mine.voters]).toEqual([[b], 1]);
    const [adm] = await admin.polls.list({});
    expect(adm.names).toEqual({ [b]: ["Medlem Testsson"] });
  });
});
