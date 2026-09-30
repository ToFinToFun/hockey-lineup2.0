/**
 * Hockeykort: sparat originalfoto och val per spelare (max ett), samt
 * statistiken som visas på kortet (säsong, karriär, form).
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { playerCards } from "../drizzle/schema";
import { getAllMatchResults } from "./scoreDb";
import { playerProfile } from "./playerProfile";
import { seasonOf } from "./playerHistory";
import type { CardStats, CardStatLine } from "../shared/cardStats";

/** Max storlek på originalfotot (base64-tecken) – ca 1,1 MB JPEG. */
export const MAX_CARD_SOURCE_BASE64 = 1_500_000;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

/** Vilka spelare som har ett sparat kort (utan bilderna). */
export async function listCards(): Promise<Array<{ playerId: string; updatedAt: Date; settings: Record<string, unknown>; liveProfile: boolean }>> {
  const db = await requireDb();
  return db.select({ playerId: playerCards.playerId, updatedAt: playerCards.updatedAt, settings: playerCards.settings, liveProfile: playerCards.liveProfile }).from(playerCards);
}

/** Hela kortet (foto + val) – för att rita om profilbilden på servern. */
export async function getCardRow(playerId: string) {
  const db = await requireDb();
  const [row] = await db.select().from(playerCards).where(eq(playerCards.playerId, playerId)).limit(1);
  return row ?? null;
}

export async function listLiveProfileIds(): Promise<string[]> {
  const db = await requireDb();
  return (await db.select({ id: playerCards.playerId }).from(playerCards).where(eq(playerCards.liveProfile, true))).map((r) => r.id);
}

export async function setRenderedHash(playerId: string, hash: string | null) {
  const db = await requireDb();
  await db.update(playerCards).set({ renderedHash: hash }).where(eq(playerCards.playerId, playerId));
}

export async function getCardMask(playerId: string): Promise<{ image: Buffer; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select({ mask: playerCards.mask, updatedAt: playerCards.updatedAt }).from(playerCards).where(eq(playerCards.playerId, playerId)).limit(1);
  return row?.mask ? { image: Buffer.from(row.mask, "base64"), updatedAt: row.updatedAt } : null;
}

export async function getCardSource(playerId: string): Promise<{ image: Buffer; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select({ source: playerCards.source, updatedAt: playerCards.updatedAt }).from(playerCards).where(eq(playerCards.playerId, playerId)).limit(1);
  return row ? { image: Buffer.from(row.source, "base64"), updatedAt: row.updatedAt } : null;
}

/** Spara kortet. Utan nytt foto behålls det sparade och bara valen uppdateras. */
/**
 * maskBase64: undefined = oförändrad, null = ta bort friläggningen, sträng = ny mask.
 * Nytt foto utan ny mask tar bort den gamla masken (den hör till det gamla fotot).
 */
export async function saveCard(playerId: string, settings: Record<string, unknown>, sourceBase64?: string, liveProfile?: boolean, maskBase64?: string | null) {
  const db = await requireDb();
  // Ny ritning behövs alltid efter en ändring (renderedHash nollas)
  const mask = maskBase64 !== undefined ? { mask: maskBase64 } : sourceBase64 ? { mask: null } : {};
  const extra = { ...(liveProfile !== undefined ? { liveProfile } : {}), ...mask, renderedHash: null };
  if (sourceBase64) {
    await db.insert(playerCards).values({ playerId, source: sourceBase64, settings, liveProfile: liveProfile ?? false, mask: maskBase64 ?? null })
      .onDuplicateKeyUpdate({ set: { source: sourceBase64, settings, updatedAt: new Date(), ...extra } });
    return;
  }
  const res = await db.update(playerCards).set({ settings, updatedAt: new Date(), ...extra }).where(eq(playerCards.playerId, playerId));
  const affected = (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
  if (!affected) throw new Error("Det finns inget sparat foto för spelaren – ladda upp ett foto först.");
}

export async function deleteCard(playerId: string) {
  const db = await requireDb();
  await db.delete(playerCards).where(eq(playerCards.playerId, playerId));
}

/** Statistiken för kortet: innevarande säsong (från 1 augusti), karriär och form. */
export async function cardStats(playerId: string): Promise<CardStats> {
  const p = playerProfile(await getAllMatchResults(), playerId);
  const seasonNow = seasonOf(new Date());
  const line = (label: string, log: typeof p.matchLog): CardStatLine => {
    const goals = log.reduce((s, e) => s + e.goals, 0);
    const assists = log.reduce((s, e) => s + e.assists, 0);
    const wins = log.filter((e) => e.result === "V").length;
    const gk = log.filter((e) => e.position === "MV");
    return {
      label, matches: log.length, goals, assists, points: goals + assists, wins,
      winPct: log.length ? Math.round((wins / log.length) * 100) : 0,
      goalie: gk.length ? {
        matches: gk.length,
        gaa: Math.round((gk.reduce((s, e) => s + e.opp, 0) / gk.length) * 10) / 10,
        shutouts: gk.filter((e) => e.opp === 0).length,
      } : null,
    };
  };
  const seasonLog = p.matchLog.filter((e) => seasonOf(new Date(e.date)) === seasonNow);
  const gkShare = p.matchLog.filter((e) => e.position === "MV").length;
  return {
    season: line(seasonNow, seasonLog),
    career: line("Totalt", p.matchLog),
    form: p.form,
    isGoalie: p.matchLog.length > 0 && gkShare >= p.matchLog.length / 2,
  };
}
