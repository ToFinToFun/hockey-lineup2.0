/**
 * Medlemsinloggning – helt skild från styrelsens lösenord och länkarna (egen kaka, "stal_member").
 *
 * - Medlemmen skriver sin e-post; sajten (som har adresserna) mejlar kod och länk.
 * - Koden/länken kontrolleras av sajten, som svarar med medlemmens id. Appen sparar en rad per
 *   enhet (member_sessions) och en signerad kaka med radens id. Inget lösenord, ingen e-post här.
 * - Varje anrop kontrollerar att raden inte är utloggad, så att utloggning gäller direkt.
 */
import { SignJWT, jwtVerify } from "jose";
import { parseCookie, stringifySetCookie } from "cookie";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { memberSessions } from "../drizzle/schema";

const COOKIE = "stal_member";
const SESSION_SECONDS = 365 * 24 * 60 * 60;

const key = () => new TextEncoder().encode(ENV.cookieSecret);

async function sign(payload: Record<string, unknown>, seconds: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + seconds).sign(key());
}

function setCookie(res: Response, value: string, maxAge: number) {
  // append – styrelsens kaka (stal_session) kan sättas i samma svar
  res.append(
    "Set-Cookie",
    stringifySetCookie({ name: COOKIE, value, httpOnly: true, secure: ENV.isProduction, sameSite: "lax", path: "/", maxAge }),
  );
}

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  return d;
}

/** Kort beskrivning av enheten utifrån webbläsarens User-Agent. */
export function deviceLabel(ua: string | undefined): string {
  const s = ua ?? "";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Okänd enhet";
  const br = /Edg\//.test(s) ? "Edge" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}

export async function startMemberSession(req: Request, res: Response, memberId: number) {
  const id = randomUUID();
  await (await db()).insert(memberSessions).values({ id, memberId, device: deviceLabel(req.headers["user-agent"]).slice(0, 120) });
  setCookie(res, await sign({ typ: "member", sid: id, mid: memberId }, SESSION_SECONDS), SESSION_SECONDS);
  return id;
}

export type MemberSession = { sid: string; memberId: number } | null;

// Kort cache så att inte varje anrop går mot databasen; utloggning rensar den direkt.
const cache = new Map<string, { ok: boolean; at: number }>();
const lastSeen = new Map<string, number>();

export async function readMember(req: Request): Promise<MemberSession> {
  const raw = req.headers.cookie ? parseCookie(req.headers.cookie)[COOKIE] : undefined;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, key());
    if (payload.typ !== "member" || typeof payload.sid !== "string" || typeof payload.mid !== "number") return null;
    const sid = payload.sid;
    const hit = cache.get(sid);
    let ok = hit && Date.now() - hit.at < 30_000 ? hit.ok : undefined;
    if (ok === undefined) {
      const [row] = await (await db()).select().from(memberSessions).where(eq(memberSessions.id, sid));
      ok = !!row && !row.revokedAt && row.memberId === payload.mid;
      cache.set(sid, { ok, at: Date.now() });
    }
    if (!ok) return null;
    // Senast sedd uppdateras högst en gång i timmen
    if (Date.now() - (lastSeen.get(sid) ?? 0) > 3600_000) {
      lastSeen.set(sid, Date.now());
      void getDb().then((d) => d?.update(memberSessions).set({ lastSeenAt: new Date() }).where(eq(memberSessions.id, sid)));
    }
    return { sid, memberId: payload.mid };
  } catch {
    return null;
  }
}

export async function listDevices(memberId: number) {
  return (await db())
    .select()
    .from(memberSessions)
    .where(and(eq(memberSessions.memberId, memberId), isNull(memberSessions.revokedAt)))
    .orderBy(desc(memberSessions.lastSeenAt));
}

/** Loggar ut en enhet (bara medlemmens egna). */
export async function revokeDevice(memberId: number, sid: string) {
  await (await db())
    .update(memberSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(memberSessions.id, sid), eq(memberSessions.memberId, memberId)));
  cache.delete(sid);
}

/** Loggar ut alla en medlems enheter (medlemmen själv, eller styrelsen via sajten). */
export async function revokeAll(memberId: number) {
  const rows = await listDevices(memberId);
  await (await db()).update(memberSessions).set({ revokedAt: new Date() }).where(and(eq(memberSessions.memberId, memberId), isNull(memberSessions.revokedAt)));
  for (const r of rows) cache.delete(r.id);
  return rows.length;
}

export function clearMemberCookie(res: Response) {
  setCookie(res, "", 0);
}

/** Flera medlemmar med samma e-post: en kortlivad biljett med vilka som får väljas. */
export async function choiceTicket(memberIds: number[]) {
  return sign({ typ: "member-choice", ids: memberIds }, 10 * 60);
}

export async function readChoiceTicket(ticket: string): Promise<number[] | null> {
  try {
    const { payload } = await jwtVerify(ticket, key());
    return payload.typ === "member-choice" && Array.isArray(payload.ids) ? (payload.ids as number[]) : null;
  } catch {
    return null;
  }
}
