/**
 * Dela verktyg (styrelsen): tillfälliga länkar som ger någon annan tillgång till
 * Lineup och Score Tracker i 24 timmar – t.ex. en tränare som bygger laget.
 * Länken ger inte statistik, PIR, spelarregistret eller inställningar.
 */
import { useState } from "react";
import { toast } from "sonner";
import { X, Link2, Copy, Share2, ShieldOff, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const fmt = (ms: number) => new Date(ms).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const urlOf = (token: string) => `${window.location.origin}/lank/${token}`;

export function ShareToolsModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const list = trpc.auth.listInvites.useQuery(undefined, { refetchInterval: 30_000 });
  const refresh = () => utils.auth.listInvites.invalidate();
  const [label, setLabel] = useState("");
  const create = trpc.auth.createInvite.useMutation({
    onSuccess: async (data) => {
      setLabel("");
      await refresh();
      await share(urlOf(data.token), true);
    },
    onError: (e) => toast.error("Kunde inte skapa länken", { description: e.message }),
  });
  const revoke = trpc.auth.revokeInvite.useMutation({ onSuccess: () => { toast.success("Länken är återkallad"); void refresh(); } });
  const revokeAll = trpc.auth.revokeInvites.useMutation({ onSuccess: () => { toast.success("Alla länkar är återkallade"); void refresh(); } });

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

  const invites = list.data ?? [];

  return (
    <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md glass-panel-strong panel-solid rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}>
            <Link2 size={16} className="text-emerald-400" /> Dela verktyg
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>

        <div className="text-xs text-white/55 space-y-1">
          <p>En länk ger den som öppnar den tillgång i <b className="text-white/80">24 timmar</b> till:</p>
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
          <button onClick={() => create.mutate({ label })} disabled={create.isPending}
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
                      <p className="text-sm text-white/90 truncate">{i.label || "Utan namn"}</p>
                      <p className="text-[10px] text-white/40">
                        Giltig till {fmt(i.expiresAt)} · öppnad {i.uses} {i.uses === 1 ? "gång" : "gånger"}
                      </p>
                    </div>
                    <button onClick={() => void share(urlOf(i.token))} title="Dela eller kopiera" aria-label="Dela eller kopiera"
                      className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300">
                      {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => { if (confirm(`Återkalla länken${i.label ? ` till ${i.label}` : ""}? Den som använder den loggas ut.`)) revoke.mutate({ id: i.id }); }}
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

        {invites.length > 1 && (
          <button onClick={() => { if (confirm("Återkalla alla länkar direkt? Alla som använder dem loggas ut.")) revokeAll.mutate(); }}
            disabled={revokeAll.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
            <ShieldOff size={14} /> Återkalla alla
          </button>
        )}
      </div>
    </div>
  );
}
