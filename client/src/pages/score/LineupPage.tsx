/*
 * LineupPage - Team lineup display
 * Design: Dark theme with team panels showing goalkeepers, defense, and forwards
 * Mirrors the native app's Lineup tab
 * Spacing is tightened to maximize player name display on mobile
 */

import { useMemo } from "react";
import { IMAGES } from "@/lib/scoreConstants";
import { RefreshCw, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import PullToRefresh from "@/components/score/PullToRefresh";
import { type AppState, type Slot, createTeamSlots, groupSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import { type Player } from "@/lib/players";

interface LineupPageProps {
  lineupState: AppState | null;
  loading: boolean;
  lastSyncTime: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

// Position badge colors matching the native app
function getPositionColors(shortLabel: string) {
  switch (shortLabel) {
    case "MV":
    case "RES":
      return { bg: "#92400e20", text: "#fbbf24", border: "#fbbf2440" };
    case "B":
      return { bg: "#1e3a5f20", text: "#60a5fa", border: "#60a5fa40" };
    case "C":
      return { bg: "#581c8720", text: "#c084fc", border: "#c084fc40" };
    case "LW":
    case "RW":
      return { bg: "#064e3b20", text: "#34d399", border: "#34d39940" };
    default:
      return { bg: "#ffffff10", text: "#ffffff80", border: "#ffffff20" };
  }
}

// ─── Slot Row ────────────────────────────────────────────────────────────────

function SlotRow({ player, label, shortLabel }: { player: Player | undefined; label: string; shortLabel: string }) {
  const posColors = getPositionColors(shortLabel);

  if (!player) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border-l-2"
        style={{ borderLeftColor: "#ffffff15", backgroundColor: "#ffffff08" }}>
        <div className="shrink-0 w-7 h-[18px] rounded flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: "#ffffff10", color: "#ffffff30" }}>—</div>
        <span className="text-[11px] text-[#ffffff40]">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border-l-2"
      style={{ borderLeftColor: posColors.border, backgroundColor: posColors.bg }}>
      <div className="shrink-0 w-7 h-[18px] rounded flex items-center justify-center text-[9px] font-bold"
        style={{ backgroundColor: posColors.border, color: posColors.text }}>
        {shortLabel}
      </div>
      {player.captainRole && (
        <span className="shrink-0 text-[9px] font-bold"
          style={{ color: player.captainRole === "C" ? "#fde047" : "#7dd3fc" }}>
          {player.captainRole}
        </span>
      )}
      <span className="text-[11px] text-[#ECEDEE] truncate min-w-0">{player.name}</span>
      {player.number && (
        <span className="shrink-0 text-[10px] text-[#9BA1A6]">#{player.number}</span>
      )}
    </div>
  );
}

// ─── Team Section ────────────────────────────────────────────────────────────

function TeamSection({ slots, lineup, title, headerColor }: {
  slots: Slot[];
  lineup: Record<string, Player>;
  title: string;
  headerColor: string;
}) {
  const groups = groupSlots(slots);
  return (
    <div className="mb-2">
      <h4 className="text-[9px] font-bold tracking-wider mb-1 px-0.5" style={{ color: headerColor }}>
        {title}
      </h4>
      {groups.map(({ groupLabel, slots: groupSlotList }) => {
        const filledSlots = groupSlotList.filter(s => lineup[s.id]);
        if (filledSlots.length === 0) return null;
        return (
          <div key={groupLabel} className="mb-1.5">
            <span className="text-[8px] text-[#ffffff50] uppercase tracking-wider px-0.5">{groupLabel}</span>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {filledSlots.map(slot => (
                <SlotRow key={slot.id} player={lineup[slot.id]} label={slot.label} shortLabel={slot.shortLabel} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Team Panel ──────────────────────────────────────────────────────────────

function TeamPanel({ teamName, slots, lineup, isWhite }: {
  teamName: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  isWhite: boolean;
}) {
  const gkSlots = slots.filter(s => s.type === "goalkeeper");
  const defSlots = slots.filter(s => s.type === "defense");
  const fwdSlots = slots.filter(s => s.type === "forward");
  const placedCount = slots.filter(s => lineup[s.id]).length;
  const logo = isWhite ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo;
  const accentColor = isWhite ? "#e2e8f0" : "#34d399";
  const borderColor = isWhite ? "#e2e8f030" : "#34d39930";

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor }}>
      {/* Team header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b" style={{ borderBottomColor: borderColor }}>
        <img src={logo} alt={teamName} className="w-8 h-8 object-contain shrink-0" />
        <div className="min-w-0">
          <h3 className="text-xs font-bold" style={{ color: accentColor }}>{teamName}</h3>
          <span className="text-[9px] text-[#9BA1A6]">{placedCount} spelare</span>
        </div>
      </div>

      {/* Sections */}
      <div className="p-2">
        <TeamSection slots={gkSlots} lineup={lineup} title="MÅLVAKTER" headerColor="#fbbf24" />
        <TeamSection slots={defSlots} lineup={lineup} title="BACKAR" headerColor="#60a5fa" />
        <TeamSection slots={fwdSlots} lineup={lineup} title="FORWARDS" headerColor="#34d399" />
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function formatSyncTime(date: Date | null): string {
  if (!date) return "Aldrig synkad";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "Just nu";
  if (diffSec < 60) return `${diffSec}s sedan`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min sedan`;
  return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function generateLineupText(
  lineupState: AppState,
  teamASlots: Slot[],
  teamBSlots: Slot[],
  teamALineup: Record<string, Player>,
  teamBLineup: Record<string, Player>
): string {
  const formatTeam = (
    teamName: string,
    slots: Slot[],
    lineup: Record<string, Player>
  ): string => {
    const lines: string[] = [];
    lines.push(teamName.toUpperCase());
    lines.push("");

    const sections: Slot["type"][] = ["goalkeeper", "defense", "forward"];

    for (const sectionType of sections) {
      const sectionSlots = slots.filter((s) => s.type === sectionType);
      const filled = sectionSlots.filter((s) => lineup[s.id]);
      if (filled.length === 0) continue;

      const groups = groupSlots(sectionSlots);
      let isFirstGroup = true;
      for (const group of groups) {
        const filledInGroup = group.slots.filter((s) => lineup[s.id]);
        if (filledInGroup.length === 0) continue;

        if (!isFirstGroup) {
          lines.push("");
        }

        for (const slot of filledInGroup) {
          const p = lineup[slot.id];
          if (!p) continue;
          const pos = slot.shortLabel.padEnd(3);
          const captain = p.captainRole ? ` (${p.captainRole})` : "";
          const num = p.number ? ` #${p.number}` : "";
          lines.push(`${pos}  ${p.name}${num}${captain}`);
        }
        isFirstGroup = false;
      }

      lines.push("");
    }

    return lines.join("\n");
  };

  const teamA = formatTeam(
    lineupState.teamAName,
    teamASlots,
    teamALineup
  );
  const teamB = formatTeam(
    lineupState.teamBName,
    teamBSlots,
    teamBLineup
  );

  return [teamA, teamB].join("\n");
}

export default function LineupPage({ lineupState, loading, lastSyncTime, refreshing, onRefresh }: LineupPageProps) {
  const teamASlots = useMemo(() =>
    createTeamSlots("team-a", lineupState?.teamAConfig ?? MAX_TEAM_CONFIG),
    [lineupState?.teamAConfig]
  );
  const teamBSlots = useMemo(() =>
    createTeamSlots("team-b", lineupState?.teamBConfig ?? MAX_TEAM_CONFIG),
    [lineupState?.teamBConfig]
  );

  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  if (lineupState?.lineup) {
    for (const [slotId, player] of Object.entries(lineupState.lineup)) {
      if (slotId.startsWith("team-a-")) teamALineup[slotId] = player;
      else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player;
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 border-2 border-[#0a7ea4] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#9BA1A6]">Laddar laguppställning...</span>
      </div>
    );
  }

  if (!lineupState) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6">
        <span className="text-base font-semibold text-[#EF4444] text-center">Kunde inte ladda laguppställningen</span>
        <span className="text-xs text-[#9BA1A6] text-center">Kontrollera din internetanslutning och försök igen.</span>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={onRefresh} refreshing={refreshing} className="h-full bg-[#1a1a1a]">
      <div className="px-2 py-3">
        {/* Header with refresh */}
        <div className="mb-3 px-1 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-[#ECEDEE]">Laguppställning</h2>
            <p className="text-[10px] text-[#9BA1A6]">
              Senast synkad: {formatSyncTime(lastSyncTime)}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const text = generateLineupText(lineupState, teamASlots, teamBSlots, teamALineup, teamBLineup);
                navigator.clipboard.writeText(text).then(() => {
                  toast.success("Kopierad till urklipp!", { description: "Klistra in i valfri chatt" });
                }).catch(() => {
                  toast.error("Kunde inte kopiera");
                });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 text-[#8b5cf6] hover:bg-[#8b5cf6]/25 transition-colors text-[10px] font-medium"
            >
              <Copy size={12} />
              Kopiera
            </button>
            <button
              onClick={() => {
                const text = generateLineupText(lineupState, teamASlots, teamBSlots, teamALineup, teamBLineup);
                const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                const now = new Date();
                const dateStr = now.toLocaleDateString("sv-SE").replace(/\//g, "-");
                const teamA = lineupState.teamAName.toLowerCase().replace(/[^a-zåäö0-9]/gi, "");
                const teamB = lineupState.teamBName.toLowerCase().replace(/[^a-zåäö0-9]/gi, "");
                a.href = url;
                a.download = `${teamA}-vs-${teamB}-${dateStr}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Laguppställning exporterad!", { description: "Textfil sparad" });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors text-[10px] font-medium"
            >
              <Download size={12} />
              Exportera
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0a7ea4]/15 border border-[#0a7ea4]/30 text-[#0a7ea4] hover:bg-[#0a7ea4]/25 transition-colors disabled:opacity-50 text-[10px] font-medium"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Uppdatera
            </button>
          </div>
        </div>

        {/* Teams side by side */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <TeamPanel
              teamName={lineupState.teamAName}
              slots={teamASlots}
              lineup={teamALineup}
              isWhite={true}
            />
          </div>
          <div className="flex-1 min-w-0">
            <TeamPanel
              teamName={lineupState.teamBName}
              slots={teamBSlots}
              lineup={teamBLineup}
              isWhite={false}
            />
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[9px] text-[#9BA1A6] mt-3 mb-1">
          Stålstadens Score Tracker · A-lag Herrar
        </p>
      </div>
    </PullToRefresh>
  );
}
