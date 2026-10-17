/**
 * Dela Lineup: en delad länk (samma sort som under Inställningar → Åtkomst) med bara
 * Lineup, giltig till och med i morgon – t.ex. en tränare som bygger laget.
 * Länken ger inte statistik, PIR, spelarregistret eller inställningar.
 */
import { useState } from "react";
import { toast } from "sonner";
import { X, Link2, Copy, Share2, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const fmt = (iso: string) => new Date(new Date(iso).getTime() - 60_000).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "numeric" });
const urlOf = (token: string) => `${window.location.origin}/a/${token}`;
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ShareToolsModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const list = trpc.auth.accessLinks.useQuery(undefined, { refetchInterval: 30_000 });
  const refresh = () => utils.auth.accessLinks.invalidate();
  const [label, setLabel] = useState("");
  const create = trpc.auth.createAccessLink.useMutation({
    onSuccess: async (data) => {
      setLabel("");
      await refresh();
      await share(urlOf(data.token), true);
    },
    onError: (e) => toast.error("Kunde inte skapa länken", { description: e.message }),
  });
  const revoke = trpc.auth.revokeAccessLink.useMutation({ onSuccess: () => { toast.success("Länken är stängd"); void refresh(); } });

  async function share(url: string, justCreated = false) {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Stålstadens – bygg laguppställningen", url });
        return;
      } catch { /* avbruten – kopiera i stället */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(justCreated ? "Länken är skapad och kopierad" : "Länken är kopierad");
    } catch {
      toast.message("Kopiera länken från listan");
    }
  }

  // Länkar med bara Lineup som fortfarande gäller
  const invites = (list.data ?? []).filter((l) => l.modules.length === 1 && l.modules[0] === "lineup" && (!l.expiresAt || new Date(l.expiresAt).getTime() > Date.now()));
  const tomorrow = () => isoDate(new Date(Date.now() + 86400000));

  return (
    <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md glass-panel-strong panel-solid rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}>
            <Link2 size={16} className="text-emerald-400" /> Dela Lineup
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>

        <div className="text-xs text-white/55 space-y-1">
          <p>En länk ger den som öppnar den tillgång <b className="text-white/80">till och med i morgon</b> till:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><b className="text-white/80">Lineup</b> – bygga laget, hämta anmälda, dela</li>
            <li><b className="text-white/80">Score Tracker</b> – föra matchen (sparade matcher väntar på godkännande)</li>
          </ul>
          <p>Inte statistik, PIR, spelarregistret, matchhistorik eller inställningar. PIR används ändå i bakgrunden när de trycker Auto.</p>
        </div>

        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Vem är den till? (valfritt)"
            maxLength={60}
            className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2"
          />
          <button onClick={() => create.mutate({ name: label.trim() || "Lineup", modules: ["lineup"], validUntil: tomorrow() })} disabled={create.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-emerald-950 text-sm font-bold disabled:opacity-50">
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Skapa
          </button>
        </div>

        <div>
          <p className="text-[11px] text-white/45 mb-1.5">Aktiva länkar</p>
          {list.isLoading ? (
            <Loader2 className="animate-spin text-white/40" />
          ) : invites.length === 0 ? (
            <p className="text-xs text-white/35">Inga aktiva länkar.</p>
          ) : (
            <ul className="space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/90 truncate">{i.name}</p>
                      <p className="text-[10px] text-white/40">
                        {i.expiresAt ? `Gäller till och med ${fmt(i.expiresAt)}` : "Tills vidare"} · öppnad {i.uses} {i.uses === 1 ? "gång" : "gånger"}
                      </p>
                    </div>
                    <button onClick={() => void share(urlOf(i.token))} title="Dela eller kopiera" aria-label="Dela eller kopiera"
                      className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300">
                      {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => { if (confirm(`Stänga länken "${i.name}"? Den som använder den loggas ut.`)) revoke.mutate({ id: i.id }); }}
                      title="Återkalla" aria-label="Återkalla"
                      className="p-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>


      </div>
    </div>
  );
}
