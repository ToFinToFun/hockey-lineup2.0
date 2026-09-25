/**
 * Synkmodell för laguppställningen – samma kod körs på servern och i klienten.
 *
 * Uppställningen är ett "dokument". Varje ändring skickas som små operationer
 * (flytta en spelare, byt lagnamn …) i stället för hela dokumentet. Servern
 * tillämpar operationerna i tur och ordning och skickar dem vidare till alla
 * enheter. Två personer som flyttar olika spelare samtidigt krockar därför
 * aldrig; flyttar båda samma spelare vinner den som kom sist till servern.
 *
 * Invariant som applyOps alltid upprätthåller: varje spelare finns på exakt
 * ett ställe – antingen i truppen (players) eller på en plats (lineup).
 */
import { createTeamSlots, DEFAULT_TEAM_CONFIG, type TeamConfig } from "../client/src/lib/lineup";
import type { Player } from "../client/src/lib/players";

export type { Player, TeamConfig };

export interface LineupDoc {
  players: Player[];
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
  teamAConfig: TeamConfig;
  teamBConfig: TeamConfig;
  deletedPlayerIds: string[];
}

export type FieldKey = "teamAName" | "teamBName" | "teamAConfig" | "teamBConfig" | "deletedPlayerIds";

export type LineupOp =
  /** Sätt (eller töm med null) en plats. */
  | { t: "slot"; slot: string; player: Player | null }
  /** Lägg till/uppdatera en spelare i truppen på angiven position. */
  | { t: "rosterUpsert"; player: Player; index: number }
  /** Ta bort en spelare ur truppen. */
  | { t: "rosterRemove"; id: string }
  /** Sätt ett enkelt fält (lagnamn, formation, borttagna spelare). */
  | { t: "field"; key: FieldKey; value: unknown };

export interface LineupPatch {
  /** Unikt ID som gör omförsök säkra (servern tillämpar samma patch en gång). */
  id: string;
  ops: LineupOp[];
}

export function emptyDoc(): LineupDoc {
  return {
    players: [],
    lineup: {},
    teamAName: "VITA",
    teamBName: "GRÖNA",
    teamAConfig: { ...DEFAULT_TEAM_CONFIG },
    teamBConfig: { ...DEFAULT_TEAM_CONFIG },
    deletedPlayerIds: [],
  };
}

// ─── Spelardata ───────────────────────────────────────────────────────────────

/**
 * Fält som räknas fram i klienten (PIR, vanligaste position) och som inte ska
 * synkas – annars skulle varje ny PIR-beräkning se ut som en ändring.
 */
function isDerivedKey(key: string): boolean {
  return key.startsWith("pir") || key === "mostPlayedPosition" || key === "mostPlayedTeam";
}

/** Spelaren utan framräknade fält, med nycklarna i fast ordning (stabil jämförelse). */
export function stripPlayer(p: Player): Player {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(p).sort()) {
    const value = (p as unknown as Record<string, unknown>)[key];
    if (!isDerivedKey(key) && value !== undefined) out[key] = value;
  }
  return out as unknown as Player;
}

function samePlayer(a: Player | null | undefined, b: Player | null | undefined): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return JSON.stringify(stripPlayer(a)) === JSON.stringify(stripPlayer(b));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ─── Platser ──────────────────────────────────────────────────────────────────

const slotCache = new Map<string, Set<string>>();
function validSlots(teamPrefix: "team-a" | "team-b", config: TeamConfig): Set<string> {
  const key = `${teamPrefix}:${config.goalkeepers}:${config.defensePairs}:${config.forwardLines}`;
  let set = slotCache.get(key);
  if (!set) {
    set = new Set(createTeamSlots(teamPrefix, config).map((s) => s.id));
    slotCache.set(key, set);
  }
  return set;
}

export function isValidSlot(doc: Pick<LineupDoc, "teamAConfig" | "teamBConfig">, slot: string): boolean {
  if (slot.startsWith("team-a-")) return validSlots("team-a", doc.teamAConfig).has(slot);
  if (slot.startsWith("team-b-")) return validSlots("team-b", doc.teamBConfig).has(slot);
  return false;
}

// ─── Normalisering ────────────────────────────────────────────────────────────

/**
 * Städar ett dokument (t.ex. från databasen eller en äldre klient): tar bort
 * framräknade fält, ogiltiga platser och dubbletter. En spelare som finns både
 * på en plats och i truppen behålls på platsen.
 */
export function normalizeDoc(input: Partial<LineupDoc> | null | undefined): LineupDoc {
  const base = emptyDoc();
  const doc: LineupDoc = {
    teamAName: typeof input?.teamAName === "string" ? input.teamAName : base.teamAName,
    teamBName: typeof input?.teamBName === "string" ? input.teamBName : base.teamBName,
    teamAConfig: input?.teamAConfig ?? base.teamAConfig,
    teamBConfig: input?.teamBConfig ?? base.teamBConfig,
    deletedPlayerIds: Array.isArray(input?.deletedPlayerIds) ? [...input!.deletedPlayerIds] : [],
    lineup: {},
    players: [],
  };
  const placed = new Set<string>();
  const orphans: Player[] = [];
  for (const [slot, player] of Object.entries(input?.lineup ?? {})) {
    if (!player?.id) continue;
    if (placed.has(player.id)) continue;
    if (!isValidSlot(doc, slot)) {
      orphans.push(player);
      continue;
    }
    doc.lineup[slot] = stripPlayer(player);
    placed.add(player.id);
  }
  for (const player of [...orphans, ...(input?.players ?? [])]) {
    if (!player?.id || placed.has(player.id)) continue;
    doc.players.push(stripPlayer(player));
    placed.add(player.id);
  }
  return doc;
}

