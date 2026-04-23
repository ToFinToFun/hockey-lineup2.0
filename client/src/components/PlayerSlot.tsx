// Hockey Lineup App – PlayerSlot – v6
// Large slot-position badge fills full row height on the left.
// Player's favorite position is shown as a small badge on the right (inside PlayerCard).
// When a goalkeeper (MV) is placed in an outfield slot, PlayerCard shows their
// most-played outfield position instead of "MV".
// Edit props forwarded to DraggablePlayerCard for inline editing.
import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard } from "./PlayerCard";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import type { Slot } from "@/lib/lineup";

interface PlayerSlotProps {
  slot: Slot;
  player: Player | null;
  onRemove: () => void;
  onChangePosition: (pos: Position) => void;
  compact?: boolean;
  /** Estimated ice time in minutes for this slot */
  iceTimeMinutes?: number;
  /** Edit props — forwarded to DraggablePlayerCard */
  onChangeName?: (name: string) => void;
  onChangeNumber?: (number: string) => void;
  onChangeTeamColor?: (color: TeamColor) => void;
  onChangeCaptainRole?: (role: CaptainRole) => void;
  onChangeRegistered?: (isRegistered: boolean) => void;
  onDelete?: () => void;
}

/* Badge color mapping using CSS classes from design system */
function getBadgeClass(role: string): string {
  switch (role) {
    case "gk":
    case "res-gk":
      return "pos-badge-mv";
    case "def":
      return "pos-badge-b";
    case "lw":
    case "rw":
      return "pos-badge-f";
    case "c":
      return "pos-badge-c";
    default:
      return "pos-badge-f";
  }
}

export function PlayerSlot({
  slot, player, onRemove, onChangePosition, compact = false, iceTimeMinutes,
  onChangeName, onChangeNumber, onChangeTeamColor, onChangeCaptainRole, onChangeRegistered, onDelete,
}: PlayerSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slot.id });

  const badgeClass = getBadgeClass(slot.role);

  const dropHighlight = isOver
    ? "ring-1 ring-emerald-400/40 bg-emerald-400/[0.06]"
    : "";

  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: "manipulation" }}
      className={`
        flex items-stretch transition-all duration-150 overflow-visible
        ${compact ? 'min-h-[40px]' : 'min-h-[34px]'}
        player-row
        ${dropHighlight}
        rounded-md
      `}
    >
      {/* Slot position badge — fills full row height, flush left with rounded left corners */}
      <span className={`slot-badge ${badgeClass} ${compact ? 'slot-badge-compact' : ''}`}>
        {slot.shortLabel}
      </span>

      {/* Player card or empty placeholder */}
      {player ? (
        <div className="flex-1 min-w-0 overflow-visible flex items-center px-1.5">
          <DraggablePlayerCard
            player={player}
            onRemove={onRemove}
            onChangePosition={onChangePosition}
            onChangeName={onChangeName}
            onChangeNumber={onChangeNumber}
            onChangeTeamColor={onChangeTeamColor}
            onChangeCaptainRole={onChangeCaptainRole}
            onChangeRegistered={onChangeRegistered}
            onDelete={onDelete}
            slotType={slot.type}
            compact
            iceTimeMinutes={iceTimeMinutes}
          />
        </div>
      ) : (
        <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} italic flex-1 text-white/20 ${isOver ? "!text-white/50" : ""} flex items-center px-2`}>
          {isOver ? "Släpp här" : ""}
        </span>
      )}
    </div>
  );
}
