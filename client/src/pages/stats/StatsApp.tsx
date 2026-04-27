/**
 * StatsApp – Main statistics module container
 * Provides tab navigation, period filtering, and admin controls
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { IMAGES } from "@/lib/scoreConstants";
import { ArrowLeft, BarChart3, Trophy, Award, Users, Shield, Settings, Loader2 } from "lucide-react";
import OverviewTab from "./OverviewTab";
import LeadersTab from "./LeadersTab";
import AwardsTab from "./AwardsTab";
import PlayersTab from "./PlayersTab";
import TeamsTab from "./TeamsTab";
import StatsAdminPanel from "./StatsAdminPanel";

// ─── Period helpers ─────────────────────────────────────────────────────────
type PeriodPreset = "preseason" | "season" | "playoff" | "year" | "month" | "week" | "all";

function getCalendarWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: monday.toISOString().split("T")[0]!, to: sunday.toISOString().split("T")[0]! };
}

function getCalendarMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

function getCalendarYearRange(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
  { key: "season", label: "Säsong" },
  { key: "playoff", label: "Slutspel" },
  { key: "preseason", label: "Försäsong" },
  { key: "month", label: "Månad" },
  { key: "week", label: "Vecka" },
  { key: "all", label: "Alla" },
];

const TABS = [
  { id: "overview", label: "Översikt", icon: BarChart3 },
  { id: "leaders", label: "Poängligan", icon: Trophy },
  { id: "awards", label: "Utmärkelser", icon: Award },
  { id: "players", label: "Spelare", icon: Users },
  { id: "teams", label: "Lag", icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function StatsApp() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("season");
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Swipe support for mobile
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 60;
    if (Math.abs(diff) < threshold) return;
    const currentIdx = TABS.findIndex((t) => t.id === activeTab);
    if (diff > 0 && currentIdx < TABS.length - 1) {
      setActiveTab(TABS[currentIdx + 1].id);
    } else if (diff < 0 && currentIdx > 0) {
      setActiveTab(TABS[currentIdx - 1].id);
    }
  }, [activeTab]);

  // Period config from DB
  const { data: periodConfig } = trpc.score.config.getPeriods.useQuery();
  const { data: visibility } = trpc.statsConfig.getVisibility.useQuery();

  const dateFilter = useMemo((): { from?: string; to?: string } => {
    if (periodPreset === "all") return {};
    if (periodPreset === "preseason" && periodConfig) return { from: periodConfig.preseasonFrom, to: periodConfig.preseasonTo };
    if (periodPreset === "season" && periodConfig) return { from: periodConfig.seasonFrom, to: periodConfig.seasonTo };
    if (periodPreset === "playoff" && periodConfig) return { from: periodConfig.playoffFrom, to: periodConfig.playoffTo };
    if (periodPreset === "year") return getCalendarYearRange();
    if (periodPreset === "month") return getCalendarMonthRange();
    if (periodPreset === "week") return getCalendarWeekRange();
    return {};
  }, [periodPreset, periodConfig]);

  const queryInput = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) return undefined;
    return { from: dateFilter.from, to: dateFilter.to };
  }, [dateFilter]);

  // Data queries
  const { data: seasonStats, isLoading: loadingStats } = trpc.scoreStats.seasonStats.useQuery(queryInput ?? {});
  const { data: awardsData, isLoading: loadingAwards } = trpc.scoreStats.seasonAwards.useQuery(queryInput ?? {});
  const { data: teamData, isLoading: loadingTeam } = trpc.scoreStats.teamComparison.useQuery(queryInput ?? {});
  const { data: pirData } = trpc.pir.getRatings.useQuery();

  const handlePlayerClick = useCallback((name: string) => {
    setSelectedPlayer(name);
    setActiveTab("players");
  }, []);

  const isLoading = loadingStats || loadingAwards;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#2a2a2a]">
        <div className="max-w-6xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-[#9BA1A6] hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
              <span className="text-sm hidden sm:inline">Hem</span>
            </button>

            <div className="flex items-center gap-2">
              <img src={IMAGES.teamWhiteLogo} alt="" className="w-6 h-6 object-contain opacity-60" />
              <h1
                className="text-base sm:text-lg font-bold tracking-tight"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                STATISTIK
              </h1>
              <img src={IMAGES.teamGreenLogo} alt="" className="w-6 h-6 object-contain opacity-60" />
            </div>

            <button
              onClick={() => setShowAdmin(true)}
              className="text-[#687076] hover:text-[#0a7ea4] transition-colors p-2"
              title="Inställningar"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-[#0a7ea4] text-white"
                      : "bg-[#1a1a1a] text-[#9BA1A6] hover:bg-[#2a2a2a] hover:text-white"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Period filter */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-3">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodPreset(p.key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all ${
                  periodPreset === p.key
                    ? "bg-[#0a7ea4]/20 text-[#0a7ea4] border border-[#0a7ea4]/40"
                    : "bg-[#1a1a1a]/50 text-[#687076] border border-transparent hover:text-[#9BA1A6]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="max-w-6xl mx-auto px-4 py-6"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-[#0a7ea4]" />
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                stats={seasonStats}
                pirData={pirData}
                onPlayerClick={handlePlayerClick}
              />
            )}
            {activeTab === "leaders" && (
              <LeadersTab
                stats={seasonStats}
                onPlayerClick={handlePlayerClick}
                periodLabel={PERIOD_OPTIONS.find((p) => p.key === periodPreset)?.label ?? "Säsong"}
              />
            )}
            {activeTab === "awards" && (
              <AwardsTab
                awards={awardsData}
                onPlayerClick={handlePlayerClick}
                periodLabel={PERIOD_OPTIONS.find((p) => p.key === periodPreset)?.label ?? "Säsong"}
                periodPreset={periodPreset}
              />
            )}
            {activeTab === "players" && (
              <PlayersTab
                stats={seasonStats}
                pirData={pirData}
                onPlayerClick={handlePlayerClick}
                selectedPlayer={selectedPlayer}
                onClearSelection={() => setSelectedPlayer(null)}
                dateFilter={queryInput}
              />
            )}
            {activeTab === "teams" && (
              <TeamsTab
                teamData={teamData}
                stats={seasonStats}
              />
            )}
          </>
        )}
      </main>

      {/* Admin panel */}
      {showAdmin && (
        <StatsAdminPanel
          onClose={() => setShowAdmin(false)}
          visibility={visibility}
        />
      )}
    </div>
  );
}
