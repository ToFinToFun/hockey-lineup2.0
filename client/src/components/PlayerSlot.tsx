// Hockey Lineup App – PlayerSlot
// En fast namngiven plats som alltid visas och tar emot en spelare via drag and drop

import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";

interface PlayerSlotProps {
  slot: Slot;
  player: Player | null;
  onRemove: () => void;
  onChangePosition: (pos: Position) => void;
}

const roleColors = {
  gk:     { border: "border-amber-400/40",   bg: "bg-amber-950/20",   label: "text-amber-300",   empty: "text-amber-400/35",   badge: "bg-amber-500/20 text-amber-300" },
  "res-gk": { border: "border-amber-400/25", bg: "bg-amber-950/10",   label: "text-amber-300/70",empty: "text-amber-400/25",   badge: "bg-amber-500/15 text-amber-300/70" },
  def:    { border: "border-blue-400/40",    bg: "bg-blue-950/20",    label: "text-blue-300",    empty: "text-blue-400/35",    badge: "bg-blue-500/20 text-blue-300" },
  lw:     { border: "border-emerald-400/40", bg: "bg-emerald-950/20", label: "text-emerald-300", empty: "text-emerald-400/35", badge: "bg-emerald-500/20 text-emerald-300" },
  c:      { border: "border-purple-400/50",  bg: "bg-purple-950/25",  label: "text-purple-300",  empty: "text-purple-400/40",  badge: "bg-purple-500/25 text-purple-300" },
  rw:     { border: "border-emerald-400/40", bg: "bg-emerald-950/20", label: "text-emerald-300", empty: "text-emerald-400/35", badge: "bg-emerald-500/20 text-emerald-300" },
};

export function PlayerSlot({ slot, player, onRemove, onChangePosition }: PlayerSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slot.id });
  const colors = roleColors[slot.role];

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: "pan-y" }}
      className={`
        flex items-center gap-2 rounded-md border transition-all duration-150 min-h-[36px] overflow-visible
        ${isOver && !player
          ? `${colors.bg} border-white/50 shadow-md ring-1 ring-white/30`
          : isOver && player
          ? "bg-white/5 border-white/40 ring-1 ring-white/20"
          : `${colors.bg} ${colors.border}`
        }
        px-2 py-1.5
      `}
    >
      {/* Roll-badge */}
      <span className={`
        text-[9px] font-black w-7 text-center shrink-0 rounded px-1 py-0.5 uppercase tracking-wide
        ${colors.badge}
      `}>
        {slot.shortLabel}
      </span>

      {/* Spelarkortet eller tom plats */}
      {player ? (
        <div className="flex-1 min-w-0 overflow-visible">
          <DraggablePlayerCard
            player={player}
            onRemove={onRemove}
            onChangePosition={onChangePosition}
            compact
          />
        </div>
      ) : (
        <span className={`text-[11px] italic flex-1 ${colors.empty} ${isOver ? "text-white/50" : ""}`}>
          {isOver ? "Släpp här" : slot.label}
        </span>
      )}
    </div>
  );
}
