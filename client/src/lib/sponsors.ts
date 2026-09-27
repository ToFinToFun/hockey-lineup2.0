/**
 * Sponsorer i klienten. Listan (med loggor och räknare) hämtas från servern
 * och sparas lokalt, så att Score Tracker kan välja sponsor utan täckning.
 */
import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { pickLeastShown, type Sponsor } from "@shared/sponsors";

export { pickLeastShown };
export type { Sponsor };

const CACHE_KEY = "stalstadens_sponsors_v1";

/** Används bara om appen aldrig har hämtat listan (första start utan nät). */
const FALLBACK: Sponsor[] = ["Polar", "lindstromstransport", "Kirunabilfrakt", "Ren"].map((name, i) => ({
  id: -(i + 1),
  name,
  logo: null,
  active: true,
  sortOrder: i + 1,
  counts: { matches: 0, lineups: 0 },
  previous: { matches: 0, lineups: 0 },
}));

function readCache(): Sponsor[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Sponsor[]) : null;
  } catch {
    return null;
  }
}

function writeCache(list: Sponsor[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Fullt lagringsutrymme: appen fungerar ändå, bara utan offline-loggor.
  }
}

/** Alla sponsorer (även inaktiva, för administration). Faller tillbaka på den lokala kopian. */
export function useSponsors() {
  const query = trpc.sponsors.list.useQuery(undefined, { staleTime: 60_000, retry: 1 });
  useEffect(() => {
    if (query.data) writeCache(query.data.sponsors);
  }, [query.data]);

  const sponsors = useMemo(() => query.data?.sponsors ?? readCache() ?? FALLBACK, [query.data]);
  return { sponsors, season: query.data?.season, query };
}

/** Logga för ett sponsornamn (t.ex. sparat på ett mål), om sponsorn har en. */
export function logoForName(sponsors: Sponsor[], name: string | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return sponsors.find((s) => s.name.trim().toLowerCase() === n)?.logo ?? null;
}
