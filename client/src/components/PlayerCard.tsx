// Hockey Lineup App – PlayerCard
// Dropdowns renderas via React Portal för att alltid visas ovanpå allt

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X, Trash2 } from "lucide-react";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import { getPositionBadgeColor, ALL_POSITIONS } from "@/lib/players";
import { useState, useRef } from "react";
import { PortalDropdown } from "./PortalDropdown";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

interface PlayerCardProps {
  player: Player;
  onRemove?: () => void;
  onDelete?: () => void;
  onChangePosition?: (pos: Position) => void;
  onChangeTeamColor?: (color: TeamColor) => void;
  onChangeNumber?: (number: string) => void;
  onChangeName?: (name: string) => void;
  onChangeCaptainRole?: (role: CaptainRole) => void;
  onLongPress?: (e: React.PointerEvent) => void;
  onLongPressEnd?: () => void;
  onLongPressMove?: () => void;
  isHolding?: boolean;
  holdDuration?: number;
  compact?: boolean;
  hideExtras?: boolean; // Dölj position/lag även i icke-compact (används i export)
}

export function DraggablePlayerCard({
  player,
  onRemove,
  onDelete,
  onChangePosition,
  onChangeTeamColor,
  onChangeNumber,
  onChangeName,
  onChangeCaptainRole,
  onLongPress,
  onLongPressEnd,
  onLongPressMove,
  isHolding = false,
  holdDuration = 3000,
  compact = false,
  hideExtras = false,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: player.id, data: { player } });

  const [showEditPanel, setShowEditPanel] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nrValue, setNrValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editBtnRef = useRef<HTMLButtonElement>(null);

  // Under drag: göm originalet helt (DragOverlay hanterar all visuell feedback)
  const style = isDragging
    ? { opacity: 0, pointerEvents: "none" as const }
    : {};

  // Spara startposition för att beräkna rörelse-avstånd
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Anropa dnd-kit listeners
    if (listeners?.onPointerDown) listeners.onPointerDown(e);
    // Starta long-press timer (endast touch)
    if (e.pointerType !== "mouse" && onLongPress) {
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      onLongPress(e);
    }
  };

  const handlePointerUp = () => {
    pointerStartRef.current = null;
    if (onLongPressEnd) onLongPressEnd();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Avbryt long-press bara om fingret rört sig mer än 15px (undvik falska avbrott)
    if (pointerStartRef.current && onLongPressMove) {
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 15) {
        pointerStartRef.current = null;
        onLongPressMove();
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "pan-y" }}  /* pan-y tillåter vertikal scroll, dnd-kit hanterar drag via delay */
      className={`
        group relative flex items-center gap-1.5 rounded-md
        bg-white/10 border border-white/20 backdrop-blur-sm
        hover:bg-white/15 hover:border-white/35
        transition-all duration-150 select-none
        ${compact ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"}
        ${isDragging ? "shadow-2xl ring-2 ring-emerald-400/60" : ""}
        ${isHolding ? "ring-1 ring-red-400/60" : ""}
      `}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
    >
      {/* Visuell hold-timer overlay */}
      {isHolding && (
        <div className="absolute inset-0 rounded-md pointer-events-none flex items-center justify-center z-10"
          style={{ background: 'rgba(239,68,68,0.10)' }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="2.5" />
            <circle
              cx="18" cy="18" r="14"
              fill="none"
              stroke="rgb(239,68,68)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="87.96"
              strokeDashoffset="87.96"
              style={{ animation: `holdProgress ${holdDuration}ms linear forwards` }}
            />
          </svg>
          <span className="absolute text-[9px] font-black text-red-400 tracking-wide">HÅLL</span>
        </div>
      )}

      {/* Namn + #nr – vanlig text (ej klickbar) */}
      <span className="text-white font-medium truncate flex-1 leading-tight">
        {player.name}
        {!compact && !hideExtras && player.number ? <span className="text-white/40 font-normal ml-1">#{player.number}</span> : null}
        {compact && !hideExtras && player.number ? <span className="text-white/40 font-normal ml-1"> #{player.number}</span> : null}
      </span>

      {/* Captain + Lag-cirkel + position i compact-läge – klickbara för att öppna redigeringspanelen */}
      {compact && !hideExtras && onChangeName ? (
        <button
          ref={editBtnRef}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setNameValue(player.name);
            setNrValue(player.number ?? "");
            setShowEditPanel((v) => !v);
          }}
          className="flex items-center gap-1 shrink-0 hover:ring-1 hover:ring-emerald-400/40 rounded px-0.5 py-0.5 transition-all cursor-pointer"
          title="Klicka för att redigera spelare"
        >
          {player.captainRole && (
            <span className={`text-[9px] font-black px-1 py-0.5 rounded shrink-0 ${
              player.captainRole === "C"
                ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/40"
                : "bg-orange-400/20 text-orange-300 border border-orange-400/40"
            }`}>{player.captainRole}</span>
          )}
          <TeamColorIndicator teamColor={player.teamColor ?? null} size={10} />
          <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
            {player.position}
          </span>
        </button>
      ) : compact && !hideExtras ? (
        <div className="flex items-center gap-1 shrink-0">
          {player.captainRole && (
            <span className={`text-[9px] font-black px-1 py-0.5 rounded shrink-0 ${
              player.captainRole === "C"
                ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/40"
                : "bg-orange-400/20 text-orange-300 border border-orange-400/40"
            }`}>{player.captainRole}</span>
          )}
          <TeamColorIndicator teamColor={player.teamColor ?? null} size={10} />
          <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
            {player.position}
          </span>
        </div>
      ) : null}

      {/* Icke-compact badges – klickbara för att öppna redigeringspanelen */}
      {!compact && !hideExtras && onChangeName ? (
        <button
          ref={!compact ? editBtnRef : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setNameValue(player.name);
            setNrValue(player.number ?? "");
            setShowEditPanel((v) => !v);
          }}
          className="flex items-center gap-1 shrink-0 hover:ring-1 hover:ring-emerald-400/40 rounded px-0.5 py-0.5 transition-all cursor-pointer"
          title="Klicka för att redigera spelare"
        >
          {player.captainRole && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              player.captainRole === "C"
                ? "bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
                : "bg-orange-400/20 text-orange-300 border-orange-400/40"
            }`}>{player.captainRole}</span>
          )}
          <TeamColorIndicator teamColor={player.teamColor ?? null} size={16} />
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
            {player.position}
          </span>
        </button>
      ) : !compact && !hideExtras ? (
        <div className="flex items-center gap-1 shrink-0">
          {player.captainRole && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              player.captainRole === "C"
                ? "bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
                : "bg-orange-400/20 text-orange-300 border-orange-400/40"
            }`}>{player.captainRole}</span>
          )}
          <TeamColorIndicator teamColor={player.teamColor ?? null} size={16} />
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
            {player.position}
          </span>
        </div>
      ) : null}

      {/* Gemensam PortalDropdown för både compact och icke-compact */}
      {onChangeName && (
        <PortalDropdown
            anchorRef={editBtnRef}
            open={showEditPanel}
            onClose={() => setShowEditPanel(false)}
          >
            <div className="px-3 py-2.5 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
              {/* Rad 1: Namn-fält */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  maxLength={40}
                  placeholder="Spelarens namn"
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && nameValue.trim()) {
                      onChangeName(nameValue.trim());
                      setShowEditPanel(false);
                    } else if (e.key === "Escape") {
                      setShowEditPanel(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-white/10 border border-emerald-400/40 rounded px-2 py-1 text-xs text-white outline-none focus:border-emerald-400"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (nameValue.trim()) {
                      onChangeName(nameValue.trim());
                      setShowEditPanel(false);
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  Spara
                </button>
              </div>
              {/* Rad 2: Lag-väljare */}
              {onChangeTeamColor && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                  <span className="text-white/40 text-[10px] w-6">Lag:</span>
                  {([
                    { value: "white" as TeamColor, label: "Vita" },
                    { value: "green" as TeamColor, label: "Gröna" },
                    { value: null, label: "Waivers" },
                  ] as { value: TeamColor; label: string }[]).map(({ value, label }) => (
                    <button
                      key={String(value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeTeamColor(value);
                      }}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border transition-all ${
                        (player.teamColor ?? null) === value
                          ? "bg-white/15 text-white/80 border-white/30 ring-1 ring-white/20"
                          : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                      }`}
                    >
                      <TeamColorIndicator teamColor={value} size={10} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {/* Rad 3: Position-väljare */}
              {onChangePosition && (
                <div className="flex items-center gap-1 pt-1 border-t border-white/10 flex-wrap">
                  <span className="text-white/40 text-[10px] w-6">Pos:</span>
                  {ALL_POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangePosition(pos);
                      }}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                        player.position === pos
                          ? `${getPositionBadgeColor(pos)} ring-1 ring-white/30`
                          : "bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 hover:text-white/50"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              )}
              {/* Rad 4: Nr + Roll på samma rad */}
              {(onChangeNumber || onChangeCaptainRole) && (
                <div className="flex items-center gap-3 pt-1 border-t border-white/10">
                  {onChangeNumber && (
                    <div className="flex items-center gap-1">
                      <span className="text-white/40 text-[10px]">Nr:</span>
                      <span className="text-white/50 text-xs">#</span>
                      <input
                        type="text"
                        value={nrValue}
                        maxLength={3}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          setNrValue(v);
                          onChangeNumber(v);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") setShowEditPanel(false);
                          else if (e.key === "Escape") setShowEditPanel(false);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 bg-white/10 border border-emerald-400/40 rounded px-2 py-1 text-xs text-white text-center outline-none focus:border-emerald-400"
                      />
                    </div>
                  )}
                  {onChangeCaptainRole && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-white/40 text-[10px]">Roll:</span>
                      {([
                        { value: "C" as CaptainRole, label: "C" },
                        { value: "A" as CaptainRole, label: "A" },
                        { value: null, label: "—" },
                      ] as { value: CaptainRole; label: string }[]).map(({ value, label }) => (
                        <button
                          key={String(value)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeCaptainRole(value);
                          }}
                          className={`text-[9px] font-black px-2 py-1 rounded border transition-all ${
                            player.captainRole === value
                              ? value === "C"
                                ? "bg-yellow-400/25 text-yellow-300 border-yellow-400/50 ring-1 ring-yellow-400/30"
                                : value === "A"
                                ? "bg-orange-400/25 text-orange-300 border-orange-400/50 ring-1 ring-orange-400/30"
                                : "bg-white/15 text-white/60 border-white/30 ring-1 ring-white/20"
                              : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Ta bort spelare */}
              {onDelete && (
                <div className="pt-1.5 border-t border-white/10">
                  {!confirmDelete ? (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/15 border border-red-400/20 hover:border-red-400/40 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                      Ta bort spelare
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] text-red-300 text-center font-medium">
                        Är du säker på att ta bort {player.name}?
                      </p>
                      <div className="flex gap-1">
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                            setShowEditPanel(false);
                            setConfirmDelete(false);
                          }}
                          className="flex-1 py-1.5 rounded text-xs font-bold text-white bg-red-500/30 border border-red-400/50 hover:bg-red-500/50 transition-all"
                        >
                          Ja, ta bort
                        </button>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(false);
                          }}
                          className="flex-1 py-1.5 rounded text-xs font-medium text-white/50 bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </PortalDropdown>
      )}

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

// Liten indikator för lag-tillhörighet – solid färgcirkel
export function TeamColorIndicator({ teamColor, size = 16 }: { teamColor: TeamColor; size?: number }) {
  if (teamColor === "green") {
    return (
      <div
        title="Gröna"
        style={{ width: size, height: size, flexShrink: 0 }}
        className="rounded-full bg-emerald-400 border border-emerald-300/60 shrink-0"
      />
    );
  }
  if (teamColor === "white") {
    return (
      <div
        title="Vita"
        style={{ width: size, height: size, flexShrink: 0 }}
        className="rounded-full bg-white border border-white/60 shrink-0"
      />
    );
  }
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
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm bg-emerald-900 border border-emerald-400 shadow-2xl ring-2 ring-emerald-400/60 cursor-grabbing select-none" style={{ minWidth: 160, maxWidth: 240 }}>
      <TeamColorIndicator teamColor={player.teamColor ?? null} size={14} />
      {player.captainRole && (
        <span className={`text-[9px] font-black px-1 py-0.5 rounded shrink-0 border ${
          player.captainRole === "C"
            ? "bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
            : "bg-orange-400/20 text-orange-300 border-orange-400/40"
        }`}>{player.captainRole}</span>
      )}
      <span className="text-white font-medium truncate">{player.name}</span>
      {player.number && (
        <span className="font-bold text-emerald-300/70 text-xs w-5 shrink-0">
          {player.number}
        </span>
      )}
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${getPositionBadgeColor(player.position)}`}>
        {player.position}
      </span>
    </div>
  );
}
