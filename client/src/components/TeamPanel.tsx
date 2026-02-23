// Hockey Lineup App – TeamPanel
// Design: Industrial Ice Arena – glassmorfism lag-panel

import { DropZone } from "./DropZone";
import type { Player, Position } from "@/lib/players";
import { Shield } from "lucide-react";

interface TeamLineup {
  goalkeepers: Player[];
  defense: Player[];
  forwards: Player[];
}

interface TeamPanelProps {
  teamId: "team-a" | "team-b";
  teamName: string;
  lineup: TeamLineup;
  onRemovePlayer: (playerId: string, zone: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  onRenameTeam: (name: string) => void;
}

export function TeamPanel({
  teamId,
  teamName,
  lineup,
  onRemovePlayer,
  onChangePosition,
  onRenameTeam,
}: TeamPanelProps) {
  const isTeamA = teamId === "team-a";

  return (
    <div className={`
      flex flex-col gap-2 rounded-xl border backdrop-blur-md
      bg-black/25 border-white/15 p-3 h-full
      ${isTeamA ? "shadow-emerald-900/20" : "shadow-blue-900/20"} shadow-xl
    `}>
      {/* Lagnamn */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
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
      </div>

      {/* Formationszoner */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
        <DropZone
          id={`${teamId}-goalkeeper`}
          label="Målvakter"
          players={lineup.goalkeepers}
          maxPlayers={2}
          onRemovePlayer={(id) => onRemovePlayer(id, `${teamId}-goalkeeper`)}
          onChangePosition={onChangePosition}
          zoneType="goalkeeper"
        />
        <DropZone
          id={`${teamId}-defense`}
          label="Backar"
          players={lineup.defense}
          maxPlayers={8}
          onRemovePlayer={(id) => onRemovePlayer(id, `${teamId}-defense`)}
          onChangePosition={onChangePosition}
          zoneType="defense"
        />
        <DropZone
          id={`${teamId}-forward`}
          label="Forwards"
          players={lineup.forwards}
          maxPlayers={12}
          onRemovePlayer={(id) => onRemovePlayer(id, `${teamId}-forward`)}
          onChangePosition={onChangePosition}
          zoneType="forward"
        />
      </div>

      {/* Summering */}
      <div className="pt-2 border-t border-white/10 flex justify-between text-xs text-white/40">
        <span>Totalt: {lineup.goalkeepers.length + lineup.defense.length + lineup.forwards.length} spelare</span>
        <span className={isTeamA ? "text-emerald-400/60" : "text-blue-400/60"}>
          MV:{lineup.goalkeepers.length} B:{lineup.defense.length} F:{lineup.forwards.length}
        </span>
      </div>
    </div>
  );
}
