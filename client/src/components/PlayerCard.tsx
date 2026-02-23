// Hockey Lineup App – PlayerCard
// Design: Industrial Ice Arena – glassmorfism, mörk bakgrund, grön accent
// Draggable spelarkortet

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { Player } from "@/lib/players";
import { getPositionBadgeColor } from "@/lib/players";

interface PlayerCardProps {
  player: Player;
  onRemove?: () => void;
  compact?: boolean;
  isDragging?: boolean;
}

export function DraggablePlayerCard({
  player,
  onRemove,
  compact = false,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: player.id, data: { player } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex items-center gap-1.5 rounded-md
        bg-white/10 border border-white/20 backdrop-blur-sm
        hover:bg-white/15 hover:border-white/35
        transition-all duration-150 select-none
        ${compact ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"}
        ${isDragging ? "shadow-2xl ring-2 ring-emerald-400/60" : ""}
        cursor-grab active:cursor-grabbing
      `}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-3 h-3 text-white/30 shrink-0" />
      {player.number && (
        <span className={`font-bold text-white/50 shrink-0 ${compact ? "text-[10px] w-4" : "text-xs w-5"}`}>
          {player.number}
        </span>
      )}
      <span className="text-white font-medium truncate flex-1 leading-tight">
        {player.name}
      </span>
      <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
        {player.position === "Målvakt" ? "MV" :
         player.position === "Back" ? "B" :
         player.position === "Forward" ? "F" : "U"}
      </span>
      {onRemove && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-white/40 hover:text-red-400 shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Overlay-kort som visas under musen vid drag
export function PlayerCardOverlay({ player }: { player: Player }) {
  return (
    <div className={`
      flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm
      bg-emerald-900/90 border border-emerald-400/60 backdrop-blur-sm
      shadow-2xl ring-2 ring-emerald-400/40
      cursor-grabbing select-none
    `}>
      <GripVertical className="w-3 h-3 text-emerald-300/50 shrink-0" />
      {player.number && (
        <span className="font-bold text-emerald-300/70 text-xs w-5 shrink-0">
          {player.number}
        </span>
      )}
      <span className="text-white font-medium truncate">
        {player.name}
      </span>
      <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
        {player.position === "Målvakt" ? "MV" :
         player.position === "Back" ? "B" :
         player.position === "Forward" ? "F" : "U"}
      </span>
    </div>
  );
}
