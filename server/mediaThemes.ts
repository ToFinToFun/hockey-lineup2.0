/**
 * Kampanjteman i Media (t.ex. Mustaschkampen): logga, bakgrund, färg och
 * standardtexter som gäller alla inlägg med temat.
 * Loggan och bakgrunden visas via GET /api/media/themes/:id/(logo|photo).
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { mediaThemes } from "../drizzle/schema";

export const MAX_THEME_LOGO_BASE64 = 1_500_000;
export const MAX_THEME_PHOTO_BASE64 = 1_500_000;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

export interface ThemeFields {
  name: string;
  accent: string;
  title: string;
  subtitle: string;
  slogan: string;
  tags: string;
  background: string;
  dim: number;
}

/** Teman utan bilderna (bara om de finns) */
export async function listThemes() {
  const db = await requireDb();
  const rows = await db.select().from(mediaThemes).orderBy(asc(mediaThemes.id));
  return rows.map(({ logo, photo, createdAt: _c, ...t }) => ({ ...t, hasLogo: !!logo, hasPhoto: !!photo }));
}

export function imageMime(base64: string): string | null {
  return base64.startsWith("iVBOR") ? "image/png" : base64.startsWith("/9j/") ? "image/jpeg" : null;
}

export async function getThemeImage(id: number, which: "logo" | "photo"): Promise<{ image: Buffer; mime: string } | null> {
  const db = await requireDb();
  const [row] = await db.select({ logo: mediaThemes.logo, photo: mediaThemes.photo }).from(mediaThemes).where(eq(mediaThemes.id, id)).limit(1);
  const b64 = row?.[which];
  if (!b64) return null;
  return { image: Buffer.from(b64, "base64"), mime: imageMime(b64) ?? "application/octet-stream" };
}

/**
 * Spara ett tema. logo/photo: undefined = behåll, null = ta bort, sträng = ny bild.
 * Returnerar id (nytt eller samma).
 */
export async function saveTheme(input: ThemeFields & { id?: number; logo?: string | null; photo?: string | null }): Promise<number> {
  const db = await requireDb();
  const { id, logo, photo, ...fields } = input;
  const images = { ...(logo !== undefined ? { logo } : {}), ...(photo !== undefined ? { photo } : {}) };
  if (id) {
    await db.update(mediaThemes).set({ ...fields, ...images, updatedAt: new Date() }).where(eq(mediaThemes.id, id));
    return id;
  }
  const [res] = await db.insert(mediaThemes).values({ ...fields, ...images });
  return Number((res as { insertId: number }).insertId);
}

export async function deleteTheme(id: number) {
  const db = await requireDb();
  await db.delete(mediaThemes).where(eq(mediaThemes.id, id));
}
