/**
 * Matchinställningar i Lineup (menyn → Match): internmatch eller mot ett annat
 * lag, vilket lag vi möter, vårt lags namn och logga samt – för matcher mot
 * andra lag – egen dag, tid och plats när de inte följer laget.se (t.ex. bortamatch).
 */
import { useEffect, useState } from "react";
import { X, Swords } from "lucide-react";
import { club } from "@shared/club";
import { teamName } from "@shared/teams";
import { ourLogoFor, type MatchSetup, type OurLogo } from "@shared/matchSetup";
import { trpc } from "@/lib/trpc";

export function ourLogoUrl(setup: MatchSetup): string {
  return ourLogoFor(setup, club());
}

/** Kort text till Lineups rubrik: "Mot Kalix HC · lör 10/10 15:30 · Kalix ishall" */
export function setupLabel(setup: MatchSetup, opponentName?: string | null): string | null {
  if (setup.mode !== "external") return null;
  const parts = [`Mot ${opponentName ?? "motståndare"}`];
  if (setup.date) {
    const [y, m, d] = setup.date.split("-").map(Number);
    const wd = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"][new Date(y, m - 1, d).getDay()];
    parts.push(`${wd} ${d}/${m}${setup.time ? ` ${setup.time}` : ""}`);
  } else if (setup.time) parts.push(setup.time);
  if (setup.location) parts.push(setup.location);
  return parts.join(" · ");
}

export function MatchSetupModal({ open, onClose, setup, onChange }: {
  open: boolean; onClose: () => void; setup: MatchSetup; onChange: (next: MatchSetup, opponentName?: string) => void;
}) {
  const list = trpc.opponents.list.useQuery(undefined, { staleTime: 60_000, enabled: open });
  const [draft, setDraft] = useState<MatchSetup>(setup);
  useEffect(() => { if (open) setDraft(setup); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const c = club();
  // Gröna, Vita och klubbmärket (städet). Äldre "club" är samma som klubbens (gröna) logga.
  const logos: Array<{ id: OurLogo; label: string; url: string }> = [
    { id: "green", label: teamName("green"), url: c.teams.green.logo },
    { id: "white", label: teamName("white"), url: c.teams.white.logo },
    ...(c.crest ? [{ id: "crest" as OurLogo, label: c.crest.name, url: c.crest.url }] : []),
  ];
  const selectedLogo: OurLogo = draft.ourLogo === "club" ? (c.logo === c.teams.white.logo ? "white" : "green") : draft.ourLogo;
  const nameOf = (id: number | null) => list.data?.find((o) => o.id === id)?.name;
  const input = "w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/30";
  const chip = (on: boolean) => `flex-1 px-3 py-2 rounded-lg text-xs font-semibold border ${on ? "bg-sky-500/20 border-sky-400/60 text-sky-100" : "bg-white/5 border-white/10 text-white/55"}`;
  const external = draft.mode === "external";
  const changed = JSON.stringify(draft) !== JSON.stringify(setup);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel-strong panel-solid rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>Match</h2>
          </div>
          <button onClick={onClose} aria-label="Stäng" className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-5 space-y-4 text-xs text-white/70">
          <div className="flex gap-2">
            <button onClick={() => setDraft({ ...draft, mode: "internal" })} className={chip(!external)}>Internmatch ({teamName("white")}–{teamName("green")})</button>
            <button onClick={() => setDraft({ ...draft, mode: "external" })} className={chip(external)}>Mot annat lag</button>
          </div>

          {external && (
            <>
              <label className="block text-[11px] text-white/50">Motståndare
                <select value={draft.opponentId ?? ""} onChange={(e) => setDraft({ ...draft, opponentId: Number(e.target.value) || null })} className={input}>
                  <option value="" className="text-black">Välj lag…</option>
                  {(list.data ?? []).map((o) => <option key={o.id} value={o.id} className="text-black">{o.name}</option>)}
                </select>
                {list.data?.length === 0 && <span className="block text-[10px] text-white/40 mt-1">Inga lag – skapa under Inställningar → Motståndare.</span>}
              </label>

              <label className="block text-[11px] text-white/50">Vårt lags namn
                <input value={draft.ourName ?? ""} onChange={(e) => setDraft({ ...draft, ourName: e.target.value || null })} placeholder={c.name} maxLength={40} className={input} />
              </label>

              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Vårt lags logga</p>
                <div className="flex gap-2">
                  {logos.map((l) => (
                    <button key={l.id} onClick={() => setDraft({ ...draft, ourLogo: l.id })}
                      className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border ${selectedLogo === l.id ? "border-sky-400 bg-sky-500/20" : "border-white/10 bg-white/5"}`}>
                      <img src={l.url} alt="" className="w-10 h-10 object-contain" />
                      <span className="text-[10px] text-white/70 text-center leading-tight">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-white/50">Dag, tid och plats <span className="text-white/35">– fyll i om matchen inte följer laget.se (t.ex. bortamatch)</span></p>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} className={input} aria-label="Dag" />
                  <input type="time" value={draft.time ?? ""} onChange={(e) => setDraft({ ...draft, time: e.target.value || null })} className={input} aria-label="Tid" />
                </div>
                <input value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value || null })} placeholder="Plats, t.ex. Kalix ishall" maxLength={100} className={input} aria-label="Plats" />
                <p className="text-[10px] text-white/35">Används för nyheten, Score Tracker (75 min före start), matchens plats och Media. Tomt = laget.se:s evenemang. Anmälningarna hämtas fortfarande från laget.se.</p>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70">Avbryt</button>
            <button disabled={!changed || (external && !draft.opponentId)}
              onClick={() => {
                const next: MatchSetup = external ? draft : { mode: "internal", opponentId: null, ourName: null, ourLogo: "club", date: null, time: null, location: null };
                onChange(next, nameOf(next.opponentId));
                onClose();
              }}
              className="flex-1 py-2 rounded-lg bg-sky-600 text-white font-semibold disabled:opacity-40">Spara</button>
          </div>
          {setup.mode !== draft.mode && <p className="text-[10px] text-amber-300/80">Byte av matchtyp tömmer lag B (våra spelare går tillbaka till truppen). Det går att ångra.</p>}
        </div>
      </div>
    </div>
  );
}
