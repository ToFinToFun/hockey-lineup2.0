// Hockey Lineup App – PlayerCard – Glassmorphism v2
// Flat design: no colored row backgrounds, just name + number + badges
// PortalDropdown edit panel preserved with all functionality

import { teamName, teamSingular, teamGenitive, defaultTeamNames } from "@shared/teams";
import { teamLogo, club, clubHeading } from "@shared/club";
import { trpc } from "@/lib/trpc";
import { posGroup } from "@/lib/altPosition";
import { POSITION_COLORS } from "@/lib/positionColors";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X, Trash2 } from "lucide-react";
import type { Player, Position, TeamColor, CaptainRole, PlayerRecord } from "@/lib/players";
import { getPositionBadgeColor, ALL_POSITIONS, positionName } from "@/lib/players";
import { useState, useRef, Fragment } from "react";
import { PortalDropdown } from "./PortalDropdown";
import { PlayerPhoto } from "./PlayerPhoto";
import { CardThumb } from "./CardThumb";
import { useForwardColor } from "@/hooks/useForwardColor";
import { usePirSettings } from "@/hooks/usePirEnabled";


interface PlayerCardProps {
  /** Kortet ligger inne i en plats i uppställningen – ingen egen ruta runt. */
  embedded?: boolean;
  player: Player;
  onRemove?: () => void;
  onDelete?: () => void;
  onChangePosition?: (pos: Position) => void;
  onChangeTeamColor?: (color: TeamColor) => void;
  onChangeNumber?: (number: string) => void;
  onChangeName?: (name: string) => void;
  onChangeCaptainRole?: (role: CaptainRole) => void;
  onChangeRegistered?: (isRegistered: boolean) => void;
  onSyncToLaget?: (status: "Attending" | "NotAttending" | "NotAnswered") => Promise<void>;
  onChangeGamesPlayed?: (gamesPlayed: number) => void;
  onLongPress?: (e: React.PointerEvent) => void;
  onLongPressEnd?: () => void;
  onLongPressMove?: () => void;
  isHolding?: boolean;
  holdDuration?: number;
  compact?: boolean;
  hideExtras?: boolean;
  /** Slot type when rendered inside a PlayerSlot (used for MV outfield display) */
  slotType?: "goalkeeper" | "defense" | "forward";
  /** Estimated ice time in minutes for this slot */
  iceTimeMinutes?: number;
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
  onChangeRegistered,
  onSyncToLaget,
  onChangeGamesPlayed,
  onLongPress,
  onLongPressEnd,
  onLongPressMove,
  isHolding = false,
  holdDuration = 3000,
  compact = false,
  hideExtras = false,
  embedded = false,
  slotType,
  iceTimeMinutes,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: player.id, data: { player } });

  const { colors: fc } = useForwardColor();

  // Determine display position: if a goalkeeper (MV) is placed in an outfield
  // slot, show their most-played outfield position instead of "MV".
  // If no outfield position is known, keep showing "MV" — never auto-assign IB.
  const displayPosition = (() => {
    if (slotType && slotType !== "goalkeeper" && player.position === "MV") {
      if (player.mostPlayedPosition && player.mostPlayedPosition !== "MV") {
        return player.mostPlayedPosition;
      }
    }
    return player.position;
  })();

  const pirSettings = usePirSettings();
  const pirEnabled = pirSettings.enabled;


  // Dual PIR: select the correct PIR based on slot context or player position.
  // When placed in a goalkeeper slot → use goalkeeper PIR (if available).
  // When placed in an outfield slot → use outfield PIR (if available).
  // When not placed (roster) → use based on player.position.
  // Falls back to overall PIR if role-specific PIR is not available.
  const activePir = (() => {
    const isGkContext = slotType === "goalkeeper" || (!slotType && player.position === "MV");
    const isOutContext = slotType ? slotType !== "goalkeeper" : player.position !== "MV";

    if (isGkContext && player.pirGoalkeeper != null) {
      return {
        rating: player.pirGoalkeeper,
        trend: player.pirGoalkeeperTrend ?? null,
        trendLabel: player.pirGoalkeeperTrendLabel ?? 'stable' as const,
        matchesPlayed: player.pirGoalkeeperMatchesPlayed ?? 0,
        confidence: player.pirGoalkeeperConfidence ?? 0,
        recent: null as number | null,
        label: 'MV',
      };
    }
    if (isOutContext && player.pirOutfield != null) {
      return {
        rating: player.pirOutfield,
        trend: player.pirOutfieldTrend ?? null,
        trendLabel: player.pirOutfieldTrendLabel ?? 'stable' as const,
        matchesPlayed: player.pirOutfieldMatchesPlayed ?? 0,
        confidence: player.pirOutfieldConfidence ?? 0,
        recent: null as number | null,
        label: 'UT',
      };
    }
    // Fallback to overall PIR
    return {
      rating: player.pir ?? null,
      trend: player.pirTrend ?? null,
      trendLabel: player.pirTrendLabel ?? 'stable' as const,
      matchesPlayed: player.pirMatchesPlayed ?? 0,
      confidence: player.pirConfidence ?? 0,
      recent: player.pirRecent ?? null,
      label: null as string | null,
    };
  })();

  const [showEditPanel, setShowEditPanel] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nrValue, setNrValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncingToLaget, setSyncingToLaget] = useState(false);

  const editBtnRef = useRef<HTMLButtonElement>(null);

  const style = isDragging
    ? { opacity: 0, pointerEvents: "none" as const }
    : {};

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
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
      style={{ ...style, touchAction: "manipulation" }}
      className={`
        group relative rounded-r-md rounded-l-sm w-full
        ${embedded ? "bg-transparent" : "player-row"} border-l-[3px]
        ${player.isRegistered ? "border-l-emerald-400" : player.isDeclined ? "border-l-red-500" : "border-l-white/10"}
        transition-all duration-150 select-none
        ${compact ? "flex items-center pl-1 pr-0.5 py-0.5 text-xs" : "flex items-center pl-1.5 pr-1 py-1 text-sm"}
        ${isDragging ? "shadow-2xl ring-2 ring-emerald-400/60" : ""}
        ${isHolding ? "ring-1 ring-red-400/60" : ""}
      `}
      title={player.isRegistered ? "Anmäld" : player.isDeclined ? "Kommer inte" : "Inte svarat"}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
    >
      {/* Hold-timer overlay */}
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

      {/* ---- Namn (upp till två rader) till vänster, märken i två rader till höger ----
           Anmälan visas som färgad kant, lagtillhörighet som V/G-ruta. */}
      <div className={`flex items-center w-full min-w-0 ${compact ? "gap-1" : "gap-2"}`}>
        {compact ? (() => {
          // Förnamn på rad 1, efternamn på rad 2. Ord delas aldrig – blir en rad
          // för lång kortas just den raden med "…".
          const parts = player.name.trim().split(/\s+/);
          const last = parts.length > 1 ? parts.pop()! : "";
          const first = parts.join(" ");
          return (
            <span className="flex-1 min-w-0 text-white leading-tight text-[12px] font-semibold" title={`${player.name}${player.number ? ` #${player.number}` : ""}`}>
              <span className="block truncate">
                {first}
                {player.number ? <span className="text-white/40 font-normal ml-1">#{player.number}</span> : null}
              </span>
              {last && <span className="block truncate">{last}</span>}
            </span>
          );
        })() : (
          <span className="flex-1 min-w-0 text-white leading-tight text-[13px] font-medium truncate" title={player.name}>
            {player.name}
            {player.number ? <span className="text-white/40 font-normal ml-1">#{player.number}</span> : null}
          </span>
        )}

        {!hideExtras && (() => {
          const showPir = pirEnabled && pirSettings.showRating && activePir.rating != null;
          const pirBadge = showPir ? (
            <span
              className={`text-[9px] leading-none font-bold px-1 py-[3px] rounded border text-center ${
                activePir.rating! >= 1050 ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
                : activePir.rating! >= 1000 ? "bg-white/5 text-white/50 border-white/15"
                : "bg-sky-400/10 text-sky-300/60 border-sky-400/20"
              }`}
              title={`PIR${activePir.label ? ` (${activePir.label})` : ""}: ${activePir.rating} | Matcher: ${activePir.matchesPlayed}`}
            >
              {activePir.rating}
              {pirSettings.showTrend && <TrendIcon trendLabel={activePir.trendLabel} matchesPlayed={activePir.matchesPlayed} className="!w-auto !h-auto !text-[9px] ml-0.5" />}
            </span>
          ) : null;
          const pirRatingBadge = showPir ? (
            <span
              className={`text-[9px] leading-none font-bold px-1 py-[3px] rounded border text-center shrink-0 ${
                activePir.rating! >= 1050 ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
                : activePir.rating! >= 1000 ? "bg-white/5 text-white/50 border-white/15"
                : "bg-sky-400/10 text-sky-300/60 border-sky-400/20"
              }`}
              title={`PIR${activePir.label ? ` (${activePir.label})` : ""}: ${activePir.rating} | Matcher: ${activePir.matchesPlayed}`}
            >
              {activePir.rating}
            </span>
          ) : null;
          const teamBadge = <TeamColorIndicator teamColor={player.teamColor ?? null} compact mostPlayedTeam={!player.teamColor ? player.mostPlayedTeam : undefined} />;
          // Alternativ position: manuell (hybrid) eller från historiken – andra färgen i brickan
          const altPos = player.altPosition || player.secondaryPosition || null;
          const showAlt = !!altPos && !!displayPosition && posGroup(displayPosition) !== null && posGroup(altPos) !== posGroup(displayPosition);
          const posBadge = (
            <span
              className={`pos-badge pos-badge-sm ${displayPosition ? `pos-badge-${displayPosition.toLowerCase()}` : "bg-white/10 text-white/40"} shrink-0`}
              style={showAlt ? { background: `linear-gradient(135deg, ${POSITION_COLORS[displayPosition!] ?? "#64748b"} 0 52%, ${POSITION_COLORS[altPos!] ?? "#64748b"} 52% 100%)` } : undefined}
              title={displayPosition
                ? `${positionName(displayPosition)}${showAlt ? ` · spelar även ${positionName(altPos!)}${player.altPosition ? " (hybrid)" : player.secondaryShare ? ` (${Math.round(player.secondaryShare * 100)} % av matcherna)` : ""}` : ""}`
                : "Ingen position"}
            >
              {displayPosition || "–"}
            </span>
          );
          const badges = compact ? (
            /* Uppställningen: högst 2×2 – lag och position överst, PIR under (dubbel bredd).
               Speltid visas i positionsrutan till vänster, C/A i truppen och i spelarkortet. */
            <span className="grid grid-cols-2 gap-0.5 justify-items-stretch">
              {teamBadge}
              {posBadge}
              {pirBadge && <span className="col-span-2 flex [&>*]:flex-1">{pirBadge}</span>}
            </span>
          ) : (
            /* Truppen: en rad i samma ordning som mobilen – C/A, lag, position,
               formpil (PIR-trend), speltid, PIR. */
            <span className="flex items-center gap-0.5 justify-end">
              {player.captainRole && (
                <span className={`text-[9px] leading-none font-black px-1 py-[3px] rounded border shrink-0 ${
                  player.captainRole === "C"
                    ? "bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
                    : "bg-orange-400/20 text-orange-300 border-orange-400/40"
                }`} title={player.captainRole === "C" ? "Lagkapten" : "Assisterande lagkapten"}>{player.captainRole}</span>
              )}
              {teamBadge}
              {posBadge}
              {pirEnabled && pirSettings.showTrend && (
                <TrendIcon trendLabel={activePir.trendLabel} matchesPlayed={activePir.matchesPlayed} />
              )}
              {iceTimeMinutes != null && (
                <span className="ice-time-badge ice-time-badge-compact shrink-0" title={`Beräknad speltid: ${iceTimeMinutes} min`}>
                  {iceTimeMinutes}ʼ
                </span>
              )}
              {pirRatingBadge}
            </span>
          );
          return onChangeName ? (
            <button
              ref={editBtnRef}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setNameValue(player.name);
                setNrValue(player.number ?? "");
                setShowEditPanel((v) => !v);
              }}
              className="flex flex-col gap-0.5 shrink-0 rounded px-0.5 py-0.5 hover:ring-1 hover:ring-emerald-400/40 transition-all cursor-pointer"
              title="Tryck för att redigera spelaren"
            >
              {badges}
            </button>
          ) : (
            <span className="flex flex-col gap-0.5 shrink-0">{badges}</span>
          );
        })()}
      </div>

      {/* PortalDropdown edit panel */}
      {onChangeName && (
        <PortalDropdown
            anchorRef={editBtnRef}
            open={showEditPanel}
            onClose={() => setShowEditPanel(false)}
            solid
          >
            <div className="px-3 py-2.5 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
              {/* Name field */}
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
              {/* Team color */}
              {onChangeTeamColor && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                  <span className="text-white/40 text-[10px] w-6">Lag:</span>
                  {([
                    { value: "white" as TeamColor, label: teamName("white") },
                    { value: "green" as TeamColor, label: teamName("green") },
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
                      <TeamColorIndicator teamColor={value} compact />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {/* Position */}
              {onChangePosition && (
                <div className="flex items-center gap-1 pt-1 border-t border-white/10 flex-wrap">
                  <span className="text-white/40 text-[10px] w-6">Pos:</span>
                  {ALL_POSITIONS.map((pos) => (
                    <button
                      title={positionName(pos)}
                      key={pos}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangePosition(pos);
                      }}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                        player.position === pos
                          ? `${getPositionBadgeColor(pos, fc.badgeBg)} ring-1 ring-white/30`
                          : "bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 hover:text-white/50"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                  {/* Alternativ position (hybridspelare) – går före historiken i brickan och för Auto */}
                  <AltPositionRow player={player} badgeBg={fc.badgeBg} />
                  <span className="flex items-center gap-1 ml-1 pl-1.5 border-l border-white/10">
                    <span className="text-white/40 text-[10px]">Spelat:</span>
                    <PositionShare stats={player.positionStats} />
                  </span>
                </div>
              )}
              {/* Number + Captain role */}
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
              {/* Registered + Sync to laget.se */}
              <div className="flex items-center gap-3 flex-wrap">
                {(onChangeRegistered || onSyncToLaget) && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40 text-[10px]">Anmälan:</span>
                    <AttendanceButtons player={player} onSync={onSyncToLaget} onLocal={onChangeRegistered} />
                  </div>
                )}
                {onChangeGamesPlayed && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40 text-[10px]">Matcher:</span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={player.gamesPlayed ?? 0}
                      onChange={(e) => {
                        const v = Math.max(0, parseInt(e.target.value) || 0);
                        onChangeGamesPlayed(v);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" || e.key === "Escape") setShowEditPanel(false);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-14 bg-white/10 border border-emerald-400/40 rounded px-2 py-1 text-xs text-white text-center outline-none focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>
              <PlayerStatsSection player={player} />
              {/* Åtgärder: ta bort (med bekräftelse), ta ur uppställningen (direkt), stäng */}
              <div className="pt-1.5 border-t border-white/10">
                {!confirmDelete ? (
                  <div className="flex gap-1">
                    {onDelete && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-semibold text-white bg-red-600/70 hover:bg-red-600 border border-red-400/50 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> Ta bort
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onRemove(); setShowEditPanel(false); }}
                        className="flex-1 py-1.5 rounded text-[11px] font-semibold text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 transition-all"
                        title="Tillbaka till truppen"
                      >
                        Ta ur uppställningen
                      </button>
                    )}
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setShowEditPanel(false); }}
                      className="flex-1 py-1.5 rounded text-[11px] font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/15 transition-all"
                    >
                      Stäng
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] text-red-300 text-center font-medium">
                      Ta bort {player.name} ur truppen? Det går inte att ångra.
                    </p>
                    <div className="flex gap-1">
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onDelete?.(); setShowEditPanel(false); setConfirmDelete(false); }}
                        className="flex-1 py-1.5 rounded text-xs font-bold text-white bg-red-600 border border-red-400/60 hover:bg-red-500 transition-all"
                      >
                        Ja, ta bort
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                        className="flex-1 py-1.5 rounded text-xs font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PortalDropdown>
      )}


    </div>
  );
}

