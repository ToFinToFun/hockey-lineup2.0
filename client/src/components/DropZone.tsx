// Hockey Lineup App – DropZone med formations-gruppering
// Backar: grupperade i par (2+2+2+2)
// Forwards: grupperade i trior med center i mitten (LW – C – RW)

import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position } from "@/lib/players";

interface DropZoneProps {
  id: string;
  label: string;
  players: Player[];
  maxPlayers: number;
  onRemovePlayer: (playerId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  zoneType: "goalkeeper" | "defense" | "forward";
}

const zoneStyles = {
  goalkeeper: {
    border: "border-amber-400/30",
    bg: "bg-amber-950/20",
    activeBg: "bg-amber-900/30",
    activeBorder: "border-amber-400/70",
    labelColor: "text-amber-300",
    countColor: "text-amber-400",
    emptyText: "text-amber-400/40",
  },
  defense: {
    border: "border-blue-400/30",
    bg: "bg-blue-950/20",
    activeBg: "bg-blue-900/30",
    activeBorder: "border-blue-400/70",
    labelColor: "text-blue-300",
    countColor: "text-blue-400",
    emptyText: "text-blue-400/40",
  },
  forward: {
    border: "border-emerald-400/30",
    bg: "bg-emerald-950/20",
    activeBg: "bg-emerald-900/30",
    activeBorder: "border-emerald-400/70",
    labelColor: "text-emerald-300",
    countColor: "text-emerald-400",
    emptyText: "text-emerald-400/40",
  },
};

// Dela upp array i chunks
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// Backar-par: visa 2 per rad
function DefensePairs({ players, onRemovePlayer, onChangePosition }: {
  players: Player[];
  onRemovePlayer: (id: string) => void;
  onChangePosition: (id: string, pos: Position) => void;
}) {
  const pairs = chunk(players, 2);
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map((pair, i) => (
        <div key={i} className="flex flex-col gap-0.5 rounded-md bg-blue-950/20 border border-blue-400/15 p-1">
          <div className="text-[9px] text-blue-400/50 font-bold uppercase tracking-wider px-0.5 mb-0.5">
            Par {i + 1}
          </div>
          {pair.map((player) => (
            <DraggablePlayerCard
              key={player.id}
              player={player}
              onRemove={() => onRemovePlayer(player.id)}
              onChangePosition={(pos) => onChangePosition(player.id, pos)}
              compact
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Forwards-trio: LW – C – RW (3 per rad, center i mitten)
function ForwardLines({ players, onRemovePlayer, onChangePosition }: {
  players: Player[];
  onRemovePlayer: (id: string) => void;
  onChangePosition: (id: string, pos: Position) => void;
}) {
  const lines = chunk(players, 3);
  const lineLabels = ["1:a kedjan", "2:a kedjan", "3:e kedjan", "4:e kedjan"];
  const roleLabels = ["VF", "C", "HF"];

  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => (
        <div key={i} className="rounded-md bg-emerald-950/20 border border-emerald-400/15 p-1">
          <div className="text-[9px] text-emerald-400/50 font-bold uppercase tracking-wider px-0.5 mb-1">
            {lineLabels[i] ?? `Kedja ${i + 1}`}
          </div>
          <div className="flex flex-col gap-0.5">
            {line.map((player, j) => (
              <div key={player.id} className="flex items-center gap-1">
                <span className={`text-[8px] font-bold w-5 shrink-0 text-center rounded px-0.5
                  ${j === 1 ? "text-purple-300 bg-purple-500/20" : "text-emerald-300/60 bg-emerald-500/10"}
                `}>
                  {roleLabels[j] ?? ""}
                </span>
                <div className="flex-1 min-w-0">
                  <DraggablePlayerCard
                    player={player}
                    onRemove={() => onRemovePlayer(player.id)}
                    onChangePosition={(pos) => onChangePosition(player.id, pos)}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DropZone({
  id,
  label,
  players,
  maxPlayers,
  onRemovePlayer,
  onChangePosition,
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
          ? `${styles.activeBg} ${styles.activeBorder} shadow-lg`
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

      {/* Formationsvisning */}
      {players.length === 0 ? (
        <div className={`text-[11px] italic text-center py-3 ${styles.emptyText}`}>
          Dra spelare hit
        </div>
      ) : zoneType === "defense" ? (
        <DefensePairs
          players={players}
          onRemovePlayer={onRemovePlayer}
          onChangePosition={onChangePosition}
        />
      ) : zoneType === "forward" ? (
        <ForwardLines
          players={players}
          onRemovePlayer={onRemovePlayer}
          onChangePosition={onChangePosition}
        />
      ) : (
        // Målvakter – enkel lista
        <div className="flex flex-col gap-1">
          {players.map((player) => (
            <DraggablePlayerCard
              key={player.id}
              player={player}
              onRemove={() => onRemovePlayer(player.id)}
              onChangePosition={(pos) => onChangePosition(player.id, pos)}
              compact
            />
          ))}
        </div>
      )}

      {isFull && (
        <div className="text-[10px] text-red-400/70 text-center italic mt-1">
          Zonen är full
        </div>
      )}
    </div>
  );
}
