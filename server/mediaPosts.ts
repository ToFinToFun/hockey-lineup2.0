/**
 * Sparade mediainlägg (utkast) – mall, val, bildtext och ev. egen bild.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { mediaPosts, mediaPostPhotos } from "../drizzle/schema";

export const MAX_MEDIA_PHOTO_BASE64 = 1_500_000;
/** Kampanjinläggens bilder: högst 9, var och en mindre än huvudbilden */
export const MAX_POST_PHOTOS = 9;
export const MAX_POST_PHOTO_BASE64 = 700_000;

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
  await db.delete(mediaPostPhotos).where(eq(mediaPostPhotos.postId, id));
  await db.delete(mediaPosts).where(eq(mediaPosts.id, id));
}

/** Antal bilder per inlägg (kampanjinläggen) */
export async function mediaPhotoCounts(): Promise<Map<number, number>> {
  const db = await requireDb();
  const rows = await db.select({ postId: mediaPostPhotos.postId, n: sql<number>`count(*)` }).from(mediaPostPhotos).groupBy(mediaPostPhotos.postId);
  return new Map(rows.map((r) => [r.postId, Number(r.n)]));
}

export async function getPostPhoto(id: number, idx: number): Promise<Buffer | null> {
  const db = await requireDb();
  const [row] = await db.select({ image: mediaPostPhotos.image }).from(mediaPostPhotos)
    .where(sql`${mediaPostPhotos.postId} = ${id} and ${mediaPostPhotos.idx} = ${idx}`).limit(1);
  return row ? Buffer.from(row.image, "base64") : null;
}

export type PostPhotoInput = { keep: number } | { data: string };

/**
 * Ny lista med bilder, i ordning: { keep: i } behåller inläggets bild nr i
 * (bara vid sparning av samma inlägg), { data } är en ny bild (JPEG, base64).
 */
export function resolvePostPhotos(input: PostPhotoInput[], existing: string[]): string[] {
  return input.map((p) => {
    if ("data" in p) return p.data;
    const img = existing[p.keep];
    if (img === undefined) throw new Error("En bild saknas – ladda upp den igen");
    return img;
  });
}

export async function setPostPhotos(postId: number, input: PostPhotoInput[], sameId: boolean) {
  const db = await requireDb();
  const existing = sameId
    ? (await db.select({ idx: mediaPostPhotos.idx, image: mediaPostPhotos.image }).from(mediaPostPhotos).where(eq(mediaPostPhotos.postId, postId)).orderBy(asc(mediaPostPhotos.idx)))
    : [];
  const byIdx: string[] = [];
  for (const r of existing) byIdx[r.idx] = r.image;
  const next = resolvePostPhotos(input, byIdx);
  await db.transaction(async (tx) => {
    await tx.delete(mediaPostPhotos).where(eq(mediaPostPhotos.postId, postId));
    if (next.length) await tx.insert(mediaPostPhotos).values(next.map((image, idx) => ({ postId, idx, image })));
  });
}
