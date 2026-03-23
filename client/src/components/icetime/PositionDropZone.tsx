/*
 * PositionDropZone component
 * A droppable zone that accepts dragged players.
 * Shows position info, player count, and calculated ice time.
 */

import { useDroppable } from "@dnd-kit/core";
import { Shield, Target, Swords, Clock } from "lucide-react";
import { formatTime } from "@/hooks/useIceTimeCalculator";
import DraggablePlayer, { type Player } from "./DraggablePlayer";

interface PositionDropZoneProps {
  id: "backs" | "centers" | "forwards";
  label: string;
  players: Player[];
  iceSlots: number;
  matchTime: number;
  isOver: boolean;
}

const zoneConfig = {
  backs: {
    icon: Shield,
    accentBar: "bg-ice-deep",
    iconBg: "bg-ice-deep/10",
    iconColor: "text-ice-deep",
    dropHighlight: "ring-ice-deep/40 bg-ice-deep/5",
    emptyText: "Dra spelare hit",
  },
  centers: {
    icon: Target,
    accentBar: "bg-ice-medium",
    iconBg: "bg-ice-medium/10",
    iconColor: "text-ice-medium",
    dropHighlight: "ring-ice-medium/40 bg-ice-medium/5",
    emptyText: "Dra spelare hit",
  },
  forwards: {
    icon: Swords,
    accentBar: "bg-goal-red",
    iconBg: "bg-goal-red/8",
    iconColor: "text-goal-red",
    dropHighlight: "ring-goal-red/30 bg-goal-red/5",
    emptyText: "Dra spelare hit",
  },
};

export default function PositionDropZone({
  id,
  label,
  players,
  iceSlots,
  matchTime,
  isOver,
}: PositionDropZoneProps) {
  const { setNodeRef } = useDroppable({ id });
  const config = zoneConfig[id];
  const Icon = config.icon;

  const playerCount = players.length;
  const timePerPlayer = playerCount > 0 ? (iceSlots / playerCount) * matchTime : 0;

  return (
    <div
      ref={setNodeRef}
      className={`
        glass-card-strong rounded-2xl p-5 relative overflow-hidden transition-all duration-200
        ${isOver ? `ring-2 ${config.dropHighlight}` : ""}
      `}
    >
      {/* Accent bar at top */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${config.accentBar}`} style={{ opacity: 0.8 }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.iconBg}`}>
            <Icon className={`w-5 h-5 ${config.iconColor}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              {label}
            </h3>
            <p className="text-xs text-muted-foreground">
              {iceSlots} på isen samtidigt
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-serif text-foreground">{playerCount}</div>
          <div className="text-xs text-muted-foreground">spelare</div>
        </div>
      </div>

      {/* Ice time display */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-muted/30 border border-border/30">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Speltid:</span>
        <span className={`text-lg font-semibold ${config.iconColor}`}>
          {playerCount > 0 ? formatTime(timePerPlayer) : "—"}
        </span>
        <span className="text-xs text-muted-foreground">per spelare</span>
      </div>

      {/* Players area */}
      <div
        className={`
          min-h-[60px] rounded-xl border-2 border-dashed p-3 transition-colors duration-200
          ${isOver ? "border-current/30" : "border-border/40"}
          ${players.length === 0 ? "flex items-center justify-center" : ""}
        `}
      >
        {players.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">{config.emptyText}</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <DraggablePlayer key={player.id} player={player} positionType={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
