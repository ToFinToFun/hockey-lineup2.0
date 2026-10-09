/**
 * Gemensam tabell för hela statistikmodulen: klicka på en kolumnrubrik för att
 * sortera, klicka igen för att vända ordningen. Topp 10 visas, resten fälls ut.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface StatColumn<T> {
  key: string;
  label: string;
  /** Värdet som sorteras på (null/undefined hamnar sist) */
  value: (row: T) => number | string | null | undefined;
  /** Hur cellen visas (standard: värdet) */
  render?: (row: T) => ReactNode;
  title?: string;
  /** Lägre är bättre (t.ex. insläppta/60) – första klicket sorterar stigande */
  lowerIsBetter?: boolean;
  /** Bredd/justering */
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: StatColumn<T>[];
  /** Kolumnen för namnet (vänsterställd, sorteras inte) */
  name: (row: T) => ReactNode;
  nameLabel?: string;
  rowKey: (row: T) => string;
  defaultSort: string;
  /** Hur många som visas innan "Visa alla" (standard 10) */
  initial?: number;
  onRowClick?: (row: T) => void;
  /** Extra rad under namnet (t.ex. positionsstapel) */
  sub?: (row: T) => ReactNode;
  empty?: string;
}

export function StatTable<T>({ rows, columns, name, nameLabel = "Spelare", rowKey, defaultSort, initial = 10, onRowClick, sub, empty = "Inget att visa för perioden." }: Props<T>) {
  const col0 = columns.find((c) => c.key === defaultSort) ?? columns[0];
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: col0.key, dir: col0.lowerIsBetter ? "asc" : "desc" });
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const c = columns.find((x) => x.key === sort.key) ?? col0;
    const list = [...rows];
    list.sort((a, b) => {
      const va = c.value(a), vb = c.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // saknade värden sist oavsett riktning
      if (vb == null) return -1;
      const d = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "sv");
      return sort.dir === "asc" ? d : -d;
    });
    return list;
  }, [rows, sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return <p className="text-xs text-white/40 py-3">{empty}</p>;
  const shown = all ? sorted : sorted.slice(0, initial);
  const click = (c: StatColumn<T>) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: c.key, dir: c.lowerIsBetter ? "asc" : "desc" }));

  return (
    <div className="rounded-xl bg-[#161616] border border-white/10 overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/40 text-[10px] border-b border-white/5">
              {/* # och namn står kvar när en bred tabell scrollas i sidled (mobil) */}
              <th className="w-7 pl-3 py-2 text-left font-medium sticky left-0 z-10 bg-[#161616]">#</th>
              <th className="text-left font-medium py-2 sticky left-7 z-10 bg-[#161616] shadow-[6px_0_6px_-6px_rgba(0,0,0,0.6)]">{nameLabel}</th>
              {columns.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} title={c.title} className={`font-medium px-1.5 py-2 whitespace-nowrap ${c.className ?? "text-center"}`}>
                    <button onClick={() => click(c)} className={`inline-flex items-center gap-0.5 ${active ? "text-sky-300" : "hover:text-white/70"}`}>
                      {c.label}
                      {active && (sort.dir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-b border-white/[0.03] last:border-0 ${onRowClick ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}>
                <td className={`pl-3 py-1.5 tabular-nums sticky left-0 z-10 bg-[#161616] ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-300" : "text-white/35"}`}>{i + 1}</td>
                <td className="py-1.5 pr-2 sticky left-7 z-10 bg-[#161616] shadow-[6px_0_6px_-6px_rgba(0,0,0,0.6)]">
                  <span className="block text-white/90 truncate max-w-[10rem] sm:max-w-[16rem]">{name(r)}</span>
                  {sub && <div className="mt-1 w-28 sm:w-40">{sub(r)}</div>}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-1.5 py-1.5 tabular-nums whitespace-nowrap ${c.className ?? "text-center"} ${sort.key === c.key ? "text-white font-semibold" : "text-white/70"}`}>
                    {c.render ? c.render(r) : (c.value(r) ?? "–")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > initial && (
        <button onClick={() => setAll((v) => !v)} className="w-full py-2 text-[11px] text-white/50 hover:text-white border-t border-white/5 flex items-center justify-center gap-1">
          {all ? <>Visa färre <ChevronUp size={12} /></> : <>Visa alla {sorted.length} <ChevronDown size={12} /></>}
        </button>
      )}
    </div>
  );
}

/** Rubrik för ett avsnitt i statistiken (samma utseende överallt). */
export function StatSection({ title, icon, hint, children, right }: { title: string; icon?: ReactNode; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[#ECEDEE] text-sm font-semibold flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
      {hint && <p className="text-[10px] text-white/35">{hint}</p>}
    </section>
  );
}
