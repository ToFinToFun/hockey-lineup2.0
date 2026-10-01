/**
 * Klubbens uppladdade loggor (klubbens logga, lagens loggor, kortens märke).
 * Visas via GET /api/club/logo/:key och går före klubbprofilens filer.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { clubAssets } from "../drizzle/schema";

export const CLUB_ASSET_KEYS = ["club", "white", "green", "crest"] as const;
export type ClubAssetKey = (typeof CLUB_ASSET_KEYS)[number];
export const MAX_CLUB_ASSET_BASE64 = 1_400_000;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

/** Vilka loggor som är uppladdade och när (för adresser med ?v= så att cachen byts). */
export async function listClubAssets(): Promise<Partial<Record<ClubAssetKey, number>>> {
  const db = await requireDb();
  const rows = await db.select({ key: clubAssets.key, updatedAt: clubAssets.updatedAt }).from(clubAssets);
  return Object.fromEntries(rows.map((r) => [r.key, r.updatedAt.getTime()]));
}

export async function getClubAsset(key: string): Promise<{ image: Buffer; mime: string; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select().from(clubAssets).where(eq(clubAssets.key, key)).limit(1);
  return row ? { image: Buffer.from(row.image, "base64"), mime: row.mime, updatedAt: row.updatedAt } : null;
}

export async function setClubAsset(key: ClubAssetKey, base64: string) {
  const mime = base64.startsWith("iVBOR") ? "image/png" : base64.startsWith("/9j/") ? "image/jpeg" : null;
  if (!mime) throw new Error("Loggan måste vara PNG eller JPEG");
  const db = await requireDb();
  await db.insert(clubAssets).values({ key, image: base64, mime }).onDuplicateKeyUpdate({ set: { image: base64, mime, updatedAt: new Date() } });
}

export async function deleteClubAsset(key: ClubAssetKey) {
  const db = await requireDb();
  await db.delete(clubAssets).where(eq(clubAssets.key, key));
}
