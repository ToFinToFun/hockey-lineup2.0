// Hockey Lineup App – PlayerSlot – Glassmorphism v2
// Flat design: thin left-colored border accent, minimal background
// Empty slots: dashed border with placeholder text

import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { useForwardColor } from "@/hooks/useForwardColor";

interface PlayerSlotProps {
  slot: Slot;
  player: Player | null;
  onRemove: () => void;
  onChangePosition: (pos: Position) => void;
  compact?: boolean;
}

/* Role-specific accent colors for the left border and badge */
const roleAccents: Record<string, { border: string; badge: string; badgeText: string; empty: string }> = {
  gk:       { border: "border-l-amber-400",    badge: "bg-amber-500",    badgeText: "text-amber-950",   empty: "text-amber-400/30" },
  "res-gk": { border: "border-l-amber-400/50", badge: "bg-amber-500/70", badgeText: "text-amber-950",   empty: "text-amber-400/20" },
  def:      { border: "border-l-blue-400",     badge: "bg-blue-500",     badgeText: "text-blue-950",    empty: "text-blue-400/30" },
  c:        { border: "border-l-purple-400",    badge: "bg-purple-500",   badgeText: "text-purple-950",  empty: "text-purple-400/30" },
};

export function PlayerSlot({ slot, player, onRemove, onChangePosition, compact = false }: PlayerSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slot.id });
  const { colors: fc } = useForwardColor();

  // Forward roles (lw, rw) use cyan
  const forwardAccent = {
    border: "border-l-cyan-400",
    badge: "bg-cyan-500",
    badgeText: "text-cyan-950",
    empty: "text-cyan-400/30",
  };

  const accents: Record<string, typeof forwardAccent> = {
    ...roleAccents,
    lw: forwardAccent,
    rw: forwardAccent,
  };

  const accent = accents[slot.role] ?? forwardAccent;

  const filledClasses = `
    bg-white/[0.06] border border-white/[0.10]
    hover:bg-white/[0.10] hover:border-white/[0.15]
  `;

  const emptyClasses = `
    border border-dashed border-white/[0.08]
    bg-white/[0.02]
  `;

  const dropHighlight = isOver
    ? "!bg-white/[0.08] !border-white/30 ring-1 ring-white/20 shadow-md"
    : "";

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: "manipulation" }}
      className={`
        flex items-center gap-1.5 rounded-lg transition-all duration-150 overflow-visible
        ${compact ? 'min-h-[30px] px-1.5 py-0.5' : 'min-h-[38px] px-2.5 py-1.5'}
        ${player ? filledClasses : emptyClasses}
        ${dropHighlight}
      `}
    >
      {/* Position badge — rounded rect matching mockup */}
      <span className={`
        ${compact ? 'min-w-[22px] h-5 px-1 text-[8px]' : 'min-w-[26px] h-6 px-1.5 text-[10px]'}
        font-black flex items-center justify-center shrink-0 rounded uppercase
        ${accent.badge} ${accent.badgeText}
      `}>
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
        <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} italic flex-1 ${accent.empty} ${isOver ? "!text-white/50" : ""}`}>
          {isOver ? "Släpp här" : (compact ? slot.shortLabel : slot.label)}
        </span>
      )}
    </div>
  );
}
