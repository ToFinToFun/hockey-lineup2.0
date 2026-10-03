/**
 * Behörighet utan användarkonton.
 *
 * - "admin":  styrelsen, loggar in med ADMIN_PASSWORD. Session i 30 dagar.
 * - "lineup": den som öppnat en tillfällig länk (skapad av admin). Får bygga
 *             uppställningar och synka laget.se tills länken går ut (24 h).
 * - "access": delad länk med moduler (server/accessLinks.ts) – bara de valda
 *             modulerna, aldrig Lineup eller inställningar.
 *
 * Sessionen är en signerad JWT i en httpOnly-cookie. Länkar är signerade
 * tokens med samma nyckel. "Återkalla alla länkar" höjer ett versionsnummer i
 * app_config, vilket ogiltigförklarar alla länkar och lineup-sessioner.
 *
 * Varje länk sparas också i en lista (app_config "invites") med id, etikett,
 * utgångstid och antal öppningar. Länken och sessionerna den gett bär id:t, så
 * en enskild länk kan återkallas utan att de andra påverkas.
 */
import { SignJWT, jwtVerify } from "jose";
import { parseCookie, stringifySetCookie } from "cookie";
import { timingSafeEqual, createHash, randomUUID } from "crypto";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { getActiveAccessLink, markUsed } from "./accessLinks";
import type { AccessModule } from "../shared/accessModules";

export type Role = "admin" | "lineup" | "access";

const COOKIE_NAME = "stal_session";
const ADMIN_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const INVITE_SECONDS = 24 * 60 * 60;
const INVITE_VERSION_KEY = "invite_version";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(ENV.cookieSecret);
}

// Versionen cachas kort så att inte varje anrop går mot databasen.
let versionCache: { value: number; at: number } | null = null;
async function getInviteVersion(): Promise<number> {
  if (versionCache && Date.now() - versionCache.at < 10_000) return versionCache.value;
  const raw = await getConfigValue(INVITE_VERSION_KEY);
  const value = Number(raw) || 1;
  versionCache = { value, at: Date.now() };
  return value;
}

export async function revokeAllInvites(): Promise<void> {
  const next = (await getInviteVersion()) + 1;
  await setConfigValue(INVITE_VERSION_KEY, String(next));
  versionCache = { value: next, at: Date.now() };
}

export function checkAdminPassword(input: string): boolean {
  if (!ENV.adminPassword) return false;
  // Hasha båda så att jämförelsen alltid sker på lika långa buffertar.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(ENV.adminPassword).digest();
  return timingSafeEqual(a, b);
}

async function sign(payload: Record<string, unknown>, expiresInSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey());
}

// ─── Listan över länkar ──────────────────────────────────────────────────────

const INVITES_KEY = "invites";

export interface InviteRecord {
  id: string;
  label: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  uses: number;
  revoked?: boolean;
}

let invitesCache: { list: InviteRecord[]; at: number } | null = null;

async function loadInvites(): Promise<InviteRecord[]> {
  if (invitesCache && Date.now() - invitesCache.at < 10_000) return invitesCache.list;
  let list: InviteRecord[] = [];
  try {
    const raw = await getConfigValue(INVITES_KEY);
    if (raw) list = JSON.parse(raw) as InviteRecord[];
  } catch { /* tom lista */ }
  invitesCache = { list, at: Date.now() };
  return list;
}

async function saveInvites(list: InviteRecord[]) {
  // Utgångna länkar sparas en vecka för överblickens skull, sedan rensas de
  const keep = list.filter((i) => i.expiresAt > Date.now() - 7 * 24 * 60 * 60 * 1000);
  await setConfigValue(INVITES_KEY, JSON.stringify(keep));
  invitesCache = { list: keep, at: Date.now() };
}

/** Länkar som fortfarande går att använda (inte utgångna eller återkallade), nyast först. */
export async function listActiveInvites(): Promise<InviteRecord[]> {
  const v = await getInviteVersion();
  const list = await loadInvites();
  return list
    .filter((i) => !i.revoked && i.expiresAt > Date.now() && inviteVersionOf(i.token) === v)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Versionen som länken skapades med (läses utan verifiering – bara för listan). */
function inviteVersionOf(token: string): number | null {
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.v === "number" ? json.v : null;
  } catch {
    return null;
  }
}

export async function revokeInvite(id: string): Promise<void> {
  const list = await loadInvites();
  await saveInvites(list.map((i) => (i.id === id ? { ...i, revoked: true } : i)));
}

