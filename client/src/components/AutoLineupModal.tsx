/**
 * Auto-lag (Lineup → menyn): förklaring, på/av och tid före matchstart.
 * Logiken finns i server/autoLineup.ts.
 */
import { useEffect, useState } from "react";
import { X, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function AutoLineupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.laget.autoLineup.useQuery(undefined, { enabled: open });
  const save = trpc.laget.setAutoLineup.useMutation({
    onSuccess: () => { toast.success("Auto-lag sparat"); void utils.laget.autoLineup.invalidate(); },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState(90);
  useEffect(() => {
    if (q.data) { setEnabled(q.data.config.enabled); setMinutes(q.data.config.minutesBefore); }
  }, [q.data]);
  if (!open) return null;
  const dirty = q.data && (enabled !== q.data.config.enabled || minutes !== q.data.config.minutesBefore);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel-strong panel-solid rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>Auto-lag</h2>
          </div>
          <button onClick={onClose} aria-label="Stäng" className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-5 space-y-4 text-xs text-white/70">
          <div className="space-y-2 leading-relaxed">
            <p>Före varje internmatch jämförs uppställningen med anmälningarna på laget.se. Det räknas som en avvikelse om anmälda saknas i uppställningen, eller om någon i laget inte är anmäld (återbud eller inte svarat).</p>
            <p><b className="text-white/90">Auto-lag på:</b> finns en avvikelse och ingen nyhet är publicerad eller tidsinställd, görs laget om helt – anmälningarna synkas och alla anmälda fördelas med Auto (position, lagfärg och PIR). Ett mejl talar om vad som gjorts, och nyhetsmejlen nämner att laget skapades automatiskt.</p>
            <p><b className="text-white/90">Auto-lag av</b> (eller laget redan publicerat): ingenting ändras, men ett mejl listar vad som inte stämmer.</p>
            <p className="text-white/45">Mejlen väljs under Inställningar → Notiser. Matcher mot andra lag rörs aldrig.</p>
          </div>

          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white/5 border-white/10">
            <div className="flex-1">
              <div className="text-xs font-semibold text-white/90">Gör om laget automatiskt</div>
              <div className="text-[10px] text-white/40">Annars bara mejl vid avvikelse</div>
            </div>
            <button role="switch" aria-checked={enabled} aria-label="Auto-lag" onClick={() => setEnabled(!enabled)}
              className={`shrink-0 w-10 h-5 rounded-full relative ${enabled ? "bg-emerald-500/60" : "bg-white/10"}`}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: enabled ? "22px" : "2px" }} />
            </button>
          </div>

          <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white/5 border-white/10">
            <span className="flex-1">
              <span className="block text-xs font-semibold text-white/90">Tid före matchstart</span>
              <span className="block text-[10px] text-white/40">Kontroll och mejl (standard 90 min, minst 60)</span>
            </span>
            <input type="number" min={60} max={240} step={5} value={minutes}
              onChange={(e) => setMinutes(Math.max(60, Math.min(240, Number(e.target.value) || 90)))}
              className="w-16 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2 py-1 text-right" />
            <span className="text-white/50">min</span>
          </label>

          {q.data?.state?.summary && (
            <p className="text-[10px] text-white/40">Senast ({q.data.state.eventDate}): {q.data.state.summary}</p>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setEnabled(false); setMinutes(90); }} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70">Återställ standard</button>
            <button disabled={!dirty || save.isPending} onClick={() => save.mutate({ enabled, minutesBefore: minutes })}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-40">
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Spara
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
