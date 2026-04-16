// Hockey Lineup App – TeamPanel med logotyp-header och dynamiska grupper
// VITA = vit logotyp, GRÖNA = grön logotyp

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
}

const baseSectionStyles = {
  goalkeeper: {
    headerColor: "text-amber-300",
    borderColor: "border-amber-400/20",
    bgColor: "bg-amber-950/10",
  },
  defense: {
    headerColor: "text-blue-300",
    borderColor: "border-blue-400/20",
    bgColor: "bg-blue-950/10",
  },
};

function GroupCard({
  group,
  lineup,
  onRemovePlayer,
  onChangePosition,
  type,
}: {
  group: { groupLabel: string; slots: Slot[] };
  lineup: Record<string, Player>;
  onRemovePlayer: (slotId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  type: "defense" | "forward";
}) {
  const { colors: fc } = useForwardColor();

  const headerColor = type === "defense" ? "text-blue-400/60" : fc.groupHeader;
  const borderColor = type === "defense" ? "border-blue-400/15" : fc.groupBorder;
  const bgColor = type === "defense" ? "bg-blue-950/15" : fc.groupBg;

  return (
    <div className={`rounded-md ${bgColor} border ${borderColor} p-1.5`}>
      <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 px-0.5 ${headerColor}`}>
        {group.groupLabel}
      </div>
      <div className="space-y-1">
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
          />
        ))}
      </div>
    </div>
  );
}

function AddRemoveButtons({
  count,
  max,
  min,
  onAdd,
  onRemove,
  accentClass,
}: {
  count: number;
  max: number;
  min: number;
  onAdd: () => void;
  onRemove: () => void;
  accentClass: string;
}) {
  return (
    <div className="flex items-center gap-1 ml-auto">
      {count > min && (
        <button
          onClick={onRemove}
          className={`w-5 h-5 rounded flex items-center justify-center bg-white/5 hover:bg-red-400/20 text-white/40 hover:text-red-400 transition-all border border-white/10 hover:border-red-400/30`}
          title="Ta bort"
        >
          <Minus className="w-3 h-3" />
        </button>
      )}
      {count < max && (
        <button
          onClick={onAdd}
          className={`w-5 h-5 rounded flex items-center justify-center bg-white/5 hover:bg-emerald-400/20 text-white/40 hover:text-emerald-400 transition-all border border-white/10 hover:border-emerald-400/30`}
          title="Lägg till"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function TeamPanel({
  teamId,
  teamName,
  slots,
  lineup,
  onRemovePlayer,
  onChangePosition,
  onRenameTeam,
  onClearTeam,
  isWhite = false,
  config,
  onConfigChange,
}: TeamPanelProps) {
  const logo = isWhite ? LOGO_WHITE : LOGO_GREEN;
  const accentColor = isWhite ? "text-slate-200" : "text-emerald-400";
  const borderAccent = isWhite ? "border-slate-300/20" : "border-emerald-400/20";
  const shadowColor = isWhite ? "shadow-slate-400/10" : "shadow-emerald-900/20";

  const { colors: fc } = useForwardColor();

  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");

  const defenseGroups = useMemo(() => groupSlots(defenseSlots), [defenseSlots]);
  const forwardGroups = useMemo(() => groupSlots(forwardSlots), [forwardSlots]);

  // Alla grupper renderas vertikalt (under varandra)

  const filledCount = Object.keys(lineup).length;
  const totalSlots = slots.length;
  const registeredInTeam = Object.values(lineup).filter((p) => p.isRegistered).length;

  // Dynamic forward section styles
  const sectionStyles = {
    ...baseSectionStyles,
    forward: {
      headerColor: fc.sectionHeader,
      borderColor: fc.sectionBorder,
      bgColor: fc.sectionBg,
    },
  };

  return (
    <div className={`
      flex flex-col rounded-xl border backdrop-blur-md
      bg-black/25 ${borderAccent}
      ${shadowColor} shadow-xl
    `}>
      {/* Lagnamn-header med logotyp */}
      <div className={`flex items-center gap-2.5 px-3 py-2 border-b ${borderAccent} shrink-0`}>
        <img
          src={logo}
          alt={teamName}
          className="w-10 h-10 object-contain shrink-0 drop-shadow-lg"
        />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={teamName}
            onChange={(e) => onRenameTeam(e.target.value)}
            className={`bg-transparent border-none outline-none font-black text-lg w-full tracking-widest uppercase ${accentColor}`}
            style={{ fontFamily: "'Oswald', sans-serif" }}
            placeholder="Lagnamn..."
            maxLength={30}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-white/30 text-xs">{registeredInTeam} anmälda av {filledCount} i laget</span>
          {filledCount > 0 && (
            <button
              onClick={() => {
                onClearTeam();
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded border border-red-400/30 text-red-400/70 hover:text-red-400 hover:border-red-400/60 hover:bg-red-400/10 transition-all uppercase tracking-wider"
              title="Rensa alla spelare från laget"
            >
              Rensa
            </button>
          )}
        </div>
      </div>

      {/* Slots – scrollar med sidan (ingen intern scrollbar) */}
      <div className="p-2 space-y-2">

        {/* Målvakter */}
        <Section
          label="Målvakter"
          type="goalkeeper"
          sectionStyles={sectionStyles}
          extra={
            <AddRemoveButtons
              count={config.goalkeepers}
              max={MAX_TEAM_CONFIG.goalkeepers}
              min={1}
              onAdd={() => onConfigChange({ ...config, goalkeepers: config.goalkeepers + 1 })}
              onRemove={() => onConfigChange({ ...config, goalkeepers: config.goalkeepers - 1 })}
              accentClass="amber"
            />
          }
        >
          <div className="space-y-1.5">
            {goalkeeperSlots.map((slot) => (
              <PlayerSlot
                key={slot.id}
                slot={slot}
                player={lineup[slot.id] ?? null}
                onRemove={() => onRemovePlayer(slot.id)}
                onChangePosition={(pos) => {
                  const p = lineup[slot.id];
                  if (p) onChangePosition(p.id, pos);
                }}
              />
            ))}
          </div>
        </Section>

        {/* Backar */}
        <Section
          label="Backar"
          type="defense"
          sectionStyles={sectionStyles}
          extra={
            <AddRemoveButtons
              count={config.defensePairs}
              max={MAX_TEAM_CONFIG.defensePairs}
              min={1}
              onAdd={() => onConfigChange({ ...config, defensePairs: config.defensePairs + 1 })}
              onRemove={() => onConfigChange({ ...config, defensePairs: config.defensePairs - 1 })}
              accentClass="blue"
            />
          }
        >
          <div className="space-y-1.5">
            {defenseGroups.map((group) => (
              <GroupCard
                key={group.groupLabel}
                group={group}
                lineup={lineup}
                onRemovePlayer={onRemovePlayer}
                onChangePosition={onChangePosition}
                type="defense"
              />
            ))}
          </div>
        </Section>

        {/* Forwards */}
        <Section
          label="Forwards"
          type="forward"
          sectionStyles={sectionStyles}
          extra={
            <AddRemoveButtons
              count={config.forwardLines}
              max={MAX_TEAM_CONFIG.forwardLines}
              min={1}
              onAdd={() => onConfigChange({ ...config, forwardLines: config.forwardLines + 1 })}
              onRemove={() => onConfigChange({ ...config, forwardLines: config.forwardLines - 1 })}
              accentClass="emerald"
            />
          }
        >
          <div className="space-y-1.5">
            {forwardGroups.map((group) => (
              <GroupCard
                key={group.groupLabel}
                group={group}
                lineup={lineup}
                onRemovePlayer={onRemovePlayer}
                onChangePosition={onChangePosition}
                type="forward"
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  label,
  type,
  children,
  extra,
  sectionStyles,
}: {
  label: string;
  type: "goalkeeper" | "defense" | "forward";
  children: React.ReactNode;
  extra?: React.ReactNode;
  sectionStyles: Record<string, { headerColor: string; borderColor: string; bgColor: string }>;
}) {
  const s = sectionStyles[type];
  return (
    <div className={`rounded-lg border ${s.borderColor} ${s.bgColor} p-2`}>
      <div className="flex items-center mb-2">
        <div className={`text-xs font-bold uppercase tracking-widest ${s.headerColor}`}>
          {label}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}
