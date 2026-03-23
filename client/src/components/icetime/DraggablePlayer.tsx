/*
 * DraggablePlayer component
 * A draggable player chip that can be moved between position zones.
 * Uses @dnd-kit for drag-and-drop functionality.
 * DESIGN: Dark theme matching Hub landing page
 */

import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

export interface Player {
  id: string;
  label: string;
  position: "backs" | "centers" | "forwards";
}

interface DraggablePlayerProps {
  player: Player;
  positionType: "backs" | "centers" | "forwards";
}

const positionColors = {
  backs: "bg-sky-400/10 text-sky-400 border-sky-400/25 hover:bg-sky-400/15",
  centers: "bg-[#0a7ea4]/15 text-[#0a7ea4] border-[#0a7ea4]/25 hover:bg-[#0a7ea4]/20",
  forwards: "bg-orange-400/10 text-orange-400 border-orange-400/20 hover:bg-orange-400/15",
};

export default function DraggablePlayer({ player, positionType }: DraggablePlayerProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: player.id,
    data: { player, fromPosition: positionType },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium
        transition-all cursor-grab active:cursor-grabbing select-none
        ${positionColors[positionType]}
        ${isDragging ? "opacity-50 shadow-lg scale-105" : "opacity-100 shadow-sm"}
      `}
    >
      <GripVertical className="w-3.5 h-3.5 opacity-40" />
      <span>{player.label}</span>
    </div>
  );
}
