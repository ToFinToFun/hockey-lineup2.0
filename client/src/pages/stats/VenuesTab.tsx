/**
 * Statistik → Hallar: per hall (platsen från laget.se, sparad per match)
 * antal matcher, vinster per lag, mål per match och bästa poänggörare.
 */
import { Loader2, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { teamGenitive } from "@shared/teams";

type Input = { from?: string; to?: string; includeExternal?: boolean } | undefined;

export function VenuesTab({ input }: { input: Input }) {
  const q = trpc.scoreStats.venueStats.useQuery(input ?? {});
  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/40" /></div>;
  const halls = q.data ?? [];
  if (!halls.length) {
    return <p className="text-sm text-white/45 text-center py-10">Inga matcher med plats under perioden. Platsen sparas från laget.se när matchen avslutas i Score Tracker – äldre matcher kan få plats via Redigera i matchhistoriken.</p>;
  }
  return (
    <div className="space-y-3">
      {halls.map((h) => (
        <div key={h.venue} className="rounded-xl bg-[#161616] border border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-sky-300 shrink-0" />
            <p className="flex-1 text-sm font-semibold text-white truncate">{h.venue}</p>
            <span className="text-[11px] text-white/45">{h.matches} {h.matches === 1 ? "match" : "matcher"} · {h.goalsPerMatch.toString().replace(".", ",")} mål/match</span>
          </div>
          {h.whiteWins + h.greenWins + h.draws > 0 && (
            <p className="text-[11px] text-white/55">{teamGenitive("white")} vinster {h.whiteWins} · {teamGenitive("green")} vinster {h.greenWins} · oavgjort {h.draws}</p>
          )}
          {h.top.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="text-white/35 text-[10px]"><th className="text-left font-medium">Bäst i hallen</th><th className="w-8">G</th><th className="w-8">A</th><th className="w-10">P</th></tr></thead>
              <tbody>
                {h.top.map((l, i) => (
                  <tr key={l.name} className="text-white/85">
                    <td className="py-0.5 truncate max-w-[12rem]">{i === 0 ? "👑 " : ""}{l.name}</td>
                    <td className="text-center tabular-nums">{l.goals}</td>
                    <td className="text-center tabular-nums">{l.assists}</td>
                    <td className="text-center tabular-nums font-semibold">{l.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