// Team color indicator — rounded-rect matching pos-badge-sm size
/**
 * PIR-trend som ikon. Nivåer (senaste matcherna jämfört med totalen):
 * ↑ stigande (> +20), ↗ svagt stigande (+8…+20), → stabil, ↘ svagt fallande, ↓ fallande (< −20).
 * ? = för lite data (färre än 3 matcher).
 */
/**
 * Anmälan – samma tre knappar överallt. Med laget.se-koppling uppdateras
 * laget.se (och appen när det lyckats), annars bara appen.
 */
export function AttendanceButtons({ player, onSync, onLocal, size = "sm" }: {
  player: Player;
  onSync?: (status: "Attending" | "NotAttending" | "NotAnswered") => Promise<void>;
  onLocal?: (isRegistered: boolean) => void;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const current = player.isRegistered ? "Attending" : player.isDeclined ? "NotAttending" : "NotAnswered";
  const choose = (status: "Attending" | "NotAttending" | "NotAnswered") => {
    if (onSync) {
      setBusy(true);
      onSync(status).finally(() => setBusy(false));
    } else if (onLocal) {
      onLocal(status === "Attending");
    }
  };
  const btn = size === "md" ? "text-[11px] px-3 py-1.5" : "text-[9px] px-2 py-1";
  const opts: Array<{ status: "Attending" | "NotAttending" | "NotAnswered"; label: string; on: string }> = [
    { status: "Attending", label: "Kommer", on: "bg-emerald-400/25 text-emerald-300 border-emerald-400/50" },
    { status: "NotAttending", label: "Kommer inte", on: "bg-red-400/25 text-red-300 border-red-400/50" },
    { status: "NotAnswered", label: "Ej svarat", on: "bg-white/15 text-white/70 border-white/30" },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap" onPointerDown={(e) => e.stopPropagation()}>
      {opts.filter((o) => onSync || o.status !== "NotAttending").map((o) => (
        <button
          key={o.status}
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); choose(o.status); }}
          className={`${btn} font-bold rounded border transition-all disabled:opacity-50 ${
            current === o.status ? o.on : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
      {busy && <span className="text-[9px] text-amber-300 animate-pulse">Uppdaterar laget.se…</span>}
      {!onSync && <span className="text-[9px] text-white/30">(bara i appen)</span>}
    </div>
  );
}

const ROLES = ["MV", "B", "C", "LW", "RW"] as const;

/** Andel matcher per position (MV, B, C, LW, RW). 0 % överallt utan matcher. */
/**
 * Form de senaste matcherna som små rutor, äldst till vänster och nyast till höger.
 * Får inte alla plats klipps de äldsta bort (vänster).
 */
export function FormStrip({ form, size = "sm", className = "", placeholder = 5 }: { form?: string | null; size?: "xs" | "sm"; className?: string; placeholder?: number }) {
  const cls = size === "xs" ? "w-3.5 h-3.5 text-[8px]" : "w-4 h-4 text-[9px]";
  // Inga matcher än: streck i stället för tomt fält
  if (!form) {
    return (
      <span className={`flex items-center justify-end gap-0.5 overflow-hidden min-w-0 ${className}`} title="Inga registrerade matcher än">
        {Array.from({ length: placeholder }, (_, i) => (
          <span key={i} className={`${cls} shrink-0 rounded-[3px] leading-none flex items-center justify-center bg-white/[0.05] text-white/25`}>–</span>
        ))}
      </span>
    );
  }
  const color: Record<string, string> = {
    V: "bg-emerald-500/80 text-emerald-950",
    O: "bg-white/25 text-white/80",
    F: "bg-red-500/75 text-red-950",
  };
  const name: Record<string, string> = { V: "vinst", O: "oavgjort", F: "förlust" };
  return (
    <span
      className={`flex items-center justify-end gap-0.5 overflow-hidden min-w-0 ${className}`}
      title={`Senaste ${form.length} matcherna, nyast till höger: ${form.split("").map((c) => name[c] ?? c).join(", ")}`}
    >
      {form.split("").map((c, i) => (
        <span key={i} className={`${cls} shrink-0 rounded-[3px] font-black leading-none flex items-center justify-center ${color[c] ?? "bg-white/10"}`}>
          {c}
        </span>
      ))}
    </span>
  );
}

/** Statistik längst ner i spelarkortet: innevarande säsong och totalt. */
export function PlayerStatsSection({ player }: { player: Player }) {
  const rows: { label: string; r: PlayerRecord }[] = [];
  if (player.statsSeason) rows.push({ label: player.statsSeason.label, r: player.statsSeason });
  if (player.statsTotal) rows.push({ label: "Totalt", r: player.statsTotal });
  const cols = ["Matcher", "Mål", "Assist", "Poäng", "Vinst"];
  return (
    <div className="pt-2 border-t border-white/10 flex gap-3 items-start">
      {/* Hockeykortet är spelarens bild (sparat kort eller standardkortet) */}
      <CardThumb playerId={player.id} height={76} fallback={<PlayerPhoto playerId={player.id} editable={false} />} />
      <div className="flex-1 min-w-0">
      <p className="text-white/40 text-[10px] mb-1">Statistik</p>
      {rows.length === 0 ? (
        <p className="text-white/30 text-[10px] italic">Inga registrerade matcher ännu</p>
      ) : (
        <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
          <span />
          {cols.map((c) => <span key={c} className="text-white/35 text-right">{c}</span>)}
          {rows.map(({ label, r }) => (
            <Fragment key={label}>
              <span className="text-white/50">{label}</span>
              <span className="text-right text-white/85">{r.matches}</span>
              <span className="text-right text-white/85">{r.goals}</span>
              <span className="text-right text-white/85">{r.assists}</span>
              <span className="text-right text-white font-semibold">{r.goals + r.assists}</span>
              <span className="text-right text-white/85" title={`${r.wins} vinster, ${r.draws} oavgjorda, ${r.losses} förluster`}>
                {r.matches ? `${Math.round((r.wins / r.matches) * 100)}%` : "–"}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-white/35 text-[10px] shrink-0">Form</span>
        <FormStrip form={player.statsForm} className="justify-start" />
      </div>
      </div>
    </div>
  );
}

export function PositionShare({ stats }: { stats?: Record<string, number> | null }) {
  const counts = ROLES.map((r) => stats?.[r] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ROLES.map((r, i) => (
        <span key={r} className="flex items-center gap-0.5 text-[10px] text-white/70">
          <span className={`pos-badge pos-badge-xs pos-badge-${r.toLowerCase()}`} title={positionName(r)}>{r}</span>
          {total ? Math.round((counts[i] / total) * 100) : 0}%
        </span>
      ))}
      <span className="text-[9px] text-white/35 ml-1">{total} {total === 1 ? "match" : "matcher"}</span>
    </div>
  );
}

export function TrendIcon({ trendLabel, matchesPlayed, className = "" }: {
  trendLabel?: string | null;
  matchesPlayed?: number | null;
  className?: string;
}) {
  const base = `inline-flex items-center justify-center w-[14px] h-[18px] text-[11px] font-bold leading-none shrink-0 ${className}`;
  if ((matchesPlayed ?? 0) < 3) return <span className={`${base} text-white/30`} title="För lite matchdata (färre än 3 matcher)">?</span>;
  switch (trendLabel) {
    case "rising": return <span className={`${base} text-emerald-400`} title="Stigande form">↑</span>;
    case "slightly_rising": return <span className={`${base} text-emerald-400/70`} title="Svagt stigande form">↗</span>;
    case "slightly_falling": return <span className={`${base} text-red-400/70`} title="Svagt fallande form">↘</span>;
    case "falling": return <span className={`${base} text-red-400`} title="Fallande form">↓</span>;
    default: return <span className={`${base} text-white/40`} title="Stabil form">→</span>;
  }
}

export function TeamColorIndicator({ teamColor, compact, mostPlayedTeam }: { teamColor: TeamColor; compact?: boolean; mostPlayedTeam?: "green" | "white" }) {
  const letter = `flex items-center justify-center font-black leading-none ${compact ? "text-[9px]" : "text-[10px]"}`;
  // Match pos-badge-sm: 20×18px normal, slightly smaller in compact
  const cls = compact
    ? "w-[16px] h-[16px] rounded-[4px] shrink-0"
    : "w-[20px] h-[18px] rounded-[5px] shrink-0";

  if (teamColor === "green") {
    return <div title={`Tillhör ${teamName("green")}`} className={`${cls} ${letter} bg-emerald-400 border border-emerald-300/60 text-emerald-950`}>{teamSingular("green").charAt(0).toUpperCase()}</div>;
  }
  if (teamColor === "white") {
    return <div title={`Tillhör ${teamName("white")}`} className={`${cls} ${letter} bg-white border border-white/60 text-slate-900`}>{teamSingular("white").charAt(0).toUpperCase()}</div>;
  }

  // Waivers: alltid ett grått W. Har spelaren oftast spelat i ett lag syns det
  // som en tunn färgad kant (och i texten vid hovring) – samma symbol överallt.
  // Oftast i ett lag: W och kant i lagets färg (vit/grön), annars grått
  const tone = mostPlayedTeam === "green" ? "border-emerald-400 text-emerald-400" : mostPlayedTeam === "white" ? "border-white text-white" : "border-white/20 text-white/45";
  const hintText = mostPlayedTeam === "green" ? ` – oftast ${teamName("green")}` : mostPlayedTeam === "white" ? ` – oftast ${teamName("white")}` : "";
  return <div title={`Waivers – inget lag${hintText}`} className={`${cls} ${letter} border bg-white/5 ${tone}`}>W</div>;
}

// Drag overlay card
export function PlayerCardOverlay({ player, isRemoving = false }: { player: Player; isRemoving?: boolean }) {
  const { colors: fc } = useForwardColor();
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm cursor-grabbing select-none backdrop-blur-xl transition-all duration-200 ${
        isRemoving
          ? 'bg-red-950/90 border border-red-400/60 shadow-2xl shadow-red-500/30 ring-2 ring-red-400/50'
          : 'bg-[#0d1424]/95 border border-emerald-400/60 shadow-2xl shadow-emerald-500/20 ring-2 ring-emerald-400/40'
      }`}
      style={{ minWidth: 160, maxWidth: 240 }}
    >
      <TeamColorIndicator teamColor={player.teamColor ?? null} mostPlayedTeam={!player.teamColor ? player.mostPlayedTeam : undefined} />
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
      <span className={`pos-badge pos-badge-sm pos-badge-${player.position.toLowerCase()} shrink-0`}>
        {player.position}
      </span>
    </div>
  );
}

/** Raden "Alt. pos" i spelarkortets redigering (egen komponent – hämtar och sparar via servern). */
function AltPositionRow({ player, badgeBg }: { player: Player; badgeBg: string }) {
  const trpcUtils = trpc.useUtils();
  const setAltPosition = trpc.players.setAltPosition.useMutation({ onSuccess: () => void trpcUtils.players.altPositions.invalidate() });
  const fc = { badgeBg };
  return (

                <span className="flex items-center gap-1 ml-1 pl-1.5 border-l border-white/10" title={!player.altPosition && player.secondaryPosition ? `Enligt historiken: ${player.secondaryPosition} (${Math.round((player.secondaryShare ?? 0) * 100)} % av matcherna)` : "Hybridspelare: position spelaren också kan spela"}>
                  <span className="text-white/40 text-[10px]">Alt:</span>
                  {(["", "MV", "B", "C", "F"] as const).map((pos) => (
                    <button
                      key={pos || "none"}
                      title={pos ? positionName(pos) : "Ingen alternativ position"}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAltPosition.mutate({ playerId: player.id, position: (pos || null) as never });
                      }}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                        (player.altPosition ?? "") === pos
                          ? pos ? `${getPositionBadgeColor(pos, fc.badgeBg)} ring-1 ring-white/30` : "bg-white/15 text-white ring-1 ring-white/30"
                          : "bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 hover:text-white/50"
                      }`}
                    >
                      {pos || "–"}
                    </button>
                  ))}
                </span>
  );
}
