/**
 * Spelarregistret – en rad per person med fast ID.
 *
 * Registret är den enda källan för namn, nummer, position, lag, C/A och
 * medlemskap. Uppställningen, matcherna och målen lagrar bara spelar-ID och
 * hämtar uppgifterna härifrån, så ett namn- eller nummerbyte slår igenom
 * överallt och historiken följer med.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { players, matchPlayers, matchGoals, type PlayerRow } from "../drizzle/schema";

export type RegistryPlayer = PlayerRow;

export const PLAYER_FIELDS = ["name", "number", "position", "teamColor", "captainRole", "altPosition", "isMember", "active", "lagetName", "externalId", "notes"] as const;
export type PlayerFields = Partial<Pick<PlayerRow, (typeof PLAYER_FIELDS)[number]>>;

export const labelOf = (p: { name: string; number?: string | null }) => (p.number ? `${p.name} #${p.number}` : p.name);
export const normalizeName = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// ─── Cache ───────────────────────────────────────────────────────────────────

let cache: Map<string, PlayerRow> | null = null;
let checksum: string | null = null;
let lastCheck = 0;
let version = 0;
const listeners = new Set<(source: "app" | "external") => void>();

/** Anropas när registret ändrats (uppställning, statistik m.m. lyssnar). */
export function onRegistryChange(fn: (source: "app" | "external") => void) {
  listeners.add(fn);
}

function changed(source: "app" | "external") {
  cache = null;
  version++;
  for (const fn of listeners) fn(source);
}

export function getRegistryVersion() {
  return version;
}

async function load(): Promise<Map<string, PlayerRow>> {
  if (cache && Date.now() - lastCheck > 5_000) {
    lastCheck = Date.now();
    const sum = await tableChecksum("players");
    if (sum != null && checksum != null && sum !== checksum) changed("external"); // ändrat direkt i databasen
  }
  if (cache) return cache;
  const db = await getDb();
  if (!db) return new Map();
  checksum = await tableChecksum("players");
  const rows = await db.select().from(players);
  cache = new Map(rows.map((r) => [r.id, r]));
  lastCheck = Date.now();
  return cache;
}

async function afterWrite() {
  changed("app");
  checksum = await tableChecksum("players");
}

export async function getRegistryMap(): Promise<Map<string, PlayerRow>> {
  return load();
}

export async function listPlayers(): Promise<PlayerRow[]> {
  return [...(await load()).values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function getPlayer(id: string): Promise<PlayerRow | undefined> {
  return (await load()).get(id);
}

// ─── Skrivningar ─────────────────────────────────────────────────────────────

function cleanFields(fields: PlayerFields): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const key of PLAYER_FIELDS) {
    if (!(key in fields)) continue;
    let v = fields[key] as unknown;
    if (key === "name" && typeof v === "string") v = v.trim().slice(0, 120);
    if (key === "number" && typeof v === "string") v = v.trim().slice(0, 10);
    set[key] = v;
  }
  return set;
}

/** Uppdaterar flera spelare på en gång (en omladdning av cachen). */
export async function updatePlayers(changes: Array<{ id: string; fields: PlayerFields }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const map = await load();
  let any = false;
  for (const { id, fields } of changes) {
    if (!map.has(id)) continue;
    const set = cleanFields(fields);
    if (Object.keys(set).length === 0) continue;
    await db.update(players).set(set).where(eq(players.id, id));
    any = true;
  }
  if (any) await afterWrite();
}

export async function updatePlayer(id: string, fields: PlayerFields): Promise<PlayerRow | undefined> {
  await updatePlayers([{ id, fields }]);
  return (await load()).get(id);
}

export async function createPlayers(rows: Array<PlayerFields & { id?: string; name: string }>): Promise<PlayerRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  if (rows.length === 0) return [];
  const values = rows.map((row) => ({
    id: row.id ?? crypto.randomUUID(),
    name: row.name.trim().slice(0, 120),
    number: (row.number ?? "").trim().slice(0, 10),
    position: row.position ?? "F",
    teamColor: row.teamColor ?? null,
    captainRole: row.captainRole ?? null,
    altPosition: row.altPosition ?? null,
    isMember: row.isMember ?? true,
    active: row.active ?? true,
    lagetName: row.lagetName ?? null,
    externalId: row.externalId ?? null,
    notes: row.notes ?? null,
  }));
  await db.insert(players).values(values);
  await afterWrite();
  const map = await load();
  return values.map((v) => map.get(v.id)!);
}

export async function createPlayer(row: PlayerFields & { id?: string; name: string }): Promise<PlayerRow> {
  return (await createPlayers([row]))[0];
}

/**
 * Slår ihop två registreringar av samma person: all historik (matcher och mål)
 * flyttas till `intoId` och `fromId` tas bort.
 */
export async function mergePlayers(fromId: string, intoId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const map = await load();
  if (!map.has(fromId) || !map.has(intoId) || fromId === intoId) throw new Error("Ogiltig sammanslagning");
  await db.transaction(async (tx) => {
    await tx.update(matchPlayers).set({ playerId: intoId }).where(eq(matchPlayers.playerId, fromId));
    await tx.update(matchGoals).set({ scorerId: intoId }).where(eq(matchGoals.scorerId, fromId));
    await tx.update(matchGoals).set({ assistId: intoId }).where(eq(matchGoals.assistId, fromId));
    await tx.delete(players).where(eq(players.id, fromId));
  });
  await afterWrite();
}

/** Tar bort spelare helt (bara om de saknar historik). */
export async function deletePlayers(ids: string[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(players).where(inArray(players.id, ids));
  await afterWrite();
}
