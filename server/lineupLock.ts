/**
 * Låsta lag efter publicering: när dagens lag publicerats som nyhet på laget.se
 * sparas uppställningen som den var. Score Tracker (och därmed statistiken)
 * använder den låsta versionen även om någon ändrar i Lineup efteråt.
 * Spärren släpps efter 12 timmar, när matchen sparas (godkänd eller ej) eller
 * när någon låser upp i Lineup.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import { getLineupSnapshot } from "./lineupSync";

const KEY = "lineup_lock";
export const LOCK_HOURS = 12;

type Doc = Awaited<ReturnType<typeof getLineupSnapshot>>["doc"];

export interface LineupLock {
  lockedAt: string;
  /** Tidsinställd nyhet: när laget räknas som publicerat (annars lockedAt) */
  publishAt?: string | null;
  expiresAt: string;
  newsTitle: string | null;
  doc: Doc;
}

export async function getActiveLock(now = new Date()): Promise<LineupLock | null> {
  try {
    const raw = await getConfigValue(KEY);
    if (!raw) return null;
    const l = JSON.parse(raw) as LineupLock;
    return new Date(l.expiresAt).getTime() > now.getTime() ? l : null;
  } catch {
    return null;
  }
}

/** "2026-10-06 18:30" (laget.se:s publiceringstid, lokal tid) → Date */
export function parsePublishAt(s: string | null | undefined): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

/** När laget räknas som publicerat: den inställda tiden, annars när det låstes */
export const publishedTime = (l: LineupLock) => new Date(l.publishAt ?? l.lockedAt);

/** Lås laget som det ser ut nu (efter publicerad nyhet). publishAt = tidsinställd nyhet. */
export async function lockLineup(newsTitle: string | null, publishAt: Date | null = null): Promise<LineupLock> {
  const { doc } = await getLineupSnapshot();
  const now = new Date();
  const from = publishAt && publishAt.getTime() > now.getTime() ? publishAt : now;
  const lock: LineupLock = {
    lockedAt: now.toISOString(), publishAt: publishAt ? publishAt.toISOString() : null,
    expiresAt: new Date(from.getTime() + LOCK_HOURS * 3600_000).toISOString(), newsTitle, doc,
  };
  await setConfigValue(KEY, JSON.stringify(lock));
  return lock;
}

export async function unlockLineup() {
  await setConfigValue(KEY, "");
}

/** Skiljer sig Lineup från det låsta laget? (vem som står på vilken plats och lagnamnen) */
export function differsFromLock(live: Doc, lock: LineupLock): boolean {
  const key = (d: Doc) => JSON.stringify([d.teamAName, d.teamBName, Object.entries(d.lineup).map(([s, p]) => `${s}:${p.id}`).sort()]);
  return key(live) !== key(lock.doc);
}
