/**
 * Perioder för statistiken: försäsong, säsong och slutspel.
 * Styr knapparna Försäsong/Säsong/Slutspel i statistiken.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Periods = { seasonFrom: string; seasonTo: string; playoffFrom: string; playoffTo: string; preseasonFrom: string; preseasonTo: string };

const ROWS: Array<{ label: string; from: keyof Periods; to: keyof Periods; hint: string }> = [
  { label: "Försäsong", from: "preseasonFrom", to: "preseasonTo", hint: "Träningsmatcher innan säsongen" },
  { label: "Säsong", from: "seasonFrom", to: "seasonTo", hint: "Grundserien" },
  { label: "Slutspel", from: "playoffFrom", to: "playoffTo", hint: "Slutspelsperioden" },
];

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
    if (periods.data && !form) setForm(periods.data as Periods);
  }, [periods.data, form]);

  if (!form) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const invalid = ROWS.some((r) => !form[r.from] || !form[r.to] || form[r.from] > form[r.to]);
  const dirty = JSON.stringify(form) !== JSON.stringify(periods.data);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">Styr vad knapparna Försäsong, Säsong och Slutspel visar i statistiken. Spelarhistoriken och sponsorräknarna har egna, fasta säsongsgränser (1 augusti respektive 1 juni).</p>
      {ROWS.map((r) => (
        <div key={r.label} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-xs font-semibold text-white/85">{r.label} <span className="font-normal text-white/35">– {r.hint}</span></p>
          <div className="flex items-center gap-2 mt-2">
            <input type="date" value={form[r.from]} onChange={(e) => setForm({ ...form, [r.from]: e.target.value })}
              className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5 [color-scheme:dark]" aria-label={`${r.label} från`} />
            <span className="text-white/40">–</span>
            <input type="date" value={form[r.to]} onChange={(e) => setForm({ ...form, [r.to]: e.target.value })}
              className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5 [color-scheme:dark]" aria-label={`${r.label} till`} />
          </div>
          {form[r.from] && form[r.to] && form[r.from] > form[r.to] && <p className="text-[10px] text-red-300 mt-1">Startdatum efter slutdatum.</p>}
        </div>
      ))}
      <button onClick={() => save.mutate(form)} disabled={invalid || !dirty || save.isPending}
        className="w-full py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
        {save.isPending ? "Sparar…" : dirty ? "Spara perioder" : "Sparat"}
      </button>
    </div>
  );
}
