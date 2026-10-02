/**
 * Statistik → Motståndare: resultat mot varje lag vi mött (V/O/F, målskillnad,
 * senaste mötet), våra bästa poänggörare mot laget och deras målskyttar mot oss.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { teamInitials } from "@shared/teams";
import { club } from "@shared/club";

type Range = { from?: string; to?: string } | undefined;

export function OpponentsTab({ dateFilter }: { dateFilter: Range }) {
  const q = trpc.scoreStats.opponentRecords.useQuery(dateFilter ?? {});
  const [open, setOpen] = useState<number | null>(null);
  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/40" /></div>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-white/45 text-center py-10">Inga matcher mot andra lag under perioden.</p>;

  const total = rows.reduce((t, r) => ({ m: t.m + r.matches, w: t.w + r.wins, d: t.d + r.draws, l: t.l + r.losses, gf: t.gf + r.goalsFor, ga: t.ga + r.goalsAgainst }), { m: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[#161616] border border-white/10 p-3 grid grid-cols-4 text-center">
        {[["Matcher", total.m], ["Vinster", total.w], ["Oavgjorda", total.d], ["Förluster", total.l]].map(([l, v]) => (
          <div key={l as string}><p className="text-xl font-bold text-white">{v}</p><p className="text-[10px] text-white/45 uppercase tracking-wider">{l}</p></div>
        ))}
        <p className="col-span-4 text-[11px] text-white/45 mt-2">Mål {total.gf}–{total.ga} ({total.gf - total.ga >= 0 ? "+" : ""}{total.gf - total.ga})</p>
      </div>

      {rows.map((r) => {
        const isOpen = open === r.opponentId;
        const diff = r.goalsFor - r.goalsAgainst;
        return (
          <div key={r.opponentId} className="rounded-xl bg-[#161616] border border-white/10 overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : r.opponentId)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
              {r.logoUrl ? <img src={r.logoUrl} alt="" className="w-9 h-9 object-contain shrink-0" />
                : <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: r.color }}>{teamInitials(r.name)}</span>}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white truncate">{r.name}</span>
                <span className="block text-[11px] text-white/45">
                  {r.matches} {r.matches === 1 ? "match" : "matcher"} · {r.wins}–{r.draws}–{r.losses} · mål {r.goalsFor}–{r.goalsAgainst} ({diff >= 0 ? "+" : ""}{diff})
                </span>
              </span>
              {isOpen ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-2">
                {r.last && <p className="text-[11px] text-white/50">Senaste mötet: {r.last.name.replace(/\s\d+-\d+$/, "")} · {club().shortName || club().name} {r.last.us}–{r.last.them} {r.name}</p>}
                <ScorerList title={`${club().name} mot ${r.name}`} lines={r.ourScorers} />
                <ScorerList title={`${r.name} mot oss`} lines={r.theirScorers} empty="Inga mål eller assist mot oss" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScorerList({ title, lines, empty = "Inga poäng" }: { title: string; lines: Array<{ name: string; goals: number; assists: number; points: number }>; empty?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">{title}</p>
      {lines.length === 0 ? <p className="text-xs text-white/35">{empty}</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-white/35 text-[10px]"><th className="text-left font-medium">Spelare</th><th className="w-8">G</th><th className="w-8">A</th><th className="w-10">P</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.name} className="text-white/85">
                <td className="py-0.5 truncate max-w-[12rem]">{l.name}</td>
                <td className="text-center tabular-nums">{l.goals}</td>
                <td className="text-center tabular-nums">{l.assists}</td>
                <td className="text-center tabular-nums font-semibold">{l.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
