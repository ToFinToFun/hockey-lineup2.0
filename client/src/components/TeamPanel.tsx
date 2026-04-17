// Hockey Lineup App – TeamPanel – v3 (consistent design system)
import { useMemo } from "react";
import { Plus, Minus } from "lucide-react";
import { PlayerSlot } from "./PlayerSlot";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots, MAX_TEAM_CONFIG, type TeamConfig } from "@/lib/lineup";
import { useForwardColor } from "@/hooks/useForwardColor";

const LOGO_GREEN = "/images/logo-green.png";
const LOGO_WHITE = "/images/logo-white.png";

interface TeamPanelProps {
  teamId: "team-a" | "team-b";
  teamName: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  onRemovePlayer: (slotId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  onRenameTeam: (name: string) => void;
  onClearTeam: () => void;
  isWhite?: boolean;
  config: TeamConfig;
  onConfigChange: (config: TeamConfig) => void;
  compact?: boolean;
}

/* Section header colors */
const sectionColors: Record<string, string> = {
  goalkeeper: "text-amber-400",
  defense: "text-blue-400",
};

const groupColors: Record<string, string> = {
  defense: "text-blue-400/50",
};

/* ── GroupCard ── */
function GroupCard({
  group, lineup, onRemovePlayer, onChangePosition, type, compact,
}: {
  group: { groupLabel: string; slots: Slot[] };
  lineup: Record<string, Player>;
  onRemovePlayer: (slotId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  type: "defense" | "forward";
  compact?: boolean;
}) {
  const { colors: fc } = useForwardColor();
  const labelColor = type === "defense" ? groupColors.defense : fc.groupHeader;

  return (
    <div className={compact ? "mb-1.5" : "mb-2"}>
      <div className={`${compact ? 'text-[7px]' : 'text-[9px]'} font-bold uppercase tracking-wider ${compact ? 'mb-0.5 px-0.5' : 'mb-1 px-1'} ${labelColor}`}>
        {group.groupLabel}
      </div>
      <div className={compact ? "space-y-0.5" : "space-y-1"}>
        {group.slots.map((slot) => (
          <PlayerSlot
            key={slot.id}
            slot={slot}
            player={lineup[slot.id] ?? null}
            onRemove={() => onRemovePlayer(slot.id)}
            onChangePosition={(pos) => {
              const p = lineup[slot.id];
              if (p) onChangePosition(p.id, pos);
            }}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

/* ── +/- buttons ── */
function AddRemoveButtons({
  count, max, min, onAdd, onRemove, compact,
}: {
  count: number; max: number; min: number;
  onAdd: () => void; onRemove: () => void;
  accentClass?: string; compact?: boolean;
}) {
  const sz = compact ? "w-4 h-4" : "w-5 h-5";
  const ic = compact ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <div className="flex items-center gap-1 ml-auto">
      {count > min && (
        <button onClick={onRemove} className={`${sz} rounded flex items-center justify-center bg-white/5 hover:bg-red-400/20 text-white/40 hover:text-red-400 transition-all border border-white/10 hover:border-red-400/30`} title="Ta bort">
          <Minus className={ic} />
        </button>
      )}
      {count < max && (
        <button onClick={onAdd} className={`${sz} rounded flex items-center justify-center bg-white/5 hover:bg-emerald-400/20 text-white/40 hover:text-emerald-400 transition-all border border-white/10 hover:border-emerald-400/30`} title="Lägg till">
          <Plus className={ic} />
        </button>
      )}
    </div>
  );
}

/* ── Main TeamPanel ── */
export function TeamPanel({
  teamId, teamName, slots, lineup,
  onRemovePlayer, onChangePosition, onRenameTeam, onClearTeam,
  isWhite = false, config, onConfigChange, compact = false,
}: TeamPanelProps) {
  const logo = isWhite ? LOGO_WHITE : LOGO_GREEN;
  const accentColor = isWhite ? "text-slate-200" : "text-emerald-400";
  // Subtle top border accent for team identity
  const topBorderColor = isWhite
    ? "border-t-2 border-t-slate-400/30"
    : "border-t-2 border-t-emerald-500/40";

  const { colors: fc } = useForwardColor();

  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");

  const defenseGroups = useMemo(() => groupSlots(defenseSlots), [defenseSlots]);
  const forwardGroups = useMemo(() => groupSlots(forwardSlots), [forwardSlots]);

  const filledCount = Object.keys(lineup).length;
  const registeredInTeam = Object.values(lineup).filter((p) => p.isRegistered).length;

  return (
    <div
      className={`
        flex flex-col rounded-lg
        glass-panel
        ${topBorderColor}
      `}
    >
      {/* ── Team header ── */}
      <div className={`flex items-center gap-2 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} border-b border-white/[0.06]`}>
        <img
          src={logo}
          alt={teamName}
          className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} object-contain shrink-0`}
        />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={teamName}
            onChange={(e) => onRenameTeam(e.target.value)}
            className={`bg-transparent border-none outline-none font-black ${compact ? 'text-sm' : 'text-lg'} w-full tracking-widest uppercase ${accentColor}`}
            style={{ fontFamily: "'Oswald', sans-serif" }}
            placeholder="Lagnamn..."
            maxLength={30}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-white/30 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
            {registeredInTeam} anm. av {filledCount}
          </span>
          {filledCount > 0 && !compact && (
            <button
              onClick={() => onClearTeam()}
              className="text-[9px] font-bold px-2 py-0.5 rounded border border-red-400/25 text-red-400/60 hover:text-red-400 hover:border-red-400/50 hover:bg-red-400/10 transition-all uppercase tracking-wider"
              title="Rensa alla spelare från laget"
            >
              Rensa
            </button>
          )}
          {filledCount > 0 && compact && (
            <button
              onClick={() => onClearTeam()}
              className="text-[8px] font-bold px-1 py-0.5 rounded border border-red-400/25 text-red-400/60 hover:text-red-400 transition-all"
              title="Rensa"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Slots content ── */}
      <div className={compact ? "p-1.5" : "p-2.5"}>

        {/* ── MÅLVAKTER ── */}
        <div className={compact ? "mb-2" : "mb-3"}>
          <div className={`flex items-center ${compact ? 'mb-0.5' : 'mb-1.5'}`}>
            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-black uppercase tracking-[0.15em] ${sectionColors.goalkeeper}`}>
              Målvakter
            </span>
            <AddRemoveButtons
              count={config.goalkeepers} max={MAX_TEAM_CONFIG.goalkeepers} min={1}
              onAdd={() => onConfigChange({ ...config, goalkeepers: config.goalkeepers + 1 })}
              onRemove={() => onConfigChange({ ...config, goalkeepers: config.goalkeepers - 1 })}
              compact={compact}
            />
          </div>
          <div className={compact ? "space-y-0.5" : "space-y-1"}>
            {goalkeeperSlots.map((slot) => (
              <PlayerSlot
                key={slot.id} slot={slot} player={lineup[slot.id] ?? null}
                onRemove={() => onRemovePlayer(slot.id)}
                onChangePosition={(pos) => { const p = lineup[slot.id]; if (p) onChangePosition(p.id, pos); }}
                compact={compact}
              />
            ))}
          </div>
        </div>

        {/* ── Separator ── */}
        <div className={`border-t border-white/[0.04] ${compact ? 'mb-2' : 'mb-3'}`} />

        {/* ── BACKAR ── */}
        <div className={compact ? "mb-2" : "mb-3"}>
          <div className={`flex items-center ${compact ? 'mb-0.5' : 'mb-1.5'}`}>
            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-black uppercase tracking-[0.15em] ${sectionColors.defense}`}>
              Backar
            </span>
            <AddRemoveButtons
              count={config.defensePairs} max={MAX_TEAM_CONFIG.defensePairs} min={1}
              onAdd={() => onConfigChange({ ...config, defensePairs: config.defensePairs + 1 })}
              onRemove={() => onConfigChange({ ...config, defensePairs: config.defensePairs - 1 })}
              compact={compact}
            />
          </div>
          {defenseGroups.map((group) => (
            <GroupCard key={group.groupLabel} group={group} lineup={lineup}
              onRemovePlayer={onRemovePlayer} onChangePosition={onChangePosition}
              type="defense" compact={compact}
            />
          ))}
        </div>

        {/* ── Separator ── */}
        <div className={`border-t border-white/[0.04] ${compact ? 'mb-2' : 'mb-3'}`} />

        {/* ── FORWARDS ── */}
        <div>
          <div className={`flex items-center ${compact ? 'mb-0.5' : 'mb-1.5'}`}>
            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-black uppercase tracking-[0.15em] ${fc.sectionHeader}`}>
              Forwards
            </span>
            <AddRemoveButtons
              count={config.forwardLines} max={MAX_TEAM_CONFIG.forwardLines} min={1}
              onAdd={() => onConfigChange({ ...config, forwardLines: config.forwardLines + 1 })}
              onRemove={() => onConfigChange({ ...config, forwardLines: config.forwardLines - 1 })}
              compact={compact}
            />
          </div>
          {forwardGroups.map((group) => (
            <GroupCard key={group.groupLabel} group={group} lineup={lineup}
              onRemovePlayer={onRemovePlayer} onChangePosition={onChangePosition}
              type="forward" compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
