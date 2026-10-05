/**
 * Statistik → Hallar: per hall (platsen från laget.se, sparad per match)
 * antal matcher, vinster per lag, mål per match, bästa målvakt och en
 * sorterbar lista över poänggörarna i hallen.
 */
import { Loader2, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { teamGenitive } from "@shared/teams";
import { HockeyGoal } from "@/components/score/HockeyIcons";
import { StatTable } from "./StatTable";

type Input = { from?: string; to?: string; includeExternal?: boolean } | undefined;
type Line = { name: string; goals: number; assists: number; points: number };

/** Bästa målvakten i hallen: lägst insläppta/60 (minst 30 min i mål), annars flest vinster. */
function HallGoalie({ input, venue }: { input: Input; venue: string }) {
  const q = trpc.scoreStats.iceTime.useQuery({ ...(input ?? {}), venue });
  const gks = (q.data ?? []).filter((r) => r.byPos.MV > 0);
  if (!gks.length) return null;
  const best = [...gks].sort((a, b) => (a.ga60 ?? 99) - (b.ga60 ?? 99) || b.gkWins - a.gkWins)[0];
  return (
    <p className="text-[11px] text-white/60 flex items-center gap-1.5">
      <HockeyGoal size={13} className="text-orange-400 shrink-0" />
      <span>Bäst målvakt i hallen: <b className="text-white/85 font-semibold">{best.name}</b>
        {" "}– {best.ga60 != null ? `${best.ga60.toString().replace(".", ",")} insl./60 · ` : ""}{best.gkWins} V · {best.shutouts} {best.shutouts === 1 ? "nolla" : "nollor"} ({best.gkMatches} {best.gkMatches === 1 ? "match" : "matcher"})
      </span>
    </p>
  );
}

export function VenuesTab({ input }: { input: Input }) {
  const q = trpc.scoreStats.venueStats.useQuery(input ?? {});
  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/40" /></div>;
  const halls = q.data ?? [];
  if (!halls.length) {
    return <p className="text-sm text-white/45 text-center py-10">Inga matcher med plats under perioden. Platsen sparas från laget.se när matchen avslutas i Score Tracker – äldre matcher kan få plats under Redigera i matchhistoriken.</p>;
  }
  return (
    <div className="space-y-4">
      {halls.map((h) => (
        <div key={h.venue} className="rounded-xl bg-[#121212] border border-white/10 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-sky-300 shrink-0" />
            <p className="flex-1 text-sm font-semibold text-white truncate">{h.venue}</p>
            <span className="text-[11px] text-white/45">{h.matches} {h.matches === 1 ? "match" : "matcher"} · {h.goalsPerMatch.toString().replace(".", ",")} mål/match</span>
          </div>
          {h.whiteWins + h.greenWins + h.draws > 0 && (
            <p className="text-[11px] text-white/55">{teamGenitive("white")} vinster {h.whiteWins} · {teamGenitive("green")} vinster {h.greenWins} · oavgjort {h.draws}</p>
          )}
          <HallGoalie input={input} venue={h.venue} />
          {h.top.length > 0 && (
            <StatTable<Line>
              rows={h.top as Line[]}
              rowKey={(r) => r.name}
              name={(r) => r.name}
              defaultSort="p"
              initial={5}
              columns={[
                { key: "m", label: "M", title: "Mål", value: (r) => r.goals },
                { key: "a", label: "A", title: "Assist", value: (r) => r.assists },
                { key: "p", label: "P", title: "Poäng", value: (r) => r.points },
              ]}
            />
          )}
        </div>
      ))}
    </div>
  );
}
