// Hockey Lineup App – PlayerSlot – v3 (consistent design system)
// Badge is integrated into the row as a rounded-rect, matching mockup exactly

import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";

interface PlayerSlotProps {
  slot: Slot;
  player: Player | null;
  onRemove: () => void;
  onChangePosition: (pos: Position) => void;
  compact?: boolean;
}

/* Badge color mapping using CSS classes from design system */
function getBadgeClass(role: string): string {
  switch (role) {
    case "gk":
    case "res-gk":
      return "pos-badge-mv";
    case "def":
      return "pos-badge-b";
    case "lw":
    case "rw":
      return "pos-badge-f";
    case "c":
      return "pos-badge-c";
    default:
      return "pos-badge-f";
  }
}

export function PlayerSlot({ slot, player, onRemove, onChangePosition, compact = false }: PlayerSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slot.id });

  const badgeClass = getBadgeClass(slot.role);

  const dropHighlight = isOver
    ? "ring-1 ring-emerald-400/40 bg-emerald-400/[0.06]"
    : "";

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: "manipulation" }}
      className={`
        flex items-center gap-1.5 transition-all duration-150 overflow-visible
        ${compact ? 'min-h-[28px] px-1' : 'min-h-[34px] px-1.5'}
        ${player ? 'player-row' : ''}
        ${dropHighlight}
        rounded-md
      `}
    >
      {/* Position badge — rounded rect, solid color, from design system */}
      <span className={`pos-badge ${compact ? 'pos-badge-sm' : 'pos-badge-sm'} ${badgeClass}`}>
        {slot.shortLabel}
      </span>

      {/* Player card or empty placeholder */}
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
        <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} italic flex-1 text-white/20 ${isOver ? "!text-white/50" : ""}`}>
          {isOver ? "Släpp här" : ""}
        </span>
      )}
    </div>
  );
}
