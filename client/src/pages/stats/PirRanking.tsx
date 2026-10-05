/**
 * PIR-ranking i statistiken: utespelare och målvakter som vanliga topplistor.
 * Bara spelare med betyg (minst 3 matcher i rollen). Modellen finns under Inställningar.
 */
import { useState } from "react";
import { Gauge } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { TrendIcon } from "@/components/PlayerCard";

type Rating = inferRouterOutputs<AppRouter>["pir"]["getRatings"][number];

export default function PirRanking({ ratings, onPlayerClick, role: fixedRole }: { ratings: Rating[] | undefined; onPlayerClick: (name: string) => void; role?: "outfield" | "goalkeeper" }) {
  const [ownRole, setRole] = useState<"outfield" | "goalkeeper">("outfield");
  const role = fixedRole ?? ownRole;
  const [showAll, setShowAll] = useState(false);
  if (!ratings) return null;

  const rows = ratings
    .map((r) => ({
      r,
      value: role === "outfield" ? r.outfieldRating : r.goalkeeperRating,
      trend: role === "outfield" ? r.outfieldTrendLabel : r.goalkeeperTrendLabel,
      matches: role === "outfield" ? r.outfieldMatchesPlayed : r.goalkeeperMatchesPlayed,
    }))
    .filter((x) => x.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number));
  const shown = showAll ? rows : rows.slice(0, 10);

  return (
    <section className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#ECEDEE] text-sm font-semibold flex items-center gap-2">
          <Gauge size={14} className="text-amber-400" /> PIR-ranking
        </h3>
        {!fixedRole && (
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px]">
            {([["outfield", "Utespelare"], ["goalkeeper", "Målvakter"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setRole(k)} className={`px-2.5 py-1 rounded-md ${role === k ? "bg-white/15 text-white" : "text-white/50"}`}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-white/40">Ingen har betyg i rollen ännu (kräver 3 matcher).</p>
      ) : (
        <>
          <ol className="space-y-1">
            {shown.map(({ r, value, trend, matches }, i) => (
              <li key={r.playerKey} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-right text-white/35 tabular-nums">{i + 1}</span>
                <button onClick={() => onPlayerClick(r.label)} className="flex-1 min-w-0 truncate text-left text-white/85 hover:text-sky-300">{r.name}</button>
                <span className="text-white/35 tabular-nums">{matches} m</span>
                <TrendIcon trendLabel={trend} matchesPlayed={matches} />
                <span className={`w-12 text-right font-bold tabular-nums ${(value as number) >= 1050 ? "text-amber-300" : (value as number) >= 1000 ? "text-white" : "text-sky-300/80"}`}>{value}</span>
              </li>
            ))}
          </ol>
          {rows.length > 10 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[11px] text-sky-300/80 hover:text-sky-200">
              {showAll ? "Visa topp 10" : `Visa alla ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
