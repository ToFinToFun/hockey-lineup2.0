/**
 * Mustaschkampen – bidrag som medlemmarna laddar upp själva.
 *
 * Modulen är öppen för alla (utan inloggning) under november och fem dagar in
 * i december; styrelsen (Media) kommer åt den hela året. Man väljer sig själv
 * i truppen eller skriver sitt namn. Bilden skalas ned och kodas om på servern
 * (max 1080 px, utan metadata som plats). Inga godkännanden – styrelsen väljer
 * i Media vad som publiceras och kan ta bort bidrag.
 *
 * Spärrar mot missbruk: högst 10 bilder per enhet och 30 per IP-adress per
 * dygn, högst 1 500 bidrag per kampanj. Allt raderas efter 90 dagar.
 */
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "./db";
import { campaignEntries, mediaThemes } from "../drizzle/schema";
import { serverCanvas } from "./serverCanvas";

export const CAMPAIGN_LIMITS = {
  perDevicePerDay: 10,
  perIpPerDay: 30,
  perCampaign: 1500,
  /** Det klienten får skicka (redan nedskalat i telefonen) */
  maxUploadBase64: 3_000_000,
  maxSide: 1080,
  quality: 0.82,
  keepDays: 90,
  /** Öppet för alla till och med den här dagen i december */
  openUntilDecemberDay: 5,
};

/** Temat som modulen gäller (Mustaschkampen, inbyggd nyckel "movember") */
export const CAMPAIGN_BUILTIN = "movember";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

const hash = (s: string) => createHash("sha256").update(`mustasch:${s}`).digest("hex");

/** Svensk kalenderdag (år, månad 1–12, dag) */
function stockholmDate(now: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Öppet för alla: 1 november – 5 december (svensk tid) */
export function campaignOpen(now = new Date()): boolean {
  const d = stockholmDate(now);
  return d.month === 11 || (d.month === 12 && d.day <= CAMPAIGN_LIMITS.openUntilDecemberDay);
}

/** Kampanjperioden som gäller nu eller nästa (efter 5 december: nästa år), som ÅÅÅÅ-MM-DD */
export function campaignDates(now = new Date()) {
  const d = stockholmDate(now);
  const year = d.month === 12 && d.day > CAMPAIGN_LIMITS.openUntilDecemberDay ? d.year + 1 : d.year;
  return { opens: `${year}-11-01`, closes: `${year}-12-${String(CAMPAIGN_LIMITS.openUntilDecemberDay).padStart(2, "0")}` };
}

export async function campaignTheme() {
  const db = await requireDb();
  const [t] = await db.select({ id: mediaThemes.id, name: mediaThemes.name, accent: mediaThemes.accent, slogan: mediaThemes.slogan, builtin: mediaThemes.builtin, hasLogo: sql<number>`${mediaThemes.logo} is not null`, updatedAt: mediaThemes.updatedAt })
    .from(mediaThemes).where(eq(mediaThemes.builtin, CAMPAIGN_BUILTIN)).limit(1);
  return t ? { ...t, hasLogo: !!Number(t.hasLogo) } : null;
}

/** Skala ned (högst 1080 px), koda om som JPEG och ta bort all metadata */
export async function processEntryImage(base64: string): Promise<{ image: string; width: number; height: number }> {
  const napi = await serverCanvas();
  if (!napi) throw new Error("Bilder kan inte tas emot just nu");
  let img: Awaited<ReturnType<typeof napi.loadImage>>;
  try {
    img = await napi.loadImage(Buffer.from(base64, "base64"));
  } catch {
    throw new Error("Bilden kunde inte läsas");
  }
  if (!img.width || !img.height) throw new Error("Bilden kunde inte läsas");
  const s = Math.min(1, CAMPAIGN_LIMITS.maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * s)), height = Math.max(1, Math.round(img.height * s));
  const c = napi.createCanvas(width, height);
  c.getContext("2d").drawImage(img, 0, 0, width, height);
  const jpeg = await c.encode("jpeg", Math.round(CAMPAIGN_LIMITS.quality * 100));
  return { image: jpeg.toString("base64"), width, height };
}

