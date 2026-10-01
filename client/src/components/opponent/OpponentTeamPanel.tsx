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
}

const POS_FOR_SLOT = (type: string, shortLabel: string) => (type === "goalkeeper" ? "MV" : type === "defense" ? "B" : shortLabel === "C" ? "C" : "F");
const BADGE: Record<string, string> = { MV: "pos-badge-mv", B: "pos-badge-b", C: "pos-badge-c", F: "pos-badge-f" };

export const toLineupPlayer = (p: OpponentRosterPlayer): Player => ({
  id: opponentPlayerId(p.id), name: p.name, number: p.number ?? "", position: ((p.position || "F") as Player["position"]), isOpponent: true,
});

export function OpponentTeamPanel({ teamName, logoUrl, color, config, lineup, roster, onPlace, onAddPlayer, compact = false, teamId = "team-b" }: Props) {
  const slots = useMemo(() => createTeamSlots(teamId, config), [teamId, config]);
  const groups = useMemo(() => groupSlots(slots), [slots]);
  const placedIds = new Set(Object.values(lineup).map((p) => p.id));
  const free = (roster ?? []).filter((p) => p.active !== false && !placedIds.has(opponentPlayerId(p.id)));
  const [adding, setAdding] = useState<string | null>(null);
  const [np, setNp] = useState({ name: "", number: "" });
  const count = Object.keys(lineup).length;

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
    </div>
  );
}
