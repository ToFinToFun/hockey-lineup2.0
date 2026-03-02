// Hämta anmälningsdata från laget.se via backend-API
// Backend loggar in på laget.se, hittar dagens/nästa event, och returnerar anmälda namn
// Smeknamn inom citattecken ignoreras (t.ex. Linus "The Wall" Carbin → Linus Carbin)

import type { Player } from "./players";

export interface AttendanceData {
  eventTitle: string;
  eventDate: string;
  registeredNames: string[];
  totalRegistered: number;
  error?: string;
  noEvent?: boolean;
}

/**
 * Hämta anmälningslistan från backend (som i sin tur skrapar laget.se)
 */
export async function fetchAttendanceFromApi(): Promise<AttendanceData> {
  // Försök med tRPC-backend först (Manus hosting)
  // Om det misslyckas, försök med Netlify Function
  try {
    const response = await fetch("/api/trpc/laget.attendance");
    if (response.ok) {
      const json = await response.json();
      const data = json?.result?.data?.json;
      if (data) return data as AttendanceData;
    }
  } catch {
    // tRPC inte tillgänglig, försök med Netlify Function
  }

  // Fallback: Netlify Function
  const response = await fetch("/api/laget-attendance");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data) {
    throw new Error("Oväntat svar från servern");
  }
  return data as AttendanceData;
}

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
  registeredNames: string[],
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

  for (const regName of registeredNames) {
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
