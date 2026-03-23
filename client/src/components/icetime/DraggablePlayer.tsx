/*
 * DraggablePlayer component
 * A draggable player chip that can be moved between position zones.
 * Uses @dnd-kit for drag-and-drop functionality.
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
  backs: "bg-ice-deep/10 text-ice-deep border-ice-deep/25 hover:bg-ice-deep/15",
  centers: "bg-ice-medium/10 text-ice-medium border-ice-medium/25 hover:bg-ice-medium/15",
  forwards: "bg-goal-red/8 text-goal-red border-goal-red/20 hover:bg-goal-red/12",
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