async function isInviteActive(id: unknown): Promise<boolean> {
  if (typeof id !== "string") return true; // äldre länkar utan id styrs bara av versionen
  const rec = (await loadInvites()).find((i) => i.id === id);
  return !!rec && !rec.revoked;
}

export async function createInviteToken(label = ""): Promise<{ id: string; token: string; expiresAt: number }> {
  const v = await getInviteVersion();
  const id = randomUUID().slice(0, 8);
  const token = await sign({ typ: "invite", role: "lineup", v, inv: id }, INVITE_SECONDS);
  const expiresAt = Date.now() + INVITE_SECONDS * 1000;
  const list = await loadInvites();
  await saveInvites([...list, { id, label: label.trim().slice(0, 60), token, createdAt: Date.now(), expiresAt, uses: 0 }]);
  return { id, token, expiresAt };
}

function setSessionCookie(res: Response, token: string, maxAgeSeconds: number) {
  res.setHeader(
    "Set-Cookie",
    stringifySetCookie({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    })
  );
}

export function clearSessionCookie(res: Response) {
  setSessionCookie(res, "", 0);
}

export async function startAdminSession(res: Response) {
  const token = await sign({ typ: "session", role: "admin" }, ADMIN_SESSION_SECONDS);
  setSessionCookie(res, token, ADMIN_SESSION_SECONDS);
}

/** Byter en giltig länk-token mot en lineup-session med samma utgångstid. */
export async function redeemInvite(res: Response, token: string): Promise<{ expiresAt: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== "invite" || payload.role !== "lineup" || !payload.exp) return null;
    if (payload.v !== (await getInviteVersion())) return null;
    if (!(await isInviteActive(payload.inv))) return null;
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return null;
    const session = await sign({ typ: "session", role: "lineup", v: payload.v, inv: payload.inv }, remaining);
    if (typeof payload.inv === "string") {
      const list = await loadInvites();
      await saveInvites(list.map((i) => (i.id === payload.inv ? { ...i, uses: i.uses + 1 } : i)));
    }
    setSessionCookie(res, session, remaining);
    return { expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

export type Session = { role: Role; expiresAt: number; modules?: AccessModule[]; linkName?: string; linkExpiresAt?: string | null } | null;

const ACCESS_SESSION_SECONDS = 365 * 24 * 60 * 60;

/** Länk-token för en delad länk med moduler (giltigheten avgörs av länken, inte token) */
export async function accessLinkToken(id: string): Promise<string> {
  return sign({ typ: "access-link", al: id }, 10 * 365 * 24 * 60 * 60);
}

/** Byter en delad länk mot en session. Modulerna läses vid varje anrop (ändringar gäller direkt). */
export async function redeemAccessLink(res: Response, token: string): Promise<{ name: string; modules: AccessModule[] } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== "access-link") return null;
    const link = await getActiveAccessLink(payload.al);
    if (!link) return null;
    const until = link.expiresAt ? Math.floor((new Date(link.expiresAt).getTime() - Date.now()) / 1000) : ACCESS_SESSION_SECONDS;
    if (until <= 0) return null;
    const session = await sign({ typ: "session", role: "access", al: link.id }, until);
    setSessionCookie(res, session, until);
    await markUsed(link.id).catch(() => undefined);
    return { name: link.name, modules: link.modules };
  } catch {
    return null;
  }
}

export async function readSession(req: Request): Promise<Session> {
  const raw = req.headers.cookie ? parseCookie(req.headers.cookie)[COOKIE_NAME] : undefined;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (payload.typ !== "session" || !payload.exp) return null;
    if (payload.role === "admin") return { role: "admin", expiresAt: payload.exp * 1000 };
    if (payload.role === "lineup" && payload.v === (await getInviteVersion()) && (await isInviteActive(payload.inv))) {
      return { role: "lineup", expiresAt: payload.exp * 1000 };
    }
    if (payload.role === "access") {
      const link = await getActiveAccessLink(payload.al);
      if (link) return { role: "access", expiresAt: payload.exp * 1000, modules: link.modules, linkName: link.name, linkExpiresAt: link.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}

// Enkel spärr mot lösenordsgissning: max 10 försök per IP per 15 min.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}


/** Styrelsen eller en delad länk med någon av modulerna (för REST-routerna) */
export function hasModule(s: Session, ...modules: AccessModule[]): boolean {
  return s?.role === "admin" || (s?.role === "access" && modules.some((m) => s.modules?.includes(m)));
}
