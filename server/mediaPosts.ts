/**
 * Sparade mediainlägg (utkast) – mall, val, bildtext och ev. egen bild.
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { mediaPosts } from "../drizzle/schema";

export const MAX_MEDIA_PHOTO_BASE64 = 1_500_000;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

export async function listMediaPosts() {
  const db = await requireDb();
  return db.select({
    id: mediaPosts.id, type: mediaPosts.type, title: mediaPosts.title, settings: mediaPosts.settings,
    caption: mediaPosts.caption, updatedAt: mediaPosts.updatedAt,
  }).from(mediaPosts).orderBy(desc(mediaPosts.updatedAt)).limit(100);
}

/** Har inlägget en egen bild? (för listan och för att veta om den ska hämtas) */
export async function mediaPhotoIds(): Promise<Set<number>> {
  const db = await requireDb();
  const rows = await db.select({ id: mediaPosts.id, photo: mediaPosts.photo }).from(mediaPosts);
  return new Set(rows.filter((r) => !!r.photo).map((r) => r.id));
}

export async function getMediaPhoto(id: number): Promise<{ image: Buffer; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select({ photo: mediaPosts.photo, updatedAt: mediaPosts.updatedAt }).from(mediaPosts).where(eq(mediaPosts.id, id)).limit(1);
  return row?.photo ? { image: Buffer.from(row.photo, "base64"), updatedAt: row.updatedAt } : null;
}

/**
 * Spara. photoBase64: undefined = behåll, null = ta bort, sträng = ny bild.
 * Returnerar id (nytt eller samma).
 */
export async function saveMediaPost(input: {
  id?: number; type: string; title: string; settings: Record<string, unknown>; caption: string; photoBase64?: string | null;
}): Promise<number> {
  const db = await requireDb();
  const photo = input.photoBase64 !== undefined ? { photo: input.photoBase64 } : {};
  if (input.id) {
    await db.update(mediaPosts).set({ type: input.type, title: input.title, settings: input.settings, caption: input.caption, ...photo, updatedAt: new Date() }).where(eq(mediaPosts.id, input.id));
    return input.id;
  }
  const [res] = await db.insert(mediaPosts).values({ type: input.type, title: input.title, settings: input.settings, caption: input.caption, photo: input.photoBase64 ?? null });
  return Number((res as { insertId: number }).insertId);
}

export async function deleteMediaPost(id: number) {
  const db = await requireDb();
  await db.delete(mediaPosts).where(eq(mediaPosts.id, id));
}
