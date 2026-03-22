/**
 * AES-256-GCM encryption/decryption for storing sensitive credentials in the database.
 * Uses JWT_SECRET as the base key material, derived via PBKDF2 for proper key stretching.
 */
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16;
const SALT = "stalstadens-lineup-secrets-v1"; // Static salt (key material already has entropy)

function deriveKey(): Buffer {
  const secret = ENV.cookieSecret || "fallback-dev-key-not-for-production";
  return pbkdf2Sync(secret, SALT, 100_000, 32, "sha256");
}

export interface EncryptedPayload {
  iv: string;       // base64
  authTag: string;  // base64
  ciphertext: string; // base64
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a JSON string containing iv, authTag, and ciphertext (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted,
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input is the JSON string produced by encrypt().
 */
export function decrypt(encryptedJson: string): string {
  const key = deriveKey();
  const payload: EncryptedPayload = JSON.parse(encryptedJson);

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
