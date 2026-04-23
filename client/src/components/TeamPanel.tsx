// Hockey Lineup App – TeamPanel – v4 (section alignment with spacers)
import { useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { PlayerSlot } from "./PlayerSlot";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots, MAX_TEAM_CONFIG, type TeamConfig } from "@/lib/lineup";
import { useForwardColor } from "@/hooks/useForwardColor";
import { usePirSettings } from "@/hooks/usePirEnabled";
import { calculateSlotIceTimes, generateIceTimeSummary } from "@/lib/iceTimePerSlot";

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
  /** The other team's config — used to calculate spacers for section alignment */
  otherConfig?: TeamConfig;
  /** Match duration in minutes for ice time calculation (default 60) */
  matchTime?: number;
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
  group, lineup, onRemovePlayer, onChangePosition, type, compact, iceTimeMap,
}: {
  group: { groupLabel: string; slots: Slot[] };
  lineup: Record<string, Player>;
  onRemovePlayer: (slotId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  type: "defense" | "forward";
  compact?: boolean;
  iceTimeMap?: Map<string, number>;
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
            iceTimeMinutes={iceTimeMap?.get(slot.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Spacer that mimics a defense pair (2 slots) or forward line (3 slots) ── */
function SectionSpacer({ slotCount, compact, hasGroupLabel = true }: { slotCount: number; compact?: boolean; hasGroupLabel?: boolean }) {
  // Render invisible real slots so height matches exactly regardless of content wrapping
  return (
    <div className={compact ? 'mb-1.5' : 'mb-2'} aria-hidden>
      {hasGroupLabel && (
        <div className={`${compact ? 'text-[7px] mb-0.5 px-0.5' : 'text-[9px] mb-1 px-1'} font-bold uppercase tracking-wider invisible`}>
          &nbsp;
        </div>
      )}
      <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
        {Array.from({ length: slotCount }).map((_, i) => (
          <div
            key={i}
            className={`flex items-stretch ${compact ? 'min-h-[40px]' : 'min-h-[34px]'} player-row rounded-md invisible`}
          >
            <span className={`slot-badge ${compact ? 'slot-badge-compact' : ''}`}>&nbsp;</span>
            <span className="flex-1" />
          </div>
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

/* ── Confirm remove dialog ── */
function ConfirmRemoveDialog({
  open, onConfirm, onCancel, message,
}: {
  open: boolean; onConfirm: () => void; onCancel: () => void; message: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="glass-panel-strong mx-4 p-4 rounded-xl max-w-xs w-full shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-white/80 mb-3 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-all"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/20 border border-red-400/30 text-red-300 hover:bg-red-500/30 transition-all"
          >
            Ta bort
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main TeamPanel ── */
export function TeamPanel({
  teamId, teamName, slots, lineup,
  onRemovePlayer, onChangePosition, onRenameTeam, onClearTeam,
  isWhite = false, config, onConfigChange, compact = false,
  otherConfig,
  matchTime = 60,
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

  // Calculate ice time per slot
  const iceTimeMap = useMemo(
    () => calculateSlotIceTimes(slots, lineup, config, matchTime),
    [slots, lineup, config, matchTime],
  );

  // Ice time rotation summary text
  const iceTimeSummary = useMemo(
    () => generateIceTimeSummary(slots, lineup, config, matchTime),
    [slots, lineup, config, matchTime],
  );

  const filledCount = Object.keys(lineup).length;
  const registeredInTeam = Object.values(lineup).filter((p) => p.isRegistered).length;

  // PIR team strength
  const pirSettings = usePirSettings();
  const teamPirData = useMemo(() => {
    const players = Object.values(lineup).filter(p => p.pir != null && (p.pirMatchesPlayed ?? 0) >= 3);
    if (players.length === 0) return null;
    const sum = players.reduce((s, p) => s + (p.pir ?? 0), 0);
    const avg = Math.round(sum / players.length);
    return { sum: Math.round(sum), avg, count: players.length };
  }, [lineup]);

  // Calculate spacers needed for alignment with the other team
  const defenseSpacers = useMemo(() => {
    if (!otherConfig) return 0;
    const diff = otherConfig.defensePairs - config.defensePairs;
    return diff > 0 ? diff : 0;
  }, [config.defensePairs, otherConfig]);

  const forwardSpacers = useMemo(() => {
    if (!otherConfig) return 0;
    const diff = otherConfig.forwardLines - config.forwardLines;
    return diff > 0 ? diff : 0;
  }, [config.forwardLines, otherConfig]);

  const goalkeeperSpacers = useMemo(() => {
    if (!otherConfig) return 0;
    const diff = otherConfig.goalkeepers - config.goalkeepers;
    return diff > 0 ? diff : 0;
  }, [config.goalkeepers, otherConfig]);

  // Confirm dialog for removing occupied pairs/lines
  const [confirmRemove, setConfirmRemove] = useState<{ type: 'defense' | 'forward' | 'goalkeeper'; message: string } | null>(null);

  const handleRemoveDefensePair = () => {
    // Check if the last defense pair has players
    const lastPair = config.defensePairs;
    const lastPairSlots = [`${teamId}-def-${lastPair}-1`, `${teamId}-def-${lastPair}-2`];
    const hasPlayers = lastPairSlots.some(id => lineup[id]);
    const playerNames = lastPairSlots.map(id => lineup[id]?.name).filter(Boolean);
    if (hasPlayers) {
      setConfirmRemove({
        type: 'defense',
        message: `Backpar ${lastPair} har spelare (${playerNames.join(', ')}). Vill du ta bort paret? Spelarna flyttas tillbaka till truppen.`,
      });
    } else {
      onConfigChange({ ...config, defensePairs: config.defensePairs - 1 });
    }
  };

  const handleRemoveForwardLine = () => {
    // Check if the last forward line has players
    const lastLine = config.forwardLines;
    const lastLineSlots = [`${teamId}-fwd-${lastLine}-lw`, `${teamId}-fwd-${lastLine}-c`, `${teamId}-fwd-${lastLine}-rw`];
    const hasPlayers = lastLineSlots.some(id => lineup[id]);
    const playerNames = lastLineSlots.map(id => lineup[id]?.name).filter(Boolean);
    if (hasPlayers) {
      setConfirmRemove({
        type: 'forward',
        message: `${lastLine}:a kedjan har spelare (${playerNames.join(', ')}). Vill du ta bort kedjan? Spelarna flyttas tillbaka till truppen.`,
      });
    } else {
      onConfigChange({ ...config, forwardLines: config.forwardLines - 1 });
    }
  };

  const handleRemoveGoalkeeper = () => {
    const gk2Slot = `${teamId}-gk-2`;
    const hasPlayer = !!lineup[gk2Slot];
    if (hasPlayer) {
      setConfirmRemove({
        type: 'goalkeeper',
        message: `Reservmålvaktsplatsen har ${lineup[gk2Slot]?.name}. Vill du ta bort platsen? Spelaren flyttas tillbaka till truppen.`,
      });
    } else {
      onConfigChange({ ...config, goalkeepers: config.goalkeepers - 1 });
    }
  };

  const handleConfirmRemove = () => {
    if (!confirmRemove) return;
    if (confirmRemove.type === 'defense') {
      onConfigChange({ ...config, defensePairs: config.defensePairs - 1 });
    } else if (confirmRemove.type === 'forward') {
      onConfigChange({ ...config, forwardLines: config.forwardLines - 1 });
    } else if (confirmRemove.type === 'goalkeeper') {
      onConfigChange({ ...config, goalkeepers: config.goalkeepers - 1 });
    }
    setConfirmRemove(null);
  };

  return (
    <>
    <ConfirmRemoveDialog
      open={!!confirmRemove}
      message={confirmRemove?.message ?? ''}
      onConfirm={handleConfirmRemove}
      onCancel={() => setConfirmRemove(null)}
    />
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
          {!compact && (
            <span
              className="text-white/40 font-bold text-xs"
              title="Antal spelare i laguppställningen"
            >
              {filledCount}
            </span>
          )}
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

      {/* ── Team PIR strength bar ── */}
      {pirSettings.enabled && pirSettings.showTeamStrength && teamPirData && (
        <div className="flex items-center justify-center gap-2 px-2 py-1 border-b border-white/[0.04] text-[9px] text-white/30">
          <span title="Total PIR-summa">\u03A3 {teamPirData.sum}</span>
          <span className="text-white/10">|</span>
          <span title="Genomsnittlig PIR">ø {teamPirData.avg}</span>
          <span className="text-white/10">|</span>
          <span title="Antal spelare med PIR-data">{teamPirData.count} spelare</span>
        </div>
      )}

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
              onRemove={handleRemoveGoalkeeper}
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
                iceTimeMinutes={iceTimeMap.get(slot.id)}
              />
            ))}
          </div>
          {/* Goalkeeper spacers — no group label, just bare slots */}
          {goalkeeperSpacers > 0 && (
            <div className={compact ? "mt-0.5" : "mt-1"}>
              {Array.from({ length: goalkeeperSpacers }).map((_, i) => (
                <SectionSpacer key={`gk-spacer-${i}`} slotCount={1} compact={compact} hasGroupLabel={false} />
              ))}
            </div>
          )}
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
              onRemove={handleRemoveDefensePair}
              compact={compact}
            />
          </div>
          {defenseGroups.map((group) => (
            <GroupCard key={group.groupLabel} group={group} lineup={lineup}
              onRemovePlayer={onRemovePlayer} onChangePosition={onChangePosition}
              type="defense" compact={compact} iceTimeMap={iceTimeMap}
            />
          ))}
          {/* Defense spacers for alignment */}
          {defenseSpacers > 0 && (
            <div>
              {Array.from({ length: defenseSpacers }).map((_, i) => (
                <SectionSpacer key={`def-spacer-${i}`} slotCount={2} compact={compact} />
              ))}
            </div>
          )}
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
              onRemove={handleRemoveForwardLine}
              compact={compact}
            />
          </div>
          {forwardGroups.map((group) => (
            <GroupCard key={group.groupLabel} group={group} lineup={lineup}
              onRemovePlayer={onRemovePlayer} onChangePosition={onChangePosition}
              type="forward" compact={compact} iceTimeMap={iceTimeMap}
            />
          ))}
          {/* Forward spacers for alignment */}
          {forwardSpacers > 0 && (
            <div>
              {Array.from({ length: forwardSpacers }).map((_, i) => (
                <SectionSpacer key={`fwd-spacer-${i}`} slotCount={3} compact={compact} />
              ))}
            </div>
          )}
        </div>

        {/* ── Ice time rotation summary ── */}
        {iceTimeSummary && (
          <div className={`border-t border-white/[0.04] ${compact ? 'mt-1.5 pt-1.5 px-0.5' : 'mt-2 pt-2 px-1'}`}>
            <p className={`${compact ? 'text-[7px]' : 'text-[9px]'} italic text-white/25 leading-relaxed`}>
              {iceTimeSummary}
            </p>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
