/**
 * Återställ lag: förslag för spelare som saknar lag (t.ex. efter att de
 * oavsiktligt blivit Waivers). Visas bara när det finns förslag.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function TeamRecovery() {
  const utils = trpc.useUtils();
  const q = trpc.players.teamSuggestions.useQuery(undefined, { staleTime: 60_000 });
  const apply = trpc.players.applyTeams.useMutation();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (q.data) setChecked(Object.fromEntries(q.data.map((s) => [s.playerId, true])));
  }, [q.data]);
  if (!q.data?.length) return null;
  const selected = q.data.filter((s) => checked[s.playerId]);

  const run = async () => {
    const res = await apply.mutateAsync(selected.map((s) => ({ playerId: s.playerId, teamColor: s.teamColor })));
    toast.success(`${res.updated} spelare har fått tillbaka sitt lag`);
    setOpen(false);
    void utils.players.teamSuggestions.invalidate();
    void utils.players.list.invalidate();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-left text-sm text-amber-200">
        <RotateCcw size={15} className="shrink-0" />
        <span className="flex-1">{q.data.length} spelare saknar lag – det finns förslag på att återställa dem</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-lg bg-[#161616] border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Återställ lag</h2>
              <button onClick={() => setOpen(false)} aria-label="Stäng" className="text-white/50"><X size={18} /></button>
            </div>
            <p className="text-xs text-white/50">
              Förslaget är laget spelaren spelat i oftast de senaste matcherna (minst 3 matcher, minst 70 %), eller från en äldre
              sparad uppställning. Kontrollera listan och kryssa ur dem som inte stämmer – spelare som ska vara Waivers ska inte med.
            </p>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
              {q.data.map((s) => (
                <li key={s.playerId}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={!!checked[s.playerId]} onChange={(e) => setChecked({ ...checked, [s.playerId]: e.target.checked })} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{s.name}</span>
                      <span className="block text-[10px] text-white/40 truncate">{s.detail}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${s.teamColor === "green" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/15 text-white"}`}>
                      {s.teamColor === "green" ? "Grön" : "Vit"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button onClick={() => void run()} disabled={!selected.length || apply.isPending}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-emerald-950 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {apply.isPending && <Loader2 size={14} className="animate-spin" />} Återställ {selected.length} spelare
            </button>
          </div>
        </div>
      )}
    </>
  );
}
