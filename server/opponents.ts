/**
 * Motståndarregistret: andra lag vi spelar mot, med logga, färg och spelare.
 * Sparas för att nästa match mot samma lag ska vara i stort sett förifylld.
 * (Steg 3 i docs/PLAN-lag-och-motstandare.md – bakom flaggan "opponents".)
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { opponents, opponentPlayers } from "../drizzle/schema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

export const MAX_OPPONENT_LOGO_BASE64 = 1_400_000;

export interface OpponentSummary {
  id: number;
  name: string;
  shortName: string | null;
  color: string;
  /** Adress till loggan (eller null) – med ?v= så att cachen byts vid ny bild */
  logoUrl: string | null;
  archived: boolean;
  playerCount: number;
}

export interface OpponentPlayer {
  id: number;
  name: string;
  number: string | null;
  position: string | null;
  active: boolean;
}

const logoUrl = (id: number, hasLogo: boolean, updatedAt: Date) => (hasLogo ? `/api/opponents/${id}/logo?v=${updatedAt.getTime()}` : null);

export async function listOpponents(includeArchived = false): Promise<OpponentSummary[]> {
  const db = await requireDb();
  const rows = await db.select({
    id: opponents.id, name: opponents.name, shortName: opponents.shortName, color: opponents.color,
    hasLogo: opponents.logoMime, archived: opponents.archived, updatedAt: opponents.updatedAt,
  }).from(opponents).orderBy(asc(opponents.name));
  const players = await db.select({ opponentId: opponentPlayers.opponentId, active: opponentPlayers.active }).from(opponentPlayers);
  const counts = new Map<number, number>();
  for (const p of players) if (p.active) counts.set(p.opponentId, (counts.get(p.opponentId) ?? 0) + 1);
  return rows
    .filter((r) => includeArchived || !r.archived)
    .map((r) => ({ id: r.id, name: r.name, shortName: r.shortName, color: r.color, logoUrl: logoUrl(r.id, !!r.hasLogo, r.updatedAt), archived: r.archived, playerCount: counts.get(r.id) ?? 0 }));
}

export async function getOpponent(id: number): Promise<(OpponentSummary & { players: OpponentPlayer[] }) | null> {
  const db = await requireDb();
  const [r] = await db.select({
    id: opponents.id, name: opponents.name, shortName: opponents.shortName, color: opponents.color,
    hasLogo: opponents.logoMime, archived: opponents.archived, updatedAt: opponents.updatedAt,
  }).from(opponents).where(eq(opponents.id, id)).limit(1);
  if (!r) return null;
  const players = await db.select({ id: opponentPlayers.id, name: opponentPlayers.name, number: opponentPlayers.number, position: opponentPlayers.position, active: opponentPlayers.active })
    .from(opponentPlayers).where(eq(opponentPlayers.opponentId, id)).orderBy(asc(opponentPlayers.name));
  return {
    id: r.id, name: r.name, shortName: r.shortName, color: r.color, logoUrl: logoUrl(r.id, !!r.hasLogo, r.updatedAt), archived: r.archived,
    playerCount: players.filter((p) => p.active).length, players,
  };
}

export async function getOpponentLogo(id: number): Promise<{ image: Buffer; mime: string; updatedAt: Date } | null> {
  const db = await requireDb();
  const [r] = await db.select({ logo: opponents.logo, mime: opponents.logoMime, updatedAt: opponents.updatedAt }).from(opponents).where(eq(opponents.id, id)).limit(1);
  return r?.logo && r.mime ? { image: Buffer.from(r.logo, "base64"), mime: r.mime, updatedAt: r.updatedAt } : null;
}

const mimeOf = (b64: string) => (b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("/9j/") ? "image/jpeg" : null);

/**
 * Skapa eller ändra. logoBase64: undefined = behåll, null = ta bort, sträng = ny logga.
 * Returnerar id.
 */
export async function saveOpponent(input: { id?: number; name: string; shortName?: string | null; color?: string; archived?: boolean; logoBase64?: string | null }): Promise<number> {
  const db = await requireDb();
  let logo: { logo: string | null; logoMime: string | null } | Record<string, never> = {};
  if (input.logoBase64 === null) logo = { logo: null, logoMime: null };
  else if (input.logoBase64) {
    const mime = mimeOf(input.logoBase64);
    if (!mime) throw new Error("Loggan måste vara PNG eller JPEG");
    logo = { logo: input.logoBase64, logoMime: mime };
  }
  const fields = {
    name: input.name.trim(),
    shortName: input.shortName?.trim() || null,
    ...(input.color ? { color: input.color } : {}),
    ...(input.archived !== undefined ? { archived: input.archived } : {}),
    ...logo,
  };
  if (input.id) {
    await db.update(opponents).set({ ...fields, updatedAt: new Date() }).where(eq(opponents.id, input.id));
    return input.id;
  }
  const [res] = await db.insert(opponents).values(fields);
  return Number((res as { insertId: number }).insertId);
}

/** Ta bort helt (bara om laget inte använts i matcher – annars arkivera). */
export async function deleteOpponent(id: number) {
  const db = await requireDb();
  await db.delete(opponentPlayers).where(eq(opponentPlayers.opponentId, id));
  await db.delete(opponents).where(eq(opponents.id, id));
}

export async function addOpponentPlayer(opponentId: number, p: { name: string; number?: string | null; position?: string | null }): Promise<number> {
  const db = await requireDb();
  const [res] = await db.insert(opponentPlayers).values({ opponentId, name: p.name.trim(), number: p.number?.trim() || null, position: p.position || null });
  return Number((res as { insertId: number }).insertId);
}

export async function updateOpponentPlayer(opponentId: number, id: number, p: { name?: string; number?: string | null; position?: string | null; active?: boolean }) {
  const db = await requireDb();
  const set: Record<string, unknown> = {};
  if (p.name !== undefined) set.name = p.name.trim();
  if (p.number !== undefined) set.number = p.number?.trim() || null;
  if (p.position !== undefined) set.position = p.position || null;
  if (p.active !== undefined) set.active = p.active;
  if (Object.keys(set).length) await db.update(opponentPlayers).set(set).where(and(eq(opponentPlayers.id, id), eq(opponentPlayers.opponentId, opponentId)));
}

export async function deleteOpponentPlayer(opponentId: number, id: number) {
  const db = await requireDb();
  await db.delete(opponentPlayers).where(and(eq(opponentPlayers.id, id), eq(opponentPlayers.opponentId, opponentId)));
}
