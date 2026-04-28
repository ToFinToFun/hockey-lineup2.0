/**
 * PlayersTab – Searchable player list with comprehensive inline profile view
 * Includes: team split, goal types, form curve, full streaks, position bars,
 * detailed match history, sortable player table, goalkeeper stats
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
  Star,
  Crosshair,
  ArrowUpDown,
  Filter,
} from "lucide-react";

interface PlayersTabProps {
  stats: any;
  pirData: any;
  onPlayerClick: (name: string) => void;
  selectedPlayer: string | null;
  onClearSelection: () => void;
  dateFilter?: { from?: string; to?: string };
}

// ─── Constants ──────────────────────────────────────────────────────────────
const positionLabels: Record<string, string> = {
  MV: "Målvakt",
  LW: "Vänsterytter",
  RW: "Högerytter",
  C: "Center",
  B: "Back",
};

const positionColors: Record<string, string> = {
  MV: "#F59E0B",
  LW: "#3B82F6",
  RW: "#8B5CF6",
  C: "#EF4444",
  B: "#22C55E",
};

const goalTypeColors: Record<string, string> = {
  Skott: "#3B82F6",
  Styrning: "#8B5CF6",
  Friläge: "#F59E0B",
  Solo: "#EC4899",
  Straff: "#EF4444",
  Självmål: "#6B7280",
  Övrigt: "#0a7ea4",
};

// ─── Form Curve SVG ─────────────────────────────────────────────────────────
function FormCurve({ matchHistory }: { matchHistory: any[] }) {
  if (matchHistory.length < 2) return null;

  const recentMatches = [...matchHistory].reverse().slice(-10);
  const maxPoints = Math.max(...recentMatches.map((m) => m.goals + m.assists), 1);
  const chartWidth = 300;
  const chartHeight = 90;
  const pad = { top: 18, bottom: 28, left: 10, right: 10 };
  const plotW = chartWidth - pad.left - pad.right;
  const plotH = chartHeight - pad.top - pad.bottom;
  const stepX = recentMatches.length > 1 ? plotW / (recentMatches.length - 1) : plotW / 2;

  const points = recentMatches.map((m, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + plotH - ((m.goals + m.assists) / maxPoints) * plotH,
    pts: m.goals + m.assists,
    result: m.result,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${pad.top + plotH} L ${points[0]!.x} ${pad.top + plotH} Z`;

  return (
    <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
      <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
        <Activity size={14} className="text-[#0a7ea4]" />
        Formkurva
      </h3>
      <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full">
        {[0, 0.5, 1].map((pct) => (
          <line
            key={pct}
            x1={pad.left}
            y1={pad.top + plotH * (1 - pct)}
            x2={pad.left + plotW}
            y2={pad.top + plotH * (1 - pct)}
            stroke="#2a2a2a"
            strokeWidth="0.5"
            strokeDasharray="3,3"
          />
        ))}
        <path d={areaPath} fill="url(#formGrad)" />
        <path d={linePath} fill="none" stroke="#0a7ea4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const dotColor = p.result === "win" ? "#22C55E" : p.result === "loss" ? "#EF4444" : "#9BA1A6";
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={4} fill={dotColor} stroke="#111" strokeWidth="1.5" />
              {p.pts > 0 && (
                <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#0a7ea4" fontSize="8" fontWeight="700">
                  {p.pts}p
                </text>
              )}
              <text x={p.x} y={chartHeight - 6} textAnchor="middle" fill="#687076" fontSize="7">
                {i + 1}
              </text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="formGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a7ea4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0a7ea4" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center justify-center gap-3 mt-2">
        {[
          { color: "#22C55E", label: "Vinst" },
          { color: "#EF4444", label: "Förlust" },
          { color: "#9BA1A6", label: "Oavgjort" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[#687076] text-[9px]">{l.label}</span>
          </div>
        ))}
        <span className="text-[#687076] text-[9px]">Senaste {recentMatches.length}</span>
      </div>
    </div>
  );
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

  const matchesVisible = showAllMatches ? profile.matchHistory : profile.matchHistory.slice(0, 10);

  // Goal type distribution
  const goalTypes = profile.goalTypes ? Object.entries(profile.goalTypes).sort((a: any, b: any) => b[1] - a[1]) : [];
  const maxGoalTypeCount = goalTypes.length > 0 ? Math.max(...goalTypes.map(([, c]: any) => c), 1) : 1;

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
          <p className="text-[#687076] text-xs">{profile.matchesPlayed} matcher spelade</p>
        </div>
      </div>

      {/* Summary stats - 3 col */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-3 text-center">
          <p className="text-[#0a7ea4] text-2xl font-bold">{profile.matchesPlayed}</p>
          <p className="text-[#687076] text-[10px] uppercase">Matcher</p>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-3 text-center">
          <p className="text-emerald-400 text-2xl font-bold">{profile.wins}</p>
          <p className="text-[#687076] text-[10px] uppercase">Vinster</p>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-3 text-center">
          <p className="text-amber-400 text-2xl font-bold">{profile.winRate}%</p>
          <p className="text-[#687076] text-[10px] uppercase">Vinstprocent</p>
        </div>
      </div>

      {/* Team split + losses/draws */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#2a2a2a]">
          <p className="text-white/70 text-sm font-bold">{profile.matchesWhite}</p>
          <p className="text-[#687076] text-[9px] uppercase">Vita</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#2a2a2a]">
          <p className="text-emerald-400/70 text-sm font-bold">{profile.matchesGreen}</p>
          <p className="text-[#687076] text-[9px] uppercase">Gröna</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#2a2a2a]">
          <p className="text-red-400 text-sm font-bold">{profile.losses}</p>
          <p className="text-[#687076] text-[9px] uppercase">Förluster</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center border border-[#2a2a2a]">
          <p className="text-[#9BA1A6] text-sm font-bold">{profile.draws}</p>
          <p className="text-[#687076] text-[9px] uppercase">Oavgjort</p>
        </div>
      </div>

      {/* Goals, Assists, Points, GWG */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Mål", value: profile.totalGoals, color: "text-amber-400", icon: Target, perMatch: true },
          { label: "Assist", value: profile.totalAssists, color: "text-sky-400", icon: TrendingUp, perMatch: true },
          { label: "Poäng", value: profile.totalGoals + profile.totalAssists, color: "text-[#0a7ea4]", icon: Trophy, perMatch: true },
          { label: "GWG", value: profile.totalGwg, color: "text-red-400", icon: Star, perMatch: false },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Icon size={12} className={s.color} />
                <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
              </div>
              <p className="text-[#687076] text-[10px] uppercase">{s.label}</p>
              {s.perMatch && profile.matchesPlayed > 0 && (
                <p className="text-[#687076] text-[9px]">
                  {(s.value / profile.matchesPlayed).toFixed(1)}/match
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Form curve */}
      <FormCurve matchHistory={profile.matchHistory} />

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
                <p className="text-[#0a7ea4] text-3xl font-bold">{Math.round(playerPir.rating)}</p>
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

        {/* Streaks - all 4 types */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Flame size={14} className="text-red-400" />
            Sviter
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {/* Longest Win Streak */}
            <div className="bg-[#0a0a0a] rounded-lg p-2.5 border border-[#2a2a2a]">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center">
                  <Flame size={10} className="text-emerald-400" />
                </div>
                <span className="text-[#687076] text-[9px] uppercase">Vinstsvit</span>
              </div>
              <p className="text-emerald-400 text-lg font-bold">
                {profile.streaks.longestWinStreak}{" "}
                <span className="text-xs font-normal text-[#687076]">matcher</span>
              </p>
              {profile.streaks.currentWinStreak > 0 && (
                <p className="text-emerald-400/70 text-[9px]">Pågående: {profile.streaks.currentWinStreak}</p>
              )}
            </div>
            {/* Longest Unbeaten */}
            <div className="bg-[#0a0a0a] rounded-lg p-2.5 border border-[#2a2a2a]">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded bg-[#0a7ea4]/20 flex items-center justify-center">
                  <Shield size={10} className="text-[#0a7ea4]" />
                </div>
                <span className="text-[#687076] text-[9px] uppercase">Obesegrad</span>
              </div>
              <p className="text-[#0a7ea4] text-lg font-bold">
                {profile.streaks.longestUnbeatenStreak}{" "}
                <span className="text-xs font-normal text-[#687076]">matcher</span>
              </p>
              {profile.streaks.currentUnbeatenStreak > 1 && (
                <p className="text-[#0a7ea4]/70 text-[9px]">Pågående: {profile.streaks.currentUnbeatenStreak}</p>
              )}
            </div>
            {/* Longest Loss Streak */}
            <div className="bg-[#0a0a0a] rounded-lg p-2.5 border border-[#2a2a2a]">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded bg-red-500/20 flex items-center justify-center">
                  <TrendingDown size={10} className="text-red-400" />
                </div>
                <span className="text-[#687076] text-[9px] uppercase">Förlustsvit</span>
              </div>
              <p className="text-red-400 text-lg font-bold">
                {profile.streaks.longestLossStreak}{" "}
                <span className="text-xs font-normal text-[#687076]">matcher</span>
              </p>
              {profile.streaks.currentLossStreak > 0 && (
                <p className="text-red-400/70 text-[9px]">Pågående: {profile.streaks.currentLossStreak}</p>
              )}
            </div>
            {/* Longest Draw Streak */}
            <div className="bg-[#0a0a0a] rounded-lg p-2.5 border border-[#2a2a2a]">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded bg-[#9BA1A6]/20 flex items-center justify-center">
                  <span className="text-[#9BA1A6] text-[8px] font-bold">=</span>
                </div>
                <span className="text-[#687076] text-[9px] uppercase">Oavgjordsvit</span>
              </div>
              <p className="text-[#9BA1A6] text-lg font-bold">
                {profile.streaks.longestDrawStreak}{" "}
                <span className="text-xs font-normal text-[#687076]">matcher</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Position distribution with bars */}
      {profile.positionStats.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Users size={14} className="text-[#0a7ea4]" />
            Positioner
          </h3>
          <div className="space-y-2">
            {profile.positionStats.map((ps: any) => {
              const posColor = positionColors[ps.position] || "#687076";
              const posLabel = positionLabels[ps.position] || ps.position;
              return (
                <div key={ps.position} className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded w-10 text-center flex-shrink-0"
                    style={{ backgroundColor: `${posColor}20`, color: posColor }}
                  >
                    {ps.position}
                  </span>
                  <span className="text-[#9BA1A6] text-xs flex-shrink-0 w-24">{posLabel}</span>
                  <div className="flex-1 h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${ps.percentage}%`,
                        backgroundColor: posColor,
                        minWidth: ps.count > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                  <span className="text-[#687076] text-[10px] flex-shrink-0 w-16 text-right">
                    {ps.count} ({ps.percentage}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Goal type distribution */}
      {goalTypes.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Crosshair size={14} className="text-[#0a7ea4]" />
            Måltyper
          </h3>
          <div className="space-y-2">
            {goalTypes.map(([type, count]: any) => {
              const color = goalTypeColors[type] || "#0a7ea4";
              const pct = profile.totalGoals > 0 ? Math.round((count / profile.totalGoals) * 100) : 0;
              const barPct = Math.round((count / maxGoalTypeCount) * 100);
              return (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded w-20 text-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {type}
                  </span>
                  <div className="flex-1 h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barPct}%`, backgroundColor: color, minWidth: count > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="text-[#687076] text-[10px] flex-shrink-0 w-16 text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Best match */}
      {profile.bestMatch && (
        <div className="bg-gradient-to-br from-amber-500/5 to-[#111] rounded-xl border border-amber-500/20 p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-2 flex items-center gap-2">
            <Star size={14} className="text-amber-400 fill-amber-400" />
            Bästa match
          </h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Star size={18} className="text-amber-400 fill-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#ECEDEE] text-xs font-medium truncate">{profile.bestMatch.matchName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: profile.bestMatch.team === "green" ? "#22C55E" : "#ECEDEE",
                      border: profile.bestMatch.team === "white" ? "1px solid #687076" : "none",
                    }}
                  />
                  <span className="text-[#687076] text-[10px]">
                    {profile.bestMatch.team === "white" ? "Vita" : "Gröna"}
                  </span>
                </div>
                <span className="text-[#687076] text-[10px]">
                  {profile.bestMatch.whiteScore}-{profile.bestMatch.greenScore}
                </span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor:
                      profile.bestMatch.result === "win" ? "#22C55E20" : profile.bestMatch.result === "loss" ? "#EF444420" : "#9BA1A620",
                    color: profile.bestMatch.result === "win" ? "#22C55E" : profile.bestMatch.result === "loss" ? "#EF4444" : "#9BA1A6",
                  }}
                >
                  {profile.bestMatch.result === "win" ? "Vinst" : profile.bestMatch.result === "loss" ? "Förlust" : "Oavgjort"}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-amber-400 text-lg font-bold">{profile.bestMatch.points}p</p>
              <p className="text-[#687076] text-[9px]">
                {profile.bestMatch.goals}G {profile.bestMatch.assists}A
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Match history - detailed */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-[#ECEDEE] text-sm font-semibold flex items-center gap-2">
            <Activity size={14} className="text-[#0a7ea4]" />
            Matchhistorik
          </h3>
        </div>

        <div className="divide-y divide-[#2a2a2a]/50">
          {matchesVisible.map((m: any, i: number) => {
            const resultColor = m.result === "win" ? "#22C55E" : m.result === "loss" ? "#EF4444" : "#9BA1A6";
            const resultText = m.result === "win" ? "V" : m.result === "loss" ? "F" : "O";
            const teamColor = m.team === "green" ? "#22C55E" : "#ECEDEE";
            const posColor = positionColors[m.position] || "#687076";

            return (
              <div key={m.matchId || i} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {/* Result badge */}
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-black flex-shrink-0"
                    style={{ backgroundColor: resultColor }}
                  >
                    {resultText}
                  </div>

                  {/* Match info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[#ECEDEE] text-xs truncate">{m.matchName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: teamColor,
                            border: m.team === "white" ? "1px solid #687076" : "none",
                          }}
                        />
                        <span className="text-[#687076] text-[10px]">{m.team === "white" ? "Vita" : "Gröna"}</span>
                      </div>
                      {m.position && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${posColor}20`, color: posColor }}
                        >
                          {m.position}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-sm font-bold ${m.whiteScore > m.greenScore ? "text-white" : "text-[#9BA1A6]"}`}>
                      {m.whiteScore}
                    </span>
                    <span className="text-[#687076] text-xs">-</span>
                    <span className={`text-sm font-bold ${m.greenScore > m.whiteScore ? "text-emerald-400" : "text-[#9BA1A6]"}`}>
                      {m.greenScore}
                    </span>
                  </div>

                  {/* Goals + Assists */}
                  {(m.goals > 0 || m.assists > 0) && (
                    <span className="text-[#0a7ea4] text-xs font-bold flex-shrink-0 ml-1">
                      {m.goals > 0 ? `${m.goals}G` : ""}
                      {m.goals > 0 && m.assists > 0 ? " " : ""}
                      {m.assists > 0 ? `${m.assists}A` : ""}
                    </span>
                  )}
                </div>

                {/* Goal details */}
                {m.goalDetails && m.goalDetails.length > 0 && (
                  <div className="mt-1.5 pl-8 flex flex-wrap gap-1">
                    {m.goalDetails.map((gd: any, j: number) => (
                      <span key={j} className="text-[9px] bg-[#0a7ea4]/15 text-[#0a7ea4] px-1.5 py-0.5 rounded">
                        {gd.other ? gd.other : "Mål"}
                        {gd.assist ? ` (${gd.assist})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
            MVP-utmärkelser
          </h3>
          <div className="space-y-1.5">
            {profile.mvpMonths.map((m: any, i: number) => (
              <div
                key={i}
                className="bg-gradient-to-r from-amber-500/10 to-amber-500/5 rounded-lg p-2.5 border border-amber-500/30 flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Trophy size={14} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-amber-400 font-bold text-xs">{m.month}</p>
                  <p className="text-[#9BA1A6] text-[10px]">
                    {m.points} poäng ({m.goals}m {m.assists}a)
                    {m.gwg > 0 && ` · ${m.gwg} GWG`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Player Table ──────────────────────────────────────────────────
type SortKey = "name" | "matches" | "goals" | "assists" | "points" | "gwg" | "winRate";
type ViewMode = "all" | "goalkeepers";

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
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // Goalkeeper stats from score router
  const gkInput = useMemo(() => dateFilter ?? {}, [dateFilter]);
  const { data: goalkeeperStats } = trpc.score.goalkeeperStats.useQuery(gkInput);

  // If a player is selected, show their profile
  if (selectedPlayer) {
    return <PlayerProfile name={selectedPlayer} pirData={pirData} onBack={onClearSelection} />;
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

  // Sort players
  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "matches":
          aVal = a.matches ?? 0;
          bVal = b.matches ?? 0;
          break;
        case "goals":
          aVal = a.goals ?? 0;
          bVal = b.goals ?? 0;
          break;
        case "assists":
          aVal = a.assists ?? 0;
          bVal = b.assists ?? 0;
          break;
        case "points":
          aVal = a.points ?? 0;
          bVal = b.points ?? 0;
          break;
        case "gwg":
          aVal = a.gwg ?? 0;
          bVal = b.gwg ?? 0;
          break;
        case "winRate":
          aVal = a.winRate ?? 0;
          bVal = b.winRate ?? 0;
          break;
        default:
          return 0;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [players, sortKey, sortAsc]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedPlayers;
    const q = search.toLowerCase();
    return sortedPlayers.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [sortedPlayers, search]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, sortKeyVal, width }: { label: string; sortKeyVal: SortKey; width: string }) => (
    <button
      onClick={() => handleSort(sortKeyVal)}
      className={`${width} text-center flex items-center justify-center gap-0.5 hover:text-[#ECEDEE] transition-colors ${
        sortKey === sortKeyVal ? "text-[#0a7ea4]" : ""
      }`}
    >
      {label}
      {sortKey === sortKeyVal && (
        <span className="text-[8px]">{sortAsc ? "▲" : "▼"}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* View mode toggle + Search */}
      <div className="flex gap-2">
        <div className="flex rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
          <button
            onClick={() => setViewMode("all")}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              viewMode === "all" ? "bg-[#0a7ea4]/10 text-[#0a7ea4]" : "text-[#687076] hover:text-[#9BA1A6]"
            }`}
          >
            <Users size={14} />
          </button>
          <button
            onClick={() => setViewMode("goalkeepers")}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              viewMode === "goalkeepers" ? "bg-[#0a7ea4]/10 text-[#0a7ea4]" : "text-[#687076] hover:text-[#9BA1A6]"
            }`}
          >
            <Shield size={14} />
          </button>
        </div>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687076]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={viewMode === "goalkeepers" ? "Sök målvakt..." : "Sök spelare..."}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-[#ECEDEE] text-sm placeholder:text-[#687076] focus:outline-none focus:border-[#0a7ea4]/50"
          />
        </div>
      </div>

      {viewMode === "goalkeepers" ? (
        /* ─── Goalkeeper Table ─────────────────────────────────────── */
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
          <div className="px-4 py-2 border-b border-[#2a2a2a]">
            <h3 className="text-[#ECEDEE] text-xs font-semibold flex items-center gap-2">
              <Shield size={12} className="text-amber-400" />
              Målvaktsstatistik
            </h3>
          </div>

          {/* Header */}
          <div className="flex items-center px-3 py-1.5 text-[10px] text-[#687076] uppercase tracking-wider border-b border-[#2a2a2a]">
            <span className="flex-1">Målvakt</span>
            <span className="w-8 text-center">M</span>
            <span className="w-8 text-center">V</span>
            <span className="w-8 text-center">F</span>
            <span className="w-12 text-center hidden sm:block">IM/M</span>
            <span className="w-8 text-center">NS</span>
            <span className="w-12 text-center">V%</span>
          </div>

          {!goalkeeperStats || goalkeeperStats.length === 0 ? (
            <div className="text-center py-8 text-[#687076] text-xs">Ingen målvaktsdata</div>
          ) : (
            goalkeeperStats
              .filter((gk: any) => !search.trim() || gk.name.toLowerCase().includes(search.toLowerCase()))
              .map((gk: any, i: number) => (
                <button
                  key={gk.name}
                  onClick={() => onPlayerClick(gk.name)}
                  className={`w-full flex items-center px-3 py-2.5 text-xs hover:bg-[#2a2a2a]/30 transition-colors ${
                    i % 2 === 0 ? "bg-[#1a1a1a]/20" : ""
                  }`}
                >
                  <span className="flex-1 text-left text-[#ECEDEE] truncate font-medium hover:text-[#0a7ea4] transition-colors">
                    {gk.name}
                  </span>
                  <span className="w-8 text-center text-[#9BA1A6]">{gk.matchesPlayed}</span>
                  <span className="w-8 text-center text-emerald-400 font-medium">{gk.wins}</span>
                  <span className="w-8 text-center text-red-400">{gk.losses}</span>
                  <span className="w-12 text-center text-[#9BA1A6] hidden sm:block">{gk.goalsAgainstPerMatch}</span>
                  <span className="w-8 text-center text-amber-400 font-medium">{gk.cleanSheets}</span>
                  <span className="w-12 text-center text-[#0a7ea4] font-medium">{gk.winRate}%</span>
                </button>
              ))
          )}
        </div>
      ) : (
        /* ─── Full Player Table ─────────────────────────────────────── */
        <>
          <p className="text-[#687076] text-[10px]">
            {filtered.length} spelare{search && ` (av ${players.length})`}
          </p>

          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
            {/* Sortable header */}
            <div className="flex items-center px-4 py-2 text-[10px] text-[#687076] uppercase tracking-wider border-b border-[#2a2a2a]">
              <span className="w-6">#</span>
              <SortHeader label="Spelare" sortKeyVal="name" width="flex-1 !justify-start" />
              <SortHeader label="Sp" sortKeyVal="matches" width="w-8" />
              <SortHeader label="M" sortKeyVal="goals" width="w-8" />
              <SortHeader label="A" sortKeyVal="assists" width="w-8" />
              <SortHeader label="P" sortKeyVal="points" width="w-8" />
              <SortHeader label="GWG" sortKeyVal="gwg" width="w-10" />
              <span className="w-14 text-center hidden sm:flex items-center justify-center gap-0.5">
                <button
                  onClick={() => handleSort("winRate")}
                  className={`hover:text-[#ECEDEE] transition-colors ${sortKey === "winRate" ? "text-[#0a7ea4]" : ""}`}
                >
                  V%
                  {sortKey === "winRate" && <span className="text-[8px] ml-0.5">{sortAsc ? "▲" : "▼"}</span>}
                </button>
              </span>
              <span className="w-10 text-center hidden sm:block">Form</span>
              <span className="w-12 text-center hidden sm:block">PIR</span>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-8 text-[#687076] text-xs">Inga spelare hittades</div>
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
                  <span className="w-8 text-center text-[#687076]">
                    {p.matches ?? p.matchesPlayed ?? "—"}
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
                  <span className="w-14 text-center hidden sm:block text-[#0a7ea4]">
                    {p.winRate != null ? `${p.winRate}%` : "—"}
                  </span>
                  {/* Recent form */}
                  <span className="w-10 text-center hidden sm:flex items-center justify-center gap-0.5">
                    {p.recentForm
                      ? p.recentForm.split("").map((r: string, j: number) => (
                          <span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: r === "V" ? "#22C55E" : r === "F" ? "#EF4444" : "#9BA1A6",
                            }}
                          />
                        ))
                      : "—"}
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
        </>
      )}
    </div>
  );
}
