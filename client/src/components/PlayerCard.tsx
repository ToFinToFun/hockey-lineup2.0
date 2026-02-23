// Hockey Lineup App – PlayerCard
// Design: Industrial Ice Arena – glassmorfism, mörk bakgrund, grön accent
// Draggable spelarkortet med redigerbar position och lag-tillhörighet (Grön/Vit)

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { Player, Position, TeamColor } from "@/lib/players";
import { getPositionBadgeColor, ALL_POSITIONS } from "@/lib/players";
import { useState, useRef, useEffect } from "react";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

interface PlayerCardProps {
  player: Player;
  onRemove?: () => void;
  onChangePosition?: (pos: Position) => void;
  onChangeTeamColor?: (color: TeamColor) => void;
  compact?: boolean;
}

export function DraggablePlayerCard({
  player,
  onRemove,
  onChangePosition,
  onChangeTeamColor,
  compact = false,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: player.id, data: { player } });
  const [showPosMenu, setShowPosMenu] = useState(false);
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  useEffect(() => {
    if (!showPosMenu && !showTeamMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPosMenu(false);
      }
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) {
        setShowTeamMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPosMenu, showTeamMenu]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex items-center gap-1.5 rounded-md
        bg-white/10 border border-white/20 backdrop-blur-sm
        hover:bg-white/15 hover:border-white/35
        transition-all duration-150 select-none overflow-visible
        ${compact ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"}
        ${isDragging ? "shadow-2xl ring-2 ring-emerald-400/60" : ""}
      `}
    >
      {/* Drag handle */}
      <div className="cursor-grab active:cursor-grabbing shrink-0" {...attributes} {...listeners}>
        <GripVertical className="w-3 h-3 text-white/30" />
      </div>

      {/* Lag-markering (logotyp eller färgad cirkel) */}
      {onChangeTeamColor ? (
        <div className="relative shrink-0 overflow-visible" ref={teamMenuRef}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowTeamMenu((v) => !v); setShowPosMenu(false); }}
            className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-white/40 transition-all shrink-0"
            title="Klicka för att ändra lag-tillhörighet"
          >
            <TeamColorIndicator teamColor={player.teamColor ?? null} size={20} />
          </button>
          {showTeamMenu && (
            <div className="absolute left-0 top-full mt-1 z-[9999] bg-gray-900/95 border border-white/20 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md" style={{ zIndex: 9999 }}>
              {([
                { value: "green" as TeamColor, label: "Gröna" },
                { value: "white" as TeamColor, label: "Vita" },
                { value: null, label: "Inget lag" },
              ] as { value: TeamColor; label: string }[]).map(({ value, label }) => (
                <button
                  key={String(value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeTeamColor(value);
                    setShowTeamMenu(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors whitespace-nowrap ${(player.teamColor ?? null) === value ? "bg-white/10" : ""}`}
                >
                  <TeamColorIndicator teamColor={value} size={16} />
                  <span className="text-white/80">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0">
          <TeamColorIndicator teamColor={player.teamColor ?? null} size={16} />
        </div>
      )}

      {/* Nummer */}
      {player.number && (
        <span className={`font-bold text-white/50 shrink-0 ${compact ? "text-[10px] w-4" : "text-xs w-5"}`}>
          {player.number}
        </span>
      )}

      {/* Namn */}
      <span className="text-white font-medium truncate flex-1 leading-tight">
        {player.name}
      </span>

      {/* Positions-badge – klickbar för att ändra */}
      <div className="relative shrink-0 overflow-visible" ref={menuRef}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (onChangePosition) { setShowPosMenu((v) => !v); setShowTeamMenu(false); }
          }}
          className={`
            text-[9px] font-bold px-1.5 py-0.5 rounded transition-all
            ${getPositionBadgeColor(player.position)}
            ${onChangePosition ? "hover:ring-2 hover:ring-white/40 cursor-pointer" : "cursor-default"}
          `}
          title={onChangePosition ? "Klicka för att ändra position" : undefined}
        >
          {player.position}
        </button>

        {/* Positions-dropdown */}
        {showPosMenu && onChangePosition && (
          <div className="absolute right-0 top-full mt-1 z-[9999] bg-gray-900/95 border border-white/20 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md" style={{ zIndex: 9999 }}>
            {ALL_POSITIONS.map((pos) => (
              <button
                key={pos}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onChangePosition(pos);
                  setShowPosMenu(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors ${player.position === pos ? "bg-white/10" : ""}`}
              >
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getPositionBadgeColor(pos)}`}>
                  {pos}
                </span>
                <span className="text-white/70">
                  {pos === "MV" ? "Målvakt" : pos === "B" ? "Back" : pos === "F" ? "Forward" : pos === "C" ? "Center" : "Ingen bestämd"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ta bort-knapp */}
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

// Liten indikator för lag-tillhörighet
export function TeamColorIndicator({ teamColor, size = 16 }: { teamColor: TeamColor; size?: number }) {
  if (teamColor === "green") {
    return (
      <img
        src={LOGO_GREEN}
        alt="Gröna"
        style={{ width: size, height: size, objectFit: "contain" }}
        className="rounded-full"
      />
    );
  }
  if (teamColor === "white") {
    return (
      <img
        src={LOGO_WHITE}
        alt="Vita"
        style={{ width: size, height: size, objectFit: "contain" }}
        className="rounded-full"
      />
    );
  }
  // Inget lag – grå tom cirkel
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full border border-white/20 bg-white/5 shrink-0"
    />
  );
}

// Overlay-kort som visas under musen vid drag
export function PlayerCardOverlay({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm bg-emerald-900/90 border border-emerald-400/60 backdrop-blur-sm shadow-2xl ring-2 ring-emerald-400/40 cursor-grabbing select-none">
      <GripVertical className="w-3 h-3 text-emerald-300/50 shrink-0" />
      <TeamColorIndicator teamColor={player.teamColor ?? null} size={14} />
      {player.number && (
        <span className="font-bold text-emerald-300/70 text-xs w-5 shrink-0">
          {player.number}
        </span>
      )}
      <span className="text-white font-medium truncate">{player.name}</span>
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
        {player.position}
      </span>
    </div>
  );
}
