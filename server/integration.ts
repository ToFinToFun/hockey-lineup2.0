// Integration med sajten (stalstadens.se) – grunden. Allt är avstängt tills något område slås på.
//
// - Egen intern port (INTEGRATION_PORT, standard 3101) som bara startar med INTEGRATION_KEY (minst 32 tecken).
//   Porten ska inte exponeras i Coolify: den nås bara från sajtens container i samma Docker-nätverk.
// - Varje anrop kräver "Authorization: Bearer <nyckel>". INTEGRATION_KEY_PREVIOUS gäller också vid nyckelbyte.
// - Appen får aldrig personnummer, e-post, telefon eller avgifter från sajten och kan aldrig söka i registret.
import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { linkSponsors, scheduleSponsorSync, sponsorMode, sponsorSyncState, syncSponsors } from "./sponsorSync";

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
    res.json({ ok: true });
  });

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
