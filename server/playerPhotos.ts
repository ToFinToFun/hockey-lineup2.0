/**
 * Profilbilder för spelare. Bilden förminskas i webbläsaren (kvadrat, JPEG)
 * och sparas i databasen, så den följer med i backupen.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { playerPhotos } from "../drizzle/schema";

/** Max storlek på en bild efter förminskning (base64-tecken). ~150 kB JPEG. */
export const MAX_PHOTO_BASE64 = 200_000;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

export async function getPlayerPhoto(playerId: string): Promise<{ image: Buffer; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select().from(playerPhotos).where(eq(playerPhotos.playerId, playerId)).limit(1);
  return row ? { image: Buffer.from(row.image, "base64"), updatedAt: row.updatedAt } : null;
}

export async function setPlayerPhoto(playerId: string, base64Jpeg: string) {
  const db = await requireDb();
  await db
    .insert(playerPhotos)
    .values({ playerId, image: base64Jpeg })
    .onDuplicateKeyUpdate({ set: { image: base64Jpeg, updatedAt: new Date() } });
}

export async function deletePlayerPhoto(playerId: string) {
  const db = await requireDb();
  await db.delete(playerPhotos).where(eq(playerPhotos.playerId, playerId));
}
