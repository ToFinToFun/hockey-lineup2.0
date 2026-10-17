/**
 * Inställningar → Åtkomst.
 * - Medlemmar: behörighet per medlem (Admin eller valda delar). Medlemmen loggar in som vanligt
 *   med e-postkod. Kontroll mot styrelsen enligt Organisation på sajten.
 * - Länkar: för den som inte är medlem eller saknar e-post (namn, delar, giltighet).
 * Ändringar gäller direkt. Score Tracker är öppen för alla.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, X, Pencil, Plus, Loader2, KeyRound, ShieldCheck, Search, AlertTriangle, UserRound } from "lucide-react";
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
        <p className="text-[10px] text-white/35 mt-1">Score Tracker är alltid öppen. Ta bort matcher, slå ihop spelare och inställningar kräver Admin.</p>
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
    <div className="space-y-6">
      <MemberGrants />
      <section className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2"><KeyRound size={15} className="text-sky-300" /> Länkar</h3>
      <p className="text-[11px] text-white/45">För den som inte är medlem, t.ex. en fotograf eller en extern tränare.</p>
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
      </section>
    </div>
  );
}

// ─── Medlemmar med behörighet ────────────────────────────────────────────────

const fmtDay = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

function GrantForm({ initial, busy, onSave, onCancel, onRemove }: {
  initial: { admin: boolean; modules: AccessModule[] };
  busy: boolean;
  onSave: (g: { admin: boolean; modules: AccessModule[] }) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [g, setG] = useState(initial);
  const toggle = (m: AccessModule) => setG({ ...g, modules: g.modules.includes(m) ? g.modules.filter((x) => x !== m) : [...g.modules, m] });
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setG({ ...g, admin: !g.admin })}
        className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${g.admin ? "bg-emerald-500/15 border-emerald-400/50" : "bg-white/[0.03] border-white/10"}`}>
        <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${g.admin ? "bg-emerald-500 border-emerald-300 text-white" : "border-white/30"}`}>{g.admin ? "✓" : ""}</span>
        <span className="text-xs font-semibold">Admin – allt, även inställningar och behörigheter</span>
      </button>
      {!g.admin && (
        <div className="grid grid-cols-2 gap-1.5">
          {ACCESS_MODULES.map((m) => {
            const on = g.modules.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${on ? "bg-sky-500/15 border-sky-400/50" : "bg-white/[0.03] border-white/10 text-white/70"}`}>
                <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center text-[9px] ${on ? "bg-sky-500 border-sky-300 text-white" : "border-white/30"}`}>{on ? "✓" : ""}</span>
                {m.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {onRemove && <button type="button" onClick={onRemove} className="px-3 py-2 rounded-lg border border-red-400/30 text-red-300 text-xs">Ta bort</button>}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs">Avbryt</button>
        <button type="button" disabled={busy || (!g.admin && !g.modules.length)} onClick={() => onSave(g)}
          className="px-3 py-2 rounded-lg bg-[#0a7ea4] text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
          {busy && <Loader2 size={12} className="animate-spin" />} Spara
        </button>
      </div>
    </div>
  );
}

function MemberGrants() {
  const utils = trpc.useUtils();
  const q = trpc.auth.grants.useQuery();
  const roster = trpc.players.list.useQuery(undefined, { staleTime: 60_000 });
  const refresh = () => {
    void utils.auth.grants.invalidate();
    void utils.auth.me.invalidate();
  };
  const onErr = (e: { message: string }) => toast.error(e.message);
  const save = trpc.auth.setGrant.useMutation({ onSuccess: () => { toast.success("Sparat – gäller direkt"); setEditing(null); setAdding(null); setSearch(""); refresh(); }, onError: onErr });
  const remove = trpc.auth.removeGrant.useMutation({ onSuccess: () => { toast.success("Behörigheten borttagen"); setEditing(null); refresh(); }, onError: onErr });
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ memberId: number; name: string; admin?: boolean } | null>(null);
  const [search, setSearch] = useState("");

  const granted = new Set(q.data?.grants.map((g) => g.memberId));
  const needle = search.trim().toLowerCase();
  const hits = needle
    ? (roster.data ?? [])
        .filter((p) => p.isMember && Number(p.externalId) > 0 && !granted.has(Number(p.externalId)) && p.name.toLowerCase().includes(needle))
        .slice(0, 6)
    : [];
  const moduleNames = (ids: string[]) => ACCESS_MODULES.filter((m) => ids.includes(m.id)).map((m) => m.name).join(", ");
  const b = q.data?.board;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-300" /> Medlemmar</h3>
      <p className="text-[11px] text-white/45">Medlemmen loggar in med sin e-post som vanligt och får det du väljer här.</p>

      {b && (b.missingAdmin.length > 0 || b.adminNotBoard.length > 0) && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> Stämmer inte med styrelsen på sajten</p>
          {b.missingAdmin.map((m) => (
            <div key={m.memberId} className="flex items-center gap-2">
              <span className="flex-1">{m.name ?? `Medlem ${m.memberId} (inte kopplad till en spelare)`} sitter i styrelsen men saknar Admin</span>
              <button onClick={() => setAdding({ memberId: m.memberId, name: m.name ?? `Medlem ${m.memberId}`, admin: true })} className="px-2 py-1 rounded-md bg-amber-500/20 border border-amber-400/40">Ge Admin</button>
            </div>
          ))}
          {b.adminNotBoard.map((n) => <p key={n}>{n} har Admin men sitter inte i styrelsen</p>)}
        </div>
      )}

      {adding ? (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-1.5"><UserRound size={14} /> {adding.name}</p>
          <GrantForm initial={{ admin: !!adding.admin, modules: [] }} busy={save.isPending}
            onSave={(g) => save.mutate({ memberId: adding.memberId, ...g })} onCancel={() => setAdding(null)} />
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2">
            <Search size={14} className="text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lägg till medlem – sök namn"
              className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
          </div>
          {hits.map((p) => (
            <button key={p.id} onClick={() => setAdding({ memberId: Number(p.externalId), name: p.name })}
              className="block w-full text-left text-sm px-3 py-1.5 rounded-lg hover:bg-white/5">{p.name}</button>
          ))}
          {needle && hits.length === 0 && <p className="text-[11px] text-white/40 px-1">Ingen medlem hittades. Bara medlemmar som är kopplade till en spelare syns här.</p>}
        </div>
      )}

      {q.isLoading && <Loader2 className="animate-spin text-white/40 mx-auto" />}
      <div className="rounded-xl border border-white/10 divide-y divide-white/5">
        {q.data?.grants.length === 0 && <p className="text-xs text-white/40 p-3">Ingen medlem har behörighet än.</p>}
        {q.data?.grants.map((g) => (
          <div key={g.memberId} className="p-3 space-y-2">
            <button onClick={() => setEditing(editing === g.memberId ? null : g.memberId)} className="w-full flex items-start gap-2 text-left">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{g.name}</p>
                <p className={`text-[11px] ${g.admin ? "text-emerald-300" : "text-white/55"}`}>{g.admin ? "Admin" : moduleNames(g.modules)}</p>
                <p className="text-[10px] text-white/35">
                  Av {g.grantedBy || "okänd"} {fmtDay(g.grantedAt)} · {g.lastUsedAt ? `använd ${fmtDay(g.lastUsedAt)}` : "inte använd än"}
                </p>
              </div>
              <Pencil size={13} className="text-white/40 mt-1" />
            </button>
            {editing === g.memberId && (
              <GrantForm initial={{ admin: g.admin, modules: g.modules as AccessModule[] }} busy={save.isPending || remove.isPending}
                onSave={(n) => save.mutate({ memberId: g.memberId, ...n })} onCancel={() => setEditing(null)}
                onRemove={() => { if (confirm(`Ta bort all behörighet för ${g.name}?`)) remove.mutate({ memberId: g.memberId }); }} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
