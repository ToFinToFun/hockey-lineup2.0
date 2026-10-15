/**
 * Spelare ↔ medlemmar i sajtens register (steg 4 i integrationen).
 *
 * Registret äger kopplingen: sajten läser appens spelarlista, föreslår och bekräftar kopplingar och
 * ber appen skapa, koppla eller uppdatera spelare. Appen läser aldrig registret och får bara medlemmens
 * id (sparas i players.externalId) och om personen är medlem – aldrig personnummer, kontaktuppgifter
 * eller avgifter.
 *
 * Medlemsmarkeringen (players.isMember, grått namn i Lineup) styrs av registret när sajten säger
 * "managed": kopplad till en medlem som inte är avslutad = medlem, allt annat = inte medlem.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { matchPlayers, matchResults, matchGoals } from "../drizzle/schema";
import { createPlayer, deletePlayers, getPlayer, listPlayers, setPlayerChangeHook, touchRegistry, updatePlayers, type PlayerFields } from "./playersDb";
import { getConfigValue, setConfigValue } from "./scoreDb";

const CONFIG_KEY = "integration.players";
let managed = false;

export async function loadPlayerLinkState() {
  try {
    const raw = await getConfigValue(CONFIG_KEY);
    managed = raw ? Boolean((JSON.parse(raw) as { managed?: boolean }).managed) : false;
  } catch {
    managed = false;
  }
}

/** Styrs medlemsmarkeringen av sajtens register? */
export function membershipManaged(): boolean {
  return managed;
}

async function setManaged(next: boolean) {
  if (next === managed) return;
  managed = next;
  await setConfigValue(CONFIG_KEY, JSON.stringify({ managed }));
  touchRegistry(); // Lineup visar låsningen direkt
  console.log(`[integration] medlemsmarkering ${managed ? "styrs av registret" : "styrs i appen"}`);
}

/** Senaste match per spelare (datum). */
async function lastPlayed(): Promise<Map<string, string>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({ playerId: matchPlayers.playerId, last: sql<string>`max(${matchResults.matchEndTime})` })
    .from(matchPlayers)
    .innerJoin(matchResults, eq(matchResults.id, matchPlayers.matchId))
    .where(sql`${matchResults.reviewStatus} <> 'rejected'`)
    .groupBy(matchPlayers.playerId);
  return new Map(rows.map((r) => [r.playerId, new Date(r.last).toISOString().slice(0, 10)]));
}

export interface LinkPlayer {
  id: string;
  name: string;
  number: string;
  position: string;
  teamColor: "white" | "green" | null;
  captainRole: "C" | "A" | null;
  altPosition: string | null;
  isMember: boolean;
  active: boolean;
  memberId: number | null;
  lastPlayed: string | null;
  updatedAt: string;
}

const memberIdOf = (externalId: string | null) => {
  const n = Number(externalId);
  return externalId && Number.isInteger(n) && n > 0 ? n : null;
};

export async function playersForSite(): Promise<{ managed: boolean; players: LinkPlayer[] }> {
  const [rows, last] = await Promise.all([listPlayers(), lastPlayed()]);
  return {
    managed,
    players: rows.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      teamColor: (p.teamColor as LinkPlayer["teamColor"]) ?? null,
      captainRole: (p.captainRole as LinkPlayer["captainRole"]) ?? null,
      altPosition: p.altPosition ?? null,
      isMember: p.isMember,
      active: p.active,
      memberId: memberIdOf(p.externalId),
      lastPlayed: last.get(p.id) ?? null,
      updatedAt: new Date(p.updatedAt).toISOString(),
    })),
  };
}

export interface HockeyFields {
  name?: string;
  number?: string;
  position?: "MV" | "B" | "C" | "F" | "IB";
  teamColor?: "white" | "green" | null;
  captainRole?: "C" | "A" | null;
  altPosition?: "MV" | "B" | "C" | "F" | null;
}

// Ändringar som kommer från sajten ska inte skickas tillbaka dit
let fromSite = 0;
async function asSite<T>(fn: () => Promise<T>): Promise<T> {
  fromSite++;
  try {
    return await fn();
  } finally {
    fromSite--;
  }
}

const SYNCED = ["teamColor", "position", "altPosition", "captainRole"];
/** Lag, position, alt. position eller roll ändrad i appen på en kopplad spelare → säg till sajten. */
setPlayerChangeHook((changes) => {
  if (fromSite || !managed) return;
  for (const c of changes) {
    const memberId = memberIdOf(c.before.externalId);
    if (memberId === null || !c.fields.some((f) => SYNCED.includes(f))) continue;
    void (async () => {
      const p = await getPlayer(c.before.id);
      if (!p) return;
      const { siteRequest, integrationConfigured } = await import("./integration");
      if (!integrationConfigured()) return;
      await siteRequest("POST", "/internal/v1/players/changed", {
        playerId: p.id,
        memberId,
        values: { teamColor: p.teamColor ?? null, position: p.position, altPosition: p.altPosition ?? null, captainRole: p.captainRole ?? null },
        at: new Date().toISOString(),
      });
    })().catch((e) => console.warn("[integration] kunde inte meddela sajten om spelarändring:", (e as Error).message));
  }
});

