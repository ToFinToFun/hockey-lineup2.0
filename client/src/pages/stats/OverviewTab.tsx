/**
 * OverviewTab – Dashboard with key stats, charts, and trends
 */
import { useMemo } from "react";
import { Trophy, Target, TrendingUp, Flame, Activity, Users } from "lucide-react";

interface OverviewTabProps {
  stats: any;
  pirData: any;
  onPlayerClick: (name: string) => void;
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#687076] text-[10px] uppercase tracking-wider">{label}</p>
          <p className="text-[#ECEDEE] text-xl font-bold">{value}</p>
          {sub && <p className="text-[#687076] text-[10px]">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Donut Chart ────────────────────────────────────────────────────────────
function WinDonut({ whiteWins, greenWins, draws }: { whiteWins: number; greenWins: number; draws: number }) {
  const total = whiteWins + greenWins + draws;
  if (total === 0) return null;

  const radius = 42;
  const cx = 55;
  const cy = 55;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { value: whiteWins, color: "rgba(255,255,255,0.85)", label: "Vita" },
    { value: draws, color: "rgba(155,161,166,0.5)", label: "Oavgjort" },
    { value: greenWins, color: "rgba(34,197,94,0.85)", label: "Gröna" },
  ].filter((s) => s.value > 0);

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dashLength = pct * circumference;
    const dashOffset = -offset;
    offset += dashLength;
    return { ...seg, dashLength, dashOffset, pct };
  });

  return (
    <div className="flex items-center gap-5">
      <svg width="110" height="110" viewBox="0 0 110 110">
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth="16"
            strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
            strokeDashoffset={arc.dashOffset}
            transform="rotate(-90 55 55)"
            className="transition-all duration-500"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#ECEDEE" fontSize="20" fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#687076" fontSize="10">
          matcher
        </text>
      </svg>
      <div className="space-y-2">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: arc.color }} />
            <span className="text-[#9BA1A6] text-xs">
              {arc.label}: <span className="text-[#ECEDEE] font-semibold">{arc.value}</span>{" "}
              <span className="text-[#687076]">({Math.round(arc.pct * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Goal Trend Chart ───────────────────────────────────────────────────────
function GoalTrendChart({ data }: { data: { label: string; white: number; green: number }[] }) {
  if (data.length === 0) return null;
  const maxGoals = Math.max(...data.map((d) => Math.max(d.white + d.green, 1)));
  const barWidth = Math.max(16, Math.min(28, 260 / data.length));
  const chartHeight = 100;
  const chartWidth = Math.max(260, data.length * (barWidth + 6));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg width={chartWidth} height={chartHeight + 28} viewBox={`0 0 ${chartWidth} ${chartHeight + 28}`}>
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1="0"
            y1={chartHeight * (1 - pct)}
            x2={chartWidth}
            y2={chartHeight * (1 - pct)}
            stroke="#2a2a2a"
            strokeWidth="0.5"
            strokeDasharray="4,4"
          />
        ))}
        {data.map((d, i) => {
          const x = i * (barWidth + 6) + 3;
          const totalH = ((d.white + d.green) / maxGoals) * chartHeight;
          const whiteH = (d.white / maxGoals) * chartHeight;
          const greenH = (d.green / maxGoals) * chartHeight;
          return (
            <g key={i}>
              <rect x={x} y={chartHeight - totalH} width={barWidth} height={whiteH} rx="2" fill="rgba(255,255,255,0.6)" />
              <rect x={x} y={chartHeight - greenH} width={barWidth} height={greenH} rx="2" fill="rgba(34,197,94,0.6)" />
              <text x={x + barWidth / 2} y={chartHeight - totalH - 4} textAnchor="middle" fill="#9BA1A6" fontSize="9" fontWeight="600">
                {d.white + d.green}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 14}
                textAnchor="middle"
                fill="#687076"
                fontSize="7"
                transform={`rotate(-30, ${x + barWidth / 2}, ${chartHeight + 14})`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Recent Form Strip ──────────────────────────────────────────────────────
function RecentForm({ matches }: { matches: { name: string; whiteScore: number; greenScore: number }[] }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {matches.map((m, i) => {
        const isDraw = m.whiteScore === m.greenScore;
        const isWhiteWin = m.whiteScore > m.greenScore;
        return (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 border-b border-[#2a2a2a] last:border-0"
          >
            <span className="text-[#687076] text-xs flex-1 truncate pr-2">{m.name}</span>
            <div className="flex items-center gap-1">
              <span className={`text-sm font-bold ${isWhiteWin ? 'text-white' : 'text-[#9BA1A6]'}`}>
                {m.whiteScore}
              </span>
              <span className="text-[#687076] text-xs">-</span>
              <span className={`text-sm font-bold ${!isDraw && !isWhiteWin ? 'text-[#22C55E]' : 'text-[#9BA1A6]'}`}>
                {m.greenScore}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PIR Top Players ────────────────────────────────────────────────────────
function PirTopList({ pirData, onPlayerClick }: { pirData: any[]; onPlayerClick: (name: string) => void }) {
  const top5 = useMemo(() => {
    if (!pirData) return [];
    return [...pirData]
      .filter((p) => p.matchesPlayed >= 3)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
  }, [pirData]);

  if (top5.length === 0) return null;
  const maxRating = top5[0]?.rating ?? 1500;
  const minRating = Math.min(...top5.map((p) => p.rating));
  const range = maxRating - minRating || 1;

  return (
    <div className="space-y-2">
      {top5.map((p, i) => {
        const barWidth = ((p.rating - minRating + range * 0.1) / (range * 1.1)) * 100;
        const trendColor =
          p.trendLabel === "rising" || p.trendLabel === "slightly_rising"
            ? "#22C55E"
            : p.trendLabel === "falling" || p.trendLabel === "slightly_falling"
              ? "#EF4444"
              : "#687076";
        return (
          <button
            key={p.playerKey}
            onClick={() => onPlayerClick(p.playerKey)}
            className="w-full flex items-center gap-2 group hover:bg-[#1a1a1a] rounded-lg px-2 py-1 transition-colors"
          >
            <span className="text-[#687076] text-xs w-4 text-right">{i + 1}.</span>
            <span className="text-[#ECEDEE] text-xs w-28 truncate text-left group-hover:text-[#0a7ea4] transition-colors">
              {p.playerKey}
            </span>
            <div className="flex-1 h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0a7ea4] to-[#0a7ea4]/50 transition-all duration-500"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-[#0a7ea4] font-bold text-xs w-10 text-right">{Math.round(p.rating)}</span>
            <span className="text-[10px] w-4" style={{ color: trendColor }}>
              {p.trendLabel === "rising"
                ? "▲"
                : p.trendLabel === "slightly_rising"
                  ? "△"
                  : p.trendLabel === "falling"
                    ? "▼"
                    : p.trendLabel === "slightly_falling"
                      ? "▽"
                      : "─"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function OverviewTab({ stats, pirData, onPlayerClick }: OverviewTabProps) {
  const totalGoals = (stats?.totalGoalsWhite ?? 0) + (stats?.totalGoalsGreen ?? 0);
  const avgGoals = stats?.totalMatches ? (totalGoals / stats.totalMatches).toFixed(1) : "0";

  // Build goal trend from recent form
  const goalTrend = useMemo(() => {
    if (!stats?.recentForm) return [];
    return [...stats.recentForm].reverse().map((m: any) => ({
      label: m.name?.split(" ")[0] ?? "",
      white: m.whiteScore,
      green: m.greenScore,
    }));
  }, [stats]);

  // Top scorer quick stat
  const topScorer = stats?.topScorers?.[0];

  if (!stats) {
    return (
      <div className="text-center py-16 text-[#687076]">
        <p className="text-sm">Ingen data tillgänglig för vald period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Matcher" value={stats.totalMatches} icon={Activity} color="#0a7ea4" />
        <StatCard
          label="Totala mål"
          value={totalGoals}
          sub={`Snitt ${avgGoals}/match`}
          icon={Target}
          color="#F59E0B"
        />
        <StatCard
          label="Vita vinster"
          value={stats.whiteWins}
          sub={stats.totalMatches ? `${Math.round((stats.whiteWins / stats.totalMatches) * 100)}%` : ""}
          icon={Trophy}
          color="#FFFFFF"
        />
        <StatCard
          label="Gröna vinster"
          value={stats.greenWins}
          sub={stats.totalMatches ? `${Math.round((stats.greenWins / stats.totalMatches) * 100)}%` : ""}
          icon={Trophy}
          color="#22C55E"
        />
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Win distribution */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-4 flex items-center gap-2">
            <Trophy size={14} className="text-[#0a7ea4]" />
            Vinstfördelning
          </h3>
          <WinDonut whiteWins={stats.whiteWins} greenWins={stats.greenWins} draws={stats.draws} />
        </div>

        {/* Recent form */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity size={14} className="text-[#0a7ea4]" />
            Senaste matcherna
          </h3>
          <RecentForm matches={stats.recentForm} />
        </div>
      </div>

      {/* Goal trend */}
      {goalTrend.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#0a7ea4]" />
            Mål per match (trend)
          </h3>
          <GoalTrendChart data={goalTrend} />
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 rounded-sm bg-white/60" />
              <span className="text-[#687076] text-[10px]">Vita</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 rounded-sm bg-emerald-500/60" />
              <span className="text-[#687076] text-[10px]">Gröna</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom row: Top scorer + PIR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top scorer highlight */}
        {topScorer && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
              <Target size={14} className="text-amber-400" />
              Poängledare
            </h3>
            <button
              onClick={() => onPlayerClick(topScorer.name)}
              className="w-full text-left hover:bg-[#2a2a2a]/50 rounded-lg p-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#ECEDEE] font-bold text-lg">{topScorer.name}</p>
                  <p className="text-[#687076] text-xs mt-0.5">
                    {topScorer.goals} mål + {topScorer.assists} assist
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-bold text-2xl">{topScorer.points}</p>
                  <p className="text-[#687076] text-[10px]">poäng</p>
                </div>
              </div>
            </button>
            {/* Top 3 quick list */}
            {stats.topScorers?.slice(1, 4).map((p: any, i: number) => (
              <button
                key={p.name}
                onClick={() => onPlayerClick(p.name)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2a2a]/30 rounded-md transition-colors"
              >
                <span className="text-[#687076] text-xs">
                  {i + 2}. <span className="text-[#9BA1A6]">{p.name}</span>
                </span>
                <span className="text-[#9BA1A6] text-xs font-medium">
                  {p.goals}+{p.assists}={p.points}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* PIR Top 5 */}
        {pirData && pirData.length > 0 && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
              <Flame size={14} className="text-[#0a7ea4]" />
              PIR Topp 5
            </h3>
            <PirTopList pirData={pirData} onPlayerClick={onPlayerClick} />
          </div>
        )}
      </div>

      {/* Goal type distribution */}
      {stats.goalTypes && stats.goalTypes.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-4 flex items-center gap-2">
            <Target size={14} className="text-amber-400" />
            Måltyper
          </h3>
          <div className="space-y-2">
            {stats.goalTypes.map((gt: any) => {
              const maxCount = stats.goalTypes[0]?.count ?? 1;
              const pct = (gt.count / maxCount) * 100;
              const label = gt.type === "even" ? "Lika styrka" : gt.type === "pp" ? "Powerplay" : gt.type === "sh" ? "Boxplay" : gt.type === "ps" ? "Straffslag" : gt.type === "en" ? "Tomt mål" : gt.type || "Okänd";
              return (
                <div key={gt.type} className="flex items-center gap-3">
                  <span className="text-[#9BA1A6] text-xs w-24 text-right">{label}</span>
                  <div className="flex-1 h-3 bg-[#0a0a0a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-500/30 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[#ECEDEE] text-xs font-bold w-8 text-right">{gt.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player records */}
      {(stats.playerRecordGoals || stats.playerRecordAssists || stats.playerRecordPoints) && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Users size={14} className="text-[#0a7ea4]" />
            Spelarrekord (enskild match)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.playerRecordGoals && (
              <button
                onClick={() => onPlayerClick(stats.playerRecordGoals.playerName)}
                className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a] text-left hover:border-[#0a7ea4]/30 transition-colors"
              >
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Flest mål</p>
                <p className="text-amber-400 font-bold text-lg mt-1">{stats.playerRecordGoals.goals} mål</p>
                <p className="text-[#9BA1A6] text-xs mt-0.5 truncate">{stats.playerRecordGoals.playerName}</p>
                <p className="text-[#687076] text-[10px] truncate">{stats.playerRecordGoals.matchName}</p>
              </button>
            )}
            {stats.playerRecordAssists && (
              <button
                onClick={() => onPlayerClick(stats.playerRecordAssists.playerName)}
                className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a] text-left hover:border-[#0a7ea4]/30 transition-colors"
              >
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Flest assist</p>
                <p className="text-[#0a7ea4] font-bold text-lg mt-1">{stats.playerRecordAssists.assists} assist</p>
                <p className="text-[#9BA1A6] text-xs mt-0.5 truncate">{stats.playerRecordAssists.playerName}</p>
                <p className="text-[#687076] text-[10px] truncate">{stats.playerRecordAssists.matchName}</p>
              </button>
            )}
            {stats.playerRecordPoints && (
              <button
                onClick={() => onPlayerClick(stats.playerRecordPoints.playerName)}
                className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a] text-left hover:border-[#0a7ea4]/30 transition-colors"
              >
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Flest poäng</p>
                <p className="text-emerald-400 font-bold text-lg mt-1">{stats.playerRecordPoints.points} poäng</p>
                <p className="text-[#9BA1A6] text-xs mt-0.5 truncate">{stats.playerRecordPoints.playerName}</p>
                <p className="text-[#687076] text-[10px] truncate">{stats.playerRecordPoints.matchName}</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Monthly MVP */}
      {stats.monthlyMvp && stats.monthlyMvp.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" />
            Månadens spelare
          </h3>
          <div className="space-y-2">
            {stats.monthlyMvp.map((mvp: any) => {
              const [year, month] = mvp.month.split("-");
              const monthNames = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
              const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
              return (
                <button
                  key={mvp.month}
                  onClick={() => onPlayerClick(mvp.playerName)}
                  className="w-full flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2 border border-[#2a2a2a] hover:border-[#0a7ea4]/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[#687076] text-xs w-16">{monthLabel}</span>
                    <span className="text-[#ECEDEE] text-xs font-medium">{mvp.playerName}</span>
                  </div>
                  <span className="text-[#9BA1A6] text-[10px]">
                    {mvp.goals}M + {mvp.assists}A = {mvp.points}P ({mvp.matches} matcher)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Records */}
      {(stats.biggestWinWhite || stats.biggestWinGreen || stats.highestScoringMatch) && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Flame size={14} className="text-amber-400" />
            Rekord
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.biggestWinWhite && (
              <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a]">
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Största vita vinst</p>
                <p className="text-white font-bold text-sm mt-1">
                  {stats.biggestWinWhite.whiteScore}-{stats.biggestWinWhite.greenScore}
                </p>
                <p className="text-[#687076] text-[10px] mt-0.5 truncate">{stats.biggestWinWhite.name}</p>
              </div>
            )}
            {stats.biggestWinGreen && (
              <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a]">
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Största gröna vinst</p>
                <p className="text-emerald-400 font-bold text-sm mt-1">
                  {stats.biggestWinGreen.whiteScore}-{stats.biggestWinGreen.greenScore}
                </p>
                <p className="text-[#687076] text-[10px] mt-0.5 truncate">{stats.biggestWinGreen.name}</p>
              </div>
            )}
            {stats.highestScoringMatch && (
              <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a]">
                <p className="text-[#687076] text-[10px] uppercase tracking-wider">Flest mål i en match</p>
                <p className="text-[#0a7ea4] font-bold text-sm mt-1">
                  {stats.highestScoringMatch.whiteScore}-{stats.highestScoringMatch.greenScore} (
                  {stats.highestScoringMatch.whiteScore + stats.highestScoringMatch.greenScore} mål)
                </p>
                <p className="text-[#687076] text-[10px] mt-0.5 truncate">{stats.highestScoringMatch.name}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
