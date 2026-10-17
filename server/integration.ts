// Integration med sajten (stalstadens.se) – grunden. Allt är avstängt tills något område slås på.
//
// - Egen intern port (INTEGRATION_PORT, standard 3101) som bara startar med INTEGRATION_KEY (minst 32 tecken).
//   Porten ska inte exponeras i Coolify: den nås bara från sajtens container i samma Docker-nätverk.
// - Varje anrop kräver "Authorization: Bearer <nyckel>". INTEGRATION_KEY_PREVIOUS gäller också vid nyckelbyte.
// - Appen får aldrig personnummer, e-post, telefon eller avgifter från sajten och kan aldrig söka i registret.
import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { club } from "../shared/club";
import { POSITION_BASE_COLORS, POSITION_NAMES, WAIVERS } from "../shared/positions";
import { applyMembership, createForMember, linkPlayer, playersForSite, statsForSite, updateHockeyFields } from "./playerLink";
import { linkSponsors, scheduleSponsorSync, sponsorCounts, sponsorMode, sponsorSyncState, syncSponsors } from "./sponsorSync";

export const INTEGRATION_API_VERSION = 1;

/** Nyckel och sajtens adress finns – annars gör integrationen ingenting. */
export function integrationConfigured(): boolean {
  return key.length >= 32 && siteUrl !== "";
}

const key = (process.env.INTEGRATION_KEY ?? "").trim();
const previousKey = (process.env.INTEGRATION_KEY_PREVIOUS ?? "").trim();
const port = Number(process.env.INTEGRATION_PORT || 3101);
const siteUrl = (process.env.SITE_INTERNAL_URL ?? "").trim().replace(/\/+$/, "");

/** Områden – samma namn som på sajten. Alla av tills vidare. */
export const INTEGRATION_DOMAINS = ["sponsors", "terms", "players", "stats"] as const;
export type IntegrationDomain = (typeof INTEGRATION_DOMAINS)[number];
export type IntegrationMode = "off" | "shadow" | "live";
function currentModes(): Record<IntegrationDomain, IntegrationMode> {
  return { sponsors: sponsorMode(), terms: "off", players: "off", stats: "off" };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function keyAccepted(header: string | undefined): boolean {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || key.length < 32) return false;
  return sameSecret(token, key) || (previousKey !== "" && sameSecret(token, previousKey));
}

function requireKey(req: Request, res: Response, next: NextFunction) {
  if (!keyAccepted(req.get("authorization"))) return res.status(401).json({ error: "unauthorized" });
  next();
}

