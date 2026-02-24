// Hockey Lineup App – TeamPanel med logotyp-header
// VITA = vit logotyp, GRÖNA = grön logotyp

import { useMemo } from "react";
import { PlayerSlot } from "./PlayerSlot";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots } from "@/lib/lineup";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

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
}

const sectionStyles = {
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
  forward: {
    headerColor: "text-emerald-300",
    borderColor: "border-emerald-400/20",
    bgColor: "bg-emerald-950/10",
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
  const headerColor = type === "defense" ? "text-blue-400/60" : "text-emerald-400/60";
  const borderColor = type === "defense" ? "border-blue-400/15" : "border-emerald-400/15";
  const bgColor = type === "defense" ? "bg-blue-950/15" : "bg-emerald-950/15";

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
}: TeamPanelProps) {
  const logo = isWhite ? LOGO_WHITE : LOGO_GREEN;
  const accentColor = isWhite ? "text-slate-200" : "text-emerald-400";
  const borderAccent = isWhite ? "border-slate-300/20" : "border-emerald-400/20";
  const shadowColor = isWhite ? "shadow-slate-400/10" : "shadow-emerald-900/20";

  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");

  const defenseGroups = useMemo(() => groupSlots(defenseSlots), [defenseSlots]);
  const forwardGroups = useMemo(() => groupSlots(forwardSlots), [forwardSlots]);

  const defenseRows: (typeof defenseGroups)[] = [];
  for (let i = 0; i < defenseGroups.length; i += 2) {
    defenseRows.push(defenseGroups.slice(i, i + 2));
  }
  const forwardRows: (typeof forwardGroups)[] = [];
  for (let i = 0; i < forwardGroups.length; i += 2) {
    forwardRows.push(forwardGroups.slice(i, i + 2));
  }

  const filledCount = Object.keys(lineup).length;
  const totalSlots = slots.length;

  return (
    <div className={`
      flex flex-col rounded-xl border backdrop-blur-md
      bg-black/25 ${borderAccent} h-full overflow-hidden
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
          <span className="text-white/30 text-xs">{filledCount}/{totalSlots}</span>
          {filledCount > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`Rensa alla spelare från ${teamName}?`)) onClearTeam();
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded border border-red-400/30 text-red-400/70 hover:text-red-400 hover:border-red-400/60 hover:bg-red-400/10 transition-all uppercase tracking-wider"
              title="Rensa alla spelare från laget"
            >
              Rensa
            </button>
          )}
        </div>
      </div>

      {/* Scrollbar slots */}
      <div className="flex-1 overflow-y-auto overflow-x-visible min-h-0 p-2 space-y-2">

        {/* Målvakter */}
        <Section label="Målvakter" type="goalkeeper">
          <div className="space-y-1">
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

        {/* Backar – 2 par per rad */}
        <Section label="Backar" type="defense">
          <div className="space-y-1.5">
            {defenseRows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-2 gap-1.5">
                {row.map((group) => (
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
            ))}
          </div>
        </Section>

        {/* Forwards – 2 kedjor per rad */}
        <Section label="Forwards" type="forward">
          <div className="space-y-1.5">
            {forwardRows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-2 gap-1.5">
                {row.map((group) => (
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
}: {
  label: string;
  type: "goalkeeper" | "defense" | "forward";
  children: React.ReactNode;
}) {
  const s = sectionStyles[type];
  return (
    <div className={`rounded-lg border ${s.borderColor} ${s.bgColor} p-2`}>
      <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${s.headerColor}`}>
        {label}
      </div>
      {children}
    </div>
  );
}
