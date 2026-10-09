/**
 * MÅLENS ORDNING – läs detta innan du rör goalHistory / goals.
 *
 * Konvention (gäller överallt: databasen match_results.goalHistory, Score
 * Tracker, livesändningen, sparade matcher och API:erna):
 *
 *   goalHistory[0]                    = det SENASTE målet
 *   goalHistory[goalHistory.length-1] = matchens FÖRSTA mål
 *
 * Score Tracker lägger nya mål först (`[newGoal, ...goalHistory]`), och den
 * ordningen sparas som den är. Den ändras aldrig i databasen.
 *
 * Allt som behöver tidsordning (första/sista målet, ställningen efter varje mål,
 * vändningar, matchvinnande mål, mållistor i rapporter och videor) ska gå via
 * funktionerna här – aldrig egna `.reverse()`, `[0]` eller `[length - 1]` på
 * goalHistory. test/goalOrder.test.ts larmar om någon gör det ändå.
*/

import { normalizeTeamKey } from "./teams";

/** Målen i tidsordning: matchens första mål först. */
export function goalsOldestFirst<T>(goalHistory: readonly T[] | null | undefined | unknown): T[] {
  return Array.isArray(goalHistory) ? [...(goalHistory as T[])].reverse() : [];
}

/** Tillbaka till lagringsordningen (senaste först) – t.ex. när en redigerad mållista sparas. */
export function goalsForStorage<T>(oldestFirst: readonly T[]): T[] {
  return [...oldestFirst].reverse();
}

/** Matchens första mål (eller undefined). */
export function firstGoal<T>(goalHistory: readonly T[] | null | undefined | unknown): T | undefined {
  return Array.isArray(goalHistory) && goalHistory.length ? (goalHistory as T[])[goalHistory.length - 1] : undefined;
}

/** Matchens senaste/sista mål (eller undefined). */
export function lastGoal<T>(goalHistory: readonly T[] | null | undefined | unknown): T | undefined {
  return Array.isArray(goalHistory) && goalHistory.length ? (goalHistory as T[])[0] : undefined;
}

/** Index i lagringsordningen för det i:te målet i tidsordning (0 = första målet). */
export function storageIndex(goalCount: number, chronologicalIndex: number): number {
  return goalCount - 1 - chronologicalIndex;
}

/**
 * Matchvinnande mål: vinnarlagets mål nummer (förlorarens antal mål + 1), räknat
 * i tidsordning på målets lag. Returnerar index i TIDSORDNING (goalsOldestFirst),
 * eller -1 vid oavgjort / när det inte går att avgöra. Den enda GWG-regeln i appen.
 */
export function winningGoalIndex(goalHistory: readonly { team?: string | null }[] | null | undefined | unknown, whiteScore: number, greenScore: number): number {
  if (whiteScore === greenScore) return -1;
  const winner = whiteScore > greenScore ? "white" : "green";
  const loserScore = Math.min(whiteScore, greenScore);
  let n = 0;
  const chrono = goalsOldestFirst<{ team?: string | null }>(goalHistory);
  for (let i = 0; i < chrono.length; i++) {
    if (normalizeTeamKey(chrono[i].team ?? undefined) !== winner) continue;
    if (n === loserScore) return i;
    n++;
  }
  return -1;
}
