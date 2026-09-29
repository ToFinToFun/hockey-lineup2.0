/**
 * Perioder för statistiken: försäsong, säsong och slutspel – månad och dag,
 * återkommer varje år. Hockeyåret börjar med försäsongen.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Key = "preseasonFrom" | "preseasonTo" | "seasonFrom" | "seasonTo" | "playoffFrom" | "playoffTo";
type Periods = Record<Key, string>; // "MM-DD"

const ROWS: Array<{ label: string; from: Key; to: Key; hint: string }> = [
  { label: "Försäsong", from: "preseasonFrom", to: "preseasonTo", hint: "Träningsmatcher innan säsongen – här börjar hockeyåret" },
  { label: "Säsong", from: "seasonFrom", to: "seasonTo", hint: "Grundserien" },
  { label: "Slutspel", from: "playoffFrom", to: "playoffTo", hint: "Slutspelsperioden" },
];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function MonthDay({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [m, d] = value.split("-").map(Number);
  const set = (mm: number, dd: number) => onChange(`${String(mm).padStart(2, "0")}-${String(Math.min(dd, DAYS_IN[mm - 1])).padStart(2, "0")}`);
  const sel = "rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2 py-1.5";
  return (
    <span className="inline-flex gap-1" aria-label={label}>
      <select value={d} onChange={(e) => set(m, Number(e.target.value))} className={sel} aria-label={`${label} dag`}>
        {Array.from({ length: DAYS_IN[m - 1] }, (_, i) => i + 1).map((n) => <option key={n} value={n} className="text-black">{n}</option>)}
      </select>
      <select value={m} onChange={(e) => set(Number(e.target.value), d)} className={sel} aria-label={`${label} månad`}>
        {MONTHS.map((name, i) => <option key={name} value={i + 1} className="text-black">{name}</option>)}
      </select>
    </span>
  );
}

export function PeriodsPanel() {
  const utils = trpc.useUtils();
  const periods = trpc.score.config.getPeriods.useQuery();
  const save = trpc.score.config.updatePeriods.useMutation({
    onSuccess: () => {
      toast.success("Perioderna sparade");
      void utils.score.config.getPeriods.invalidate();
    },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const [form, setForm] = useState<Periods | null>(null);
  useEffect(() => {
    if (periods.data && !form) setForm(periods.data.recurring as Periods);
  }, [periods.data, form]);

  if (!form || !periods.data) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const dirty = JSON.stringify(form) !== JSON.stringify(periods.data.recurring);
  const d = periods.data;
  const fmt = (iso: string) => { const [y, m, dd] = iso.split("-").map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">Styr vad knapparna Försäsong, Säsong och Slutspel visar i statistiken. Anges som dag och månad och gäller varje år.</p>
      {ROWS.map((r) => (
        <div key={r.label} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-xs font-semibold text-white/85">{r.label} <span className="font-normal text-white/35">– {r.hint}</span></p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <MonthDay value={form[r.from]} onChange={(v) => setForm({ ...form, [r.from]: v })} label={`${r.label} från`} />
            <span className="text-white/40">–</span>
            <MonthDay value={form[r.to]} onChange={(v) => setForm({ ...form, [r.to]: v })} label={`${r.label} till`} />
          </div>
          <p className="text-[10px] text-white/35 mt-1.5">Nu: {fmt(d[r.from])} – {fmt(d[r.to])}</p>
        </div>
      ))}
      <button onClick={() => save.mutate(form)} disabled={!dirty || save.isPending}
        className="w-full py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
        {save.isPending ? "Sparar…" : dirty ? "Spara perioder" : "Sparat"}
      </button>
    </div>
  );
}
