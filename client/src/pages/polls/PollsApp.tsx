/**
 * Omröstningar och intresseanmälningar – route /omrostningar.
 *
 * Alla kan svara utan inloggning (en röst per telefon, går att ändra). Är man
 * inloggad följer svaret med medlemmen. Resultatet visas när man svarat, när
 * omröstningen stängt och alltid för admin. Admin skapar, ändrar, stänger och
 * tar bort – och ser namnen på inloggade som svarat.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Lock, LockOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

const DEVICE_KEY = "poll-device";
const ACCENT = "#f5b301";

/** Telefonens hemliga nyckel (32 hex-tecken) – skapas första gången */
function deviceKey(): string {
  try {
    const old = localStorage.getItem(DEVICE_KEY);
    if (old && /^[a-f0-9]{32}$/.test(old)) return old;
  } catch { /* privat läge */ }
  const key = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem(DEVICE_KEY, key); } catch { /* privat läge */ }
  return key;
}

type Poll = inferRouterOutputs<AppRouter>["polls"]["list"][number];
type Draft = { id?: number; kind: "poll" | "interest"; title: string; description: string; options: Array<{ id?: number; text: string }>; multi: boolean; closesAt: string };

const KIND = {
  poll: { label: "Omröstning", chip: "bg-amber-400/15 text-amber-300", fill: "rgba(245,179,1,.22)", verb: "Rösta" },
  interest: { label: "Intresseanmälan", chip: "bg-sky-400/15 text-sky-300", fill: "rgba(56,189,248,.2)", verb: "Anmäl intresse" },
} as const;

const fmtClose = (d: Date | string) => new Date(d).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** Date → värdet i <input type="datetime-local"> (lokal tid) */
const toLocalInput = (d: Date | string | null) => {
  if (!d) return "";
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
const emptyDraft = (): Draft => ({ kind: "poll", title: "", description: "", options: [{ text: "" }, { text: "" }], multi: false, closesAt: "" });
const input = "w-full rounded-xl bg-white/5 border border-white/10 text-white px-3 py-2.5 text-[15px] placeholder:text-white/25";

export default function PollsApp() {
  const device = useMemo(deviceKey, []);
  const { isAdmin } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.polls.list.useQuery({ device }, { refetchInterval: 30_000 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => { void utils.polls.list.invalidate(); void utils.polls.summary.invalidate(); };

  const polls = list.data ?? [];
  const open = polls.filter((p) => p.open), closed = polls.filter((p) => !p.open);

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Omröstningar</h1>
          {isAdmin && !draft && (
            <button onClick={() => setDraft(emptyDraft())} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold text-black" style={{ background: ACCENT }}>
              <Plus size={16} /> Ny
            </button>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {draft && <Editor draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); refresh(); }} />}
        {list.isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>
        ) : !polls.length && !draft ? (
          <p className="text-white/50 text-sm py-16 text-center">Inga omröstningar just nu.</p>
        ) : (
          <>
            {open.map((p) => <PollCard key={p.id} poll={p} device={device} admin={isAdmin} onChanged={refresh} onEdit={() => setDraft(toDraft(p))} />)}
            {closed.length > 0 && <p className="text-xs text-white/40 pt-2">Stängda</p>}
            {closed.map((p) => <PollCard key={p.id} poll={p} device={device} admin={isAdmin} onChanged={refresh} onEdit={() => setDraft(toDraft(p))} />)}
          </>
        )}
      </main>
    </div>
  );
}

const toDraft = (p: Poll): Draft => ({
  id: p.id, kind: p.kind, title: p.title, description: p.description ?? "", options: p.options.map((o) => ({ id: o.id, text: o.text })),
  multi: p.multi, closesAt: toLocalInput(p.closesAt),
});