export type UploadError = "closed" | "device" | "ip" | "full" | "name";

/** Ladda upp ett bidrag. device = enhetens hemliga nyckel, ip = avsändarens adress. */
export async function addEntry(input: { themeId: number; playerId: string | null; name: string; number: string | null; imageBase64: string; device: string; ip: string }): Promise<{ ok: true; id: number } | { ok: false; reason: UploadError }> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) return { ok: false, reason: "name" };
  const db = await requireDb();
  const device = hash(`d:${input.device}`), ipHash = hash(`ip:${input.ip}`);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = async (cond: ReturnType<typeof eq>) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(campaignEntries).where(and(cond, gte(campaignEntries.createdAt, since))))[0]?.n ?? 0);
  if ((await count(eq(campaignEntries.device, device))) >= CAMPAIGN_LIMITS.perDevicePerDay) return { ok: false, reason: "device" };
  if ((await count(eq(campaignEntries.ipHash, ipHash))) >= CAMPAIGN_LIMITS.perIpPerDay) return { ok: false, reason: "ip" };
  const total = Number((await db.select({ n: sql<number>`count(*)` }).from(campaignEntries).where(eq(campaignEntries.themeId, input.themeId)))[0]?.n ?? 0);
  if (total >= CAMPAIGN_LIMITS.perCampaign) return { ok: false, reason: "full" };
  const img = await processEntryImage(input.imageBase64);
  const [res] = await db.insert(campaignEntries).values({
    themeId: input.themeId, playerId: input.playerId, name, number: input.number, image: img.image, width: img.width, height: img.height, device, ipHash,
  });
  return { ok: true, id: Number((res as { insertId: number }).insertId) };
}

const listCols = {
  id: campaignEntries.id, playerId: campaignEntries.playerId, name: campaignEntries.name, number: campaignEntries.number,
  width: campaignEntries.width, height: campaignEntries.height, createdAt: campaignEntries.createdAt,
};

/** Den här enhetens bidrag (nyast först) */
export async function myEntries(themeId: number, deviceKey: string) {
  const db = await requireDb();
  return db.select(listCols).from(campaignEntries)
    .where(and(eq(campaignEntries.themeId, themeId), eq(campaignEntries.device, hash(`d:${deviceKey}`)))).orderBy(desc(campaignEntries.createdAt));
}

/** Alla bidrag (för Media), äldst först så att före/efter blir rätt */
export async function allEntries(themeId: number) {
  const db = await requireDb();
  return db.select(listCols).from(campaignEntries).where(eq(campaignEntries.themeId, themeId)).orderBy(asc(campaignEntries.createdAt));
}

/** Bilden – för styrelsen, eller för enheten som laddade upp den (deviceKey) */
export async function entryImage(id: number, deviceKey?: string): Promise<Buffer | null> {
  const db = await requireDb();
  const [row] = await db.select({ image: campaignEntries.image, device: campaignEntries.device }).from(campaignEntries).where(eq(campaignEntries.id, id)).limit(1);
  if (!row) return null;
  if (deviceKey !== undefined && row.device !== hash(`d:${deviceKey}`)) return null;
  return Buffer.from(row.image, "base64");
}

/** Ta bort: styrelsen alla, enheten sina egna */
export async function deleteEntry(id: number, deviceKey?: string): Promise<boolean> {
  const db = await requireDb();
  const cond = deviceKey !== undefined ? and(eq(campaignEntries.id, id), eq(campaignEntries.device, hash(`d:${deviceKey}`))) : eq(campaignEntries.id, id);
  const [res] = await db.delete(campaignEntries).where(cond);
  return Number((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** Gallring: bidrag äldre än 90 dagar raderas */
export async function purgeEntries(now = new Date()) {
  const db = await requireDb();
  await db.delete(campaignEntries).where(lt(campaignEntries.createdAt, new Date(now.getTime() - CAMPAIGN_LIMITS.keepDays * 24 * 60 * 60 * 1000)));
}

export function startCampaignPurge() {
  const run = () => void purgeEntries().catch((e) => console.warn("[mustaschkampen] gallring:", (e as Error).message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
