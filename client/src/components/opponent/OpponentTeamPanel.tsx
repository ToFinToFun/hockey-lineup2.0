/**
 * Motståndarens lag i uppställningen (lag B mot motståndare). Platserna fylls
 * genom att välja bland lagets sparade spelare – eller lägga till en ny direkt.
 * Används både i Lineup och på motståndarens delningslänk.
 */
import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { createTeamSlots, groupSlots, type TeamConfig } from "@/lib/lineup";
import type { Player } from "@/lib/players";
import { opponentPlayerId } from "@shared/matchSetup";
import { sortList } from "@/lib/opponentList";

export interface OpponentRosterPlayer { id: number; name: string; number: string | null; position: string | null; active?: boolean }

interface Props {
  teamName: string;
  logoUrl: string | null;
  color: string;
  config: TeamConfig;
  /** Platser för laget (t.ex. team-b-…) */
  lineup: Record<string, Player>;
  /** Lagets spelare – null = bara visning (ingen behörighet att välja) */
  roster: OpponentRosterPlayer[] | null;
  onPlace?: (slotId: string, player: Player | null) => void;
  onAddPlayer?: (p: { name: string; number: string; position: string }) => Promise<OpponentRosterPlayer | null>;
  compact?: boolean;
  /** Prefix för platserna (Lineup: "team-b") */
  teamId?: string;
  /** Lista utan platser: lagets spelare som är med (opponent_players.id). null = platser. */
  listIds?: number[] | null;
  /** Byt läge eller ändra listan (saknas = inget listläge, t.ex. motståndarens länk) */
  onListChange?: (ids: number[] | null) => void;
}

const POS_FOR_SLOT = (type: string, shortLabel: string) => (type === "goalkeeper" ? "MV" : type === "defense" ? "B" : shortLabel === "C" ? "C" : "F");
const BADGE: Record<string, string> = { MV: "pos-badge-mv", B: "pos-badge-b", C: "pos-badge-c", F: "pos-badge-f" };

export const toLineupPlayer = (p: OpponentRosterPlayer): Player => ({
  id: opponentPlayerId(p.id), name: p.name, number: p.number ?? "", position: ((p.position || "F") as Player["position"]), isOpponent: true,
});

