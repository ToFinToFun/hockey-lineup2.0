/**
 * Resultatrad under prediktionen: ett block per match, äldst till vänster.
 * Vitt = Vita vann, grönt = Gröna vann, grått = oavgjort, tomt = ännu ej spelad
 * (fyller ut till 30 så att raden alltid ser likadan ut).
 */
import { trpc } from "@/lib/trpc";

const SLOTS = 30;

export function MatchResultsBar({ dark = true }: { dark?: boolean }) {
  const results = trpc.lineup.recentResults.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const list = results.data ?? [];
  const empty = Math.max(0, SLOTS - list.length);
  const whiteWins = list.filter((r) => r.winner === "V").length;
  const greenWins = list.filter((r) => r.winner === "G").length;
  const draws = list.length - whiteWins - greenWins;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="shrink-0 px-3 py-1 w-full flex justify-center">
    {/* Siffrorna ligger tätt intill raden, som en enhet (inte ute i kanterna) */}
    <div className="w-full flex items-center gap-1.5" style={{ maxWidth: SLOTS * 13 + 44 }}>
      <span className={`text-[9px] font-bold tabular-nums shrink-0 ${dark ? "text-slate-200/80" : "text-gray-700"}`} title="Vitas vinster">{whiteWins}</span>
      <div
        className="flex-1 min-w-0 flex items-center justify-center gap-[3px]"
        role="img"
        aria-label={`Senaste ${list.length} matcherna: Vita ${whiteWins} vinster, Gröna ${greenWins}, oavgjort ${draws}`}
      >
        {Array.from({ length: empty }, (_, i) => (
          <span key={`e${i}`} className={`h-2.5 flex-1 max-w-[10px] min-w-[4px] rounded-[2px] border ${dark ? "border-white/15" : "border-gray-300"}`} title="Ej spelad" />
        ))}
        {list.map((r, i) => (
          <span
            key={i}
            title={`${fmt(r.date)}: Vita ${r.white}–${r.green} Gröna`}
            className={`h-2.5 flex-1 max-w-[10px] min-w-[4px] rounded-[2px] ${
              r.winner === "V" ? (dark ? "bg-slate-100" : "bg-white border border-gray-400")
              : r.winner === "G" ? "bg-emerald-500"
              : dark ? "bg-white/30" : "bg-gray-400"
            }`}
          />
        ))}
      </div>
      <span className="text-[9px] font-bold tabular-nums shrink-0 text-emerald-400" title="Grönas vinster">{greenWins}</span>
    </div>
    </div>
  );
}