export function startIntegrationServer(appVersion: string): void {
  if (!key) {
    console.log("[integration] INTEGRATION_KEY saknas – den interna porten startas inte.");
    return;
  }
  if (key.length < 32) {
    console.warn("[integration] INTEGRATION_KEY är för kort (minst 32 tecken) – den interna porten startas inte.");
    return;
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/internal", requireKey);

  app.get("/internal/v1/ping", (_req, res) => {
    res.json({ ok: true, service: "app", apiVersion: INTEGRATION_API_VERSION, version: appVersion, time: new Date().toISOString(), modes: currentModes() });
  });

  // Sajten säger till att något ändrats – appen hämtar själv
  app.post("/internal/v1/notify", (req, res) => {
    if (req.body?.domain === "sponsors") scheduleSponsorSync();
    // Organisation sparad på sajten – styrelsen läses om vid nästa behov
    if (req.body?.domain === "board") void import("./activities").then((m) => m.clearBoardCache());
    res.json({ ok: true });
  });

  // Styrelsen loggar ut alla en medlems enheter (från registret på sajten)
  app.post("/internal/v1/members/:id/logout", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ogiltigt id" });
    try {
      const { revokeAll } = await import("./memberAuth");
      res.json({ count: await revokeAll(id) });
    } catch (e) {
      next(e);
    }
  });

  // ─── Admin i appen: vägen in från sajten (den med rollen styrelse/webbadmin) ───
  app.get("/internal/v1/grants", async (_req, res, next) => {
    try {
      const { listGrants } = await import("./grants");
      res.json((await listGrants()).map((g) => ({ memberId: g.memberId, admin: g.admin, modules: g.modules, grantedBy: g.grantedBy, grantedAt: g.grantedAt, lastUsedAt: g.lastUsedAt })));
    } catch (e) {
      next(e);
    }
  });
  app.post("/internal/v1/grants/admin", async (req, res, next) => {
    const b = z.object({ memberId: z.number().int().positive(), admin: z.boolean(), by: z.string().trim().min(1).max(100) }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "ogiltiga uppgifter" });
    try {
      const { listGrants, setGrant } = await import("./grants");
      const cur = (await listGrants()).find((g) => g.memberId === b.data.memberId);
      await setGrant(b.data.memberId, { admin: b.data.admin, modules: cur?.modules ?? [] }, `${b.data.by} (sajten)`);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // Medlemmen har slutat eller raderats på sajten: utloggad överallt och utan behörigheter
  app.post("/internal/v1/members/:id/removed", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ogiltigt id" });
    try {
      const { revokeAll } = await import("./memberAuth");
      const { removeGrant } = await import("./grants");
      const devices = await revokeAll(id);
      await removeGrant(id);
      await import("./calendar").then((m) => m.removeCalendar(id));
      res.json({ devices });
    } catch (e) {
      next(e);
    }
  });

  // Sajten skickar en notis till medlemmar som har push (t.ex. ny avgift att betala)
  app.post("/internal/v1/push", async (req, res, next) => {
    const b = z
      .object({ memberIds: z.array(z.number().int().positive()).max(5000), title: z.string().min(1).max(120), body: z.string().max(300), url: z.string().regex(/^\/[\w\-/]*$/) })
      .safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "ogiltiga uppgifter" });
    try {
      const { pushTo } = await import("./push");
      const reached = await pushTo(b.data.memberIds, { title: b.data.title, body: b.data.body, url: b.data.url, tag: "avgift" });
      res.json({ pushed: reached.size });
    } catch (e) {
      next(e);
    }
  });

  // Begrepp: lagens och positionernas namn, förkortning och färg (sajtens medlemsregister använder dem)
  app.get("/internal/v1/terms", (_req, res) => {
    res.json(currentTerms());
  });

  // ─── Spelare (steg 4): sajtens register kopplar medlemmar till spelare ───
  const hockey = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    number: z.string().trim().max(10).optional(),
    position: z.enum(["MV", "B", "C", "F", "IB"]).optional(),
    teamColor: z.enum(["white", "green"]).nullable().optional(),
    captainRole: z.enum(["C", "A"]).nullable().optional(),
    altPosition: z.enum(["MV", "B", "C", "F"]).nullable().optional(),
  });
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((e: Error) => (e instanceof z.ZodError ? res.status(400).json({ error: "ogiltiga uppgifter" }) : /finns inte|kan inte|redan/.test(e.message) ? res.status(400).json({ error: e.message }) : next(e)));

  app.get("/internal/v1/players", wrap(async (_req, res) => res.json(await playersForSite())));
  // Matcher och spelade positioner per säsong (kopplade spelare)
  app.get("/internal/v1/players/stats", wrap(async (_req, res) => res.json(await statsForSite())));

  app.post("/internal/v1/players/create", wrap(async (req, res) => {
    const b = hockey.extend({ memberId: z.number().int().positive(), name: z.string().trim().min(1).max(120), isMember: z.boolean() }).parse(req.body);
    res.json({ id: await createForMember(b) });
  }));

  app.post("/internal/v1/players/link", wrap(async (req, res) => {
    const b = z.object({ playerId: z.string().min(1).max(64), memberId: z.number().int().positive().nullable(), isMember: z.boolean().nullable(), fields: hockey.default({}) }).parse(req.body);
    await linkPlayer(b.playerId, b.memberId, b.isMember, b.fields);
    res.json({ ok: true });
  }));

  app.post("/internal/v1/players/update", wrap(async (req, res) => {
    const b = z.object({ playerId: z.string().min(1).max(64), fields: hockey }).parse(req.body);
    await updateHockeyFields(b.playerId, b.fields);
    res.json({ ok: true });
  }));

  app.post("/internal/v1/players/membership", wrap(async (req, res) => {
    const b = z.object({ managed: z.boolean(), members: z.record(z.string().max(64), z.boolean()) }).parse(req.body);
    res.json(await applyMembership(b.managed, b.members));
  }));

  // Synka nu och svara med läget efteråt (används av sajtens Synkstatus)
  app.post("/internal/v1/sync", async (req, res, next) => {
    try {
      if (req.body?.domain !== "sponsors") return res.status(400).json({ error: "okänt område" });
      await syncSponsors();
      res.json(await sponsorSyncState());
    } catch (e) {
      next(e);
    }
  });

  // Visningsräknare per sponsor, denna och förra säsongen (samma siffror som appens sponsorsida)
  app.get("/internal/v1/sponsors/counts", async (_req, res, next) => {
    try {
      res.json(await sponsorCounts());
    } catch (e) {
      next(e);
    }
  });

  app.get("/internal/v1/sponsors/state", async (_req, res, next) => {
    try {
      res.json(await sponsorSyncState());
    } catch (e) {
      next(e);
    }
  });

  app.post("/internal/v1/sponsors/link", async (req, res, next) => {
    const parsed = z
      .object({ links: z.array(z.object({ appId: z.number().int().positive(), siteId: z.number().int().positive().nullable() })).max(200) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ogiltig ihopparning" });
    try {
      await linkSponsors(parsed.data.links);
      await syncSponsors();
      res.json(await sponsorSyncState());
    } catch (e) {
      if (e instanceof Error && !(e as { code?: string }).code) return res.status(400).json({ error: e.message });
      next(e);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[integration]", err);
    res.status(500).json({ error: "server error" });
  });
  app.listen(port, () => console.log(`[integration] intern port ${port} (API v${INTEGRATION_API_VERSION})`));
}

export interface PingResult {
  ok: boolean;
  ms?: number;
  error?: string;
  remote?: { service?: string; version?: string; apiVersion?: number };
}

/** "#abc" → "#aabbcc"; annat än hex blir grått (sajten kräver #rrggbb). */
function hex6(c: string): string {
  const v = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return "#8c8c8c";
}

export function currentTerms() {
  const t = club().teams;
  const team = (k: "white" | "green") => ({ name: t[k].name.slice(0, 40), shortName: t[k].shortName.slice(0, 10), color: hex6(t[k].color) });
  const pos = (k: keyof typeof POSITION_NAMES) => ({ name: POSITION_NAMES[k], shortName: k, color: POSITION_BASE_COLORS[k] });
  return {
    teams: { white: team("white"), green: team("green"), waivers: { ...WAIVERS } },
    positions: { MV: pos("MV"), B: pos("B"), C: pos("C"), F: pos("F"), IB: pos("IB") },
  };
}

/** Säger till sajten att något ändrats. Sajten hämtar själv; annars tar avstämningen var 5:e minut det. */
export function notifySite(domain: IntegrationDomain): void {
  if (!integrationConfigured()) return;
  void siteRequest("POST", "/internal/v1/notify", { domain }).catch((e) =>
    console.warn(`[integration] kunde inte meddela sajten (${domain}):`, (e as Error).message),
  );
}

/** Anrop till sajtens interna API. Kastar fel med en begriplig text. */
export async function siteRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!integrationConfigured()) throw new Error("Integrationen är inte inställd");
  let res: globalThis.Response;
  try {
    res = await fetch(`${siteUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new Error(`Når inte sajten: ${(e as Error).message}`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Sajten svarade ${res.status}`);
  return data;
}

/** Hämtar en bild från sajten. Null om den saknas (404). */
export async function siteImage(path: string): Promise<Buffer | null> {
  if (!integrationConfigured()) throw new Error("Integrationen är inte inställd");
  const res = await fetch(`${siteUrl}${path}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sajten svarade ${res.status} på loggan`);
  return Buffer.from(await res.arrayBuffer());
}

/** Testar anslutningen till sajtens interna port. */
export async function pingSite(): Promise<PingResult> {
  if (!siteUrl) return { ok: false, error: "SITE_INTERNAL_URL saknas" };
  if (key.length < 32) return { ok: false, error: "INTEGRATION_KEY saknas eller är för kort" };
  const t0 = Date.now();
  try {
    const res = await fetch(`${siteUrl}/internal/v1/ping`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - t0;
    if (res.status === 401) return { ok: false, ms, error: "Sajten godtog inte nyckeln (olika INTEGRATION_KEY?)" };
    if (!res.ok) return { ok: false, ms, error: `Sajten svarade ${res.status}` };
    return { ok: true, ms, remote: (await res.json()) as PingResult["remote"] };
  } catch (e) {
    return { ok: false, error: `Når inte sajten: ${(e as Error).message}` };
  }
}

export function integrationStatus() {
  return {
    keyConfigured: key.length >= 32,
    keyTooShort: key !== "" && key.length < 32,
    port,
    siteUrl,
    modes: currentModes(),
  };
}
