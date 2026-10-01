/**
 * Val av matchtyp i Lineup (beta): Internmatch eller Mot motståndare, vilket
 * lag vi möter och vårt lags namn och logga.
 */
import { club } from "@shared/club";
import { teamName } from "@shared/teams";
import type { MatchSetup, OurLogo } from "@shared/matchSetup";
import { trpc } from "@/lib/trpc";

export function ourLogoUrl(setup: MatchSetup): string {
  const c = club();
  return setup.ourLogo === "white" ? c.teams.white.logo : setup.ourLogo === "green" ? c.teams.green.logo : c.logo;
}

export function MatchSetupBar({ setup, onChange, dark = true }: { setup: MatchSetup; onChange: (next: MatchSetup, opponentName?: string) => void; dark?: boolean }) {
  const list = trpc.opponents.list.useQuery(undefined, { staleTime: 60_000 });
  const chip = (on: boolean) => `px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${on ? "bg-sky-500/20 border-sky-400/60 text-sky-100" : dark ? "bg-white/5 border-white/10 text-white/55" : "bg-gray-100 border-gray-200 text-gray-600"}`;
  const logos: Array<{ id: OurLogo; label: string; url: string }> = [
    { id: "club", label: club().shortName || "Klubben", url: club().logo },
    { id: "white", label: teamName("white"), url: club().teams.white.logo },
    { id: "green", label: teamName("green"), url: club().teams.green.logo },
  ];
  const nameOf = (id: number | null) => list.data?.find((o) => o.id === id)?.name;
  return (
    <div className={`rounded-xl border px-2.5 py-2 flex flex-wrap items-center gap-2 ${dark ? "border-sky-400/20 bg-sky-500/5" : "border-sky-200 bg-sky-50"}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80">Beta</span>
      <button onClick={() => onChange({ mode: "internal", opponentId: null, ourName: null, ourLogo: "club" })} className={chip(setup.mode === "internal")}>Internmatch</button>
      <button onClick={() => onChange({ ...setup, mode: "external" }, nameOf(setup.opponentId))} className={chip(setup.mode === "external")}>Mot motståndare</button>
      {setup.mode === "external" && (
        <>
          <select value={setup.opponentId ?? ""} onChange={(e) => {
            const id = Number(e.target.value) || null;
            onChange({ ...setup, opponentId: id }, nameOf(id));
          }} aria-label="Motståndare" className={`rounded-lg px-2 py-1 text-xs ${dark ? "bg-white/5 border border-white/10 text-white" : "bg-white border border-gray-200"}`}>
            <option value="" className="text-black">Välj lag…</option>
            {(list.data ?? []).map((o) => <option key={o.id} value={o.id} className="text-black">{o.name}</option>)}
          </select>
          <input value={setup.ourName ?? ""} onChange={(e) => onChange({ ...setup, ourName: e.target.value || null }, nameOf(setup.opponentId))} placeholder={club().name} maxLength={40}
            className={`w-36 rounded-lg px-2 py-1 text-xs ${dark ? "bg-white/5 border border-white/10 text-white placeholder:text-white/30" : "bg-white border border-gray-200"}`} title="Vårt lags namn" aria-label="Vårt lags namn" />
          <div className="flex items-center gap-1" title="Vårt lags logga">
            {logos.map((l) => (
              <button key={l.id} onClick={() => onChange({ ...setup, ourLogo: l.id }, nameOf(setup.opponentId))} title={l.label}
                className={`w-7 h-7 rounded-md border p-0.5 ${setup.ourLogo === l.id ? "border-sky-400 bg-sky-500/20" : "border-white/10"}`}>
                <img src={l.url} alt={l.label} className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
          {list.data?.length === 0 && <span className="text-[10px] text-white/40">Inga lag – skapa under Inställningar → Motståndare</span>}
        </>
      )}
    </div>
  );
}
