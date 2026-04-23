// RemoveDropZone — visible drop target that appears during drag to remove a player from a slot
// Desktop: inline element placed directly below the lineup (not fixed)
// Mobile: fixed at bottom of screen, icon-only
import { useDroppable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";

interface RemoveDropZoneProps {
  /** Whether a drag is currently active (controls visibility) */
  isDragging: boolean;
  /** Whether the dragged player is from a slot (only then can it be removed) */
  isFromSlot: boolean;
  /** Whether to use mobile layout (fixed at bottom, icon-only) */
  isMobile?: boolean;
}

export function RemoveDropZone({ isDragging, isFromSlot, isMobile = false }: RemoveDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id: "remove-zone" });

  // Only show when dragging a player that is in a slot
  if (!isDragging || !isFromSlot) return null;

  if (isMobile) {
    // Mobile: fixed at bottom, icon-only, compact
    return (
      <div
        ref={setNodeRef}
        className={`
          fixed bottom-4 left-1/2 -translate-x-1/2 z-[99998]
          flex items-center justify-center
          transition-all duration-200
          backdrop-blur-xl select-none pointer-events-auto
          rounded-xl px-3 py-2.5
          ${isOver
            ? "bg-red-500/30 border-2 border-red-400 shadow-2xl shadow-red-500/40 scale-110"
            : "bg-red-950/80 border border-red-400/40 shadow-lg shadow-red-500/10"
          }
        `}
      >
        <Trash2 className={`w-5 h-5 transition-colors ${isOver ? "text-red-300" : "text-red-400/70"}`} />
      </div>
    );
  }

  // Desktop: inline, placed in flow below the lineup
  return (
    <div
      ref={setNodeRef}
      className={`
        flex items-center justify-center gap-2
        mx-auto mt-3 px-5 py-2.5 rounded-xl
        transition-all duration-200
        select-none pointer-events-auto
        ${isOver
          ? "bg-red-500/20 border-2 border-red-400 shadow-lg shadow-red-500/30 scale-105"
          : "bg-red-950/50 border border-dashed border-red-400/40"
        }
      `}
    >
      <Trash2 className={`w-4 h-4 transition-colors ${isOver ? "text-red-300" : "text-red-400/60"}`} />
      <span className={`text-xs font-bold tracking-wide transition-colors ${isOver ? "text-red-200" : "text-red-400/60"}`}>
        Släpp här för att ta bort
      </span>
    </div>
  );
}
