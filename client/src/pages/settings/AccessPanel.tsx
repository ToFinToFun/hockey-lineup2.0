/**
 * Inställningar → Åtkomst: delade länkar med moduler. En länk ger tillgång till
 * valda moduler utan styrelselösenordet (namn, moduler, giltighet – går att
 * ändra i efterhand, gäller direkt). Borttagningar och inställningar kräver
 * alltid styrelsen. Score Tracker är öppen för alla.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, X, Pencil, Plus, Loader2, KeyRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ACCESS_MODULES, type AccessModule } from "@shared/accessModules";

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** expiresAt (midnatt efter sista dagen) → sista giltiga dag */
const lastDay = (expiresAt: string | null) => (expiresAt ? isoDate(new Date(new Date(expiresAt).getTime() - 60_000)) : null);
const fmt = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric", year: "numeric" });

interface Draft { name: string; modules: AccessModule[]; validUntil: string | null }

function LinkForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial: Draft; busy: boolean; submitLabel: string; onSubmit: (d: Draft) => void; onCancel?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const today = isoDate(new Date());
  const toggle = (m: AccessModule) => setD({ ...d, modules: d.modules.includes(m) ? d.modules.filter((x) => x !== m) : [...d.modules, m] });
  return (
    <div className="space-y-3">
      <label className="block text-[11px] text-white/50">Namn
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={60} placeholder="T.ex. Fotograf Anna"
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2" />
      </label>
      <div>
        <p className="text-[11px] text-white/50 mb-1">Moduler</p>
        <div className="space-y-1">
          {ACCESS_MODULES.map((m) => {
            const on = d.modules.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)}
                className={`w-full flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left ${on ? "bg-sky-500/15 border-sky-400/50" : "bg-white/[0.03] border-white/10"}`}>
                <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${on ? "bg-sky-500 border-sky-300 text-white" : "border-white/30"}`}>{on ? "✓" : ""}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{m.name}</span>
                  <span className="block text-[10px] text-white/45">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-white/35 mt-1">Score Tracker är alltid öppen. Ta bort matcher, slå ihop spelare, Lineup och inställningar kräver alltid styrelsen.</p>
      </div>
      <div>
        <p className="text-[11px] text-white/50 mb-1">Giltighet</p>
        <div className="flex gap-2 items-center">
          <button type="button" onClick={() => setD({ ...d, validUntil: null })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${d.validUntil === null ? "bg-sky-500/20 border-sky-400/60 text-sky-100" : "bg-white/5 border-white/10 text-white/55"}`}>Tills vidare</button>
          <input type="date" min={today} value={d.validUntil ?? ""} onChange={(e) => setD({ ...d, validUntil: e.target.value || null })} aria-label="Gäller till och med"
            className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5" />
        </div>
        {d.validUntil && <p className="text-[10px] text-white/35 mt-1">Gäller till och med {fmt(d.validUntil + "T12:00")}.</p>}
      </div>
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm">Avbryt</button>}
        <button type="button" disabled={busy || !d.name.trim() || d.modules.length === 0} onClick={() => onSubmit(d)}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
          {busy && <Loader2 size={14} className="animate-spin" />} {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function AccessPanel() {
  const utils = trpc.useUtils();
  const links = trpc.auth.accessLinks.useQuery();
  const refresh = () => void utils.auth.accessLinks.invalidate();
  const onErr = (e: { message: string }) => toast.error(e.message);
  const create = trpc.auth.createAccessLink.useMutation({ onSuccess: () => { toast.success("Länken skapad"); setCreating(false); refresh(); }, onError: onErr });
  const update = trpc.auth.updateAccessLink.useMutation({ onSuccess: () => { toast.success("Länken ändrad – gäller direkt"); setEditing(null); refresh(); }, onError: onErr });
  const revoke = trpc.auth.revokeAccessLink.useMutation({ onSuccess: () => { toast.success("Länken stängd"); refresh(); }, onError: onErr });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const url = (token: string) => `${window.location.origin}/a/${token}`;
  const share = async (name: string, token: string) => {
    try {
      if (navigator.share) await navigator.share({ title: name, url: url(token) });
      else { await navigator.clipboard.writeText(url(token)); toast.success("Länken kopierad"); }
    } catch { /* avbrutet */ }
  };
  const moduleNames = (ids: string[]) => ACCESS_MODULES.filter((m) => ids.includes(m.id)).map((m) => m.name).join(", ");

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/45">
        Dela delar av appen utan styrelselösenordet, t.ex. Media till en fotograf. Ändringar i en länk gäller direkt – den som har länken behöver ingen ny.
      </p>
      {creating ? (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <LinkForm initial={{ name: "", modules: [], validUntil: null }} busy={create.isPending} submitLabel="Skapa länk"
            onSubmit={(d) => create.mutate(d)} onCancel={() => setCreating(false)} />
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-400/40 text-sky-100 text-sm font-semibold">
          <Plus size={15} /> Ny länk
        </button>
      )}

      {links.isLoading && <Loader2 className="animate-spin text-white/40 mx-auto" />}
      {links.data?.length === 0 && !creating && <p className="text-xs text-white/40 text-center">Inga delade länkar.</p>}
      {(links.data ?? []).map((l) => {
        const expired = !!l.expiresAt && new Date(l.expiresAt).getTime() <= Date.now();
        return (
          <div key={l.id} className={`rounded-xl border p-3 space-y-2 ${expired ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-start gap-2">
              <KeyRound size={15} className="text-sky-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{l.name}</p>
                <p className="text-[11px] text-white/55">{moduleNames(l.modules) || "Inga moduler"}</p>
                <p className="text-[10px] text-white/40">
                  {l.expiresAt ? `${expired ? "Gick ut" : "Gäller till och med"} ${fmt(lastDay(l.expiresAt)! + "T12:00")}` : "Tills vidare"}
                  {` · öppnad ${l.uses} ggr`}{l.lastUsedAt ? ` · senast ${fmt(l.lastUsedAt)}` : ""}
                </p>
              </div>
              <button onClick={() => { void navigator.clipboard.writeText(url(l.token)); toast.success("Länken kopierad"); }} aria-label="Kopiera" className="p-1.5 text-white/60 hover:text-white"><Copy size={14} /></button>
              <button onClick={() => void share(l.name, l.token)} aria-label="Dela" className="p-1.5 text-white/60 hover:text-white"><Share2 size={14} /></button>
              <button onClick={() => setEditing(editing === l.id ? null : l.id)} aria-label="Ändra" className={`p-1.5 ${editing === l.id ? "text-sky-200" : "text-white/60 hover:text-white"}`}><Pencil size={14} /></button>
              <button onClick={() => { if (confirm(`Stänga länken "${l.name}"? Den slutar fungera direkt.`)) revoke.mutate({ id: l.id }); }} aria-label="Stäng länken" className="p-1.5 text-red-300/70 hover:text-red-300"><X size={14} /></button>
            </div>
            {editing === l.id && (
              <div className="pt-2 border-t border-white/10">
                <LinkForm initial={{ name: l.name, modules: l.modules as AccessModule[], validUntil: lastDay(l.expiresAt) }} busy={update.isPending} submitLabel="Spara ändringar"
                  onSubmit={(d) => update.mutate({ id: l.id, ...d })} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
