// Mittenpanel med spelarlista, sökfunktion, positions- och lag-filter, sortering

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard, TeamColorIndicator } from "./PlayerCard";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import { ALL_POSITIONS, POSITION_LABELS } from "@/lib/players";
import { Search, UserPlus, X, Trash2, ArrowUpDown } from "lucide-react";
import { nanoid } from "nanoid";
import { createPortal } from "react-dom";

interface PlayerListProps {
  players: Player[];
  onAddPlayer: (player: Player) => void;
  onDeletePlayer: (playerId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  onChangeTeamColor: (playerId: string, color: TeamColor) => void;
  onChangeNumber: (playerId: string, number: string) => void;
  onChangeName: (playerId: string, name: string) => void;
  onChangeCaptainRole: (playerId: string, role: CaptainRole) => void;
}

type PosFilter = Position | "Alla";
type TeamFilter = TeamColor | "Alla";
type SortKey = "name" | "number" | "position";
type SortDir = "asc" | "desc";

const positionFilters: { label: string; value: PosFilter }[] = [
  { label: "Alla", value: "Alla" },
  { label: "MV", value: "MV" },
  { label: "B", value: "B" },
  { label: "F", value: "F" },
  { label: "C", value: "C" },
  { label: "IB", value: "IB" },
];

const teamFilters: { label: string; value: TeamFilter; color: TeamColor }[] = [
  { label: "Alla", value: "Alla", color: null },
  { label: "Vita", value: "white", color: "white" },
  { label: "Gröna", value: "green", color: "green" },
  { label: "Inget lag", value: null, color: null },
];

const POSITION_ORDER: Record<string, number> = { MV: 0, B: 1, C: 2, F: 3, IB: 4 };

function sortPlayers(players: Player[], key: SortKey, dir: SortDir): Player[] {
  return [...players].sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = a.name.localeCompare(b.name, "sv");
    } else if (key === "number") {
      const na = parseInt(a.number || "9999");
      const nb = parseInt(b.number || "9999");
      cmp = na - nb;
    } else if (key === "position") {
      cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "sv");
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export function PlayerList({ players, onAddPlayer, onDeletePlayer, onChangePosition, onChangeTeamColor, onChangeNumber, onChangeName, onChangeCaptainRole }: PlayerListProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<PosFilter>("Alla");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("Alla");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newPosition, setNewPosition] = useState<Position>("IB");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; player: Player } | null>(null);


  const { setNodeRef, isOver } = useDroppable({ id: "player-list" });

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = players.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.number.includes(search);
    const matchesPos = posFilter === "Alla" || p.position === posFilter;
    const matchesTeam =
      teamFilter === "Alla" ||
      (teamFilter === null ? (p.teamColor ?? null) === null : (p.teamColor ?? null) === teamFilter);
    return matchesSearch && matchesPos && matchesTeam;
  });

  const sorted = sortPlayers(filtered, sortKey, sortDir);

  const handleAddPlayer = () => {
    if (!newName.trim()) return;
    onAddPlayer({
      id: `custom-${nanoid(6)}`,
      name: newName.trim(),
      number: newNumber.trim(),
      position: newPosition,
      teamColor: null,
    });
    setNewName("");
    setNewNumber("");
    setNewPosition("IB");
    setShowAddForm(false);
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSortClick(k)}
      className={`
        flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded transition-all
        ${sortKey === k
          ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40"
          : "bg-white/5 text-white/35 border border-white/10 hover:text-white/60 hover:bg-white/10"
        }
      `}
    >
      {label}
      <ArrowUpDown className={`w-2.5 h-2.5 ${sortKey === k ? "opacity-100" : "opacity-40"}`} />
      {sortKey === k && (
        <span className="text-[8px] opacity-70">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border backdrop-blur-md
        bg-black/30 transition-all duration-200
        ${isOver
          ? "border-emerald-400/60 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
          : "border-white/10"
        }
      `}
    >
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Spelartrupp
          </h2>
          <span className="text-white/40 text-xs">
            {filtered.length < players.length
              ? <><span className="text-white/70 font-semibold">{filtered.length}</span> / {players.length} spelare</>
              : <>{players.length} spelare</>}
          </span>
        </div>

        {/* Sökfält */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök spelare..."
            className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400/50 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Positionsfilter */}
        <div className="flex gap-1 mb-1.5">
          {positionFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setPosFilter(f.value)}
              className={`
                flex-1 text-[10px] font-bold py-1 rounded transition-all
                ${posFilter === f.value
                  ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lag-filter */}
        <div className="flex gap-1 mb-2">
          {teamFilters.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setTeamFilter(f.value)}
              className={`
                flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1 rounded transition-all
                ${teamFilter === f.value
                  ? f.value === "white"
                    ? "bg-slate-300/20 text-slate-200 border border-slate-300/50"
                    : f.value === "green"
                    ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                    : "bg-white/15 text-white border border-white/30"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60"
                }
              `}
            >
              {f.color !== null && (
                <TeamColorIndicator teamColor={f.color} size={12} />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* Sortering */}
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-[9px] uppercase tracking-wider shrink-0">Sortera:</span>
          <div className="flex gap-1">
            <SortBtn k="name" label="Namn" />
            <SortBtn k="number" label="Nr" />
            <SortBtn k="position" label="Pos" />
          </div>
        </div>
      </div>

      {/* Spelarlista – scrollbar med fast höjd */}
      <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: "560px", overscrollBehavior: "auto" }}>
        {sorted.length === 0 ? (
          <div className="text-center text-white/30 text-xs italic py-8">
            Inga spelare hittades
          </div>
        ) : (
          sorted.map((player) => (
            <div
              key={player.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, player });
              }}
            >
              <DraggablePlayerCard
                player={player}
                onChangePosition={(pos) => onChangePosition(player.id, pos)}
                onChangeTeamColor={(color) => onChangeTeamColor(player.id, color)}
                onChangeNumber={(nr) => onChangeNumber(player.id, nr)}
                onChangeName={(name) => onChangeName(player.id, name)}
                onChangeCaptainRole={(role) => onChangeCaptainRole(player.id, role)}
              />
            </div>
          ))
        )}
      </div>

      {/* Högerklicks-kontextmeny */}
      {contextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[99998]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-[99999] bg-gray-900 border border-white/15 rounded-lg shadow-2xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-1.5 border-b border-white/10 mb-1">
              <p className="text-white/60 text-[10px] truncate max-w-[140px]">{contextMenu.player.name}</p>
            </div>
            <button
              onClick={() => {
                onDeletePlayer(contextMenu.player.id);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Ta bort spelare
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Lägg till spelare */}
      <div className="p-2 border-t border-white/10">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-white/5 border border-white/10 text-white/50 hover:bg-emerald-500/10 hover:border-emerald-400/30 hover:text-emerald-300 transition-all text-xs font-medium"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Lägg till spelare
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <input
                type="text"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="#"
                className="w-10 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400/50 text-center"
                maxLength={3}
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Spelarens namn..."
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400/50"
                onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
                autoFocus
              />
            </div>
            <select
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value as Position)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-emerald-400/50"
            >
              {ALL_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos} – {POSITION_LABELS[pos]}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                onClick={handleAddPlayer}
                disabled={!newName.trim()}
                className="flex-1 py-1.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Lägg till
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewName(""); setNewNumber(""); }}
                className="flex-1 py-1.5 rounded bg-white/5 border border-white/10 text-white/40 text-xs hover:bg-white/10 transition-all"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
