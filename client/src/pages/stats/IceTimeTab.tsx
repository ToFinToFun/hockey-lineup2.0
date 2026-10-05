/**
 * Statistik → Speltid: uppskattad speltid per spelare för perioden (samma regler
 * som i Lineup, räknat på varje sparad match): total, snitt per match, fördelning
 * per position och poäng per 60 minuter.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { POSITION_COLORS } from "@/lib/positionColors";

type Input = { from?: string; to?: string; includeExternal?: boolean } | undefined;
type SortKey = "minutes" | "perMatch" | "p60" | "matches";

const POS: Array<{ key: "MV" | "B" | "C" | "F"; label: string }> = [
  { key: "MV", label: "MV" }, { key: "B", label: "B" }, { key: "C", label: "C" }, { key: "F", label: "F" },
];

/** "12 h 05 min" / "45 min" */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h ${String(r).padStart(2, "0")} min`;
}

/** Stapel med fördelningen per position. */
export function PositionSplit({ byPos, total }: { byPos: Record<"MV" | "B" | "C" | "F", number>; total: number }) {
  if (!total) return null;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5" title={POS.filter((p) => byPos[p.key]).map((p) => `${p.label} ${Math.round((byPos[p.key] / total) * 100)} %`).join(" · ")}>
      {POS.map((p) => byPos[p.key] > 0 && (
        <div key={p.key} style={{ width: `${(byPos[p.key] / total) * 100}%`, background: POSITION_COLORS[p.key] ?? "#64748b" }} />
      ))}
    </div>
  );
}

export function IceTimeTab({ input }: { input: Input }) {
  const q = trpc.scoreStats.iceTime.useQuery(input ?? {});
  const [sort, setSort] = useState<SortKey>("minutes");
  const rows = useMemo(() => {
    const list = [...(q.data ?? [])];
    list.sort((a, b) => ((b[sort] ?? -1) as number) - ((a[sort] ?? -1) as number) || a.name.localeCompare(b.name, "sv"));
    return list;
  }, [q.data, sort]);

  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/40" /></div>;
  if (!rows.length) return <p className="text-sm text-white/45 text-center py-10">Inga matcher under perioden.</p>;

  const chip = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={`px-2.5 py-1 rounded-md text-[10px] font-medium border ${sort === k ? "bg-[#0a7ea4] text-white border-[#0a7ea4]" : "bg-white/5 text-white/50 border-white/10"}`}>{label}</button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-white/40 mr-1">Sortera:</span>
        {chip("minutes", "Total tid")}{chip("perMatch", "Snitt/match")}{chip("p60", "P/60")}{chip("matches", "Matcher")}
      </div>
      <div className="rounded-xl bg-[#161616] border border-white/10 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/40 text-[10px] border-b border-white/5">
              <th className="text-left font-medium px-3 py-2">Spelare</th>
              <th className="font-medium w-8">M</th>
              <th className="font-medium text-right pr-2">Tid</th>
              <th className="font-medium w-12">Snitt</th>
              <th className="font-medium w-12 pr-3" title="Poäng per 60 minuter speltid">P/60</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/[0.03] last:border-0">
                <td className="px-3 py-1.5">
                  <span className="block text-white/90 truncate max-w-[9rem] sm:max-w-none">{r.name}</span>
                  <div className="mt-1 w-28 sm:w-40"><PositionSplit byPos={r.byPos} total={r.minutes} /></div>
                </td>
                <td className="text-center tabular-nums text-white/60">{r.matches}</td>
                <td className="text-right tabular-nums text-white pr-2 whitespace-nowrap">{formatMinutes(r.minutes)}</td>
                <td className="text-center tabular-nums text-white/70">{r.perMatch}′</td>
                <td className="text-center tabular-nums text-white/70 pr-3">{r.p60 ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-white/40">
        {POS.map((p) => <span key={p.key} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: POSITION_COLORS[p.key] }} />{p.label}</span>)}
        <span>· Uppskattad speltid: samma regler som i Lineup, räknat på varje match utifrån uppställningen och matchens längd (60 min om tider saknas).</span>
      </div>
    </div>
  );
}
