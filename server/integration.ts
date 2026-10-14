// Integration med sajten (stalstadens.se) – grunden. Allt är avstängt tills något område slås på.
//
// - Egen intern port (INTEGRATION_PORT, standard 3101) som bara startar med INTEGRATION_KEY (minst 32 tecken).
//   Porten ska inte exponeras i Coolify: den nås bara från sajtens container i samma Docker-nätverk.
// - Varje anrop kräver "Authorization: Bearer <nyckel>". INTEGRATION_KEY_PREVIOUS gäller också vid nyckelbyte.
// - Appen får aldrig personnummer, e-post, telefon eller avgifter från sajten och kan aldrig söka i registret.
import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";

export const INTEGRATION_API_VERSION = 1;

const key = (process.env.INTEGRATION_KEY ?? "").trim();
const previousKey = (process.env.INTEGRATION_KEY_PREVIOUS ?? "").trim();
const port = Number(process.env.INTEGRATION_PORT || 3101);
const siteUrl = (process.env.SITE_INTERNAL_URL ?? "").trim().replace(/\/+$/, "");

/** Områden – samma namn som på sajten. Alla av tills vidare. */
export const INTEGRATION_DOMAINS = ["sponsors", "terms", "players", "stats"] as const;
export type IntegrationDomain = (typeof INTEGRATION_DOMAINS)[number];
export type IntegrationMode = "off" | "shadow" | "live";
const modes: Record<IntegrationDomain, IntegrationMode> = { sponsors: "off", terms: "off", players: "off", stats: "off" };

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
    res.json({ ok: true, service: "app", apiVersion: INTEGRATION_API_VERSION, version: appVersion, time: new Date().toISOString(), modes });
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
    modes,
  };
}
