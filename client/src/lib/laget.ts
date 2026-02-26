// Hämta anmälningsdata från laget.se
// Fullständiga namn från "Mina anmälningar" → Översikt/Lista
// Smeknamn inom citattecken ignoreras (t.ex. Linus "The Wall" Carbin → Linus Carbin)

import type { Player } from "./players";

/** Anmälda spelare till dagens träning (26 feb 2026) */
const REGISTERED_NAMES: string[] = [
  // Ledare/tränare
  "Robert Romanowski",
  "Linus Carbin",       // Linus "The Wall" Carbin → ignorera smeknamn
  // Aktiva
  "Peter Flymalm",
  "Jimmy Andersson",
  "Oskar Brännholm Kvenås",
  "Alexander Mickelsson",
  "Rickard Holmström",
  "Pierre Schilken",
  "Vilmer Johansson Hellgren",
  "Jerry Paasovaara",
  "Tomas Johansson",
  "Johan Sandman",
  "Andreas Hietala",
  "Markus Fältö Kangastie",
  "Ludwig Rydén",
  "Daniel Pekkari",
  "Filiph Åström",
  "Joakim Brännholm",
  "Rasmus Häggqvist",
  "Viktor Lindgren",
  "Anton Åberg",
];

/**
 * Normalisera ett namn för jämförelse:
 * - Gör lowercase
 * - Ta bort smeknamn inom citattecken (t.ex. "The Wall")
 * - Trimma extra mellanslag
 */
function normalizeName(name: string): string {
  return name
    .replace(/"[^"]*"/g, "")   // Ta bort smeknamn inom citattecken
    .replace(/\s+/g, " ")       // Normalisera mellanslag
    .trim()
    .toLowerCase();
}

/**
 * Matcha anmälda spelare från laget.se mot appens roster.
 * Returnerar en lista med spelar-IDs som ska markeras som anmälda.
 */
export function matchRegisteredPlayers(
  allPlayers: Player[],
  lineupPlayers: Record<string, Player>
): { matchedIds: string[]; matchedNames: string[]; unmatchedNames: string[] } {
  // Bygg en lookup av alla spelare (trupp + lineup)
  const allKnown: Player[] = [
    ...allPlayers,
    ...Object.values(lineupPlayers),
  ];
  // Deduplicera
  const seen = new Set<string>();
  const unique = allKnown.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Bygg en map: normaliserat namn → player
  const nameMap = new Map<string, Player>();
  for (const p of unique) {
    nameMap.set(normalizeName(p.name), p);
  }

  const matchedIds: string[] = [];
  const matchedNames: string[] = [];
  const unmatchedNames: string[] = [];

  for (const regName of REGISTERED_NAMES) {
    const normalized = normalizeName(regName);
    const player = nameMap.get(normalized);
    if (player) {
      matchedIds.push(player.id);
      matchedNames.push(player.name);
    } else {
      unmatchedNames.push(regName);
    }
  }

  return { matchedIds, matchedNames, unmatchedNames };
}

export { REGISTERED_NAMES };
