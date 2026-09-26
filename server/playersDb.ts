/**
 * Spelarregistret – en rad per person med fast ID.
 *
 * - Registret är källan för namn, nummer, position, lag, C/A och medlemskap.
 * - Uppställningen (lineup_state) har kopior av spelarna; lineupSync håller
 *   dem i synk åt båda hållen.
 * - Statistik och PIR läser matcher via `canonicalizeMatch`, som byter ut
 *   gamla namn/nummer mot spelarens nuvarande uppgifter via ID. Byter någon
 *   namn eller nummer följer hela historiken med.
 */
import { eq } from "drizzle-orm";
import { getDb, tableChecksum } from "./db";
import { players, type PlayerRow, type MatchResult } from "../drizzle/schema";

export type RegistryPlayer = PlayerRow;

export const PLAYER_FIELDS = ["name", "number", "position", "teamColor", "captainRole", "isMember", "active", "lagetName", "externalId", "notes"] as const;
export type PlayerFields = Partial<Pick<PlayerRow, (typeof PLAYER_FIELDS)[number]>>;

const labelOf = (p: { name: string; number?: string | null }) => (p.number ? `${p.name} #${p.number}` : p.name);
export const normalizeName = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// ─── Cache ───────────────────────────────────────────────────────────────────

let cache: Map<string, PlayerRow> | null = null;
let checksum: string | null = null;
let lastCheck = 0;
let version = 0;
const listeners = new Set<() => void>();

/** Anropas när registret ändrats (statistikcachen m.m. lyssnar). */
export function onRegistryChange(fn: () => void) {
  listeners.add(fn);
}

function changed() {
  cache = null;
  version++;
  for (const fn of listeners) fn();
}

export function getRegistryVersion() {
  return version;
}

async function load(): Promise<Map<string, PlayerRow>> {
  if (cache && Date.now() - lastCheck > 5_000) {
    lastCheck = Date.now();
    const sum = await tableChecksum("players");
    if (sum != null && checksum != null && sum !== checksum) changed(); // ändrat direkt i databasen
  }
  if (cache) return cache;
  const db = await getDb();
  if (!db) return new Map();
  checksum = await tableChecksum("players");
  const rows = await db.select().from(players);
  cache = new Map(rows.map((r) => [r.id, { ...r, aliases: r.aliases ?? [] }]));
  lastCheck = Date.now();
  return cache;
}

export async function listPlayers(): Promise<PlayerRow[]> {
  return [...(await load()).values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function getPlayer(id: string): Promise<PlayerRow | undefined> {
  return (await load()).get(id);
}

/** Följer sammanslagningar till den spelare som gäller nu. */
export function resolveId(map: Map<string, PlayerRow>, id: string): string {
  let current = map.get(id);
  for (let i = 0; current?.mergedInto && i < 10; i++) current = map.get(current.mergedInto);
  return current?.id ?? id;
}

// ─── Skrivningar ─────────────────────────────────────────────────────────────

/** Uppdaterar en spelare. Gammalt namn/nummer sparas som alias. */
export async function updatePlayer(id: string, fields: PlayerFields): Promise<PlayerRow | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const current = (await load()).get(id);
  if (!current) return undefined;
  const next = { ...current, ...fields };
  const aliases = [...(current.aliases ?? [])];
  if (next.name !== current.name || next.number !== current.number) {
    for (const old of [labelOf(current), current.name]) {
      if (old && !aliases.includes(old) && old !== next.name && old !== labelOf(next)) aliases.push(old);
    }
  }
  const set: Record<string, unknown> = { aliases };
  for (const key of PLAYER_FIELDS) if (key in fields) set[key] = fields[key];
  await db.update(players).set(set).where(eq(players.id, id));
  changed();
  checksum = await tableChecksum("players");
  return (await load()).get(id);
}

export async function createPlayer(row: PlayerFields & { id?: string; name: string }): Promise<PlayerRow> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const id = row.id ?? crypto.randomUUID();
  await db.insert(players).values({
    id,
    name: row.name.trim().slice(0, 120),
    number: (row.number ?? "").trim().slice(0, 10),
    position: row.position ?? "F",
    teamColor: row.teamColor ?? null,
    captainRole: row.captainRole ?? null,
    isMember: row.isMember ?? true,
    active: row.active ?? true,
    lagetName: row.lagetName ?? null,
    externalId: row.externalId ?? null,
    notes: row.notes ?? null,
    aliases: [],
  });
  changed();
  checksum = await tableChecksum("players");
  return (await load()).get(id)!;
}

