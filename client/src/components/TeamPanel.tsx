// Hockey Lineup App – TeamPanel med fasta slots i 2-kolumns grid
// Backpar 1+2 bredvid, Backpar 3+4 under
// Kedja 1+2 bredvid, Kedja 3+4 under

import { useMemo } from "react";
import { PlayerSlot } from "./PlayerSlot";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots } from "@/lib/lineup";
import { Shield } from "lucide-react";

interface TeamPanelProps {
  teamId: "team-a" | "team-b";
  teamName: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  onRemovePlayer: (slotId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  onRenameTeam: (name: string) => void;
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

// En enskild grupp (backpar eller kedja) som en kompakt kolumn
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
}: TeamPanelProps) {
  const isTeamA = teamId === "team-a";

  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");

  const defenseGroups = useMemo(() => groupSlots(defenseSlots), [defenseSlots]);
  const forwardGroups = useMemo(() => groupSlots(forwardSlots), [forwardSlots]);

  // Dela i rader om 2
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
      bg-black/25 border-white/15 h-full overflow-hidden
      ${isTeamA ? "shadow-emerald-900/20" : "shadow-blue-900/20"} shadow-xl
    `}>
      {/* Lagnamn-header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
        <Shield className={`w-4 h-4 shrink-0 ${isTeamA ? "text-emerald-400" : "text-blue-400"}`} />
        <input
          type="text"
          value={teamName}
          onChange={(e) => onRenameTeam(e.target.value)}
          className="bg-transparent border-none outline-none font-bold text-base text-white placeholder-white/30 w-full tracking-wide uppercase"
          style={{ fontFamily: "'Oswald', sans-serif" }}
          placeholder="Lagnamn..."
          maxLength={30}
        />
        <span className="text-white/30 text-xs shrink-0">{filledCount}/{totalSlots}</span>
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
