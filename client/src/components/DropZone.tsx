// Hockey Lineup App – DropZone
// Design: Industrial Ice Arena – glassmorfism drop-zoner med glöd-effekt

import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player } from "@/lib/players";

interface DropZoneProps {
  id: string;
  label: string;
  players: Player[];
  maxPlayers: number;
  onRemovePlayer: (playerId: string) => void;
  zoneType: "goalkeeper" | "defense" | "forward";
}

const zoneStyles = {
  goalkeeper: {
    border: "border-amber-400/30",
    bg: "bg-amber-950/20",
    activeBg: "bg-amber-900/30",
    activeBorder: "border-amber-400/70",
    glowColor: "shadow-amber-500/20",
    labelColor: "text-amber-300",
    countColor: "text-amber-400",
    emptyText: "text-amber-400/40",
  },
  defense: {
    border: "border-blue-400/30",
    bg: "bg-blue-950/20",
    activeBg: "bg-blue-900/30",
    activeBorder: "border-blue-400/70",
    glowColor: "shadow-blue-500/20",
    labelColor: "text-blue-300",
    countColor: "text-blue-400",
    emptyText: "text-blue-400/40",
  },
  forward: {
    border: "border-emerald-400/30",
    bg: "bg-emerald-950/20",
    activeBg: "bg-emerald-900/30",
    activeBorder: "border-emerald-400/70",
    glowColor: "shadow-emerald-500/20",
    labelColor: "text-emerald-300",
    countColor: "text-emerald-400",
    emptyText: "text-emerald-400/40",
  },
};

export function DropZone({
  id,
  label,
  players,
  maxPlayers,
  onRemovePlayer,
  zoneType,
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const isFull = players.length >= maxPlayers;
  const styles = zoneStyles[zoneType];

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-lg border backdrop-blur-sm transition-all duration-200 min-h-[60px]
        ${isOver && !isFull
          ? `${styles.activeBg} ${styles.activeBorder} shadow-lg ${styles.glowColor}`
          : `${styles.bg} ${styles.border}`
        }
        ${isFull && isOver ? "border-red-400/60 bg-red-950/20" : ""}
        p-2
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-bold uppercase tracking-wider ${styles.labelColor}`}>
          {label}
        </span>
        <span className={`text-xs font-mono ${isFull ? "text-red-400" : styles.countColor}`}>
          {players.length}/{maxPlayers}
        </span>
      </div>

      {/* Spelare */}
      <div className="flex flex-col gap-1">
        {players.map((player) => (
          <DraggablePlayerCard
            key={player.id}
            player={player}
            onRemove={() => onRemovePlayer(player.id)}
            compact
          />
        ))}
        {players.length === 0 && (
          <div className={`text-[11px] italic text-center py-2 ${styles.emptyText}`}>
            Dra spelare hit
          </div>
        )}
        {isFull && (
          <div className="text-[10px] text-red-400/70 text-center italic">
            Zonen är full
          </div>
        )}
      </div>
    </div>
  );
}
