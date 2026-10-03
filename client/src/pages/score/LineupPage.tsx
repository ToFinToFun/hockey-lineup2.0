/*
 * LineupPage - Team lineup display
 * Design: Dark theme with team panels showing goalkeepers, defense, and forwards
 * Mirrors the native app's Lineup tab
 * Spacing is tightened to maximize player name display on mobile
 */

import { matchSides } from "@/lib/matchSides";
import { useMemo } from "react";
import { IMAGES } from "@/lib/scoreConstants";
import { RefreshCw } from "lucide-react";
import PullToRefresh from "@/components/score/PullToRefresh";
import { type AppState, type Slot, createTeamSlots, groupSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import { positionRowColors, CAPTAIN_COLORS } from "@/lib/positionColors";
import { type Player } from "@/lib/players";

/** Vad servern visar för den som inte är inloggad (se server/scoreLineupView.ts) */
export type ScoreView =
  | { mode: "staff" }
  | { mode: "published"; publishedAt: string }
  | { mode: "scheduled"; publishAt: string }
  | { mode: "live" }
  | { mode: "hidden"; showFrom: string | null };

const WD = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
/** "tis 18:30" */
export function shortWhen(iso: string): string {
  const d = new Date(iso);
  return `${WD[d.getDay()]} ${d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`;
}

interface LineupPageProps {
  lineupState: AppState | null;
  view?: ScoreView | null;
  /** Lineup står på en extern match längre fram – här visas dagens internmatch */
  laterExternal?: { name: string; date: string | null; emptyInternal: boolean } | null;
  loading: boolean;
  lastSyncTime: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

// Position badge colors matching the native app
const getPositionColors = positionRowColors;

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
          style={{ color: CAPTAIN_COLORS[player.captainRole as "C" | "A"] }}>
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

function TeamPanel({ teamName, slots, lineup, isWhite, logoOverride, colorOverride }: {
  /** Mot motståndare: lagets egen logga/färg (null = ingen logga) */
  logoOverride?: string | null;
  colorOverride?: string;
  teamName: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  isWhite: boolean;
}) {
  const gkSlots = slots.filter(s => s.type === "goalkeeper");
  const defSlots = slots.filter(s => s.type === "defense");
  const fwdSlots = slots.filter(s => s.type === "forward");
  const placedCount = slots.filter(s => lineup[s.id]).length;
  const logo = logoOverride !== undefined ? logoOverride : isWhite ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo;
  const accentColor = colorOverride ?? (isWhite ? "#e2e8f0" : "#34d399");
  const borderColor = `${accentColor}30`;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor }}>
      {/* Team header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b" style={{ borderBottomColor: borderColor }}>
        {logo ? <img src={logo} alt={teamName} className="w-8 h-8 object-contain shrink-0" /> : <span className="w-8 h-8 rounded-full shrink-0 border border-white/20" style={{ background: accentColor }} />}
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

export default function LineupPage({ lineupState, view, laterExternal, loading, lastSyncTime, refreshing, onRefresh }: LineupPageProps) {
  const sides = matchSides(lineupState?.setup, lineupState?.opponent, lineupState?.teamAName);
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

  // Inget lag att visa än (för den som inte är inloggad)
  if (view?.mode === "hidden" || view?.mode === "scheduled") {
    return (
      <PullToRefresh onRefresh={onRefresh} refreshing={refreshing} className="h-full bg-[#1a1a1a]">
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
          {view.mode === "scheduled" ? (
            <>
              <span className="text-base font-semibold text-[#ECEDEE]">Laget publiceras {shortWhen(view.publishAt)}</span>
              <span className="text-xs text-[#9BA1A6]">Uppställningen visas här när nyheten går ut.</span>
            </>
          ) : (
            <>
              <span className="text-base font-semibold text-[#ECEDEE]">Inget lag publicerat än</span>
              <span className="text-xs text-[#9BA1A6]">
                Uppställningen visas när laget publiceras{view.showFrom ? `, eller senast ${shortWhen(view.showFrom)} (75 min före matchstart)` : ""}.
              </span>
            </>
          )}
        </div>
      </PullToRefresh>
    );
  }

  // Inloggad: Lineup står på en extern match längre fram och dagens internmatch saknar sparad uppställning
  if (laterExternal?.emptyInternal) {
    const d = laterExternal.date ? new Date(laterExternal.date + "T12:00").toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "numeric" }) : null;
    return (
      <PullToRefresh onRefresh={onRefresh} refreshing={refreshing} className="h-full bg-[#1a1a1a]">
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
          <span className="text-base font-semibold text-[#ECEDEE]">Ingen uppställning för dagens internmatch</span>
          <span className="text-xs text-[#9BA1A6]">
            Lineup står på matchen mot {laterExternal.name}{d ? ` (${d})` : ""}. Växla Lineup till Intern (menyn → Match) och gör dagens lag – matchen mot {laterExternal.name} sparas och kommer tillbaka när du växlar.
          </span>
        </div>
      </PullToRefresh>
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
              {view?.mode === "published" ? `Publicerat ${shortWhen(view.publishedAt)}`
                : view?.mode === "live" ? "Live från Lineup – inget lag publicerat än"
                : `Senast synkad: ${formatSyncTime(lastSyncTime)}`}
            </p>
          </div>
          <div className="flex gap-1.5">
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
              {...(sides.external ? { logoOverride: sides.white.logo } : {})}
            />
          </div>
          <div className="flex-1 min-w-0">
            <TeamPanel
              teamName={lineupState.teamBName}
              slots={teamBSlots}
              lineup={teamBLineup}
              isWhite={false}
              {...(sides.external ? { logoOverride: sides.green.logo, colorOverride: sides.green.color } : {})}
            />
          </div>
        </div>

      </div>
    </PullToRefresh>
  );
}