/**
 * Slår ihop två spelare (samma person). `fromId` pekar därefter på `intoId`,
 * och all historik räknas på `intoId`.
 */
export async function mergePlayers(fromId: string, intoId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  const map = await load();
  const from = map.get(fromId);
  const into = map.get(resolveId(map, intoId));
  if (!from || !into || from.id === into.id) throw new Error("Ogiltig sammanslagning");
  const aliases = [...new Set([...(into.aliases ?? []), ...(from.aliases ?? []), labelOf(from), from.name])].filter(
    (a) => a !== into.name && a !== labelOf(into)
  );
  await db.update(players).set({ aliases }).where(eq(players.id, into.id));
  await db.update(players).set({ mergedInto: into.id, active: false }).where(eq(players.id, from.id));
  // Kedjor: de som var ihopslagna med `from` pekar nu på `into`.
  for (const p of map.values()) {
    if (p.mergedInto === from.id) await db.update(players).set({ mergedInto: into.id }).where(eq(players.id, p.id));
  }
  changed();
  checksum = await tableChecksum("players");
}

// ─── Kanonisering av matchdata ───────────────────────────────────────────────

type GoalEvent = { scorer?: string; assist?: string; scorerId?: string; assistId?: string; [k: string]: unknown };

/**
 * Matchen med spelarnas nuvarande namn och nummer (via ID) och målskyttar
 * kopplade till dem. Matchdatan i databasen ändras inte.
 */
export function canonicalizeMatch(match: MatchResult, map: Map<string, PlayerRow>): MatchResult {
  if (map.size === 0) return match;
  const lineupWrap = match.lineup as { lineup?: Record<string, Record<string, unknown>> } | null;
  const labelToId = new Map<string, string>();
  let lineup = lineupWrap;
  if (lineupWrap?.lineup) {
    const slots: Record<string, Record<string, unknown>> = {};
    for (const [slot, p] of Object.entries(lineupWrap.lineup)) {
      if (!p || typeof p !== "object" || !p.id) {
        slots[slot] = p;
        continue;
      }
      const oldLabel = labelOf(p as { name: string; number?: string });
      const id = resolveId(map, String(p.id));
      const reg = map.get(id);
      labelToId.set(normalizeName(oldLabel), id);
      labelToId.set(normalizeName(String(p.name)), id);
      slots[slot] = reg ? { ...p, id, name: reg.name, number: reg.number } : p;
    }
    lineup = { ...lineupWrap, lineup: slots };
  }

  const goals = (match.goalHistory as GoalEvent[] | null)?.map((g) => {
    const out = { ...g };
    for (const [field, idField] of [["scorer", "scorerId"], ["assist", "assistId"]] as const) {
      const rawId = g[idField] ?? (g[field] ? labelToId.get(normalizeName(g[field])) : undefined);
      if (!rawId) continue;
      const id = resolveId(map, rawId);
      const reg = map.get(id);
      if (reg) {
        out[idField] = id;
        out[field] = labelOf(reg);
      }
    }
    return out;
  }) ?? null;

  return { ...match, lineup: lineup as MatchResult["lineup"], goalHistory: goals as MatchResult["goalHistory"] };
}

export async function getRegistryMap(): Promise<Map<string, PlayerRow>> {
  return load();
}

/** Spelarens data som den ska se ut i uppställningen. */
export function toLineupFields(row: PlayerRow) {
  return {
    name: row.name,
    number: row.number,
    position: row.position,
    teamColor: row.teamColor ?? null,
    captainRole: row.captainRole ?? null,
    isMember: row.isMember,
    lagetName: row.lagetName ?? undefined,
  };
}
