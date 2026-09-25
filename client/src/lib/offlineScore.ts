/**
 * Offline-stöd för Score Tracker.
 *
 * - Senaste uppställningen sparas lokalt så att spelarna finns kvar utan nät.
 * - Matcher som inte kunde skickas läggs i en kö och skickas automatiskt
 *   när nätet är tillbaka.
 */
const LINEUP_KEY = "score-offline-lineup";
const QUEUE_KEY = "score-pending-matches";

export type PendingMatch = {
  queuedAt: number;
  payload: Record<string, unknown>;
};

export function saveLineupSnapshot(data: unknown) {
  try {
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* fullt minne – inte kritiskt */
  }
}

export function loadLineupSnapshot<T>(): { savedAt: number; data: T } | null {
  try {
    const raw = localStorage.getItem(LINEUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPendingMatches(): PendingMatch[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setPendingMatches(list: PendingMatch[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("pending-matches-changed"));
}

export function queueMatch(payload: Record<string, unknown>) {
  setPendingMatches([...getPendingMatches(), { queuedAt: Date.now(), payload }]);
}

/** Nätverksfel (inget svar från servern) – till skillnad från att servern sa nej. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const e = err as { data?: unknown; message?: string } | null;
  if (e && e.data) return false; // servern svarade med ett fel
  return true;
}

let flushing = false;
/** Skickar köade matcher en i taget. Returnerar antal som skickades. */
export async function flushPendingMatches(
  send: (payload: Record<string, unknown>) => Promise<unknown>
): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const [next, ...rest] = getPendingMatches();
      if (!next) break;
      try {
        await send(next.payload);
      } catch (err) {
        if (isNetworkError(err)) break; // fortfarande offline – försök senare
        console.error("Kö-match avvisades av servern, tas bort:", err);
      }
      setPendingMatches(rest);
      sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}
