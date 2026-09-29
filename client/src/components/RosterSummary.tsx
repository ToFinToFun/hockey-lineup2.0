/**
 * Truppens siffror – samma på mobil och desktop:
 *   56  ✓19  ✕6  !1
 *   totalt i truppen · kommer (anmälda) · kommer ej · anmälda som inte är utplacerade
 * Den gula siffran visas bara när någon anmäld saknar plats i laget.
 */
export interface RosterCounts {
  total: number;
  registered: number;
  declined: number;
  unplacedRegistered: number;
}

export function RosterSummary({ counts, size = "sm", legend = false }: { counts: RosterCounts; size?: "xs" | "sm"; legend?: boolean }) {
  const t = size === "xs" ? "text-[10px]" : "text-[11px]";
  const chip = `inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold tabular-nums leading-none ${t}`;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1" aria-label={`${counts.total} i truppen, ${counts.registered} kommer, ${counts.declined} kommer ej${counts.unplacedRegistered ? `, ${counts.unplacedRegistered} anmälda utan plats i laget` : ""}`}>
        <span className={`${chip} bg-white/10 text-white/80`} title="Spelare i truppen">{counts.total}</span>
        <span className={`${chip} bg-emerald-500/15 text-emerald-300`} title="Kommer (anmälda)">✓{counts.registered}</span>
        <span className={`${chip} bg-red-500/15 text-red-300`} title="Kommer ej">✕{counts.declined}</span>
        {counts.unplacedRegistered > 0 && (
          <span className={`${chip} bg-amber-400/20 text-amber-300`} title="Anmälda som inte är utplacerade i laget">!{counts.unplacedRegistered}</span>
        )}
      </span>
      {legend && (
        <span className="text-[9px] text-white/35 font-normal normal-case tracking-normal">
          ✓ kommer · ✕ kommer ej{counts.unplacedRegistered > 0 ? " · ! anmäld men inte i laget" : ""}
        </span>
      )}
    </span>
  );
}
