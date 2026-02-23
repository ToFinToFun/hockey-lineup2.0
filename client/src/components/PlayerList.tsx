// Hockey Lineup App – PlayerList
// Design: Industrial Ice Arena – mittenpanel med spelarlista, sökfunktion och positions-redigering

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position } from "@/lib/players";
import { ALL_POSITIONS, POSITION_LABELS } from "@/lib/players";
import { Search, UserPlus, X } from "lucide-react";
import { nanoid } from "nanoid";

interface PlayerListProps {
  players: Player[];
  onAddPlayer: (player: Player) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
}

type FilterValue = Position | "Alla";

const positionFilters: { label: string; value: FilterValue }[] = [
  { label: "Alla", value: "Alla" },
  { label: "MV", value: "MV" },
  { label: "B", value: "B" },
  { label: "F", value: "F" },
  { label: "C", value: "C" },
  { label: "IB", value: "IB" },
];

export function PlayerList({ players, onAddPlayer, onChangePosition }: PlayerListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("Alla");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newPosition, setNewPosition] = useState<Position>("IB");

  const { setNodeRef, isOver } = useDroppable({ id: "player-list" });

  const filtered = players.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.number.includes(search);
    const matchesFilter = filter === "Alla" || p.position === filter;
    return matchesSearch && matchesFilter;
  });

  const handleAddPlayer = () => {
    if (!newName.trim()) return;
    onAddPlayer({
      id: `custom-${nanoid(6)}`,
      name: newName.trim(),
      number: newNumber.trim(),
      position: newPosition,
    });
    setNewName("");
    setNewNumber("");
    setNewPosition("IB");
    setShowAddForm(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border backdrop-blur-md h-full
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
          <span className="text-white/40 text-xs">{players.length} spelare</span>
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
        <div className="flex gap-1">
          {positionFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`
                flex-1 text-[10px] font-bold py-1 rounded transition-all
                ${filter === f.value
                  ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spelarlista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="text-center text-white/30 text-xs italic py-8">
            Inga spelare hittades
          </div>
        ) : (
          filtered.map((player) => (
            <DraggablePlayerCard
              key={player.id}
              player={player}
              onChangePosition={(pos) => onChangePosition(player.id, pos)}
            />
          ))
        )}
      </div>

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
