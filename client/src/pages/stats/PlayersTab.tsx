/**
 * PlayersTab – Searchable player list with inline profile view
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search,
  Users,
  ArrowLeft,
  Target,
  Trophy,
  Activity,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PlayersTabProps {
  stats: any;
  pirData: any;
  onPlayerClick: (name: string) => void;
  selectedPlayer: string | null;
  onClearSelection: () => void;
  dateFilter?: { from?: string; to?: string };
}

// ─── Player Profile View ────────────────────────────────────────────────────
function PlayerProfile({
  name,
  pirData,
  onBack,
}: {
  name: string;
  pirData: any;
  onBack: () => void;
}) {
  const { data: profile, isLoading } = trpc.scoreStats.playerProfile.useQuery({ name });
  const [showAllMatches, setShowAllMatches] = useState(false);

  const playerPir = useMemo(() => {
    if (!pirData) return null;
    return pirData.find((p: any) => p.playerKey === name);
  }, [pirData, name]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#0a7ea4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-[#687076]">
        <p className="text-sm">Spelaren hittades inte</p>
        <button onClick={onBack} className="mt-3 text-[#0a7ea4] text-xs">
          Tillbaka
        </button>
      </div>
    );
  }

  const matchesVisible = showAllMatches
    ? profile.matchHistory
    : profile.matchHistory.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#9BA1A6] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-[#ECEDEE] text-xl font-bold">{profile.name}</h2>
          <p className="text-[#687076] text-xs">
            {profile.matchesPlayed} matcher spelade
          </p>
        </div>
      </div>

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-[#687076] text-[10px] uppercase tracking-wider">Mål</p>
          <p className="text-amber-400 text-2xl font-bold">{profile.totalGoals}</p>
          <p className="text-[#687076] text-[10px]">
            {profile.matchesPlayed > 0
              ? `${(profile.totalGoals / profile.matchesPlayed).toFixed(1)}/match`
              : ""}
          </p>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-[#687076] text-[10px] uppercase tracking-wider">Assist</p>
          <p className="text-sky-400 text-2xl font-bold">{profile.totalAssists}</p>
          <p className="text-[#687076] text-[10px]">
            {profile.matchesPlayed > 0
              ? `${(profile.totalAssists / profile.matchesPlayed).toFixed(1)}/match`
              : ""}
          </p>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-[#687076] text-[10px] uppercase tracking-wider">Vinster</p>
          <p className="text-emerald-400 text-2xl font-bold">{profile.wins}</p>
          <p className="text-[#687076] text-[10px]">{profile.winRate}% vinstprocent</p>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-[#687076] text-[10px] uppercase tracking-wider">GWG</p>
          <p className="text-red-400 text-2xl font-bold">{profile.totalGwg}</p>
          <p className="text-[#687076] text-[10px]">avgörande mål</p>
        </div>
      </div>

      {/* PIR + Streaks row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* PIR */}
        {playerPir && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
              <Flame size={14} className="text-[#0a7ea4]" />
              PIR (Player Impact Rating)
            </h3>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-[#0a7ea4] text-3xl font-bold">
                  {Math.round(playerPir.rating)}
                </p>
                <p className="text-[#687076] text-[10px]">Overall</p>
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[#687076] text-[10px] w-16">Trend:</span>
                  <span className="text-xs flex items-center gap-1">
                    {playerPir.trendLabel === "rising" || playerPir.trendLabel === "slightly_rising" ? (
                      <TrendingUp size={12} className="text-emerald-400" />
                    ) : playerPir.trendLabel === "falling" || playerPir.trendLabel === "slightly_falling" ? (
                      <TrendingDown size={12} className="text-red-400" />
                    ) : (
                      <Minus size={12} className="text-[#687076]" />
                    )}
                    <span className="text-[#9BA1A6]">
                      {playerPir.trendLabel === "rising"
                        ? "Stigande"
                        : playerPir.trendLabel === "slightly_rising"
                          ? "Svagt stigande"
                          : playerPir.trendLabel === "falling"
                            ? "Fallande"
                            : playerPir.trendLabel === "slightly_falling"
                              ? "Svagt fallande"
                              : "Stabil"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#687076] text-[10px] w-16">Matcher:</span>
                  <span className="text-[#9BA1A6] text-xs">{playerPir.matchesPlayed}</span>
                </div>
                {playerPir.goalkeeperRating && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#687076] text-[10px] w-16">MV PIR:</span>
                    <span className="text-[#9BA1A6] text-xs">{Math.round(playerPir.goalkeeperRating)}</span>
                  </div>
                )}
                {playerPir.outfieldRating && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#687076] text-[10px] w-16">UT PIR:</span>
                    <span className="text-[#9BA1A6] text-xs">{Math.round(playerPir.outfieldRating)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Streaks */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity size={14} className="text-amber-400" />
            Sviter
          </h3>
          <div className="space-y-2">
            {[
              { label: "Längsta vinstsvit", value: profile.streaks.longestWinStreak, color: "#22C55E" },
              { label: "Längsta obesegrad", value: profile.streaks.longestUnbeatenStreak, color: "#0a7ea4" },
              { label: "Pågående vinstsvit", value: profile.streaks.currentWinStreak, color: "#F59E0B" },
              { label: "Pågående obesegrad", value: profile.streaks.currentUnbeatenStreak, color: "#8B5CF6" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[#687076] text-xs">{s.label}</span>
                <span className="text-xs font-bold" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Position stats */}
      {profile.positionStats.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Shield size={14} className="text-[#0a7ea4]" />
            Positioner
          </h3>
          <div className="flex gap-2 flex-wrap">
            {profile.positionStats.map((ps: any) => (
              <div
                key={ps.position}
                className="bg-[#0a0a0a] rounded-lg px-3 py-2 border border-[#2a2a2a] text-center"
              >
                <p className="text-[#ECEDEE] text-sm font-bold">{ps.position}</p>
                <p className="text-[#687076] text-[10px]">
                  {ps.count} ({ps.percentage}%)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best match */}
      {profile.bestMatch && (
        <div className="bg-gradient-to-br from-amber-500/5 to-[#111] rounded-xl border border-amber-500/20 p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-2 flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" />
            Bästa match
          </h3>
          <p className="text-[#9BA1A6] text-xs">{profile.bestMatch.matchName}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-amber-400 font-bold text-lg">
              {profile.bestMatch.goals}+{profile.bestMatch.assists}={profile.bestMatch.points}p
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                profile.bestMatch.result === "win"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : profile.bestMatch.result === "loss"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-[#2a2a2a] text-[#687076]"
              }`}
            >
              {profile.bestMatch.result === "win" ? "Vinst" : profile.bestMatch.result === "loss" ? "Förlust" : "Oavgjort"}
            </span>
            <span className="text-[#687076] text-[10px]">
              {profile.bestMatch.whiteScore}-{profile.bestMatch.greenScore}
            </span>
          </div>
        </div>
      )}

      {/* Match history */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-[#ECEDEE] text-sm font-semibold flex items-center gap-2">
            <Activity size={14} className="text-[#0a7ea4]" />
            Matchhistorik
          </h3>
        </div>

        {/* Header */}
        <div className="flex items-center px-4 py-1.5 text-[10px] text-[#687076] uppercase tracking-wider border-b border-[#2a2a2a]/50">
          <span className="flex-1">Match</span>
          <span className="w-10 text-center">Lag</span>
          <span className="w-10 text-center">Pos</span>
          <span className="w-14 text-center">Resultat</span>
          <span className="w-8 text-center">M</span>
          <span className="w-8 text-center">A</span>
        </div>

        {matchesVisible.map((m: any, i: number) => (
          <div
            key={m.matchId}
            className={`flex items-center px-4 py-2 text-xs ${i % 2 === 0 ? "bg-[#1a1a1a]/20" : ""}`}
          >
            <span className="flex-1 text-[#9BA1A6] truncate text-[11px]">{m.matchName}</span>
            <span className="w-10 text-center">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  m.team === "white" ? "bg-white/70" : "bg-emerald-500/70"
                }`}
              />
            </span>
            <span className="w-10 text-center text-[#687076]">{m.position}</span>
            <span className="w-14 text-center">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  m.result === "win"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : m.result === "loss"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-[#2a2a2a] text-[#687076]"
                }`}
              >
                {m.whiteScore}-{m.greenScore}
              </span>
            </span>
            <span className={`w-8 text-center font-medium ${m.goals > 0 ? "text-amber-400" : "text-[#687076]"}`}>
              {m.goals}
            </span>
            <span className={`w-8 text-center font-medium ${m.assists > 0 ? "text-sky-400" : "text-[#687076]"}`}>
              {m.assists}
            </span>
          </div>
        ))}

        {profile.matchHistory.length > 10 && (
          <button
            onClick={() => setShowAllMatches(!showAllMatches)}
            className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-[#0a7ea4] hover:text-[#0a7ea4]/80 transition-colors border-t border-[#2a2a2a]/50"
          >
            {showAllMatches ? (
              <>
                <ChevronUp size={12} /> Visa färre
              </>
            ) : (
              <>
                <ChevronDown size={12} /> Visa alla ({profile.matchHistory.length})
              </>
            )}
          </button>
        )}
      </div>

      {/* MVP months */}
      {profile.mvpMonths.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" />
            Månadens spelare
          </h3>
          <div className="flex gap-2 flex-wrap">
            {profile.mvpMonths.map((m: any) => (
              <div
                key={m.month}
                className="bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-500/20"
              >
                <p className="text-amber-400 text-xs font-semibold">{m.month}</p>
                <p className="text-[#687076] text-[10px]">
                  {m.goals}+{m.assists}={m.points}p
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function PlayersTab({
  stats,
  pirData,
  onPlayerClick,
  selectedPlayer,
  onClearSelection,
  dateFilter,
}: PlayersTabProps) {
  const [search, setSearch] = useState("");

  // If a player is selected, show their profile
  if (selectedPlayer) {
    return (
      <PlayerProfile
        name={selectedPlayer}
        pirData={pirData}
        onBack={onClearSelection}
      />
    );
  }

  const topScorers = stats?.topScorers ?? [];

  // Build player list with PIR data merged
  const players = useMemo(() => {
    const pirMap = new Map<string, any>();
    if (pirData) {
      for (const p of pirData) {
        pirMap.set(p.playerKey, p);
      }
    }
    return topScorers.map((p: any) => ({
      ...p,
      pir: pirMap.get(p.name),
    }));
  }, [topScorers, pirData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687076]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök spelare..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-[#ECEDEE] text-sm placeholder:text-[#687076] focus:outline-none focus:border-[#0a7ea4]/50"
        />
      </div>

      {/* Player count */}
      <p className="text-[#687076] text-[10px]">
        {filtered.length} spelare{search && ` (av ${players.length})`}
      </p>

      {/* Player list */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 py-2 text-[10px] text-[#687076] uppercase tracking-wider border-b border-[#2a2a2a]">
          <span className="w-6">#</span>
          <span className="flex-1">Spelare</span>
          <span className="w-8 text-center">M</span>
          <span className="w-8 text-center">A</span>
          <span className="w-8 text-center">P</span>
          <span className="w-10 text-center">GWG</span>
          <span className="w-12 text-center hidden sm:block">PIR</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[#687076] text-xs">
            Inga spelare hittades
          </div>
        ) : (
          filtered.map((p: any, i: number) => (
            <button
              key={p.name}
              onClick={() => onPlayerClick(p.name)}
              className={`w-full flex items-center px-4 py-2.5 text-xs hover:bg-[#2a2a2a]/30 transition-colors ${
                i % 2 === 0 ? "bg-[#1a1a1a]/20" : ""
              }`}
            >
              <span className="w-6 text-[#687076]">{i + 1}</span>
              <span className="flex-1 text-left text-[#ECEDEE] truncate font-medium hover:text-[#0a7ea4] transition-colors">
                {p.name}
              </span>
              <span className={`w-8 text-center ${p.goals > 0 ? "text-amber-400 font-medium" : "text-[#687076]"}`}>
                {p.goals}
              </span>
              <span className={`w-8 text-center ${p.assists > 0 ? "text-sky-400 font-medium" : "text-[#687076]"}`}>
                {p.assists}
              </span>
              <span className="w-8 text-center text-[#ECEDEE] font-semibold">{p.points}</span>
              <span className={`w-10 text-center ${p.gwg > 0 ? "text-red-400 font-medium" : "text-[#687076]"}`}>
                {p.gwg}
              </span>
              <span className="w-12 text-center hidden sm:block">
                {p.pir ? (
                  <span className="text-[#0a7ea4] font-medium">{Math.round(p.pir.rating)}</span>
                ) : (
                  <span className="text-[#687076]">—</span>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
