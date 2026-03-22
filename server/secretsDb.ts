/**
 * Database helpers for encrypted app secrets (e.g. laget.se credentials).
 */
import { getDb } from "./db";
import { appSecrets } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export interface LagetSeCredentials {
  username: string;
  password: string;
}

/**
 * Save an encrypted secret to the database.
 * If the key already exists, it will be updated.
 */
export async function saveSecret(key: string, value: string, label?: string): Promise<void> {
  const encryptedValue = encrypt(value);

  const db = await requireDb();
  const existing = await db
    .select()
    .from(appSecrets)
    .where(eq(appSecrets.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSecrets)
      .set({ encryptedValue, label: label ?? existing[0].label })
      .where(eq(appSecrets.key, key));
  } else {
    await db.insert(appSecrets).values({ key, encryptedValue, label });
  }
}

/**
 * Read and decrypt a secret from the database.
 * Returns null if the key doesn't exist.
 */
export async function getSecret(key: string): Promise<string | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(appSecrets)
    .where(eq(appSecrets.key, key))
    .limit(1);

  if (rows.length === 0) return null;

  try {
    return decrypt(rows[0].encryptedValue);
  } catch {
    return null; // Decryption failed (key changed?)
  }
}

/**
 * Check if a secret exists in the database (without decrypting).
 */
export async function hasSecret(key: string): Promise<boolean> {
  const db = await requireDb();
  const rows = await db
    .select({ id: appSecrets.id })
    .from(appSecrets)
    .where(eq(appSecrets.key, key))
    .limit(1);
  return rows.length > 0;
}

/**
 * Delete a secret from the database.
 */
export async function deleteSecret(key: string): Promise<void> {
  const db = await requireDb();
  await db.delete(appSecrets).where(eq(appSecrets.key, key));
}

// ─── Laget.se-specific helpers ─────────────────────────────────────────────

const LAGET_SE_KEY = "laget_se";

/**
 * Save laget.se credentials (encrypted) to the database.
 */
export async function saveLagetSeCredentials(creds: LagetSeCredentials): Promise<void> {
  await saveSecret(LAGET_SE_KEY, JSON.stringify(creds), "Laget.se inloggning");
}

/**
 * Read laget.se credentials from the database.
 * Returns null if not configured.
 */
export async function getLagetSeCredentials(): Promise<LagetSeCredentials | null> {
  const raw = await getSecret(LAGET_SE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LagetSeCredentials;
  } catch {
    return null;
  }
}

/**
 * Check if laget.se credentials are configured.
 */
export async function hasLagetSeCredentials(): Promise<boolean> {
  return hasSecret(LAGET_SE_KEY);
}
