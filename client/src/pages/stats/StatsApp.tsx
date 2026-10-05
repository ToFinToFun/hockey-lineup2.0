/**
 * StatsApp – Main statistics module container
 * Provides tab navigation, period filtering, and admin controls
 */
import { VenuesTab } from "./VenuesTab";
import { OpponentsTab } from "./OpponentsTab";
import { useFeatures } from "@/contexts/ClubContext";
import { useState, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { IMAGES } from "@/lib/scoreConstants";
import { ArrowLeft, BarChart3, Users, Shield, Loader2, X, Swords, MapPin, Timer } from "lucide-react";
import { IceTimeTab } from "./IceTimeTab";
import OverviewTab from "./OverviewTab";
import LeadersTab from "./LeadersTab";
import AwardsTab from "./AwardsTab";
import TeamsTab from "./TeamsTab";
import PirRanking from "./PirRanking";
import { PlayerProfileView } from "../players/PlayerProfile";

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
  { key: "all", label: "Totalt" },
];

// Tre flikar: Översikt, Spelare och Lag. PIR-modellen och perioderna finns under
// Inställningar på startsidan. Spelarprofilen öppnas från alla listor.
const TABS = [
  { id: "overview", label: "Översikt", icon: BarChart3 },
  { id: "players", label: "Spelare", icon: Users },
  { id: "teams", label: "Lag", icon: Shield },
  { id: "icetime", label: "Speltid", icon: Timer },
  { id: "venues", label: "Hallar", icon: MapPin },
  { id: "opponents", label: "Motståndare", icon: Swords },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function StatsApp() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("season");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  // Spelarregistret för att hitta rätt profil från namnet i listorna ("Namn #12" eller "Namn")
  const { data: registry } = trpc.players.list.useQuery();

  // Swipe support for mobile (horizontal only, doesn't block vertical scroll)
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].clientX;
    touchStartY.current = e.changedTouches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    // Only trigger tab switch for clearly horizontal swipes
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const currentIdx = TABS.findIndex((t) => t.id === activeTab);
    if (dx > 0 && currentIdx < TABS.length - 1) {
      setActiveTab(TABS[currentIdx + 1].id);
    } else if (dx < 0 && currentIdx > 0) {
      setActiveTab(TABS[currentIdx - 1].id);
    }
  }, [activeTab]);

  // Period config from DB
  const { data: periodConfig } = trpc.score.config.getPeriods.useQuery();

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

  // Matcher mot andra lag (beta): av som standard, kan slås på för spelarnas siffror
  const features = useFeatures();
  const [includeExternal, setIncludeExternal] = useState(false);
  const queryInput = useMemo(() => {
    const ext = features.opponents && includeExternal ? { includeExternal: true } : {};
    if (!dateFilter.from && !dateFilter.to) return Object.keys(ext).length ? ext : undefined;
    return { from: dateFilter.from, to: dateFilter.to, ...ext };
  }, [dateFilter, includeExternal, features.opponents]);
  const visibleTabs = TABS.filter((t) => t.id !== "opponents" || features.opponents);

  // Data queries
  const { data: seasonStats, isLoading: loadingStats } = trpc.scoreStats.seasonStats.useQuery(queryInput ?? {});
  const { data: awardsData, isLoading: loadingAwards } = trpc.scoreStats.seasonAwards.useQuery(queryInput ?? {});
  const { data: teamData, isLoading: loadingTeam } = trpc.scoreStats.teamComparison.useQuery(queryInput ?? {});
  const { data: pirData } = trpc.pir.getRatings.useQuery();

  const handlePlayerClick = useCallback((name: string) => {
    setSelectedPlayer(name);
  }, []);
  const profilePlayer = useMemo(() => {
    if (!selectedPlayer || !registry) return null;
    const label = selectedPlayer.trim().toLowerCase();
    const bare = label.replace(/\s+#\d+$/, "");
    return (
      registry.find((p) => (p.number ? `${p.name} #${p.number}` : p.name).toLowerCase() === label) ??
      registry.find((p) => p.name.toLowerCase() === bare) ??
      null
    );
  }, [selectedPlayer, registry]);

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

            <span className="w-[18px]" aria-hidden />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
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
            {features.opponents && activeTab !== "opponents" && activeTab !== "teams" && (
              <button
                onClick={() => setIncludeExternal((v) => !v)}
                title="Ta med matcher mot andra lag i spelarnas siffror (lagens siffror och PIR räknar alltid bara internmatcher)"
                className={`ml-1 px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all border ${
                  includeExternal ? "bg-sky-500/20 text-sky-200 border-sky-400/40" : "bg-[#1a1a1a]/50 text-[#687076] border-white/10 hover:text-[#9BA1A6]"
                }`}
              >
                {includeExternal ? "✓ " : ""}Inkl. externa matcher
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="max-w-6xl mx-auto px-4 py-6 overflow-y-auto"
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
            {activeTab === "players" && (
              <div className="space-y-8">
                <LeadersTab
                  stats={seasonStats}
                  onPlayerClick={handlePlayerClick}
                  periodLabel={PERIOD_OPTIONS.find((p) => p.key === periodPreset)?.label ?? "Säsong"}
                  dateFilter={queryInput as { from?: string; to?: string } | undefined}
                />
                <PirRanking ratings={pirData} onPlayerClick={handlePlayerClick} />
                <AwardsTab
                  awards={awardsData}
                  onPlayerClick={handlePlayerClick}
                  periodLabel={PERIOD_OPTIONS.find((p) => p.key === periodPreset)?.label ?? "Säsong"}
                  periodPreset={periodPreset}
                />
              </div>
            )}
            {activeTab === "venues" && <VenuesTab input={queryInput as { from?: string; to?: string; includeExternal?: boolean } | undefined} />}
            {activeTab === "icetime" && <IceTimeTab input={queryInput as never} />}
            {activeTab === "opponents" && <OpponentsTab dateFilter={dateFilter.from || dateFilter.to ? { from: dateFilter.from, to: dateFilter.to } : undefined} />}
            {activeTab === "teams" && (
              <TeamsTab
                teamData={teamData}
                stats={seasonStats}
                dateFilter={queryInput as { from?: string; to?: string } | undefined}
              />
            )}
          </>
        )}
      </main>


      {/* Spelarprofil (samma som på spelarsidan) */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="w-full sm:max-w-xl bg-[#161616] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end -mb-2">
              <button onClick={() => setSelectedPlayer(null)} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
            </div>
            {profilePlayer ? (
              <PlayerProfileView player={profilePlayer} all={registry ?? []} />
            ) : (
              <p className="text-sm text-white/50 py-6 text-center">
                {registry ? `"${selectedPlayer}" finns inte i spelarregistret (gästspelare eller gammalt namn).` : "Laddar …"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