// ─── Tillämpa operationer ─────────────────────────────────────────────────────

function removeFromSlots(lineup: Record<string, Player>, id: string, exceptSlot?: string) {
  for (const [slot, p] of Object.entries(lineup)) {
    if (slot !== exceptSlot && p.id === id) delete lineup[slot];
  }
}

function isPlaced(doc: LineupDoc, id: string): boolean {
  return doc.players.some((p) => p.id === id) || Object.values(doc.lineup).some((p) => p.id === id);
}

/** Flyttar spelare som hamnat på platser som inte längre finns tillbaka till truppen. */
function evictInvalidSlots(doc: LineupDoc) {
  const evicted: Player[] = [];
  for (const [slot, p] of Object.entries(doc.lineup)) {
    if (!isValidSlot(doc, slot)) {
      evicted.push(p);
      delete doc.lineup[slot];
    }
  }
  if (evicted.length) doc.players = [...evicted, ...doc.players];
}

/** Tillämpar operationer och returnerar ett nytt dokument (originalet ändras inte). */
export function applyOps(source: LineupDoc, ops: LineupOp[]): LineupDoc {
  const doc: LineupDoc = {
    ...source,
    players: [...source.players],
    lineup: { ...source.lineup },
    deletedPlayerIds: [...source.deletedPlayerIds],
  };

  for (const op of ops) {
    switch (op.t) {
      case "slot": {
        const previous = doc.lineup[op.slot];
        if (!op.player) {
          delete doc.lineup[op.slot];
          break;
        }
        const player = stripPlayer(op.player);
        if (!isValidSlot(doc, op.slot)) {
          // Platsen finns inte (t.ex. formationen minskades av någon annan) – till truppen.
          removeFromSlots(doc.lineup, player.id);
          doc.players = [player, ...doc.players.filter((p) => p.id !== player.id)];
          break;
        }
        removeFromSlots(doc.lineup, player.id, op.slot);
        doc.players = doc.players.filter((p) => p.id !== player.id);
        doc.lineup[op.slot] = player;
        // Spelaren som stod på platsen får inte försvinna.
        if (previous && previous.id !== player.id && !isPlaced(doc, previous.id)) {
          doc.players = [previous, ...doc.players];
        }
        break;
      }
      case "rosterUpsert": {
        const player = stripPlayer(op.player);
        removeFromSlots(doc.lineup, player.id);
        const rest = doc.players.filter((p) => p.id !== player.id);
        const index = Math.max(0, Math.min(op.index, rest.length));
        rest.splice(index, 0, player);
        doc.players = rest;
        break;
      }
      case "rosterRemove": {
        doc.players = doc.players.filter((p) => p.id !== op.id);
        break;
      }
      case "field": {
        (doc as unknown as Record<string, unknown>)[op.key] = op.value;
        if (op.key === "teamAConfig" || op.key === "teamBConfig") evictInvalidSlots(doc);
        break;
      }
    }
  }
  return doc;
}

// ─── Skillnader ───────────────────────────────────────────────────────────────

const FIELD_KEYS: FieldKey[] = ["teamAConfig", "teamBConfig", "teamAName", "teamBName", "deletedPlayerIds"];

/**
 * Operationerna som tar `prev` till `next`. Ordningen spelar roll:
 * formation först (så att nya platser finns), sedan platser, sist truppen.
 */
export function diffDocs(prev: LineupDoc, next: LineupDoc): LineupOp[] {
  const ops: LineupOp[] = [];

  for (const key of FIELD_KEYS) {
    if (!sameValue(prev[key], next[key])) ops.push({ t: "field", key, value: next[key] });
  }

  const slots = new Set([...Object.keys(prev.lineup), ...Object.keys(next.lineup)]);
  const clears: LineupOp[] = [];
  const sets: LineupOp[] = [];
  for (const slot of slots) {
    const a = prev.lineup[slot];
    const b = next.lineup[slot];
    if (samePlayer(a, b)) continue;
    if (b) sets.push({ t: "slot", slot, player: stripPlayer(b) });
    else clears.push({ t: "slot", slot, player: null });
  }
  ops.push(...clears, ...sets);

  const prevRoster = new Map(prev.players.map((p) => [p.id, p]));
  const nextIds = new Set(next.players.map((p) => p.id));
  for (const p of prev.players) {
    if (!nextIds.has(p.id)) ops.push({ t: "rosterRemove", id: p.id });
  }
  next.players.forEach((p, index) => {
    const before = prevRoster.get(p.id);
    if (!before || !samePlayer(before, p)) ops.push({ t: "rosterUpsert", player: stripPlayer(p), index });
  });

  return ops;
}

export function docsEqual(a: LineupDoc, b: LineupDoc): boolean {
  return diffDocs(a, b).length === 0 && a.players.map((p) => p.id).join() === b.players.map((p) => p.id).join();
}
