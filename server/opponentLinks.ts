/**
 * Delningslänk för motståndaren: laget fyller i/ändrar sitt namn, logga och
 * spelare och gör sin uppställning själv – utan inloggning. Valfritt om de
 * får se vårt lag. Länkarna sparas i app_config "opponent_links".
 */
import type { LineupOp } from "../shared/lineupDoc";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { getDb } from "./db";
import { opponents } from "../drizzle/schema";
import { getOpponent } from "./opponents";
import { applyLineupPatch, getLineupSnapshot, refreshOpponentPlayers } from "./lineupSync";
import { opponentPlayerId, opponentPlayerDbId, isOpponentPlayerId } from "../shared/matchSetup";
import { createTeamSlots, MAX_TEAM_CONFIG, type TeamConfig } from "../client/src/lib/lineup";
import { club } from "../shared/club";

/** Vad laget får se av vårt lag: uppställningen, bara spelarna (lista) eller inget */
export type OurTeamView = "lineup" | "players" | "none";

export interface OpponentLink {
  token: string;
  opponentId: number;
  /** Äldre länkar: true = uppställningen. Nya länkar har ourView. */
  showOurTeam: boolean;
  ourView?: OurTeamView;
  /** Matchdagen ("YYYY-MM-DD") – länken slutar gälla ett dygn efter */
  matchDate?: string | null;
  createdAt: string;
  expiresAt: string;
}

const KEY = "opponent_links";

async function readLinks(): Promise<OpponentLink[]> {
  try {
    const raw = await getConfigValue(KEY);
    const list = raw ? (JSON.parse(raw) as OpponentLink[]) : [];
    return list.filter((l) => new Date(l.expiresAt).getTime() > Date.now());
  } catch {
    return [];
  }
}
const writeLinks = (l: OpponentLink[]) => setConfigValue(KEY, JSON.stringify(l));

export const ourViewOf = (l: Pick<OpponentLink, "showOurTeam" | "ourView">): OurTeamView => l.ourView ?? (l.showOurTeam ? "lineup" : "none");

/**
 * När länken slutar gälla: ett dygn efter matchdagen (vid midnatt efter dagen
 * efter matchen), annars efter ett antal dagar. Exporteras för test.
 */
export function linkExpiry(opts: { matchDate?: string | null; days?: number }, now = new Date()): Date {
  const m = opts.matchDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3] + 2, 0, 0, 0);
  return new Date(now.getTime() + (opts.days ?? 7) * 86_400_000);
}

export async function createOpponentLink(opponentId: number, ourView: OurTeamView, opts: { days?: number; matchDate?: string | null } = {}): Promise<OpponentLink> {
  const expires = linkExpiry(opts);
  if (expires.getTime() <= Date.now()) throw new Error("Matchdagen har redan passerat");
  const link: OpponentLink = {
    token: randomBytes(18).toString("base64url"),
    opponentId, showOurTeam: ourView !== "none", ourView,
    createdAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
    matchDate: opts.matchDate ?? null,
  };
  await writeLinks([...(await readLinks()), link]);
  return link;
}

export async function listOpponentLinks(opponentId: number): Promise<OpponentLink[]> {
  return (await readLinks()).filter((l) => l.opponentId === opponentId);
}

export async function revokeOpponentLink(token: string) {
  await writeLinks((await readLinks()).filter((l) => l.token !== token));
}

/** Giltig länk eller fel. */
export async function resolveLink(token: string): Promise<OpponentLink> {
  const l = (await readLinks()).find((x) => x.token === token);
  if (!l) throw new Error("Länken är ogiltig eller har gått ut");
  return l;
}

/** Är Lineup just nu inställd på en match mot det här laget? */
async function liveFor(opponentId: number) {
  const { doc } = await getLineupSnapshot();
  return doc.setup.mode === "external" && doc.setup.opponentId === opponentId ? doc : null;
}

/** Allt laget behöver på länksidan. */
export async function linkView(token: string) {
  const link = await resolveLink(token);
  const o = await getOpponent(link.opponentId);
  if (!o) throw new Error("Laget finns inte längre");
  const live = await liveFor(link.opponentId);
  const config: TeamConfig = live?.teamBConfig ?? MAX_TEAM_CONFIG;
  // Lagets uppställning: den aktuella i Lineup om matchen är vald, annars lagets sparade
  const stored = await storedLineup(link.opponentId);
  const lineup: Record<string, number> = live
    ? Object.fromEntries(Object.entries(live.lineup).filter(([k, p]) => k.startsWith("team-b-") && isOpponentPlayerId(p.id)).map(([k, p]) => [k, opponentPlayerDbId(p.id)]))
    : stored;
  const ourView = ourViewOf(link);
  const ourPlaced = live ? Object.entries(live.lineup).filter(([k]) => k.startsWith("team-a-")) : [];
  const ours = live && ourView !== "none"
    ? {
      name: live.teamAName,
      config: live.teamAConfig,
      // "players": bara vilka som spelar (ingen plats) – platserna skickas inte alls
      lineup: ourView === "lineup" ? Object.fromEntries(ourPlaced.map(([k, p]) => [k, { name: p.name, number: p.number ?? "", position: p.position }])) : {},
      players: ourView === "players" ? ourPlaced.map(([, p]) => ({ name: p.name, number: p.number ?? "", position: p.position as string })) : [],
    }
    : null;
  return {
    club: { name: club().name, logo: club().logo },
    showOurTeam: ourView !== "none",
    ourView,
    expiresAt: link.expiresAt,
    live: !!live,
    opponent: { id: o.id, name: o.name, shortName: o.shortName, color: o.color, logoUrl: o.logoUrl, players: o.players.filter((p) => p.active) },
    config,
    lineup,
    // Laget som lista (utan platser): den aktuella i Lineup om matchen är vald, annars lagets sparade
    list: live ? (Array.isArray(live.setup.oppList) ? live.setup.oppList : null) : await storedList(link.opponentId),
    ours,
  };
}

