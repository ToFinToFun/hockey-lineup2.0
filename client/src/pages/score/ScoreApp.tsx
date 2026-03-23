/**
 * ScoreApp - Score Tracker sub-application wrapper
 * Provides tab navigation between Match, Lineup, History, and Stats
 * Replaces the original Score Tracker's App.tsx
 * Uses tRPC to fetch lineup data instead of Firebase
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import MatchPage from "./MatchPage";
import LineupPage from "./LineupPage";
import MatchHistoryPage from "./MatchHistoryPage";
import SeasonStatsPage from "./SeasonStatsPage";
import PlayerProfileModal from "./PlayerProfileModal";
import { trpc } from "@/lib/trpc";
import { Home, Users, History, BarChart3, ArrowLeft } from "lucide-react";
import type { AppState } from "@/lib/lineup";
import { Link } from "wouter";

type TabType = "match" | "lineup" | "history" | "stats";

export default function ScoreApp() {
  const [activeTab, setActiveTab] = useState<TabType>("match");
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 500);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Fetch lineup state via tRPC instead of Firebase
  const { data: lineupData, isLoading: loading, refetch } = trpc.lineup.getState.useQuery();
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Convert tRPC data to AppState format
  const lineupState = useMemo<AppState | null>(() => {
    if (!lineupData) return null;
    return {
      players: (lineupData.players ?? []) as AppState["players"],
      lineup: (lineupData.lineup ?? {}) as AppState["lineup"],
      teamAName: lineupData.teamAName ?? "Lag A",
      teamBName: lineupData.teamBName ?? "Lag B",
      teamAConfig: lineupData.teamAConfig as AppState["teamAConfig"],
      teamBConfig: lineupData.teamBConfig as AppState["teamBConfig"],
      deletedPlayerIds: lineupData.deletedPlayerIds as string[] | undefined,
    };
  }, [lineupData]);

  // Update lastSyncTime when data changes
  useEffect(() => {
    if (lineupData) {
      setLastSyncTime(new Date());
      setRefreshing(false);
    }
  }, [lineupData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 500);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#111111]">
      <div
        className="relative w-full flex flex-col overflow-hidden bg-[#1a1a1a]"
        style={{
          maxWidth: isDesktop ? "480px" : "100%",
          height: isDesktop ? "min(932px, 100dvh)" : "100dvh",
          borderRadius: isDesktop ? "24px" : "0",
          boxShadow: isDesktop ? "0 0 80px rgba(0,0,0,0.6)" : "none",
        }}
      >
        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "match" && (
            <MatchPage lineupState={lineupState} />
          )}
          {activeTab === "lineup" && (
            <LineupPage
              lineupState={lineupState}
              loading={loading}
              lastSyncTime={lastSyncTime}
              refreshing={refreshing}
              onRefresh={refresh}
            />
          )}
          {activeTab === "history" && (
            <MatchHistoryPage onBack={() => setActiveTab("match")} />
          )}
          {activeTab === "stats" && (
            <SeasonStatsPage
              onBack={() => setActiveTab("match")}
              onPlayerClick={(name) => setSelectedPlayer(name)}
            />
          )}
        </div>

        {/* Player Profile Modal */}
        {selectedPlayer && (
          <PlayerProfileModal
            playerName={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
          />
        )}

        {/* Tab Bar */}
        <div
          className="flex-shrink-0 border-t border-[#3a3a3a] bg-[#1a1a1a]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex">
            <Link
              href="/"
              className="flex-1 flex flex-col items-center py-2 gap-0.5 text-[#9BA1A6] hover:text-[#0a7ea4] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-[10px] font-medium">Hub</span>
            </Link>
            <button
              onClick={() => setActiveTab("match")}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                activeTab === "match" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <Home size={20} />
              <span className="text-[10px] font-medium">Match</span>
            </button>
            <button
              onClick={() => setActiveTab("lineup")}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                activeTab === "lineup" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <Users size={20} />
              <span className="text-[10px] font-medium">Uppställning</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                activeTab === "history" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <History size={20} />
              <span className="text-[10px] font-medium">Historik</span>
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                activeTab === "stats" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <BarChart3 size={20} />
              <span className="text-[10px] font-medium">Statistik</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
