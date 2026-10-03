/**
 * Motståndarens sida via delningslänk (/lag/:token) – ingen inloggning.
 * Laget fyller i namn, logga, färg och spelare och gör sin uppställning.
 * Vårt lag visas bara om vi valt det när länken skapades.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { OpponentTeamPanel } from "@/components/opponent/OpponentTeamPanel";
import { opponentPlayerDbId, opponentPlayerId } from "@shared/matchSetup";
import type { Player } from "@/lib/players";

const POSITIONS = ["", "MV", "B", "C", "F"] as const;
const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 placeholder:text-white/30";

async function prepareLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
    const sc = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1] ?? "";
  } finally { URL.revokeObjectURL(url); }
}

export default function OpponentLinkPage() {
  const { token = "" } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const q = trpc.opponentLink.view.useQuery({ token }, { retry: false, refetchInterval: 15_000 });
  const refresh = () => void utils.opponentLink.view.invalidate({ token });
  const onErr = (e: { message: string }) => toast.error(e.message);
  const saveTeam = trpc.opponentLink.saveTeam.useMutation({ onSuccess: () => { toast.success("Sparat"); refresh(); }, onError: onErr });
  const addPlayer = trpc.opponentLink.addPlayer.useMutation({ onSuccess: refresh, onError: onErr });
  const updatePlayer = trpc.opponentLink.updatePlayer.useMutation({ onSuccess: refresh, onError: onErr });
  const deletePlayer = trpc.opponentLink.deletePlayer.useMutation({ onSuccess: refresh, onError: onErr });
  const setSlot = trpc.opponentLink.setSlot.useMutation({ onSuccess: refresh, onError: onErr });
  const setList = trpc.opponentLink.setList.useMutation({ onSuccess: refresh, onError: onErr });
  const [team, setTeam] = useState<{ name: string; shortName: string; color: string } | null>(null);
  const [np, setNp] = useState({ name: "", number: "", position: "" });
  useEffect(() => { if (q.data && !team) setTeam({ name: q.data.opponent.name, shortName: q.data.opponent.shortName ?? "", color: q.data.opponent.color }); }, [q.data, team]);

  if (q.isLoading) return <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-white/40" /></div>;
  if (q.error || !q.data) return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center p-6 text-center">
      <div><p className="text-lg font-bold">Länken fungerar inte</p><p className="text-sm text-white/50 mt-1">{q.error?.message ?? "Den kan ha gått ut."} Be laget ni ska möta om en ny länk.</p></div>
    </div>
  );
  const d = q.data;
  const o = d.opponent;
  const dirty = team && (team.name !== o.name || team.shortName !== (o.shortName ?? "") || team.color !== o.color);
  const lineup: Record<string, Player> = {};
  for (const [slot, pid] of Object.entries(d.lineup)) {
    const p = o.players.find((x) => x.id === pid);
    if (p) lineup[slot] = { id: opponentPlayerId(p.id), name: p.name, number: p.number ?? "", position: (p.position || "F") as Player["position"], isOpponent: true };
  }
  const add = () => {
    if (!np.name.trim()) return;
    addPlayer.mutate({ token, name: np.name, number: np.number || null, position: (np.position || null) as never });
    setNp({ name: "", number: "", position: np.position });
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
        <img src={d.club.logo} alt="" className="w-9 h-9 object-contain" />
        <div className="min-w-0">
          <p className="text-[11px] text-white/45">Match mot {d.club.name}</p>
          <h1 className="text-lg font-bold truncate" style={{ fontFamily: "'Oswald', sans-serif", color: o.color }}>{o.name}</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <p className="text-xs text-white/50">Fyll i ert lag och er uppställning – med platser eller bara som en lista över vilka som spelar. Allt sparas direkt. Länken gäller till {new Date(d.expiresAt).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}.</p>

        {/* Laget */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white/80">Ert lag</h2>
          <div className="flex items-center gap-3">
            {o.logoUrl ? <img src={o.logoUrl} alt="" className="w-14 h-14 object-contain" /> : <span className="w-14 h-14 rounded-full border border-white/20" style={{ background: o.color }} />}
            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs cursor-pointer">
              <Upload size={12} /> {o.logoUrl ? "Byt logga" : "Ladda upp logga"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f) saveTeam.mutate({ token, name: o.name, logoBase64: await prepareLogo(f) });
              }} />
            </label>
          </div>
          {team && (
            <div className="grid grid-cols-[1fr_5rem_4rem] gap-2">
              <label className="text-[11px] text-white/50">Namn<input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} maxLength={80} className={input} /></label>
              <label className="text-[11px] text-white/50">Kort<input value={team.shortName} onChange={(e) => setTeam({ ...team, shortName: e.target.value })} maxLength={10} className={input} /></label>
              <label className="text-[11px] text-white/50">Färg<input type="color" value={team.color} onChange={(e) => setTeam({ ...team, color: e.target.value })} className="w-full h-[38px] rounded-lg bg-white/5 border border-white/10" /></label>
            </div>
          )}
          {dirty && team && <button onClick={() => saveTeam.mutate({ token, name: team.name, shortName: team.shortName || null, color: team.color })} className="w-full py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold">Spara</button>}
        </section>

        {/* Spelare */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white/80">Spelare ({o.players.length})</h2>
          <div className="grid grid-cols-[1fr_3.5rem_4.5rem_2.25rem] gap-1.5">
            <input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Namn" maxLength={80} className={input} />
            <input value={np.number} onChange={(e) => setNp({ ...np, number: e.target.value.replace(/\D/g, "").slice(0, 3) })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Nr" inputMode="numeric" className={`${input} text-center`} />
            <select value={np.position} onChange={(e) => setNp({ ...np, position: e.target.value })} className={input}>{POSITIONS.map((p) => <option key={p} value={p} className="text-black">{p || "–"}</option>)}</select>
            <button onClick={add} disabled={!np.name.trim()} aria-label="Lägg till spelare" className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
          </div>
          <ul className="space-y-1">
            {o.players.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_3.5rem_4.5rem_2.25rem] gap-1.5 items-center">
                <input defaultValue={p.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== p.name) updatePlayer.mutate({ token, id: p.id, name: e.target.value }); }} className={input} />
                <input defaultValue={p.number ?? ""} onBlur={(e) => { if (e.target.value !== (p.number ?? "")) updatePlayer.mutate({ token, id: p.id, number: e.target.value || null }); }} inputMode="numeric" className={`${input} text-center`} />
                <select value={p.position ?? ""} onChange={(e) => updatePlayer.mutate({ token, id: p.id, position: (e.target.value || null) as never })} className={input}>{POSITIONS.map((x) => <option key={x} value={x} className="text-black">{x || "–"}</option>)}</select>
                <button onClick={() => { if (confirm(`Ta bort ${p.name}?`)) deletePlayer.mutate({ token, id: p.id }); }} aria-label="Ta bort" className="text-red-300/60 hover:text-red-300 flex items-center justify-center"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </section>

        {/* Uppställning */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white/80">Er uppställning</h2>
          <div className={d.ours ? "grid gap-3 sm:grid-cols-2" : ""}>
            <OpponentTeamPanel
              teamName={o.name} logoUrl={o.logoUrl} color={o.color} config={d.config} lineup={lineup}
              roster={o.players}
              onPlace={(slot, p) => setSlot.mutate({ token, slot, playerId: p ? opponentPlayerDbId(p.id) : null })}
              onAddPlayer={async (p) => {
                const r = await addPlayer.mutateAsync({ token, name: p.name, number: p.number || null, position: (p.position || null) as never });
                return { id: r.id, name: p.name, number: p.number || null, position: p.position };
              }}
              listIds={d.list ?? null}
              onListChange={(ids) => setList.mutate({ token, ids })}
            />
            {d.ours && (
              <OpponentTeamPanel
                teamName={d.ours.name} logoUrl={d.club.logo} color="#ffffff" config={d.ours.config} teamId="team-a"
                lineup={Object.fromEntries(Object.entries(d.ours.lineup).map(([k, p]) => [k, { id: k, name: p.name, number: p.number, position: p.position as Player["position"] }]))}
                roster={null}
              />
            )}
          </div>
          {!d.ours && d.showOurTeam && <p className="text-[11px] text-white/40">{d.club.name}s uppställning visas här när den är klar.</p>}
        </section>
      </main>
    </div>
  );
}
