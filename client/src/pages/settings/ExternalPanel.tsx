/**
 * Externa källor: API-nyckel till Highlightly (SHL-tabell och SHL-matcher i
 * Stålbladet). Nyckeln visas aldrig igen efter att den sparats – bara de fyra
 * sista tecknen. Servern hämtar själv och räknar anropen per dygn.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "–");

export function ExternalPanel() {
  const utils = trpc.useUtils();
  const q = trpc.external.status.useQuery();
  const set = trpc.external.set.useMutation({
    onSuccess: (s) => { utils.external.status.setData(undefined, s); setKey(""); toast.success("Sparat"); },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const refresh = trpc.external.refresh.useMutation({
    onSuccess: (r) => {
      utils.external.status.setData(undefined, r.status);
      void utils.external.shl.invalidate();
      if (r.error) toast.error("Hämtningen misslyckades", { description: r.error });
      else toast.success(`Hämtat: ${[r.table && "tabellen", r.matches && "dagens matcher"].filter(Boolean).join(" och ") || "inget nytt"}`);
    },
    onError: (e) => toast.error("Kunde inte hämta", { description: e.message }),
  });
  const [key, setKey] = useState("");
  const s = q.data;
  if (q.isLoading || !s) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2";

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/60">
        SHL-tabellen och SHL-matcher i Stålbladet hämtas från {s.source}s hockey-API (gratis upp till 100 anrop per dygn).
        Skapa ett konto, kopiera API-nyckeln och klistra in den här. Servern hämtar sedan själv: tabellen varje timme
        dagtid, dagens matcher var tredje timme och var tionde minut när en SHL-match pågår.
      </p>
      <a href="https://highlightly.net/hockey-api/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300/80 hover:text-sky-200">Highlightly hockey-API <ExternalLink size={12} /></a>

      <div className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${s.configured && !s.lastError ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : s.lastError ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
        {s.configured && !s.lastError ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertTriangle size={14} className="shrink-0 mt-px" />}
        <div className="space-y-0.5">
          <p>{s.configured ? <>Nyckel sparad ({s.keyMasked}){s.rapidApi ? " – via RapidAPI" : ""}.</> : <>Ingen nyckel än – SHL-rutorna i tidningen är avstängda.</>}</p>
          {s.lastError && <p>Senaste fel ({time(s.lastErrorAt)}): {s.lastError}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] text-white/50">{s.configured ? "Byt nyckel" : "API-nyckel"}
          <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder={s.configured ? "Klistra in en ny nyckel" : "Klistra in nyckeln"} className={input} />
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={s.rapidApi} onChange={(e) => set.mutate({ rapidApi: e.target.checked })} /> Nyckeln är från RapidAPI (inte direkt från Highlightly)
        </label>
        <div className="flex gap-2">
          <button onClick={() => set.mutate({ apiKey: key })} disabled={!key.trim() || set.isPending} className="flex-1 py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">{set.isPending ? "Sparar…" : "Spara nyckeln"}</button>
          {s.configured && <button onClick={() => { if (confirm("Ta bort nyckeln? Det sparade ligger kvar men uppdateras inte.")) set.mutate({ apiKey: null }); }} className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/25 text-red-300 text-sm">Ta bort</button>}
        </div>
      </div>

      {s.configured && (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2 text-xs text-white/70">
          <div className="grid grid-cols-2 gap-y-1">
            <span className="text-white/45">Anrop i dag</span><span>{s.callsToday} av max {s.dailyCap}{s.remaining != null ? ` (källan: ${s.remaining} kvar)` : ""}</span>
            <span className="text-white/45">SHL-tabellen</span><span>{s.tableRows ? `${s.tableRows} lag · ${time(s.tableFetchedAt)}` : "inte hämtad än"}</span>
            <span className="text-white/45">Dagens matcher</span><span>{s.matchesFetchedAt ? `${s.matchesToday} st · ${time(s.matchesFetchedAt)}` : "inte hämtade än"}</span>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={(e) => set.mutate({ enabled: e.target.checked })} /> Hämta automatiskt</label>
          <label className="flex items-center gap-2">Max anrop per dygn
            <input type="number" min={5} max={1000} defaultValue={s.dailyCap} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== s.dailyCap) set.mutate({ dailyCap: v }); }} className="w-20 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
          </label>
          <p className="text-[10px] text-white/40">När taket nås slutar servern hämta till midnatt och tidningen visar det senast hämtade med tid. Gratisnivån har 100 anrop per dygn.</p>
          <button onClick={() => refresh.mutate()} disabled={refresh.isPending} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm disabled:opacity-40">
            {refresh.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Hämta nu (2–3 anrop)
          </button>
        </div>
      )}
    </div>
  );
}
