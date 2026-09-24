/**
 * Behörighet utan användarkonton.
 *
 * - "admin":  styrelsen, loggar in med ADMIN_PASSWORD. Session i 30 dagar.
 * - "lineup": den som öppnat en tillfällig länk (skapad av admin). Får bygga
 *             uppställningar och synka laget.se tills länken går ut (24 h).
 *
 * Sessionen är en signerad JWT i en httpOnly-cookie. Länkar är signerade
 * tokens med samma nyckel. "Återkalla alla länkar" höjer ett versionsnummer i
 * app_config, vilket ogiltigförklarar alla länkar och lineup-sessioner.
 */
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import { timingSafeEqual, createHash } from "crypto";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { getConfigValue, setConfigValue } from "./scoreDb";

export type Role = "admin" | "lineup";

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

export async function createInviteToken(): Promise<{ token: string; expiresAt: number }> {
  const v = await getInviteVersion();
  const token = await sign({ typ: "invite", role: "lineup", v }, INVITE_SECONDS);
  return { token, expiresAt: Date.now() + INVITE_SECONDS * 1000 };
}

function setSessionCookie(res: Response, token: string, maxAgeSeconds: number) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(COOKIE_NAME, token, {
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
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return null;
    const session = await sign({ typ: "session", role: "lineup", v: payload.v }, remaining);
    setSessionCookie(res, session, remaining);
    return { expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

export type Session = { role: Role; expiresAt: number } | null;

export async function readSession(req: Request): Promise<Session> {
  const raw = req.headers.cookie ? parseCookie(req.headers.cookie)[COOKIE_NAME] : undefined;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (payload.typ !== "session" || !payload.exp) return null;
    if (payload.role === "admin") return { role: "admin", expiresAt: payload.exp * 1000 };
    if (payload.role === "lineup" && payload.v === (await getInviteVersion())) {
      return { role: "lineup", expiresAt: payload.exp * 1000 };
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