function PollCard({ poll: p, device, admin, onChanged, onEdit }: { poll: Poll; device: string; admin: boolean; onChanged: () => void; onEdit: () => void }) {
  const k = KIND[p.kind];
  const [sel, setSel] = useState<number[]>([]);
  const [changing, setChanging] = useState(false);
  const vote = trpc.polls.vote.useMutation();
  const unvote = trpc.polls.unvote.useMutation();
  const setClosed = trpc.polls.setClosed.useMutation();
  const del = trpc.polls.delete.useMutation();

  const voting = p.open && (!p.mine || changing);
  const pick = (id: number) => setSel((s) => p.multi ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]);
  const startChange = () => { setSel(p.mine ?? []); setChanging(true); };
  const send = async () => {
    try {
      await vote.mutateAsync({ device, pollId: p.id, choices: sel });
      setChanging(false);
      toast.success(p.kind === "interest" ? "Tack för din anmälan!" : "Tack för din röst!");
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const withdraw = async () => {
    if (!confirm(p.kind === "interest" ? "Ta tillbaka din anmälan?" : "Ta bort din röst?")) return;
    try { await unvote.mutateAsync({ device, pollId: p.id }); setChanging(false); setSel([]); onChanged(); } catch (e) { toast.error((e as Error).message); }
  };
  const total = p.counts ? Math.max(1, ...Object.values(p.counts)) : 1;
  const meta = [p.multi ? "Flera val" : "Ett val", p.open ? (p.closesAt ? `Stänger ${fmtClose(p.closesAt)}` : null) : "Stängd", `${p.voters} har svarat`].filter(Boolean).join(" · ");

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3" data-testid={`poll-${p.id}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${k.chip}`}>{k.label}</span>
        {!p.open && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white/60">Stängd</span>}
        {admin && (
          <div className="ml-auto flex items-center gap-1 text-white/50">
            <button onClick={onEdit} className="p-1.5 hover:text-white" aria-label="Ändra"><Pencil size={15} /></button>
            <button onClick={async () => { await setClosed.mutateAsync({ id: p.id, closed: p.open }); onChanged(); }} className="p-1.5 hover:text-white" aria-label={p.open ? "Stäng" : "Öppna igen"} title={p.open ? "Stäng" : "Öppna igen"}>
              {p.open ? <Lock size={15} /> : <LockOpen size={15} />}
            </button>
            <button onClick={async () => { if (confirm(`Ta bort "${p.title}" och alla svar?`)) { await del.mutateAsync({ id: p.id }); onChanged(); } }} className="p-1.5 hover:text-red-300" aria-label="Ta bort"><Trash2 size={15} /></button>
          </div>
        )}
      </div>
      <h2 className="text-xl leading-tight font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>{p.title}</h2>
      {p.description && <p className="text-sm text-white/60 whitespace-pre-line">{p.description}</p>}
      <p className="text-[11px] text-white/40">{meta}</p>

      {voting ? (
        <div className="space-y-2">
          {p.options.map((o) => {
            const on = sel.includes(o.id);
            return (
              <button key={o.id} onClick={() => pick(o.id)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left text-[15px] transition-colors ${on ? "border-amber-400 bg-amber-400/10" : "border-white/12 bg-white/[0.03]"}`}>
                <span className={`w-[18px] h-[18px] shrink-0 border-2 flex items-center justify-center ${p.multi ? "rounded-[5px]" : "rounded-full"} ${on ? "border-amber-400 bg-amber-400" : "border-white/35"}`}>{on && <Check size={12} className="text-black" strokeWidth={3} />}</span>
                {o.text}
              </button>
            );
          })}
          <div className="flex gap-2 pt-1">
            {changing && <button onClick={() => setChanging(false)} className="px-4 py-3 rounded-xl border border-white/15 text-sm text-white/70">Avbryt</button>}
            <button onClick={() => void send()} disabled={!sel.length || vote.isPending} className="flex-1 py-3 rounded-xl font-bold text-black disabled:opacity-35 flex items-center justify-center gap-2" style={{ background: ACCENT }}>
              {vote.isPending && <Loader2 size={16} className="animate-spin" />}{changing ? "Spara" : k.verb}
            </button>
          </div>
          {!changing && <p className="text-[11px] text-white/35 text-center">Inget namn behövs. Du kan ändra ditt svar från den här telefonen.</p>}
        </div>
      ) : null}

      {p.counts && (!voting || admin) && (
        <div className="space-y-2">
          {p.mine && !changing && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2"><Check size={13} className="inline mr-1" />Ditt svar: {p.options.filter((o) => p.mine!.includes(o.id)).map((o) => o.text).join(", ")}</p>}
          {voting && admin && <p className="text-[11px] text-white/40">Resultat hittills (syns för admin)</p>}
          {p.options.map((o) => {
            const n = p.counts![o.id] ?? 0, mine = !!p.mine?.includes(o.id);
            return (
              <div key={o.id}>
                <div className={`relative overflow-hidden rounded-xl border px-3 py-2.5 flex justify-between text-[15px] ${mine ? "border-amber-400" : "border-white/10"}`}>
                  <div className="absolute inset-y-0 left-0" style={{ width: `${(n / total) * 100}%`, background: k.fill }} />
                  <span className="relative">{o.text}{mine && " ✓"}</span>
                  <span className="relative font-semibold tabular-nums">{n}</span>
                </div>
                {admin && !!p.names?.[o.id]?.length && <p className="text-[11px] text-white/45 px-3 pt-1">{p.names[o.id].join(", ")}</p>}
              </div>
            );
          })}
          {p.open && p.mine && !changing && (
            <div className="flex gap-2">
              <button onClick={startChange} className="flex-1 py-2.5 rounded-xl border border-white/15 text-sm text-white/80">Ändra mitt svar</button>
              <button onClick={() => void withdraw()} className="px-4 py-2.5 rounded-xl border border-white/15 text-sm text-white/50">Ta bort</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Editor({ draft: d, setDraft, onSaved }: { draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const save = trpc.polls.save.useMutation();
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const setOpt = (i: number, text: string) => set({ options: d.options.map((o, j) => (j === i ? { ...o, text } : o)) });
  const submit = async () => {
    try {
      await save.mutateAsync({
        id: d.id, kind: d.kind, title: d.title, description: d.description.trim() || null,
        options: d.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id ?? null, text: o.text })),
        multi: d.multi, closesAt: d.closesAt ? new Date(d.closesAt).toISOString() : null,
      });
      toast.success(d.id ? "Ändrad" : "Publicerad");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };
  const seg = (on: boolean) => `flex-1 py-2 rounded-lg text-sm ${on ? "font-bold text-black" : "text-white/60"}`;
  const ready = d.title.trim() && d.options.some((o) => o.text.trim());

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.04] p-4 space-y-3" data-testid="poll-editor">
      <div className="flex items-center">
        <h2 className="font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>{d.id ? "Ändra" : "Ny omröstning"}</h2>
        <button onClick={() => setDraft(null)} className="text-white/50" aria-label="Stäng"><X size={18} /></button>
      </div>
      <div className="flex gap-1 p-1 rounded-xl bg-white/5">
        {(["poll", "interest"] as const).map((k) => <button key={k} onClick={() => set({ kind: k })} className={seg(d.kind === k)} style={d.kind === k ? { background: ACCENT } : undefined}>{KIND[k].label}</button>)}
      </div>
      <label className="block text-[11px] text-white/50">Rubrik<input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="T.ex. Julavslutning – vilken dag passar?" className={`${input} mt-1`} /></label>
      <label className="block text-[11px] text-white/50">Beskrivning (valfri)<textarea value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} rows={3} className={`${input} mt-1`} /></label>
      <div className="space-y-1.5">
        <p className="text-[11px] text-white/50">Svarsalternativ</p>
        {d.options.map((o, i) => (
          <div key={o.id ?? `n${i}`} className="flex gap-2">
            <input value={o.text} onChange={(e) => setOpt(i, e.target.value)} maxLength={120} placeholder={`Alternativ ${i + 1}`} className={input} />
            {d.options.length > 1 && <button onClick={() => set({ options: d.options.filter((_, j) => j !== i) })} className="px-2 text-white/40 hover:text-red-300" aria-label="Ta bort alternativet"><X size={16} /></button>}
          </div>
        ))}
        {d.options.length < 20 && <button onClick={() => set({ options: [...d.options, { text: "" }] })} className="w-full py-2 rounded-xl border border-dashed border-white/15 text-sm text-white/50">+ Lägg till alternativ</button>}
        {d.id && <p className="text-[10px] text-white/35">Tar du bort ett alternativ försvinner svaren på det.</p>}
      </div>
      <div className="flex gap-1 p-1 rounded-xl bg-white/5">
        <button onClick={() => set({ multi: false })} className={seg(!d.multi)} style={!d.multi ? { background: ACCENT } : undefined}>Ett val</button>
        <button onClick={() => set({ multi: true })} className={seg(d.multi)} style={d.multi ? { background: ACCENT } : undefined}>Flera val</button>
      </div>
      <label className="block text-[11px] text-white/50">Stänger (valfritt)
        <div className="flex gap-2 mt-1">
          <input type="datetime-local" value={d.closesAt} onChange={(e) => set({ closesAt: e.target.value })} className={input} />
          {d.closesAt && <button onClick={() => set({ closesAt: "" })} className="px-2 text-white/40" aria-label="Ingen stängningstid"><X size={16} /></button>}
        </div>
      </label>
      <button onClick={() => void submit()} disabled={!ready || save.isPending} className="w-full py-3 rounded-xl font-bold text-black disabled:opacity-35 flex items-center justify-center gap-2" style={{ background: ACCENT }}>
        {save.isPending && <Loader2 size={16} className="animate-spin" />}{d.id ? "Spara" : "Publicera"}
      </button>
    </section>
  );
}
