// Hockey Lineup App – TeamPanel med fasta slots
// Design: Industrial Ice Arena

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
  lineup: Record<string, Player>; // slotId -> Player
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

  // Dela upp slots i sektioner: målvakter, backar, forwards
  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");

  const defenseGroups = useMemo(() => groupSlots(defenseSlots), [defenseSlots]);
  const forwardGroups = useMemo(() => groupSlots(forwardSlots), [forwardSlots]);

  const filledCount = Object.keys(lineup).length;
  const totalSlots = slots.length;

  return (
    <div className={`
      flex flex-col gap-0 rounded-xl border backdrop-blur-md
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
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">

        {/* Målvakter */}
        <Section label="Målvakter" type="goalkeeper">
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
        </Section>

        {/* Backar */}
        <Section label="Backar" type="defense">
          <div className="space-y-1.5">
            {defenseGroups.map((group) => (
              <div key={group.groupLabel} className="rounded-md bg-blue-950/15 border border-blue-400/15 p-1.5">
                <div className="text-[9px] text-blue-400/60 font-bold uppercase tracking-wider mb-1 px-0.5">
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
            ))}
          </div>
        </Section>

        {/* Forwards */}
        <Section label="Forwards" type="forward">
          <div className="space-y-1.5">
            {forwardGroups.map((group) => (
              <div key={group.groupLabel} className="rounded-md bg-emerald-950/15 border border-emerald-400/15 p-1.5">
                <div className="text-[9px] text-emerald-400/60 font-bold uppercase tracking-wider mb-1 px-0.5">
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