/** Skapar en spelare för en medlem (aktiv i truppen). Returnerar spelarens id. */
export async function createForMember(input: { memberId: number; name: string; isMember: boolean } & HockeyFields): Promise<string> {
  const existing = (await listPlayers()).find((p) => memberIdOf(p.externalId) === input.memberId);
  if (existing) return existing.id;
  const row = await asSite(() => createPlayer({
    name: input.name,
    number: input.number ?? "",
    position: input.position ?? "IB",
    teamColor: input.teamColor ?? null,
    captainRole: input.captainRole ?? null,
    altPosition: input.altPosition ?? null,
    isMember: input.isMember,
    active: true,
    externalId: String(input.memberId),
  }));
  console.log(`[integration] spelare skapad för medlem ${input.memberId}: ${row.name}`);
  return row.id;
}

/** Kopplar (eller kopplar loss, memberId null) en spelare. En medlem kan bara ha en spelare. */
export async function linkPlayer(playerId: string, memberId: number | null, isMember: boolean | null, fields: HockeyFields = {}) {
  const all = await listPlayers();
  const player = all.find((p) => p.id === playerId);
  if (!player) throw new Error("Spelaren finns inte i appen");
  const changes: Array<{ id: string; fields: PlayerFields }> = [];
  if (memberId !== null) {
    for (const other of all) {
      if (other.id !== playerId && memberIdOf(other.externalId) === memberId) changes.push({ id: other.id, fields: { externalId: null, ...(managed ? { isMember: false } : {}) } });
    }
  }
  const set: PlayerFields = { externalId: memberId === null ? null : String(memberId), ...fields };
  if (isMember !== null && (managed || memberId !== null)) set.isMember = isMember;
  if (memberId !== null) set.active = true;
  changes.push({ id: playerId, fields: set });
  await asSite(() => updatePlayers(changes));
}

/** Uppdaterar hockeyuppgifter på en kopplad spelare (val i registrets guide). */
export async function updateHockeyFields(playerId: string, fields: HockeyFields) {
  const p = await getPlayer(playerId);
  if (!p) throw new Error("Spelaren finns inte i appen");
  await asSite(() => updatePlayers([{ id: playerId, fields }]));
}

/**
 * Medlemsmarkeringen enligt registret. `members` = spelar-id → medlem (kopplade spelare).
 * Okopplade spelare markeras som icke-medlemmar. managed=false lämnar markeringen till appen.
 */
export async function applyMembership(next: boolean, members: Record<string, boolean>) {
  await setManaged(next);
  if (!next) return { changed: 0 };
  const changes: Array<{ id: string; fields: PlayerFields }> = [];
  for (const p of await listPlayers()) {
    const want = memberIdOf(p.externalId) !== null && members[p.id] === true;
    const fields: PlayerFields = {};
    if (p.isMember !== want) fields.isMember = want;
    // Medlemmar finns alltid i truppen
    if (want && !p.active) fields.active = true;
    if (Object.keys(fields).length) changes.push({ id: p.id, fields });
  }
  await asSite(() => updatePlayers(changes));
  return { changed: changes.length };
}

/** Har spelaren registrerade matcher eller mål? Då går den inte att ta bort (historiken). */
export async function hasHistory(playerId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const [m] = await db.select({ id: matchPlayers.id }).from(matchPlayers).where(eq(matchPlayers.playerId, playerId)).limit(1);
  if (m) return true;
  const [g] = await db
    .select({ id: matchGoals.id })
    .from(matchGoals)
    .where(sql`${matchGoals.scorerId} = ${playerId} or ${matchGoals.assistId} = ${playerId}`)
    .orderBy(desc(matchGoals.id))
    .limit(1);
  return Boolean(g);
}

/** Tar bort en spelare som inte är kopplad till registret och saknar historik. */
export async function removeUnlinkedPlayer(playerId: string) {
  const p = (await listPlayers()).find((x) => x.id === playerId);
  if (!p) throw new Error("Spelaren finns inte");
  if (memberIdOf(p.externalId) !== null) throw new Error("Spelaren är kopplad till medlemsregistret och kan inte tas bort här.");
  if (await hasHistory(playerId)) throw new Error("Spelaren har matcher i historiken. Inaktivera eller slå ihop i stället, så att målen och statistiken finns kvar.");
  await deletePlayers([playerId]);
}
