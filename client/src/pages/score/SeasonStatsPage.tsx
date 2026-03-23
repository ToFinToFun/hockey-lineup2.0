import { trpc } from "@/lib/trpc";
import { IMAGES } from "@/lib/scoreConstants";
import { useMemo, useState, useCallback } from "react";
import { HeadToHeadSection } from "./HeadToHeadSection";
import SeasonAwardsPage from "./SeasonAwardsPage";
import { ArrowLeft, Trophy, Target, BarChart3, TrendingUp, Users, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Calendar, X, Settings, Check, Star, Award, Search, Crosshair } from "lucide-react";

interface SeasonStatsPageProps {
  onBack: () => void;
  onPlayerClick?: (playerName: string) => void;
}

type SortKey = 'name' | 'matchesPlayed' | 'matchesWhite' | 'matchesGreen' | 'wins' | 'losses' | 'draws' | 'winRate' | 'goals' | 'assists' | 'points' | 'gwg';
type SortDir = 'asc' | 'desc';

/** Simple SVG bar chart for goals per match trend */
function GoalTrendChart({ data }: { data: { label: string; white: number; green: number }[] }) {
  if (data.length === 0) return null;
  const maxGoals = Math.max(...data.map(d => Math.max(d.white + d.green, 1)));
  const barWidth = Math.max(16, Math.min(32, 280 / data.length));
  const chartHeight = 120;
  const chartWidth = Math.max(280, data.length * (barWidth + 6));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg width={chartWidth} height={chartHeight + 30} viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1="0" y1={chartHeight * (1 - pct)} x2={chartWidth} y2={chartHeight * (1 - pct)}
            stroke="#3a3a3a" strokeWidth="0.5" strokeDasharray="4,4" />
        ))}
        {data.map((d, i) => {
          const x = i * (barWidth + 6) + 3;
          const totalH = ((d.white + d.green) / maxGoals) * chartHeight;
          const whiteH = (d.white / maxGoals) * chartHeight;
          const greenH = (d.green / maxGoals) * chartHeight;
          return (
            <g key={i}>
              {/* White portion (bottom) */}
              <rect x={x} y={chartHeight - totalH} width={barWidth} height={whiteH}
                rx="2" fill="rgba(255,255,255,0.7)" />
              {/* Green portion (top) */}
              <rect x={x} y={chartHeight - greenH} width={barWidth} height={greenH}
                rx="2" fill="rgba(34,197,94,0.7)" />
              {/* Total label */}
              <text x={x + barWidth / 2} y={chartHeight - totalH - 4}
                textAnchor="middle" fill="#9BA1A6" fontSize="9" fontWeight="600">
                {d.white + d.green}
              </text>
              {/* Match label */}
              <text x={x + barWidth / 2} y={chartHeight + 14}
                textAnchor="middle" fill="#687076" fontSize="8" transform={`rotate(-30, ${x + barWidth / 2}, ${chartHeight + 14})`}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** SVG donut chart for win distribution */
function WinDonutChart({ whiteWins, greenWins, draws }: { whiteWins: number; greenWins: number; draws: number }) {
  const total = whiteWins + greenWins + draws;
  if (total === 0) return null;

  const radius = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { value: whiteWins, color: "rgba(255,255,255,0.8)", label: "Vita" },
    { value: draws, color: "rgba(155,161,166,0.6)", label: "Oavgjort" },
    { value: greenWins, color: "rgba(34,197,94,0.8)", label: "Gröna" },
  ].filter(s => s.value > 0);

  let offset = 0;
  const arcs = segments.map(seg => {
    const pct = seg.value / total;
    const dashLength = pct * circumference;
    const dashOffset = -offset;
    offset += dashLength;
    return { ...seg, dashLength, dashOffset, pct };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {arcs.map((arc, i) => (
          <circle key={i} cx={cx} cy={cy} r={radius}
            fill="none" stroke={arc.color} strokeWidth="14"
            strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
            strokeDashoffset={arc.dashOffset}
            transform="rotate(-90 50 50)" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#ECEDEE" fontSize="16" fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#687076" fontSize="8">
          matcher
        </text>
      </svg>
      <div className="space-y-1.5">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: arc.color }} />
            <span className="text-[#9BA1A6] text-xs">{arc.label}: {arc.value} ({Math.round(arc.pct * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** SVG horizontal bar chart for top scorers */
function ScorerBarChart({ scorers }: { scorers: { name: string; goals: number; assists: number; gwg: number; points: number; team: string }[] }) {
  if (scorers.length === 0) return null;
  const maxPoints = Math.max(...scorers.map(s => s.points), 1);

  return (
    <div className="space-y-1.5">
      {scorers.slice(0, 10).map((player, i) => {
        const isGreen = player.team === "green";
        const goalWidth = (player.goals / maxPoints) * 100;
        const assistWidth = (player.assists / maxPoints) * 100;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[#687076] text-xs w-4 shrink-0 text-right">{i + 1}.</span>
            <div className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: isGreen ? "#22C55E" : "#fff", border: !isGreen ? "1px solid #9BA1A6" : "none" }} />
            <span className="text-[#ECEDEE] text-xs w-28 truncate shrink-0">{player.name}</span>
            <div className="flex-1 flex items-center gap-0.5 h-4">
              {player.goals > 0 && (
                <div className="h-full rounded-sm" style={{
                  width: `${goalWidth}%`,
                  minWidth: "8px",
                  backgroundColor: isGreen ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.6)",
                }} />
              )}
              {player.assists > 0 && (
                <div className="h-full rounded-sm" style={{
                  width: `${assistWidth}%`,
                  minWidth: "8px",
                  backgroundColor: isGreen ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.25)",
                }} />
              )}
            </div>
            <span className="text-[#0a7ea4] font-bold text-xs shrink-0 w-12 text-right">
              {player.goals}+{player.assists}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-3 mt-2 justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-white/60" />
          <span className="text-[#687076] text-[10px]">Mål</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-white/25" />
          <span className="text-[#687076] text-[10px]">Assist</span>
        </div>
      </div>
    </div>
  );
}

type PeriodPreset = 'preseason' | 'season' | 'playoff' | 'year' | 'month' | 'week' | 'all';

function getCalendarWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split('T')[0]!,
    to: sunday.toISOString().split('T')[0]!,
  };
}

function getCalendarMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

function getCalendarYearRange(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function SeasonStatsPage({ onBack, onPlayerClick }: SeasonStatsPageProps) {
  // Period config from DB
  const { data: periodConfig } = trpc.score.config.getPeriods.useQuery();
  const updatePeriodsMutation = trpc.score.config.updatePeriods.useMutation({
    onSuccess: () => {
      trpc.useUtils().score.config.getPeriods.invalidate();
    },
  });

  // Period filter state - default to 'season'
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('season');

  // Discreet settings state
  const [showSettings, setShowSettings] = useState(false);
  const [editSeasonFrom, setEditSeasonFrom] = useState('');
  const [editSeasonTo, setEditSeasonTo] = useState('');
  const [editPlayoffFrom, setEditPlayoffFrom] = useState('');
  const [editPlayoffTo, setEditPlayoffTo] = useState('');
  const [editPreseasonFrom, setEditPreseasonFrom] = useState('');
  const [editPreseasonTo, setEditPreseasonTo] = useState('');
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  // Initialize edit fields when config loads
  if (periodConfig && !settingsInitialized) {
    setEditSeasonFrom(periodConfig.seasonFrom);
    setEditSeasonTo(periodConfig.seasonTo);
    setEditPlayoffFrom(periodConfig.playoffFrom);
    setEditPlayoffTo(periodConfig.playoffTo);
    setEditPreseasonFrom(periodConfig.preseasonFrom);
    setEditPreseasonTo(periodConfig.preseasonTo);
    setSettingsInitialized(true);
  }

  const dateFilter = useMemo((): { from?: string; to?: string } => {
    if (periodPreset === 'all') return {};
    if (periodPreset === 'preseason' && periodConfig) {
      return { from: periodConfig.preseasonFrom, to: periodConfig.preseasonTo };
    }
    if (periodPreset === 'season' && periodConfig) {
      return { from: periodConfig.seasonFrom, to: periodConfig.seasonTo };
    }
    if (periodPreset === 'playoff' && periodConfig) {
      return { from: periodConfig.playoffFrom, to: periodConfig.playoffTo };
    }
    if (periodPreset === 'year') return getCalendarYearRange();
    if (periodPreset === 'month') return getCalendarMonthRange();
    if (periodPreset === 'week') return getCalendarWeekRange();
    return {};
  }, [periodPreset, periodConfig]);

  const queryInput = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) return undefined;
    return dateFilter;
  }, [dateFilter]);

  const { data: stats, isLoading } = trpc.scoreStats.seasonStats.useQuery(queryInput);
  const { data: matches } = trpc.score.match.list.useQuery();
  const { data: playerStats } = trpc.score.playerStats.useQuery(queryInput);
  const { data: goalkeeperStats } = trpc.score.goalkeeperStats.useQuery(queryInput);
  const { data: teamComparison } = trpc.scoreStats.teamComparison.useQuery(queryInput);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('matchesPlayed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAwards, setShowAwards] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [gkSortKey, setGkSortKey] = useState<'name' | 'matchesPlayed' | 'wins' | 'losses' | 'goalsAgainst' | 'goalsAgainstPerMatch' | 'cleanSheets' | 'winRate'>('matchesPlayed');
  const [gkSortDir, setGkSortDir] = useState<SortDir>('desc');

  const periodLabel = useMemo(() => {
    switch (periodPreset) {
      case 'preseason': return `Försäsong${periodConfig ? ` (${periodConfig.preseasonFrom.slice(5)}–${periodConfig.preseasonTo.slice(5)})` : ''}`;
      case 'season': return `Säsong${periodConfig ? ` (${periodConfig.seasonFrom.slice(0,4)}/${periodConfig.seasonTo.slice(0,4)})` : ''}`;
      case 'playoff': return `Slutspel${periodConfig ? ` (${periodConfig.playoffFrom.slice(5)})` : ''}`;
      case 'year': return `År ${new Date().getFullYear()}`;
      case 'month': {
        const months = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        return months[new Date().getMonth()] + ' ' + new Date().getFullYear();
      }
      case 'week': return 'Denna vecka';
      default: return 'Alla matcher';
    }
  }, [periodPreset, periodConfig]);

  const handleSaveSettings = useCallback(() => {
    updatePeriodsMutation.mutate({
      seasonFrom: editSeasonFrom,
      seasonTo: editSeasonTo,
      playoffFrom: editPlayoffFrom,
      playoffTo: editPlayoffTo,
      preseasonFrom: editPreseasonFrom,
      preseasonTo: editPreseasonTo,
    });
    setShowSettings(false);
  }, [editSeasonFrom, editSeasonTo, editPlayoffFrom, editPlayoffTo, editPreseasonFrom, editPreseasonTo, updatePeriodsMutation]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortedPlayerStats = useMemo(() => {
    if (!playerStats) return [];
    let filtered = [...playerStats];
    if (playerSearch.trim()) {
      const q = playerSearch.trim().toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'sv'); break;
        case 'matchesPlayed': cmp = a.matchesPlayed - b.matchesPlayed; break;
        case 'matchesWhite': cmp = a.matchesWhite - b.matchesWhite; break;
        case 'matchesGreen': cmp = a.matchesGreen - b.matchesGreen; break;
        case 'wins': cmp = a.wins - b.wins; break;
        case 'losses': cmp = a.losses - b.losses; break;
        case 'draws': cmp = a.draws - b.draws; break;
        case 'winRate': cmp = a.winRate - b.winRate; break;
        case 'points': cmp = (a.goals + a.assists) - (b.goals + b.assists); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [playerStats, sortKey, sortDir, playerSearch]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={8} className="opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown size={8} /> : <ArrowUp size={8} />;
  };

  const handleGkSort = useCallback((key: typeof gkSortKey) => {
    if (gkSortKey === key) {
      setGkSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setGkSortKey(key);
      setGkSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }, [gkSortKey]);

  const sortedGkStats = useMemo(() => {
    if (!goalkeeperStats) return [];
    return [...goalkeeperStats].sort((a, b) => {
      let cmp = 0;
      switch (gkSortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'sv'); break;
        case 'matchesPlayed': cmp = a.matchesPlayed - b.matchesPlayed; break;
        case 'wins': cmp = a.wins - b.wins; break;
        case 'losses': cmp = a.losses - b.losses; break;
        case 'goalsAgainst': cmp = a.goalsAgainst - b.goalsAgainst; break;
        case 'goalsAgainstPerMatch': cmp = a.goalsAgainstPerMatch - b.goalsAgainstPerMatch; break;
        case 'cleanSheets': cmp = a.cleanSheets - b.cleanSheets; break;
        case 'winRate': cmp = a.winRate - b.winRate; break;
      }
      return gkSortDir === 'desc' ? -cmp : cmp;
    });
  }, [goalkeeperStats, gkSortKey, gkSortDir]);

  const GkSortIcon = ({ col }: { col: typeof gkSortKey }) => {
    if (gkSortKey !== col) return <ArrowUpDown size={8} className="opacity-40" />;
    return gkSortDir === 'desc' ? <ArrowDown size={8} /> : <ArrowUp size={8} />;
  };

  // Build goal trend data from matches (chronological order)
  const goalTrendData = useMemo(() => {
    if (!matches) return [];
    const reversed = [...matches].reverse(); // oldest first
    return reversed.map(m => {
      // Extract short label from name: "YY-MM-DD Weekday HH:00 Score" → "DD/MM"
      const parts = m.name.split(" ");
      const datePart = parts[0] ?? "";
      const dateSegments = datePart.split("-");
      const label = dateSegments.length >= 3 ? `${dateSegments[2]}/${dateSegments[1]}` : datePart;
      return {
        label,
        white: m.teamWhiteScore,
        green: m.teamGreenScore,
      };
    });
  }, [matches]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
          <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-[#ECEDEE] font-bold text-lg">Säsongsstatistik</h1>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-8 h-8 border-2 border-[#0a7ea4] border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!stats || stats.totalMatches === 0) {
    return (
      <div className="flex flex-col h-full bg-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
          <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-[#ECEDEE] font-bold text-lg">Säsongsstatistik</h1>
        </div>
        <div className="text-center py-12">
          <BarChart3 size={48} className="mx-auto text-[#3a3a3a] mb-4" />
          <p className="text-[#9BA1A6] text-base">Ingen statistik ännu</p>
          <p className="text-[#687076] text-sm mt-1">Spela och spara matcher för att se statistik</p>
        </div>
      </div>
    );
  }

  const totalGoals = stats.totalGoalsWhite + stats.totalGoalsGreen;
  const avgGoalsPerMatch = stats.totalMatches > 0 ? (totalGoals / stats.totalMatches).toFixed(1) : "0";
  const avgWhiteGoalsPerMatch = stats.totalMatches > 0 ? (stats.totalGoalsWhite / stats.totalMatches).toFixed(1) : "0";
  const avgGreenGoalsPerMatch = stats.totalMatches > 0 ? (stats.totalGoalsGreen / stats.totalMatches).toFixed(1) : "0";
  const whiteWinPct = stats.totalMatches > 0 ? Math.round((stats.whiteWins / stats.totalMatches) * 100) : 0;
  const greenWinPct = stats.totalMatches > 0 ? Math.round((stats.greenWins / stats.totalMatches) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
        <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[#ECEDEE] font-bold text-lg">Säsongsstatistik</h1>
        <span className="text-[#9BA1A6] text-sm ml-auto">
          {stats.totalMatches} matcher
        </span>
      </div>

      {/* Period Filter */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center gap-1 mb-1">
          <Calendar size={11} className="text-[#687076]" />
          <span className="text-[#687076] text-[10px] uppercase tracking-wide">Period</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'preseason' as PeriodPreset, label: 'Försäsong' },
            { key: 'season' as PeriodPreset, label: 'Säsong' },
            { key: 'playoff' as PeriodPreset, label: 'Slutspel' },
            { key: 'year' as PeriodPreset, label: 'År' },
            { key: 'month' as PeriodPreset, label: 'Månad' },
            { key: 'week' as PeriodPreset, label: 'Vecka' },
            { key: 'all' as PeriodPreset, label: 'Alla' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriodPreset(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                periodPreset === opt.key
                  ? 'bg-[#0a7ea4] text-white'
                  : 'bg-[#2a2a2a] text-[#9BA1A6] hover:text-[#ECEDEE] border border-[#3a3a3a]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[#687076] text-[10px] mt-1">{periodLabel}</p>
      </div>

      {/* Season Awards Sub-page */}
      {showAwards && (
        <div className="absolute inset-0 z-20 bg-[#1a1a1a]">
          <SeasonAwardsPage
            onBack={() => setShowAwards(false)}
            onPlayerClick={onPlayerClick}
            initialPeriod={periodPreset}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Overall Record with Donut Chart */}
        <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
          <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
            <Trophy size={14} className="text-[#F59E0B]" /> Resultatöversikt
          </h2>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col items-center flex-1">
              <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-10 h-10 object-contain mb-1" />
              <span className="text-white text-2xl font-bold">{stats.whiteWins}</span>
              <span className="text-[#9BA1A6] text-[10px]">VINSTER</span>
              <span className="text-[#687076] text-[10px]">{whiteWinPct}%</span>
            </div>
            <div className="flex flex-col items-center px-4">
              <span className="text-[#9BA1A6] text-lg font-bold">{stats.draws}</span>
              <span className="text-[#687076] text-[10px]">OAVGJORT</span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-10 h-10 object-contain mb-1" />
              <span className="text-[#22C55E] text-2xl font-bold">{stats.greenWins}</span>
              <span className="text-[#9BA1A6] text-[10px]">VINSTER</span>
              <span className="text-[#687076] text-[10px]">{greenWinPct}%</span>
            </div>
          </div>
          {/* Win bar */}
          <div className="h-2 rounded-full bg-[#3a3a3a] overflow-hidden flex mb-4">
            {whiteWinPct > 0 && (
              <div className="h-full bg-white/80" style={{ width: `${whiteWinPct}%` }} />
            )}
            {stats.draws > 0 && (
              <div className="h-full bg-[#9BA1A6]/50" style={{ width: `${Math.round((stats.draws / stats.totalMatches) * 100)}%` }} />
            )}
            {greenWinPct > 0 && (
              <div className="h-full bg-[#22C55E]/80" style={{ width: `${greenWinPct}%` }} />
            )}
          </div>
          {/* Donut chart */}
          <WinDonutChart whiteWins={stats.whiteWins} greenWins={stats.greenWins} draws={stats.draws} />
        </div>

        {/* Goals Overview */}
        <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
          <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
            <Target size={14} className="text-[#0a7ea4]" /> Mål
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-white text-xl font-bold">{stats.totalGoalsWhite}</span>
              <p className="text-[#9BA1A6] text-[10px]">VITA MÅL</p>
            </div>
            <div>
              <span className="text-[#F59E0B] text-xl font-bold">{totalGoals}</span>
              <p className="text-[#9BA1A6] text-[10px]">TOTALT</p>
            </div>
            <div>
              <span className="text-[#22C55E] text-xl font-bold">{stats.totalGoalsGreen}</span>
              <p className="text-[#9BA1A6] text-[10px]">GRÖNA MÅL</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#3a3a3a]">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="text-white text-lg font-bold">{avgWhiteGoalsPerMatch}</span>
                <p className="text-[#687076] text-[10px]">VITA SNITT</p>
              </div>
              <div>
                <span className="text-[#0a7ea4] text-lg font-bold">{avgGoalsPerMatch}</span>
                <p className="text-[#687076] text-[10px]">MÅL/MATCH</p>
              </div>
              <div>
                <span className="text-[#22C55E] text-lg font-bold">{avgGreenGoalsPerMatch}</span>
                <p className="text-[#687076] text-[10px]">GRÖNA SNITT</p>
              </div>
            </div>
          </div>
        </div>

        {/* Goal Trend Chart */}
        {goalTrendData.length > 1 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
              <BarChart3 size={14} className="text-[#F59E0B]" /> Måltrend per match
            </h2>
            <GoalTrendChart data={goalTrendData} />
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 rounded-sm bg-white/70" />
                <span className="text-[#687076] text-[10px]">Vita</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 rounded-sm bg-[#22C55E]/70" />
                <span className="text-[#687076] text-[10px]">Gröna</span>
              </div>
            </div>
          </div>
        )}

        {/* Team Comparison Radar Chart */}
        {teamComparison && teamComparison.totalMatches > 0 && (() => {
          const categories = [
            { label: 'Vinst%', white: teamComparison.white.winRate, green: teamComparison.green.winRate, max: 100 },
            { label: 'Mål/match', white: teamComparison.white.goalsPerMatch, green: teamComparison.green.goalsPerMatch, max: Math.max(teamComparison.white.goalsPerMatch, teamComparison.green.goalsPerMatch, 1) },
            { label: 'Straff/match', white: teamComparison.white.penaltiesPerMatch, green: teamComparison.green.penaltiesPerMatch, max: Math.max(teamComparison.white.penaltiesPerMatch, teamComparison.green.penaltiesPerMatch, 0.5) },
            { label: 'Nollor', white: teamComparison.white.cleanSheets, green: teamComparison.green.cleanSheets, max: Math.max(teamComparison.white.cleanSheets, teamComparison.green.cleanSheets, 1) },
            { label: 'Spelare', white: teamComparison.white.uniquePlayers, green: teamComparison.green.uniquePlayers, max: Math.max(teamComparison.white.uniquePlayers, teamComparison.green.uniquePlayers, 1) },
          ];

          const cx = 140, cy = 120, maxR = 90;
          const n = categories.length;
          const angleStep = (2 * Math.PI) / n;
          const startAngle = -Math.PI / 2;

          const getPoint = (i: number, r: number) => ({
            x: cx + r * Math.cos(startAngle + i * angleStep),
            y: cy + r * Math.sin(startAngle + i * angleStep),
          });

          const gridLevels = [0.25, 0.5, 0.75, 1];
          const whitePoints = categories.map((c, i) => getPoint(i, (c.white / c.max) * maxR));
          const greenPoints = categories.map((c, i) => getPoint(i, (c.green / c.max) * maxR));
          const whitePath = whitePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
          const greenPath = greenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

          return (
            <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
              <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
                <Users size={14} className="text-[#0a7ea4]" /> Lagjämförelse
              </h2>
              <div className="flex justify-center">
                <svg width={280} height={260} viewBox="0 0 280 260" className="w-full max-w-[280px]">
                  {/* Grid */}
                  {gridLevels.map(level => {
                    const pts = Array.from({ length: n }, (_, i) => getPoint(i, level * maxR));
                    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                    return <path key={level} d={path} fill="none" stroke="#3a3a3a" strokeWidth="0.5" />;
                  })}
                  {/* Axis lines */}
                  {categories.map((_, i) => {
                    const p = getPoint(i, maxR);
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3a3a3a" strokeWidth="0.5" />;
                  })}
                  {/* White area */}
                  <path d={whitePath} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
                  {/* Green area */}
                  <path d={greenPath} fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.7)" strokeWidth="1.5" />
                  {/* Dots */}
                  {whitePoints.map((p, i) => <circle key={`w${i}`} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#1a1a1a" strokeWidth="1" />)}
                  {greenPoints.map((p, i) => <circle key={`g${i}`} cx={p.x} cy={p.y} r={3} fill="#22C55E" stroke="#1a1a1a" strokeWidth="1" />)}
                  {/* Labels */}
                  {categories.map((c, i) => {
                    const labelR = maxR + 18;
                    const p = getPoint(i, labelR);
                    const anchor = Math.abs(p.x - cx) < 5 ? 'middle' : p.x < cx ? 'end' : 'start';
                    return (
                      <g key={`label${i}`}>
                        <text x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" fill="#9BA1A6" fontSize="9" fontWeight="600">
                          {c.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              {/* Legend + values */}
              <div className="flex items-center justify-center gap-4 mt-1 mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-white/70" />
                  <span className="text-[#9BA1A6] text-[10px] font-medium">Vita</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[#22C55E]/70" />
                  <span className="text-[#9BA1A6] text-[10px] font-medium">Gröna</span>
                </div>
              </div>
              {/* Stat comparison rows */}
              <div className="space-y-1.5">
                {categories.map((c, i) => {
                  const whiteWins = c.white > c.green;
                  const greenWins = c.green > c.white;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className={`w-12 text-right font-bold ${whiteWins ? 'text-white' : 'text-[#687076]'}`}>
                        {typeof c.white === 'number' && c.white % 1 !== 0 ? c.white.toFixed(1) : c.white}
                      </span>
                      <div className="flex-1 h-1.5 bg-[#3a3a3a] rounded-full overflow-hidden flex">
                        <div className="h-full rounded-l-full" style={{ width: `${c.max > 0 ? (c.white / c.max) * 50 : 0}%`, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                        <div className="flex-1" />
                        <div className="h-full rounded-r-full" style={{ width: `${c.max > 0 ? (c.green / c.max) * 50 : 0}%`, backgroundColor: 'rgba(34,197,94,0.6)' }} />
                      </div>
                      <span className={`w-12 text-left font-bold ${greenWins ? 'text-[#22C55E]' : 'text-[#687076]'}`}>
                        {typeof c.green === 'number' && c.green % 1 !== 0 ? c.green.toFixed(1) : c.green}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 text-[9px] text-[#687076]">
                  <span className="w-12 text-right">Vita</span>
                  <div className="flex-1 text-center">{categories.map(c => c.label).join(' · ')}</div>
                  <span className="w-12 text-left">Gröna</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Top Scorers with Bar Chart */}
        {stats.topScorers.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#22C55E]" /> Poängligan
            </h2>
            <ScorerBarChart scorers={stats.topScorers} />
          </div>
        )}

        {/* Player Statistics */}
        {playerStats && playerStats.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[#ECEDEE] font-bold text-sm flex items-center gap-1.5">
                <Users size={14} className="text-[#0a7ea4]" /> Spelarstatistik
              </h2>
            </div>
            {/* Player Search */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687076]" />
              <input
                type="text"
                placeholder="Sök spelare..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg pl-9 pr-8 py-2 text-xs text-[#ECEDEE] placeholder-[#687076] focus:outline-none focus:border-[#0a7ea4] transition-colors"
              />
              {playerSearch && (
                <button
                  onClick={() => setPlayerSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#687076] hover:text-[#ECEDEE] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {sortedPlayerStats.length === 0 && playerSearch ? (
              <div className="text-center py-6 text-[#687076] text-sm">
                Inga spelare matchar "{playerSearch}"
              </div>
            ) : (
              <>
                <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-[10px] text-[#687076] uppercase">
                    <th className="sticky left-0 z-10 bg-[#2a2a2a] text-left py-1 pr-2 min-w-[140px]">
                      <button onClick={() => handleSort('name')} className={`flex items-center gap-0.5 hover:text-[#ECEDEE] transition-colors ${sortKey === 'name' ? 'text-[#0a7ea4]' : ''}`}>
                        Spelare <SortIcon col="name" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('matchesPlayed')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'matchesPlayed' ? 'text-[#0a7ea4]' : ''}`}>
                        Matcher <SortIcon col="matchesPlayed" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('matchesWhite')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'matchesWhite' ? 'text-[#0a7ea4]' : ''}`}>
                        Vita <SortIcon col="matchesWhite" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('matchesGreen')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'matchesGreen' ? 'text-[#0a7ea4]' : ''}`}>
                        Gröna <SortIcon col="matchesGreen" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('wins')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'wins' ? 'text-[#0a7ea4]' : ''}`}>
                        Vinster <SortIcon col="wins" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('losses')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'losses' ? 'text-[#0a7ea4]' : ''}`}>
                        Förluster <SortIcon col="losses" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('draws')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'draws' ? 'text-[#0a7ea4]' : ''}`}>
                        Oavgjort <SortIcon col="draws" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('winRate')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'winRate' ? 'text-[#0a7ea4]' : ''}`}>
                        Vinst% <SortIcon col="winRate" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('goals')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'goals' ? 'text-[#0a7ea4]' : ''}`}>
                        Mål <SortIcon col="goals" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('assists')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'assists' ? 'text-[#0a7ea4]' : ''}`}>
                        Ass <SortIcon col="assists" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('points')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'points' ? 'text-[#0a7ea4]' : ''}`}>
                        Poäng <SortIcon col="points" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleSort('gwg')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${sortKey === 'gwg' ? 'text-[#0a7ea4]' : ''}`}>
                        GWG <SortIcon col="gwg" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <span className="text-[#687076]">Form</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllPlayers ? sortedPlayerStats : sortedPlayerStats.slice(0, 10)).map((player, i) => (
                    <tr key={i}
                      onClick={() => onPlayerClick?.(player.name)}
                      className="text-xs hover:bg-[#0a7ea4]/10 transition-colors cursor-pointer group">
                      <td className="sticky left-0 z-10 bg-[#2a2a2a] group-hover:bg-[#2a2a2a] py-1.5 pr-2 text-[#ECEDEE] whitespace-nowrap">
                        <span className="inline-block max-w-[180px] truncate">{player.name}</span>
                      </td>
                      <td className="text-center py-1.5 px-1.5 text-[#9BA1A6]">{player.matchesPlayed}</td>
                      <td className="text-center py-1.5 px-1.5 text-white/70">{player.matchesWhite}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#22C55E]/70">{player.matchesGreen}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#22C55E]">{player.wins}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#EF4444]">{player.losses}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#9BA1A6]">{player.draws}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#F59E0B] font-medium">{player.winRate}%</td>
                      <td className="text-center py-1.5 px-1.5 text-[#ECEDEE]">{player.goals}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#9BA1A6]">{player.assists}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#0a7ea4] font-bold">{player.points}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#F59E0B]">{player.gwg || 0}</td>
                      <td className="text-center py-1.5 px-1.5 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-0.5">
                          {(player.recentForm || []).map((r: string, fi: number) => (
                            <span key={fi} className={`inline-block w-4 h-4 rounded-sm text-[9px] font-bold flex items-center justify-center leading-none ${
                              r === 'V' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                              r === 'F' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                              'bg-[#9BA1A6]/20 text-[#9BA1A6]'
                            }`}>{r}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedPlayerStats.length > 10 && (
              <button
                onClick={() => setShowAllPlayers(!showAllPlayers)}
                className="w-full mt-2 py-2 text-[#0a7ea4] text-xs flex items-center justify-center gap-1 hover:bg-[#0a7ea4]/10 rounded-lg transition-colors"
              >
                {showAllPlayers ? (
                  <><ChevronUp size={14} /> Visa färre</>
                ) : (
                  <><ChevronDown size={14} /> Visa alla {sortedPlayerStats.length} spelare</>
                )}
              </button>
            )}
              </>
            )}
          </div>
        )}

        {/* Goalkeeper Statistics */}
        {sortedGkStats.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
              <svg width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Hockey goalie */}
                <path d="M32 4C24 4 18 10 18 16v4c0 2 1 4 3 5h22c2-1 3-3 3-5v-4c0-6-6-12-14-12z" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1.5"/>
                <path d="M22 18h20v3c0 1-1 2-2 2H24c-1 0-2-1-2-2v-3z" fill="#1a1a1a" opacity="0.6"/>
                <line x1="24" y1="18" x2="24" y2="23" stroke="#1a1a1a" strokeWidth="1"/>
                <line x1="28" y1="18" x2="28" y2="23" stroke="#1a1a1a" strokeWidth="1"/>
                <line x1="32" y1="18" x2="32" y2="23" stroke="#1a1a1a" strokeWidth="1"/>
                <line x1="36" y1="18" x2="36" y2="23" stroke="#1a1a1a" strokeWidth="1"/>
                <line x1="40" y1="18" x2="40" y2="23" stroke="#1a1a1a" strokeWidth="1"/>
                <path d="M22 25h20v16H22z" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"/>
                <path d="M22 28L12 32v6l4 2 6-4v-8z" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"/>
                <rect x="8" y="30" width="6" height="10" rx="1" fill="#F59E0B" stroke="#1a1a1a" strokeWidth="1"/>
                <path d="M42 28l10 4v6l-4 2-6-4v-8z" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"/>
                <ellipse cx="54" cy="35" rx="5" ry="4" fill="#F59E0B" stroke="#1a1a1a" strokeWidth="1"/>
                <path d="M22 41l-4 18h8l2-14z" fill="#F59E0B" stroke="#1a1a1a" strokeWidth="1"/>
                <path d="M42 41l4 18h-8l-2-14z" fill="#F59E0B" stroke="#1a1a1a" strokeWidth="1"/>
                <line x1="20" y1="48" x2="26" y2="48" stroke="#1a1a1a" strokeWidth="0.8"/>
                <line x1="20" y1="52" x2="25" y2="52" stroke="#1a1a1a" strokeWidth="0.8"/>
                <line x1="38" y1="48" x2="44" y2="48" stroke="#1a1a1a" strokeWidth="0.8"/>
                <line x1="39" y1="52" x2="44" y2="52" stroke="#1a1a1a" strokeWidth="0.8"/>
                <line x1="10" y1="28" x2="4" y2="50" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
                <rect x="2" y="48" width="6" height="10" rx="1" fill="#F59E0B" stroke="#1a1a1a" strokeWidth="1"/>
              </svg>
              Målvaktsstatistik
            </h2>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-[10px] text-[#687076] uppercase">
                    <th className="sticky left-0 z-10 bg-[#2a2a2a] text-left py-1 pr-2 min-w-[140px]">
                      <button onClick={() => handleGkSort('name')} className={`flex items-center gap-0.5 hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'name' ? 'text-[#0a7ea4]' : ''}`}>
                        Målvakt <GkSortIcon col="name" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('matchesPlayed')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'matchesPlayed' ? 'text-[#0a7ea4]' : ''}`}>
                        Matcher <GkSortIcon col="matchesPlayed" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <span className="text-white/70">Vita</span>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <span className="text-[#22C55E]/70">Gröna</span>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('wins')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'wins' ? 'text-[#0a7ea4]' : ''}`}>
                        Vinster <GkSortIcon col="wins" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('losses')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'losses' ? 'text-[#0a7ea4]' : ''}`}>
                        Förluster <GkSortIcon col="losses" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('goalsAgainst')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'goalsAgainst' ? 'text-[#0a7ea4]' : ''}`}>
                        Insläppta <GkSortIcon col="goalsAgainst" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('goalsAgainstPerMatch')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'goalsAgainstPerMatch' ? 'text-[#0a7ea4]' : ''}`}>
                        IM/Match <GkSortIcon col="goalsAgainstPerMatch" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('cleanSheets')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'cleanSheets' ? 'text-[#0a7ea4]' : ''}`}>
                        Nollor <GkSortIcon col="cleanSheets" />
                      </button>
                    </th>
                    <th className="text-center py-1 px-1.5 whitespace-nowrap">
                      <button onClick={() => handleGkSort('winRate')} className={`flex items-center justify-center gap-0.5 mx-auto hover:text-[#ECEDEE] transition-colors ${gkSortKey === 'winRate' ? 'text-[#0a7ea4]' : ''}`}>
                        Vinst% <GkSortIcon col="winRate" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGkStats.map((gk, i) => (
                    <tr key={i}
                      onClick={() => onPlayerClick?.(gk.name)}
                      className="text-xs hover:bg-[#0a7ea4]/10 transition-colors cursor-pointer group">
                      <td className="sticky left-0 z-10 bg-[#2a2a2a] group-hover:bg-[#2a2a2a] py-1.5 pr-2 text-[#ECEDEE] whitespace-nowrap">
                        <span className="inline-block max-w-[180px] truncate">{gk.name}</span>
                      </td>
                      <td className="text-center py-1.5 px-1.5 text-[#9BA1A6]">{gk.matchesPlayed}</td>
                      <td className="text-center py-1.5 px-1.5 text-white/60">{gk.matchesWhite}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#22C55E]/60">{gk.matchesGreen}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#22C55E]">{gk.wins}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#EF4444]">{gk.losses}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#F59E0B] font-medium">{gk.goalsAgainst}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#F59E0B]">{gk.goalsAgainstPerMatch}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#22C55E] font-bold">{gk.cleanSheets}</td>
                      <td className="text-center py-1.5 px-1.5 text-[#0a7ea4] font-medium">{gk.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GWG Leaderboard */}
        {stats.topScorers.some(s => s.gwg > 0) && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
              <Star size={14} className="text-[#F59E0B]" /> GWG-ligan
            </h2>
            <p className="text-[#687076] text-[10px] mb-3">Game Winning Goals — det avgörande målet i varje match</p>
            <div className="space-y-1.5">
              {[...stats.topScorers]
                .filter(s => s.gwg > 0)
                .sort((a, b) => b.gwg - a.gwg || b.points - a.points)
                .slice(0, 10)
                .map((player, i) => {
                  const isGreen = player.team === 'green';
                  const maxGwg = Math.max(...stats.topScorers.map(s => s.gwg), 1);
                  const barWidth = (player.gwg / maxGwg) * 100;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[#687076] text-xs w-4 shrink-0 text-right">{i + 1}.</span>
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: isGreen ? '#22C55E' : '#fff', border: !isGreen ? '1px solid #9BA1A6' : 'none' }} />
                      <span className="text-[#ECEDEE] text-xs w-28 truncate shrink-0">{player.name}</span>
                      <div className="flex-1 h-4 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-2"
                          style={{
                            width: `${Math.max(barWidth, 15)}%`,
                            background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(245,158,11,0.7))',
                          }}
                        >
                          <span className="text-white text-[10px] font-bold">{player.gwg}</span>
                        </div>
                      </div>
                      <span className="text-[#687076] text-[10px] shrink-0 w-16 text-right">
                        {player.goals}G {player.assists}A
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Records */}
        <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
          <h2 className="text-[#ECEDEE] font-bold text-sm mb-3">Rekord</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Left column: Match records */}
            <div className="space-y-3">
              <p className="text-[#0a7ea4] text-[10px] font-semibold uppercase tracking-wider">Matchrekord</p>
              {stats.highestScoringMatch && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Flest mål i en match</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.highestScoringMatch.whiteScore}-{stats.highestScoringMatch.greenScore}{" "}
                    <span className="text-[#687076] text-xs">({stats.highestScoringMatch.totalGoals} mål)</span>
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.highestScoringMatch.name}</p>
                </div>
              )}
              {stats.biggestWinWhite && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Största vita-segern</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.biggestWinWhite.whiteScore}-{stats.biggestWinWhite.greenScore}
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.biggestWinWhite.name}</p>
                </div>
              )}
              {stats.biggestWinGreen && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Största gröna-segern</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.biggestWinGreen.whiteScore}-{stats.biggestWinGreen.greenScore}
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.biggestWinGreen.name}</p>
                </div>
              )}
            </div>

            {/* Right column: Player records */}
            <div className="space-y-3">
              <p className="text-[#F59E0B] text-[10px] font-semibold uppercase tracking-wider">Spelarrekord</p>
              {stats.playerRecordGoals && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Flest mål i en match</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.playerRecordGoals.playerName}{" "}
                    <span className="text-[#0a7ea4] font-bold">({stats.playerRecordGoals.goals} mål)</span>
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.playerRecordGoals.matchName}</p>
                </div>
              )}
              {stats.playerRecordAssists && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Flest assist i en match</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.playerRecordAssists.playerName}{" "}
                    <span className="text-[#0a7ea4] font-bold">({stats.playerRecordAssists.assists} assist)</span>
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.playerRecordAssists.matchName}</p>
                </div>
              )}
              {stats.playerRecordPoints && (
                <div>
                  <p className="text-[#687076] text-[10px] uppercase">Flest poäng i en match</p>
                  <p className="text-[#ECEDEE] text-sm">
                    {stats.playerRecordPoints.playerName}{" "}
                    <span className="text-[#0a7ea4] font-bold">({stats.playerRecordPoints.goals}+{stats.playerRecordPoints.assists}={stats.playerRecordPoints.points})</span>
                  </p>
                  <p className="text-[#687076] text-[10px]">{stats.playerRecordPoints.matchName}</p>
                </div>
              )}
              {!stats.playerRecordGoals && !stats.playerRecordAssists && !stats.playerRecordPoints && (
                <p className="text-[#687076] text-xs italic">Inga spelarrekord ännu</p>
              )}
            </div>
          </div>
        </div>

        {/* Goal Types */}
        {stats.goalTypes && stats.goalTypes.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
              <Target size={14} className="text-[#F59E0B]" /> Måltyper
            </h2>
            <div className="space-y-2">
              {stats.goalTypes.map((gt, i) => {
                const maxCount = stats.goalTypes[0]?.count ?? 1;
                const widthPct = (gt.count / maxCount) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[#ECEDEE] text-xs w-20 shrink-0 truncate">{gt.type}</span>
                    <div className="flex-1 h-5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(widthPct, 12)}%`,
                          background: 'linear-gradient(90deg, rgba(10,126,164,0.4), rgba(10,126,164,0.8))',
                        }}
                      >
                        <span className="text-white text-[10px] font-bold">{gt.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-[#3a3a3a] text-center">
              <span className="text-[#0a7ea4] text-lg font-bold">
                {stats.goalTypes.reduce((sum, gt) => sum + gt.count, 0)}
              </span>
              <p className="text-[#687076] text-[10px]">TOTALT REGISTRERADE MÅLTYPER</p>
            </div>
          </div>
        )}

        {/* Goal Type Leaderboards */}
        {playerStats && playerStats.length > 0 && (() => {
          const goalTypeConfig: { type: string; label: string; color: string; icon: string }[] = [
            { type: 'Skott', label: 'Skottligan', color: '#3B82F6', icon: '🎯' },
            { type: 'Styrning', label: 'Styrningsligan', color: '#8B5CF6', icon: '🏒' },
            { type: 'Friläge', label: 'Frilägesligan', color: '#F59E0B', icon: '💨' },
            { type: 'Solo', label: 'Sololigan', color: '#EC4899', icon: '⚡' },
            { type: 'Straff', label: 'Straffligan', color: '#EF4444', icon: '🎪' },
            { type: 'Självmål', label: 'Självmålsligan', color: '#6B7280', icon: '😅' },
          ];

          // Build leaderboard data per goal type
          const leaderboards = goalTypeConfig
            .map(cfg => {
              const players = playerStats
                .filter(p => p.goalTypes && p.goalTypes[cfg.type] > 0)
                .map(p => ({ name: p.name, count: p.goalTypes[cfg.type] ?? 0 }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
              return { ...cfg, players };
            })
            .filter(lb => lb.players.length > 0);

          if (leaderboards.length === 0) return null;

          return (
            <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
              <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-1.5">
                <Crosshair size={14} className="text-[#EC4899]" /> Måltyps-topplistan
              </h2>
              <p className="text-[#687076] text-[10px] mb-4">Topp 5 spelare per måltyp</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {leaderboards.map(lb => {
                  const maxCount = lb.players[0]?.count ?? 1;
                  return (
                    <div key={lb.type} className="bg-[#1a1a1a] rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{lb.icon}</span>
                        <h3 className="text-xs font-bold" style={{ color: lb.color }}>{lb.label}</h3>
                      </div>
                      <div className="space-y-1">
                        {lb.players.map((player, i) => {
                          const barPct = (player.count / maxCount) * 100;
                          return (
                            <div
                              key={player.name}
                              className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                              onClick={() => onPlayerClick?.(player.name)}
                            >
                              <span className="text-[#687076] text-[10px] w-3 shrink-0 text-right">
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                              </span>
                              <span className="text-[#ECEDEE] text-[11px] w-24 truncate shrink-0">{player.name}</span>
                              <div className="flex-1 h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.max(barPct, 10)}%`,
                                    backgroundColor: lb.color,
                                    opacity: 0.7,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-bold shrink-0 w-6 text-right" style={{ color: lb.color }}>
                                {player.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Recent Form */}
        {stats.recentForm.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3">Senaste matcherna</h2>
            <div className="space-y-1.5">
              {stats.recentForm.map((match, i) => {
                const isWhiteWin = match.whiteScore > match.greenScore;
                const isGreenWin = match.greenScore > match.whiteScore;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#3a3a3a] last:border-0">
                    <span className="text-[#687076] text-xs flex-1 truncate">{match.name}</span>
                    <div className="flex items-center gap-1 ml-2">
                      <span className={`text-sm font-bold ${isWhiteWin ? 'text-white' : 'text-[#9BA1A6]'}`}>
                        {match.whiteScore}
                      </span>
                      <span className="text-[#687076] text-xs">-</span>
                      <span className={`text-sm font-bold ${isGreenWin ? 'text-[#22C55E]' : 'text-[#9BA1A6]'}`}>
                        {match.greenScore}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Head-to-Head */}
        <HeadToHeadSection dateFilter={queryInput} />

        {/* Monthly MVP */}
        {stats?.monthlyMvp && stats.monthlyMvp.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
            <h2 className="text-[#ECEDEE] font-bold text-sm mb-3 flex items-center gap-2">
              <Trophy size={16} className="text-amber-400" />
              Månadens MVP
            </h2>
            <div className="space-y-2">
              {stats.monthlyMvp.map((mvp: { month: string; playerName: string; goals: number; assists: number; points: number; gwg: number; matches: number }) => {
                const [year, month] = mvp.month.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
                const monthName = monthNames[parseInt(month) - 1] || month;
                const displayDate = `${monthName} ${year}`;
                return (
                  <div key={mvp.month} className="flex items-center gap-3 bg-[#1a1a1a] rounded-xl px-3 py-2.5 border border-[#3a3a3a]">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Star size={18} className="text-amber-400 fill-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onPlayerClick?.(mvp.playerName)}
                        className="text-[#ECEDEE] font-bold text-sm hover:text-[#0a7ea4] transition-colors truncate block"
                      >
                        {mvp.playerName}
                      </button>
                      <div className="flex items-center gap-2 text-[10px] text-[#9BA1A6]">
                        <span>{mvp.goals} mål</span>
                        <span>·</span>
                        <span>{mvp.assists} assist</span>
                        <span>·</span>
                        <span>{mvp.points} poäng</span>
                        {mvp.gwg > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-400">{mvp.gwg} GWG</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{mvp.matches} matcher</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[#9BA1A6] text-[11px] font-medium">{displayDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Season Awards Button */}
        <button
          onClick={() => setShowAwards(true)}
          className="w-full bg-gradient-to-r from-amber-900/30 to-amber-800/20 rounded-2xl p-4 border border-amber-500/30 flex items-center gap-3 hover:from-amber-900/40 hover:to-amber-800/30 transition-all group"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Award size={22} className="text-amber-400" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-[#ECEDEE] font-bold text-sm flex items-center gap-1.5">
              Periodens Bästa
              <Trophy size={12} className="text-amber-400" />
            </h3>
            <p className="text-[#9BA1A6] text-[11px]">Skyttekung, Poängkung, Mr. Clutch och fler priser</p>
          </div>
          <ArrowDown size={14} className="text-[#9BA1A6] -rotate-90 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Period Settings */}
        <div className="mt-6 pt-4 border-t border-[#3a3a3a]">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors text-xs py-2"
          >
            <Settings size={14} />
            <span>Periodinställningar</span>
            {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showSettings && (
            <div className="mt-3 space-y-4">
              <div className="bg-[#2a2a2a] rounded-xl p-4 border border-[#3a3a3a]">
                <p className="text-[#9BA1A6] text-xs font-medium uppercase tracking-wide mb-3">Säsong</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Från</label>
                    <input
                      type="date"
                      value={editSeasonFrom}
                      onChange={(e) => setEditSeasonFrom(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Till</label>
                    <input
                      type="date"
                      value={editSeasonTo}
                      onChange={(e) => setEditSeasonTo(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-4 border border-[#3a3a3a]">
                <p className="text-[#9BA1A6] text-xs font-medium uppercase tracking-wide mb-3">Försäsong</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Från</label>
                    <input
                      type="date"
                      value={editPreseasonFrom}
                      onChange={(e) => setEditPreseasonFrom(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Till</label>
                    <input
                      type="date"
                      value={editPreseasonTo}
                      onChange={(e) => setEditPreseasonTo(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-4 border border-[#3a3a3a]">
                <p className="text-[#9BA1A6] text-xs font-medium uppercase tracking-wide mb-3">Slutspel</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Från</label>
                    <input
                      type="date"
                      value={editPlayoffFrom}
                      onChange={(e) => setEditPlayoffFrom(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[#687076] text-[10px] block mb-1">Till</label>
                    <input
                      type="date"
                      value={editPlayoffTo}
                      onChange={(e) => setEditPlayoffTo(e.target.value)}
                      className="w-full bg-[#1a1a1a] text-[#ECEDEE] text-xs rounded-lg px-3 py-2 border border-[#3a3a3a] focus:border-[#0a7ea4] outline-none"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={updatePeriodsMutation.isPending}
                className="flex items-center gap-1.5 bg-[#0a7ea4] hover:bg-[#0a7ea4]/80 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Check size={12} />
                <span>{updatePeriodsMutation.isPending ? 'Sparar...' : 'Spara periodinställningar'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
