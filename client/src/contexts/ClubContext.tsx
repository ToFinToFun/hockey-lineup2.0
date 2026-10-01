/**
 * Klubbens identitet i webbläsaren: hämtas från servern när appen startar och
 * läggs i club() (shared/club.ts) så att sidor och bilder använder klubbens
 * namn, lag, loggor och hallar. Tills svaret kommit gäller standardprofilen.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { club, setClub, type ClubProfile } from "@shared/club";
import { trpc } from "@/lib/trpc";

const ClubContext = createContext<ClubProfile>(club());

export function ClubProvider({ children }: { children: ReactNode }) {
  const q = trpc.club.get.useQuery(undefined, { staleTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 1 });
  const [value, setValue] = useState<ClubProfile>(club());
  useEffect(() => {
    if (!q.data) return;
    setClub(q.data.club);
    setValue(q.data.club); // renderar om sidorna med klubbens värden
  }, [q.data]);
  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

/** Klubben i en komponent (renderas om när inställningarna ändras). */
export const useClub = () => useContext(ClubContext);
