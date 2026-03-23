/*
 * PositionDropZone component
 * A droppable zone that accepts dragged players.
 * Shows position info, player count, and calculated ice time.
 * DESIGN: Dark theme matching Hub landing page
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
    accentBar: "bg-sky-400",
    iconBg: "bg-sky-400/10 border border-sky-400/20",
    iconColor: "text-sky-400",
    dropHighlight: "ring-sky-400/40 bg-sky-400/5",
    emptyText: "Dra spelare hit",
  },
  centers: {
    icon: Target,
    accentBar: "bg-[#0a7ea4]",
    iconBg: "bg-[#0a7ea4]/15 border border-[#0a7ea4]/25",
    iconColor: "text-[#0a7ea4]",
    dropHighlight: "ring-[#0a7ea4]/40 bg-[#0a7ea4]/5",
    emptyText: "Dra spelare hit",
  },
  forwards: {
    icon: Swords,
    accentBar: "bg-orange-400",
    iconBg: "bg-orange-400/10 border border-orange-400/20",
    iconColor: "text-orange-400",
    dropHighlight: "ring-orange-400/30 bg-orange-400/5",
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
        rounded-2xl p-5 relative overflow-hidden transition-all duration-200
        bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#2a2a2a]
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
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              {label}
            </h3>
            <p className="text-xs text-white/40">
              {iceSlots} på isen samtidigt
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>{playerCount}</div>
          <div className="text-xs text-white/40">spelare</div>
        </div>
      </div>

      {/* Ice time display */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
        <Clock className="w-4 h-4 text-white/40" />
        <span className="text-sm text-white/40">Speltid:</span>
        <span className={`text-lg font-semibold ${config.iconColor}`}>
          {playerCount > 0 ? formatTime(timePerPlayer) : "—"}
        </span>
        <span className="text-xs text-white/30">per spelare</span>
      </div>

      {/* Players area */}
      <div
        className={`
          min-h-[60px] rounded-xl border-2 border-dashed p-3 transition-colors duration-200
          ${isOver ? "border-current/30" : "border-white/10"}
          ${players.length === 0 ? "flex items-center justify-center" : ""}
        `}
      >
        {players.length === 0 ? (
          <span className="text-xs text-white/20">{config.emptyText}</span>
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
