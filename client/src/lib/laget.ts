// Hämta anmälningsdata från laget.se via tRPC backend-API
// Backend loggar in på laget.se, hittar dagens/nästa event, och returnerar anmälda namn
// Smeknamn inom citattecken ignoreras (t.ex. Linus "The Wall" Carbin → Linus Carbin)
// Inloggningsuppgifter hanteras via inställningssidan (krypterat i databasen)

import type { Player } from "./players";

export interface AttendanceData {
  eventTitle: string;
  eventDate: string;
  registeredNames: string[];
  declinedNames?: string[];
  totalRegistered: number;
  error?: string;
  noEvent?: boolean;
}

// Cache för anmälningsdata (5 minuter)
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minuter
let cachedData: AttendanceData | null = null;
let cacheTimestamp: number = 0;

/**
 * Hämta anmälningslistan från tRPC backend (som i sin tur skrapar laget.se)
 * Cachelagrar resultatet i 5 minuter för att minska belastning.
 * Skicka forceRefresh=true för att tvinga en ny hämtning.
 */
export async function fetchAttendanceFromApi(forceRefresh = false): Promise<AttendanceData> {
  // Returnera cachad data om den fortfarande är giltig
  const now = Date.now();
  if (!forceRefresh && cachedData && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedData;
  }

  const response = await fetch("/api/trpc/laget.attendance");
  const contentType = response.headers.get("content-type") || "";
  
  if (!response.ok || !contentType.includes("application/json")) {
    // Ge tydliga felmeddelanden beroende på HTTP-status
    if (response.status === 429) {
      throw new Error("RATE_LIMITED: Laget.se blockerar tillfälligt förfrågningar. Vänta en stund och försök igen.");
    }
    throw new Error(`Kunde inte hämta anmälningsdata (HTTP ${response.status})`);
  }

  const json = await response.json();
  
  // Kontrollera om det finns ett tRPC-fel (t.ex. credentials saknas)
  const trpcError = json?.error?.json?.message || json?.[0]?.error?.json?.message;
  if (trpcError) {
    throw new Error(trpcError);
  }
  
  const data = json?.result?.data?.json;
  if (!data || data.registeredNames === undefined) {
    throw new Error("Oväntat svar från servern");
  }

  cachedData = data as AttendanceData;
  cacheTimestamp = now;
  return cachedData;
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

/**
 * Matcha avböjda spelare från laget.se mot appens roster.
 * Returnerar en lista med spelar-IDs som ska markeras med rött kryss.
 */
export function matchDeclinedPlayers(
  declinedNames: string[],
  allPlayers: Player[],
  lineupPlayers: Record<string, Player>
): { matchedIds: string[] } {
  const allKnown: Player[] = [
    ...allPlayers,
    ...Object.values(lineupPlayers),
  ];
  const seen = new Set<string>();
  const unique = allKnown.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const nameMap = new Map<string, Player>();
  for (const p of unique) {
    nameMap.set(normalizeName(p.name), p);
  }

  const matchedIds: string[] = [];
  for (const name of declinedNames) {
    const normalized = normalizeName(name);
    const player = nameMap.get(normalized);
    if (player) {
      matchedIds.push(player.id);
    }
  }

  return { matchedIds };
}

/**
 * Ändra en spelares deltagarstatus på laget.se via tRPC backend-API.
 * Returnerar { success, error?, newStatus? }
 */
export async function updateAttendanceOnLaget(
  playerName: string,
  status: "Attending" | "NotAttending" | "NotAnswered"
): Promise<{ success: boolean; error?: string; newStatus?: string }> {
  try {
    const response = await fetch("/api/trpc/laget.updateAttendance?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        "0": { json: { playerName, status } },
      }),
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const result = Array.isArray(json) ? json[0] : json;
    const data = result?.result?.data?.json;
    if (data) {
      return data;
    }

    throw new Error("Oväntat svar från servern");
  } catch (err: any) {
    console.error("[Laget.se sync error]", err);
    return { success: false, error: err.message || "Kunde inte uppdatera status" };
  }
}