async function storedList(opponentId: number): Promise<number[] | null> {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select({ list: opponents.lineupList }).from(opponents).where(eq(opponents.id, opponentId)).limit(1);
  return Array.isArray(r?.list) ? r!.list : null;
}

/** Lagets sparade lista (för Lineup när laget väljs). null = platser. */
export const getStoredOpponentList = storedList;

export async function setStoredOpponentList(opponentId: number, ids: number[] | null) {
  const db = await getDb();
  if (db) await db.update(opponents).set({ lineupList: ids }).where(eq(opponents.id, opponentId));
}

/**
 * Laget som lista eller platser (via länken). Sparas på laget och – om Lineup
 * är inställd på matchen mot laget – direkt i den aktuella uppställningen.
 * Till lista: lagets platser töms.
 */
export async function setLinkList(token: string, ids: number[] | null) {
  const link = await resolveLink(token);
  const o = await getOpponent(link.opponentId);
  if (!o) throw new Error("Laget finns inte längre");
  const valid = new Set(o.players.filter((p) => p.active).map((p) => p.id));
  const clean = ids === null ? null : [...new Set(ids)].filter((id) => valid.has(id)).slice(0, 60);
  await setStoredOpponentList(link.opponentId, clean);
  const live = await liveFor(link.opponentId);
  if (live) {
    const ops: LineupOp[] = [];
    if (clean !== null && !Array.isArray(live.setup.oppList)) {
      for (const k of Object.keys(live.lineup)) if (k.startsWith("team-b-")) ops.push({ t: "slot", slot: k, player: null });
    }
    ops.push({ t: "field", key: "setup", value: { ...live.setup, oppList: clean } });
    await applyLineupPatch(`opplink-list-${token.slice(0, 6)}-${Date.now()}`, ops);
  }
}

async function storedLineup(opponentId: number): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const [r] = await db.select({ lineup: opponents.lineup }).from(opponents).where(eq(opponents.id, opponentId)).limit(1);
  return (r?.lineup as Record<string, number> | null) ?? {};
}

/**
 * Sätt/töm en plats i lagets uppställning. Sparas på laget och – om Lineup är
 * inställd på matchen mot laget – direkt i den aktuella uppställningen.
 */
export async function setLinkSlot(token: string, slot: string, playerId: number | null) {
  const link = await resolveLink(token);
  if (!/^team-b-/.test(slot) || !createTeamSlots("team-b", MAX_TEAM_CONFIG).some((s) => s.id === slot)) throw new Error("Ogiltig plats");
  const o = await getOpponent(link.opponentId);
  if (!o) throw new Error("Laget finns inte längre");
  const player = playerId ? o.players.find((p) => p.id === playerId && p.active) : null;
  if (playerId && !player) throw new Error("Spelaren finns inte i laget");

  const stored = await storedLineup(link.opponentId);
  for (const [k, v] of Object.entries(stored)) if (v === playerId) delete stored[k];
  if (playerId) stored[slot] = playerId; else delete stored[slot];
  const db = await getDb();
  if (db) await db.update(opponents).set({ lineup: stored }).where(eq(opponents.id, link.opponentId));

  if (await liveFor(link.opponentId)) {
    await applyLineupPatch(`opplink-${token.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, [{
      t: "slot", slot,
      player: player ? { id: opponentPlayerId(player.id), name: player.name, number: player.number ?? "", position: (player.position || "F") as never, isOpponent: true } : null,
    }]);
  }
}

/** Efter ändrade spelare: uppdatera namnen i den aktuella uppställningen. */
export async function afterLinkPlayerChange(opponentId: number) {
  if (await liveFor(opponentId)) await refreshOpponentPlayers();
}

/** Lagets sparade uppställning (för Lineup när laget väljs). */
export const getStoredOpponentLineup = storedLineup;

/** Spara lagets uppställning (t.ex. från en spelad match). */
export async function setStoredOpponentLineup(opponentId: number, lineup: Record<string, number>) {
  const db = await getDb();
  if (db) await db.update(opponents).set({ lineup }).where(eq(opponents.id, opponentId));
}
