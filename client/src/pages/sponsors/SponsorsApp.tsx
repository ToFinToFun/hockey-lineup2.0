/**
 * SponsorsApp – sponsorregistret (styrelsen).
 *
 * Namn och valfri logga. Loggan bearbetas i webbläsaren (beskärs, skalas,
 * sparas som PNG) och används i Score Tracker, matchrapporten och laget.se-nyheten.
 * Räknarna visar hur ofta sponsorn visats denna och förra säsongen (1 juni–31 maj).
 */
import { useRef, useState } from "react";
import { Redirect } from "wouter";
import { toast } from "sonner";
import { Plus, X, Loader2, ChevronUp, ChevronDown, Trash2, ImageOff, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSponsors, type Sponsor } from "@/lib/sponsors";
import { processLogo, type LogoOptions } from "@/lib/logoProcess";

/** Gamla adressen /sponsorer leder till Inställningar → Sponsorer. */
export default function SponsorsApp() {
  return <Redirect to="/installningar?flik=sponsorer" />;
}

/** Sponsorregistret – visas under Inställningar. */
export function SponsorsPanel() {
  const { sponsors, season, query } = useSponsors();
  const utils = trpc.useUtils();
  const refresh = () => utils.sponsors.list.invalidate();
  const [editing, setEditing] = useState<Sponsor | "new" | null>(null);

  const update = trpc.sponsors.update.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const move = trpc.sponsors.move.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  const loaded = !!query.data;

  return (
    <div className="text-white">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <p className="text-white/40 text-xs flex-1">
            Sponsorerna visas i Score Tracker (en per mål), i matchrapporten och som matchsponsor i nyheten till laget.se.
            Den som visats minst väljs automatiskt. Räknarna nollas 1 juni.
          </p>
          <button
            onClick={() => setEditing("new")}
            disabled={!loaded}
            className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 disabled:opacity-50"
          >
            <Plus size={14} /> Ny sponsor
          </button>
        </div>

        {query.isLoading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/40" /></div>}
        {query.error && !loaded && <p className="text-red-300 text-sm">Sponsorerna kunde inte hämtas: {query.error.message}</p>}

        {loaded && (
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-3 py-2 text-[10px] text-white/40 border-b border-white/10 bg-white/[0.02]">
              <span>Sponsor</span>
              <span className="text-right w-24">Mål {season?.label}<br /><span className="text-white/25">förra {season?.previousLabel}</span></span>
              <span className="text-right w-24">Lagnyheter<br /><span className="text-white/25">förra</span></span>
            </div>
            {sponsors.length === 0 && <p className="px-3 py-6 text-center text-white/40 text-sm">Inga sponsorer ännu.</p>}
            {sponsors.map((s, i) => (
              <div key={s.id} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 items-center px-3 py-2.5 border-b border-white/5 last:border-0 ${s.active ? "" : "opacity-45"}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col">
                    <button aria-label="Flytta upp" disabled={i === 0 || move.isPending} onClick={() => move.mutate({ id: s.id, direction: "up" })} className="text-white/30 hover:text-white disabled:opacity-20"><ChevronUp size={14} /></button>
                    <button aria-label="Flytta ner" disabled={i === sponsors.length - 1 || move.isPending} onClick={() => move.mutate({ id: s.id, direction: "down" })} className="text-white/30 hover:text-white disabled:opacity-20"><ChevronDown size={14} /></button>
                  </div>
                  <button onClick={() => setEditing(s)} className="flex items-center gap-3 min-w-0 text-left">
                    <div className="w-24 h-10 shrink-0 rounded-md bg-[#1b1f1d] border border-white/10 flex items-center justify-center p-1">
                      {s.logo ? <img src={s.logo} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[11px] font-bold truncate px-1" style={{ fontFamily: "'Oswald', sans-serif" }}>{s.name}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{s.name}</p>
                      <p className="text-[10px] text-white/40">{s.logo ? "Logga" : "Bara text"}{s.active ? "" : " · inaktiv"}</p>
                    </div>
                  </button>
                </div>
                <div className="text-right w-24">
                  <p className="text-sm tabular-nums">{s.counts.matches}</p>
                  <p className="text-[10px] text-white/30 tabular-nums">{s.previous.matches}</p>
                </div>
                <div className="text-right w-24 flex items-center justify-end gap-2">
                  <div>
                    <p className="text-sm tabular-nums">{s.counts.lineups}</p>
                    <p className="text-[10px] text-white/30 tabular-nums">{s.previous.lineups}</p>
                  </div>
                  <button
                    onClick={() => update.mutate({ id: s.id, active: !s.active })}
                    className={`ml-1 text-[10px] px-2 py-1 rounded border ${s.active ? "border-emerald-400/30 text-emerald-300" : "border-white/15 text-white/50"}`}
                    title={s.active ? "Pausa sponsorn" : "Aktivera sponsorn"}
                  >
                    {s.active ? "Aktiv" : "Pausad"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && <SponsorEditor sponsor={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function SponsorEditor({ sponsor, onClose, onSaved }: { sponsor: Sponsor | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(sponsor?.name ?? "");
  // undefined = oförändrad, null = ingen logga, string = ny logga
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<LogoOptions>({ removeWhite: false, makeWhite: false });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = trpc.sponsors.create.useMutation();
  const update = trpc.sponsors.update.useMutation();
  const del = trpc.sponsors.delete.useMutation();
  const saving = create.isPending || update.isPending;

  const shownLogo = logo === undefined ? sponsor?.logo ?? null : logo;

  const runProcess = async (f: File, o: LogoOptions) => {
    setProcessing(true);
    setError(null);
    try {
      setLogo(await processLogo(f, o));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const onPick = (f: File) => {
    setFile(f);
    void runProcess(f, opts);
  };
  const toggle = (key: keyof LogoOptions) => {
    const next = { ...opts, [key]: !opts[key] };
    setOpts(next);
    if (file) void runProcess(file, next);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Skriv sponsorns namn");
      return;
    }
    setError(null);
    try {
      if (sponsor) {
        await update.mutateAsync({ id: sponsor.id, name: trimmed, ...(logo !== undefined ? { logo } : {}) });
        toast.success("Sponsorn sparad");
      } else {
        await create.mutateAsync({ name: trimmed, logo: logo ?? null, active: true });
        toast.success("Sponsorn tillagd");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!sponsor) return;
    if (!confirm(`Ta bort "${sponsor.name}"? Målen som redan registrerats behåller namnet. Vill du bara pausa sponsorn, använd Aktiv/Pausad i listan.`)) return;
    try {
      await del.mutateAsync({ id: sponsor.id });
      toast.success("Sponsorn borttagen");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#161616] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{sponsor ? "Redigera sponsor" : "Ny sponsor"}</h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50"><X size={18} /></button>
        </div>

        <div>
          <label htmlFor="sponsor-name" className="block text-[11px] text-white/50 mb-1">Namn</label>
          <input
            id="sponsor-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="Polar"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
          />
          {sponsor && name.trim() !== sponsor.name && name.trim() && (
            <p className="text-[10px] text-white/40 mt-1">Registrerade mål byter också namn, så räknarna följer med.</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-white/50">Logga (valfri – utan logga visas namnet)</p>
          <div className="rounded-xl border border-white/10 bg-[#0f1411] h-28 flex items-center justify-center p-3 relative">
            {processing ? (
              <Loader2 className="animate-spin text-white/40" />
            ) : shownLogo ? (
              <img src={shownLogo} alt="Förhandsvisning på mörk bakgrund" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-2xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>{name.trim() || "Sponsor"}</span>
            )}
            <span className="absolute bottom-1 right-2 text-[9px] text-white/25">så här syns den i appen</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Upload size={14} /> {shownLogo ? "Byt bild" : "Välj bild"}
            </button>
            {shownLogo && (
              <button onClick={() => { setLogo(null); setFile(null); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70">
                <ImageOff size={14} /> Bara text
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
            />
          </div>

          {file && (
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={opts.removeWhite} onChange={() => toggle("removeWhite")} />
                Ta bort vit bakgrund
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={opts.makeWhite} onChange={() => toggle("makeWhite")} />
                Gör loggan vit (för mörka loggor)
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-red-300 text-xs">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {sponsor && (
            <button onClick={remove} disabled={del.isPending} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-red-300 border border-red-400/20">
              <Trash2 size={14} /> Ta bort
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-white/15 text-white/70">Avbryt</button>
          <button onClick={save} disabled={saving || processing} className="text-xs px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-semibold disabled:opacity-50">
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}