export function OpponentTeamPanel({ teamName, logoUrl, color, config, lineup, roster, onPlace, onAddPlayer, compact = false, teamId = "team-b", listIds = null, onListChange }: Props) {
  const slots = useMemo(() => createTeamSlots(teamId, config), [teamId, config]);
  const groups = useMemo(() => groupSlots(slots), [slots]);
  const placedIds = new Set(Object.values(lineup).map((p) => p.id));
  const free = (roster ?? []).filter((p) => p.active !== false && !placedIds.has(opponentPlayerId(p.id)));
  const [adding, setAdding] = useState<string | null>(null);
  const [np, setNp] = useState({ name: "", number: "" });
  const listMode = Array.isArray(listIds);
  const count = listMode ? listIds!.length : Object.keys(lineup).length;
  const [listNew, setListNew] = useState({ name: "", number: "", position: "F" });
  const addToList = async () => {
    if (!listNew.name.trim() || !onAddPlayer || !onListChange) return;
    const p = await onAddPlayer({ name: listNew.name.trim(), number: listNew.number.trim(), position: listNew.position });
    if (p) onListChange([...(listIds ?? []), p.id]);
    setListNew({ name: "", number: "", position: listNew.position });
  };

  const addNew = async (slotId: string, pos: string) => {
    if (!np.name.trim() || !onAddPlayer) return;
    const p = await onAddPlayer({ name: np.name.trim(), number: np.number.trim(), position: pos });
    if (p) onPlace?.(slotId, toLineupPlayer(p));
    setNp({ name: "", number: "" });
    setAdding(null);
  };

  return (
    <div className="glass-panel rounded-xl overflow-hidden min-w-0" style={{ borderTop: `3px solid ${color}` }}>
      <div className={`flex items-center gap-2 ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} border-b border-white/10`}>
        {logoUrl ? <img src={logoUrl} alt="" className={compact ? "w-6 h-6 object-contain" : "w-9 h-9 object-contain"} />
          : <span className={`${compact ? "w-6 h-6" : "w-9 h-9"} rounded-full border border-white/20`} style={{ background: color }} />}
        <h2 className={`flex-1 min-w-0 truncate font-bold tracking-wide ${compact ? "text-sm" : "text-lg"}`} style={{ fontFamily: "'Oswald', sans-serif", color }}>
          {teamName.toUpperCase()}
        </h2>
        <span className="text-white/45 font-bold tabular-nums text-xs" title="Spelare i laget">{count}</span>
      </div>
      {onListChange && (
        <div className="flex gap-1 px-2.5 pt-2" role="group" aria-label="Visa motståndaren som">
          {([["Platser", false], ["Lista", true]] as const).map(([label, list]) => (
            <button key={label} onClick={() => {
              if (list === listMode) return;
              // Till lista: de placerade blir listan. Till platser: listan finns kvar men ingen placeras.
              onListChange(list ? Object.values(lineup).map((p) => Number(p.id.replace(/^opp-/, ""))).filter((n) => n > 0) : null);
            }} className={`flex-1 py-1 rounded-md text-[11px] font-semibold border ${list === listMode ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50"}`}>{label}</button>
          ))}
        </div>
      )}
      {listMode ? (
        <div className={`${compact ? "p-1.5" : "p-2.5"} space-y-1`}>
          <p className="text-[10px] text-white/40 mb-1">Bocka i vilka som är med – ingen position eller kedja.</p>
          {sortList((roster ?? []).filter((r) => r.active !== false || listIds!.includes(r.id))).map((r) => {
            const on = listIds!.includes(r.id);
            const pos = (r.position || "F").toUpperCase();
            return (
              <button key={r.id} onClick={() => onListChange?.(on ? listIds!.filter((x) => x !== r.id) : [...listIds!, r.id])}
                className={`w-full flex items-center gap-1.5 rounded-lg border px-1.5 py-1 min-h-[34px] text-left ${on ? "bg-white/[0.08] border-white/25" : "bg-white/[0.02] border-white/10 opacity-60"}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${on ? "bg-emerald-500/70 border-emerald-300 text-white" : "border-white/30"}`}>{on ? "✓" : ""}</span>
                <span className={`pos-badge pos-badge-sm ${BADGE[pos === "LW" || pos === "RW" ? "F" : pos] ?? ""} shrink-0`}>{pos}</span>
                <span className="flex-1 min-w-0 truncate text-xs text-white">{r.name}{r.number ? <span className="text-white/40"> #{r.number}</span> : null}</span>
              </button>
            );
          })}
          {(roster ?? []).length === 0 && <p className="text-[10px] text-white/40">Inga sparade spelare än – lägg till nedan.</p>}
          {onAddPlayer && (
            <div className="flex gap-1 pt-1">
              <input value={listNew.name} onChange={(e) => setListNew({ ...listNew, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void addToList(); }}
                placeholder="Ny spelare" maxLength={80} className="flex-1 min-w-0 rounded bg-white/5 border border-white/15 text-xs text-white px-1.5 py-1" />
              <input value={listNew.number} onChange={(e) => setListNew({ ...listNew, number: e.target.value.replace(/\D/g, "").slice(0, 3) })} onKeyDown={(e) => { if (e.key === "Enter") void addToList(); }}
                placeholder="Nr" inputMode="numeric" className="w-10 rounded bg-white/5 border border-white/15 text-xs text-white px-1 py-1 text-center" />
              <select value={listNew.position} onChange={(e) => setListNew({ ...listNew, position: e.target.value })} aria-label="Position" className="rounded bg-white/5 border border-white/15 text-xs text-white px-1 py-1">
                {["MV", "B", "C", "F"].map((p) => <option key={p} value={p} className="text-black">{p}</option>)}
              </select>
              <button onClick={() => void addToList()} className="px-1.5 rounded bg-emerald-500/30 text-emerald-200 text-xs">OK</button>
            </div>
          )}
        </div>
      ) : (
      <div className={`${compact ? "p-1.5 space-y-2" : "p-2.5 space-y-3"}`}>
        {groups.map((g) => (
          <div key={g.groupLabel}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40 mb-1">{g.groupLabel}</p>
            <div className="space-y-1">
              {g.slots.map((slot) => {
                const p = lineup[slot.id];
                const pos = POS_FOR_SLOT(slot.type, slot.shortLabel);
                return (
                  <div key={slot.id} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 px-1.5 py-1 min-h-[34px]">
                    <span className={`pos-badge pos-badge-sm ${BADGE[pos] ?? ""} shrink-0`}>{slot.shortLabel}</span>
                    {p ? (
                      <>
                        <span className="flex-1 min-w-0 truncate text-xs text-white">{p.name}{p.number ? <span className="text-white/40"> #{p.number}</span> : null}</span>
                        {onPlace && <button onClick={() => onPlace(slot.id, null)} aria-label="Ta bort från platsen" className="p-1 text-white/40 hover:text-red-300"><X size={13} /></button>}
                      </>
                    ) : adding === slot.id ? (
                      <div className="flex-1 flex gap-1">
                        <input autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void addNew(slot.id, pos); if (e.key === "Escape") setAdding(null); }}
                          placeholder="Namn" maxLength={80} className="flex-1 min-w-0 rounded bg-white/5 border border-white/15 text-xs text-white px-1.5 py-1" />
                        <input value={np.number} onChange={(e) => setNp({ ...np, number: e.target.value.replace(/\D/g, "").slice(0, 3) })} onKeyDown={(e) => { if (e.key === "Enter") void addNew(slot.id, pos); }}
                          placeholder="Nr" inputMode="numeric" className="w-10 rounded bg-white/5 border border-white/15 text-xs text-white px-1 py-1 text-center" />
                        <button onClick={() => void addNew(slot.id, pos)} className="px-1.5 rounded bg-emerald-500/30 text-emerald-200 text-xs">OK</button>
                      </div>
                    ) : roster && onPlace ? (
                      <select value="" onChange={(e) => {
                        if (e.target.value === "__new") { setAdding(slot.id); return; }
                        const r = roster.find((x) => String(x.id) === e.target.value);
                        if (r) onPlace(slot.id, toLineupPlayer(r));
                      }} className="flex-1 min-w-0 bg-transparent text-xs text-white/45 outline-none" aria-label={`Välj spelare för ${slot.shortLabel}`}>
                        <option value="" className="text-black">Välj spelare…</option>
                        {/* Spelare med platsens position först */}
                        {[...free].sort((a, b) => Number(b.position === pos) - Number(a.position === pos) || a.name.localeCompare(b.name, "sv")).map((r) => (
                          <option key={r.id} value={r.id} className="text-black">{r.name}{r.number ? ` #${r.number}` : ""}{r.position ? ` (${r.position})` : ""}</option>
                        ))}
                        {onAddPlayer && <option value="__new" className="text-black">＋ Ny spelare…</option>}
                      </select>
                    ) : (
                      <span className="flex-1 text-xs text-white/25 italic">Tom</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {roster && onAddPlayer && free.length === 0 && count === 0 && (
          <p className="text-[10px] text-white/40 flex items-center gap-1"><Plus size={11} /> Inga sparade spelare – välj "Ny spelare" på en plats.</p>
        )}
      </div>
      )}
    </div>
  );
}
