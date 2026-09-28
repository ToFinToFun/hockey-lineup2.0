/**
 * Statistikens inställningar: perioderna (säsong, slutspel, försäsong).
 * Sidan är bara för styrelsen, så det finns inga synlighetsval.
 */
import { useEffect, useState } from "react";
import { X, Loader2, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Periods = { seasonFrom: string; seasonTo: string; playoffFrom: string; playoffTo: string; preseasonFrom: string; preseasonTo: string };

const ROWS: Array<{ label: string; from: keyof Periods; to: keyof Periods; hint: string }> = [
  { label: "Försäsong", from: "preseasonFrom", to: "preseasonTo", hint: "Träningsmatcher innan säsongen" },
  { label: "Säsong", from: "seasonFrom", to: "seasonTo", hint: "Grundserien" },
  { label: "Slutspel", from: "playoffFrom", to: "playoffTo", hint: "Slutspelsperioden" },
];

export default function StatsSettings({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const periods = trpc.score.config.getPeriods.useQuery();
  const save = trpc.score.config.updatePeriods.useMutation({
    onSuccess: () => {
      toast.success("Perioderna sparade");
      void utils.score.config.getPeriods.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const [form, setForm] = useState<Periods | null>(null);
  useEffect(() => {
    if (periods.data && !form) setForm(periods.data as Periods);
  }, [periods.data, form]);

  const invalid = form ? ROWS.some((r) => form[r.from] && form[r.to] && form[r.from] > form[r.to]) : true;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#161616] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}>
            <CalendarRange size={16} className="text-[#0a7ea4]" /> Perioder
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-white/40">Styr vad knapparna Försäsong, Säsong och Slutspel visar i statistiken.</p>

        {!form ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-white/40" /></div>
        ) : (
          <div className="space-y-3">
            {ROWS.map((r) => (
              <div key={r.label}>
                <p className="text-xs font-semibold text-white/80">{r.label} <span className="font-normal text-white/35">– {r.hint}</span></p>
                <div className="flex items-center gap-2 mt-1">
                  <input type="date" value={form[r.from]} onChange={(e) => setForm({ ...form, [r.from]: e.target.value })}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5 [color-scheme:dark]" aria-label={`${r.label} från`} />
                  <span className="text-white/40">–</span>
                  <input type="date" value={form[r.to]} onChange={(e) => setForm({ ...form, [r.to]: e.target.value })}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5 [color-scheme:dark]" aria-label={`${r.label} till`} />
                </div>
                {form[r.from] > form[r.to] && <p className="text-[10px] text-red-300 mt-1">Startdatum efter slutdatum.</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm">Avbryt</button>
          <button onClick={() => form && save.mutate(form)} disabled={!form || invalid || save.isPending}
            className="flex-1 py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
            {save.isPending ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}
