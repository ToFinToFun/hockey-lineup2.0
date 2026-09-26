import { useMemo } from "react";
import type { Player } from "@/lib/players";
import { predictMatch } from "@/lib/matchPrediction";

/** Experimentell vinstchans per lag (styrelsen). */
export function MatchPredictionBar({ lineup, teamAName, teamBName, dark }: {
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
  dark: boolean;
}) {
  const p = useMemo(() => predictMatch(lineup), [lineup]);
  if (!p) return null;
  const a = Math.round(p.teamAWinPct * 100);
  const b = 100 - a;
  const conf = Math.round(p.confidence * 100);
  return (
    <div className={`mx-auto w-full max-w-3xl px-3 py-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider mb-1">
        <span>{teamAName} {a}%</span>
        <span className={dark ? "text-white/35" : "text-gray-400"}>Prediktion</span>
        <span>{b}% {teamBName}</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden flex ${dark ? "bg-white/10" : "bg-gray-200"}`}>
        <div className="bg-white/80" style={{ width: `${a}%` }} />
        <div className="bg-emerald-500" style={{ width: `${b}%` }} />
      </div>
      <p className={`text-[9px] mt-1 text-center ${dark ? "text-white/30" : "text-gray-400"}`}>
        {conf}% av spelarna har tillräckligt med matchdata{conf < 50 ? " – osäker prognos" : ""}
      </p>
    </div>
  );
}
