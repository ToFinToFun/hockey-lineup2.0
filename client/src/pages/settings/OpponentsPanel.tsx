/**
 * Inställningar → Motståndare (beta): lag vi spelar mot, med logga, färg och
 * spelare. Sparas så att nästa match mot samma lag är förifylld.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2, Upload, Archive, ChevronRight, Link2, Copy, Share2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { prepareLogo } from "./ClubPanel";

const POSITIONS = ["", "MV", "B", "C", "F"] as const;
const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 placeholder:text-white/30";

function Logo({ url, color, size = 36 }: { url: string | null; color: string; size?: number }) {
  return url
    ? <img src={url} alt="" style={{ width: size, height: size }} className="object-contain shrink-0" />
    : <span style={{ width: size, height: size, background: color }} className="rounded-full shrink-0 border border-white/20" />;
}

/** Länk som motståndaren kan öppna för att fylla i lag, spelare och uppställning. */
function ShareLinks({ opponentId, name }: { opponentId: number; name: string }) {
  const utils = trpc.useUtils();
  const links = trpc.opponents.links.useQuery({ opponentId });
  const create = trpc.opponents.createLink.useMutation({
    onSuccess: () => void utils.opponents.links.invalidate({ opponentId }),
    onError: (e) => toast.error("Kunde inte skapa länken", { description: e.message }),
  });
  const revoke = trpc.opponents.revokeLink.useMutation({ onSuccess: () => void utils.opponents.links.invalidate({ opponentId }) });
  const [ourView, setOurView] = useState<"lineup" | "players" | "none">("none");
  // Matchdagen: förifylls om Lineup är inställd på matchen mot laget med egen dag
  const live = trpc.lineup.scoreState.useQuery(undefined, { staleTime: 60_000, retry: false });
  const liveSetup = (live.data as { setup?: { mode?: string; opponentId?: number | null; date?: string | null } } | undefined)?.setup;
  const [matchDate, setMatchDate] = useState("");
  useEffect(() => {
    if (!matchDate && liveSetup?.mode === "external" && liveSetup.opponentId === opponentId && liveSetup.date) setMatchDate(liveSetup.date);
  }, [liveSetup?.date, liveSetup?.opponentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const url = (token: string) => `${window.location.origin}/lag/${token}`;
  const share = async (token: string) => {
    const u = url(token);
    try {
      if (navigator.share) await navigator.share({ title: `Lagets uppställning – ${name}`, url: u });
      else { await navigator.clipboard.writeText(u); toast.success("Länken kopierad"); }
    } catch { /* avbrutet */ }
  };
  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-500/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-sky-200 flex items-center gap-1.5"><Link2 size={13} /> Dela länk till laget</p>
      <p className="text-[11px] text-white/45">Laget kan själva fylla i namn, logga och spelare och göra sin uppställning – utan inloggning. Ändringarna syns direkt i Lineup när matchen mot laget är vald; annars sparas de på laget och fylls i när laget väljs. Ni kan köra internmatcher emellan.</p>
      <label className="block text-[11px] text-white/50">Matchdag
        <input type="date" min={todayIso} value={matchDate} onChange={(e) => setMatchDate(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5" />
        <span className="block text-[10px] text-white/35 mt-1">{matchDate ? "Länken slutar fungera ett dygn efter matchdagen." : "Utan matchdag gäller länken i 7 dagar."}</span>
      </label>
      <div>
        <p className="text-[11px] text-white/50 mb-1">Vårt lag på deras sida</p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Vårt lag på deras sida">
          {([["lineup", "Visa uppställning"], ["players", "Visa spelare"], ["none", "Dölj allt"]] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={ourView === v} onClick={() => setOurView(v)}
              className={`py-1.5 rounded-lg text-[11px] font-semibold border ${ourView === v ? "bg-sky-500/25 border-sky-400/60 text-sky-100" : "bg-white/5 border-white/10 text-white/55"}`}>{label}</button>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-1">{ourView === "lineup" ? "De ser våra spelare på sina platser (kedjor och backpar)." : ourView === "players" ? "De ser vilka som spelar, men inte på vilka platser." : "De ser inget av vårt lag."}</p>
      </div>
      <button onClick={() => create.mutate({ opponentId, ourView, days: 7, matchDate: matchDate || null })} disabled={create.isPending}
        className="w-full py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-100 text-sm font-semibold disabled:opacity-40">Skapa länk</button>
      {(links.data ?? []).map((l) => (
        <div key={l.token} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5">
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] text-white/80 truncate">{url(l.token)}</span>
            <span className="block text-[10px] text-white/40">{l.ourView === "lineup" ? "Ser vår uppställning" : l.ourView === "players" ? "Ser våra spelare" : "Ser inget av vårt lag"} {l.matchDate ? ` · match ${new Date(l.matchDate + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}` : ""} · gäller till {new Date(new Date(l.expiresAt).getTime() - 60_000).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}</span>
          </span>
          <button onClick={() => { void navigator.clipboard.writeText(url(l.token)); toast.success("Länken kopierad"); }} aria-label="Kopiera" className="p-1.5 text-white/60 hover:text-white"><Copy size={13} /></button>
          <button onClick={() => void share(l.token)} aria-label="Dela" className="p-1.5 text-white/60 hover:text-white"><Share2 size={13} /></button>
          <button onClick={() => revoke.mutate({ token: l.token })} aria-label="Stäng länken" className="p-1.5 text-red-300/70 hover:text-red-300"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function OpponentEditor({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.opponents.get.useQuery({ id });
  const refresh = () => { void utils.opponents.get.invalidate({ id }); void utils.opponents.list.invalidate(); };
  const save = trpc.opponents.save.useMutation({ onSuccess: refresh, onError: (e) => toast.error("Kunde inte spara", { description: e.message }) });
  const del = trpc.opponents.delete.useMutation({ onSuccess: () => { void utils.opponents.list.invalidate(); onBack(); } });
  const addPlayer = trpc.opponents.addPlayer.useMutation({ onSuccess: refresh });
  const updatePlayer = trpc.opponents.updatePlayer.useMutation({ onSuccess: refresh });
  const deletePlayer = trpc.opponents.deletePlayer.useMutation({ onSuccess: refresh });
  const [form, setForm] = useState<{ name: string; shortName: string; color: string } | null>(null);
  const [np, setNp] = useState({ name: "", number: "", position: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  useEffect(() => { if (q.data && !form) setForm({ name: q.data.name, shortName: q.data.shortName ?? "", color: q.data.color }); }, [q.data, form]);
  if (!q.data || !form) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const o = q.data;
  const dirty = form.name !== o.name || form.shortName !== (o.shortName ?? "") || form.color !== o.color;
  const add = () => {
    if (!np.name.trim()) return;
    addPlayer.mutate({ opponentId: id, name: np.name, number: np.number || null, position: (np.position || null) as never });
    setNp({ name: "", number: "", position: np.position });
    nameRef.current?.focus(); // nästa spelare direkt
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-white/50 hover:text-white"><ArrowLeft size={14} /> Alla lag</button>
      <div className="flex items-center gap-3">
        <Logo url={o.logoUrl} color={o.color} size={56} />
        <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs cursor-pointer">
          <Upload size={12} /> {o.logoUrl ? "Byt logga" : "Lägg till logga"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) save.mutate({ id, name: o.name, logoBase64: await prepareLogo(f) });
          }} />
        </label>
        {o.logoUrl && <button onClick={() => save.mutate({ id, name: o.name, logoBase64: null })} className="text-[11px] text-white/40 hover:text-white">Ta bort logga</button>}
      </div>
      <div className="grid grid-cols-[1fr_5rem_4rem] gap-2">
        <label className="text-[11px] text-white/50">Namn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} className={input} /></label>
        <label className="text-[11px] text-white/50">Kort<input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} maxLength={10} className={input} /></label>
        <label className="text-[11px] text-white/50">Färg<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full h-[38px] rounded-lg bg-white/5 border border-white/10" /></label>
      </div>
      {dirty && <button onClick={() => save.mutate({ id, name: form.name, shortName: form.shortName || null, color: form.color })} className="w-full py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold">Spara</button>}

      <div>
        <p className="text-[11px] text-white/50 mb-1.5">Spelare ({o.playerCount})</p>
        <div className="grid grid-cols-[1fr_3.5rem_4.5rem_2.25rem] gap-1.5 mb-2">
          <input ref={nameRef} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} onKeyDown={onEnter} placeholder="Namn" maxLength={80} className={input} />
          <input value={np.number} onChange={(e) => setNp({ ...np, number: e.target.value.replace(/\D/g, "").slice(0, 3) })} onKeyDown={onEnter} placeholder="Nr" inputMode="numeric" className={`${input} text-center`} />
          <select value={np.position} onChange={(e) => setNp({ ...np, position: e.target.value })} onKeyDown={onEnter} className={input}>{POSITIONS.map((p) => <option key={p} value={p} className="text-black">{p || "–"}</option>)}</select>
          <button onClick={add} disabled={!np.name.trim()} aria-label="Lägg till spelare" className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
        </div>
        <ul className="space-y-1">
          {o.players.map((p) => (
            <li key={p.id} className={`grid grid-cols-[1fr_3.5rem_4.5rem_2.25rem] gap-1.5 items-center ${p.active ? "" : "opacity-50"}`}>
              <input defaultValue={p.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== p.name) updatePlayer.mutate({ opponentId: id, id: p.id, name: e.target.value }); }} className={input} />
              <input defaultValue={p.number ?? ""} onBlur={(e) => { if (e.target.value !== (p.number ?? "")) updatePlayer.mutate({ opponentId: id, id: p.id, number: e.target.value || null }); }} inputMode="numeric" className={`${input} text-center`} />
              <select value={p.position ?? ""} onChange={(e) => updatePlayer.mutate({ opponentId: id, id: p.id, position: (e.target.value || null) as never })} className={input}>{POSITIONS.map((x) => <option key={x} value={x} className="text-black">{x || "–"}</option>)}</select>
              <button onClick={() => { if (confirm(`Ta bort ${p.name}?`)) deletePlayer.mutate({ opponentId: id, id: p.id }); }} aria-label="Ta bort" className="text-red-300/60 hover:text-red-300 flex items-center justify-center"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        {o.players.length === 0 && <p className="text-xs text-white/35">Inga spelare än – lägg till dem ovan (eller direkt i uppställningen senare).</p>}
      </div>

      <ShareLinks opponentId={id} name={o.name} />

      <div className="flex gap-2 pt-2 border-t border-white/10">
        <button onClick={() => save.mutate({ id, name: o.name, archived: !o.archived })} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs"><Archive size={13} /> {o.archived ? "Visa igen" : "Arkivera"}</button>
        <button onClick={() => { if (confirm(`Ta bort ${o.name} och alla dess spelare?`)) del.mutate({ id }); }} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/30 text-red-300 text-xs"><Trash2 size={13} /> Ta bort laget</button>
      </div>
    </div>
  );
}

export function OpponentsPanel() {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const list = trpc.opponents.list.useQuery({ includeArchived: showArchived });
  const create = trpc.opponents.save.useMutation({ onSuccess: (r) => { void utils.opponents.list.invalidate(); setOpen(r.id); } });
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState("");
  if (open) return <OpponentEditor id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">Lag vi spelar mot. Logga, färg och spelare sparas, så att nästa match mot samma lag är förifylld. Välj motståndare i Lineup under menyn → Match.</p>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { create.mutate({ name }); setName(""); } }} placeholder="Nytt lag, t.ex. Kalix HC" maxLength={80} className={input} />
        <button onClick={() => { if (name.trim()) { create.mutate({ name }); setName(""); } }} disabled={!name.trim()} className="shrink-0 flex items-center gap-1 px-3 rounded-lg bg-emerald-500 text-emerald-950 text-sm font-bold disabled:opacity-40"><Plus size={14} /> Skapa</button>
      </div>
      {list.isLoading ? <Loader2 className="animate-spin text-white/40" /> : (
        <ul className="space-y-1.5">
          {(list.data ?? []).map((o) => (
            <li key={o.id}>
              <button onClick={() => setOpen(o.id)} className={`w-full flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 text-left ${o.archived ? "opacity-50" : ""}`}>
                <Logo url={o.logoUrl} color={o.color} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{o.name}{o.shortName ? <span className="text-white/40 font-normal"> · {o.shortName}</span> : null}</span>
                  <span className="block text-[11px] text-white/40">{o.playerCount} spelare{o.archived ? " · arkiverad" : ""}</span>
                </span>
                <ChevronRight size={16} className="text-white/30" />
              </button>
            </li>
          ))}
          {list.data?.length === 0 && <p className="text-xs text-white/35">Inga lag än.</p>}
        </ul>
      )}
      <label className="flex items-center gap-2 text-[11px] text-white/45"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Visa arkiverade</label>
    </div>
  );
}
