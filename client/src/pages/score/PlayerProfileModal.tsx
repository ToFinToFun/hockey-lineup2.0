import { trpc } from "@/lib/trpc";
import { X, Trophy, Target, TrendingUp, Loader2, Users, Star, Flame, Shield, Activity, Crosshair } from "lucide-react";

interface PlayerProfileModalProps {
  playerName: string;
  onClose: () => void;
}

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

export default function PlayerProfileModal({ playerName, onClose }: PlayerProfileModalProps) {
  const { data: profile, isLoading } = trpc.scoreStats.playerProfile.useQuery({ name: playerName });

  return (
    <div
      className="absolute inset-0 z-50 bg-black/80 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-h-[90%] bg-[#1a1a1a] rounded-t-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#3a3a3a] flex-shrink-0">
          <h2 className="text-[#ECEDEE] font-bold text-base truncate flex-1">{playerName}</h2>
          <button onClick={onClose} className="text-[#687076] hover:text-[#ECEDEE] transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#0a7ea4]" />
          </div>
        ) : !profile || profile.matchesPlayed === 0 ? (
          <div className="flex items-center justify-center py-16 text-[#687076] text-sm">
            Ingen matchdata hittades
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="text-[#0a7ea4] text-xl font-bold">{profile.matchesPlayed}</div>
                <div className="text-[#687076] text-[10px] uppercase">Matcher</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="text-[#22C55E] text-xl font-bold">{profile.wins}</div>
                <div className="text-[#687076] text-[10px] uppercase">Vinster</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="text-[#F59E0B] text-xl font-bold">{profile.winRate}%</div>
                <div className="text-[#687076] text-[10px] uppercase">Vinstprocent</div>
              </div>
            </div>

            {/* Detailed Stats Row */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#2a2a2a] rounded-lg p-2 text-center border border-[#3a3a3a]">
                <div className="text-white/70 text-sm font-bold">{profile.matchesWhite}</div>
                <div className="text-[#687076] text-[9px] uppercase">Vita</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-lg p-2 text-center border border-[#3a3a3a]">
                <div className="text-[#22C55E]/70 text-sm font-bold">{profile.matchesGreen}</div>
                <div className="text-[#687076] text-[9px] uppercase">Gröna</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-lg p-2 text-center border border-[#3a3a3a]">
                <div className="text-[#EF4444] text-sm font-bold">{profile.losses}</div>
                <div className="text-[#687076] text-[9px] uppercase">Förluster</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-lg p-2 text-center border border-[#3a3a3a]">
                <div className="text-[#9BA1A6] text-sm font-bold">{profile.draws}</div>
                <div className="text-[#687076] text-[9px] uppercase">Oavgjort</div>
              </div>
            </div>

            {/* Goals, Assists, Points & GWG */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="flex items-center justify-center gap-1">
                  <Target size={12} className="text-[#0a7ea4]" />
                  <span className="text-[#0a7ea4] text-xl font-bold">{profile.totalGoals}</span>
                </div>
                <div className="text-[#687076] text-[10px] uppercase">Mål</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp size={12} className="text-[#0a7ea4]" />
                  <span className="text-[#0a7ea4] text-xl font-bold">{profile.totalAssists}</span>
                </div>
                <div className="text-[#687076] text-[10px] uppercase">Assist</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#3a3a3a]">
                <div className="flex items-center justify-center gap-1">
                  <Trophy size={12} className="text-[#0a7ea4]" />
                  <span className="text-[#0a7ea4] text-xl font-bold">{profile.totalGoals + profile.totalAssists}</span>
                </div>
                <div className="text-[#687076] text-[10px] uppercase">Poäng</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-xl p-3 text-center border border-[#F59E0B]/30">
                <div className="flex items-center justify-center gap-1">
                  <Star size={12} className="text-[#F59E0B]" />
                  <span className="text-[#F59E0B] text-xl font-bold">{profile.totalGwg}</span>
                </div>
                <div className="text-[#687076] text-[10px] uppercase">GWG</div>
              </div>
            </div>

            {/* Best Match */}
            {profile.bestMatch && (
              <div>
                <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Star size={12} className="text-[#F59E0B]" /> Bästa match
                </h3>
                <div className="bg-gradient-to-r from-[#F59E0B]/10 to-[#F59E0B]/5 rounded-xl p-3 border border-[#F59E0B]/30">
                  <div className="flex items-center gap-2">
                    {/* Star icon */}
                    <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center flex-shrink-0">
                      <Star size={16} className="text-[#F59E0B] fill-[#F59E0B]" />
                    </div>
                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[#ECEDEE] text-xs truncate font-medium">{profile.bestMatch.matchName}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: profile.bestMatch.team === 'green' ? '#22C55E' : '#ECEDEE',
                              border: profile.bestMatch.team === 'white' ? '1px solid #687076' : 'none',
                            }}
                          />
                          <span className="text-[#687076] text-[10px]">{profile.bestMatch.team === 'white' ? 'Vita' : 'Gröna'}</span>
                        </div>
                        <span className="text-[#687076] text-[10px]">
                          {profile.bestMatch.whiteScore}-{profile.bestMatch.greenScore}
                        </span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: profile.bestMatch.result === 'win' ? '#22C55E20' : profile.bestMatch.result === 'loss' ? '#EF444420' : '#9BA1A620',
                            color: profile.bestMatch.result === 'win' ? '#22C55E' : profile.bestMatch.result === 'loss' ? '#EF4444' : '#9BA1A6',
                          }}
                        >
                          {profile.bestMatch.result === 'win' ? 'Vinst' : profile.bestMatch.result === 'loss' ? 'Förlust' : 'Oavgjort'}
                        </span>
                      </div>
                    </div>
                    {/* Points */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-[#F59E0B] text-lg font-bold">{profile.bestMatch.points}p</div>
                      <div className="text-[#687076] text-[9px]">
                        {profile.bestMatch.goals}G {profile.bestMatch.assists}A
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Position Statistics */}
            {profile.positionStats && profile.positionStats.length > 0 && (
              <div>
                <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={12} className="text-[#0a7ea4]" /> Positioner
                </h3>
                <div className="space-y-1.5">
                  {profile.positionStats.map((ps) => {
                    const posColor = positionColors[ps.position] || '#687076';
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
                        <div className="flex-1 h-3 bg-[#3a3a3a] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${ps.percentage}%`, backgroundColor: posColor, minWidth: ps.count > 0 ? '4px' : '0' }}
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

            {/* Goal Type Statistics */}
            {profile.goalTypes && Object.keys(profile.goalTypes).length > 0 && (() => {
              const goalTypeLabels: Record<string, string> = {
                'Skott': 'Skott',
                'Styrning': 'Styrning',
                'Friläge': 'Friläge',
                'Solo': 'Solo',
                'Straff': 'Straff',
                'Självmål': 'Självmål',
                'Övrigt': 'Övrigt',
              };
              const goalTypeColors: Record<string, string> = {
                'Skott': '#3B82F6',
                'Styrning': '#8B5CF6',
                'Friläge': '#F59E0B',
                'Solo': '#EC4899',
                'Straff': '#EF4444',
                'Självmål': '#6B7280',
                'Övrigt': '#0a7ea4',
              };
              const sortedTypes = Object.entries(profile.goalTypes)
                .sort((a, b) => b[1] - a[1]);
              const maxCount = Math.max(...sortedTypes.map(([, c]) => c), 1);

              return (
                <div>
                  <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Crosshair size={12} className="text-[#0a7ea4]" /> Måltyper
                  </h3>
                  <div className="space-y-1.5">
                    {sortedTypes.map(([type, count]) => {
                      const color = goalTypeColors[type] || '#0a7ea4';
                      const label = goalTypeLabels[type] || type;
                      const pct = Math.round((count / profile.totalGoals) * 100);
                      const barPct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded w-20 text-center flex-shrink-0"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            {label}
                          </span>
                          <div className="flex-1 h-3 bg-[#3a3a3a] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${barPct}%`, backgroundColor: color, minWidth: count > 0 ? '4px' : '0' }}
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
              );
            })()}

            {/* Streak Statistics */}
            {profile.streaks && (
              <div>
                <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame size={12} className="text-[#EF4444]" /> Sviter
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {/* Longest Win Streak */}
                  <div className="bg-[#2a2a2a] rounded-lg p-2.5 border border-[#3a3a3a]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded bg-[#22C55E]/20 flex items-center justify-center">
                        <Flame size={10} className="text-[#22C55E]" />
                      </div>
                      <span className="text-[#687076] text-[9px] uppercase">Längsta vinstsvit</span>
                    </div>
                    <div className="text-[#22C55E] text-lg font-bold">{profile.streaks.longestWinStreak} <span className="text-xs font-normal text-[#687076]">matcher</span></div>
                    {profile.streaks.currentWinStreak > 0 && (
                      <div className="text-[#22C55E]/70 text-[9px] mt-0.5">🔥 Pågående: {profile.streaks.currentWinStreak}</div>
                    )}
                  </div>
                  {/* Longest Unbeaten Streak */}
                  <div className="bg-[#2a2a2a] rounded-lg p-2.5 border border-[#3a3a3a]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded bg-[#0a7ea4]/20 flex items-center justify-center">
                        <Shield size={10} className="text-[#0a7ea4]" />
                      </div>
                      <span className="text-[#687076] text-[9px] uppercase">Längsta obesegrad</span>
                    </div>
                    <div className="text-[#0a7ea4] text-lg font-bold">{profile.streaks.longestUnbeatenStreak} <span className="text-xs font-normal text-[#687076]">matcher</span></div>
                    {profile.streaks.currentUnbeatenStreak > 1 && (
                      <div className="text-[#0a7ea4]/70 text-[9px] mt-0.5">🛡️ Pågående: {profile.streaks.currentUnbeatenStreak}</div>
                    )}
                  </div>
                  {/* Longest Loss Streak */}
                  <div className="bg-[#2a2a2a] rounded-lg p-2.5 border border-[#3a3a3a]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded bg-[#EF4444]/20 flex items-center justify-center">
                        <TrendingUp size={10} className="text-[#EF4444] rotate-180" />
                      </div>
                      <span className="text-[#687076] text-[9px] uppercase">Längsta förlustsvit</span>
                    </div>
                    <div className="text-[#EF4444] text-lg font-bold">{profile.streaks.longestLossStreak} <span className="text-xs font-normal text-[#687076]">matcher</span></div>
                    {profile.streaks.currentLossStreak > 0 && (
                      <div className="text-[#EF4444]/70 text-[9px] mt-0.5">Pågående: {profile.streaks.currentLossStreak}</div>
                    )}
                  </div>
                  {/* Longest Draw Streak */}
                  <div className="bg-[#2a2a2a] rounded-lg p-2.5 border border-[#3a3a3a]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded bg-[#9BA1A6]/20 flex items-center justify-center">
                        <span className="text-[#9BA1A6] text-[8px] font-bold">=</span>
                      </div>
                      <span className="text-[#687076] text-[9px] uppercase">Längsta oavgjordsvit</span>
                    </div>
                    <div className="text-[#9BA1A6] text-lg font-bold">{profile.streaks.longestDrawStreak} <span className="text-xs font-normal text-[#687076]">matcher</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Form Curve */}
            {profile.matchHistory.length >= 2 && (() => {
              // Show last 10 matches in chronological order (oldest first)
              const recentMatches = [...profile.matchHistory].reverse().slice(-10);
              const maxPoints = Math.max(...recentMatches.map(m => m.goals + m.assists), 1);
              const chartWidth = 280;
              const chartHeight = 80;
              const padding = { top: 15, bottom: 25, left: 8, right: 8 };
              const plotW = chartWidth - padding.left - padding.right;
              const plotH = chartHeight - padding.top - padding.bottom;
              const stepX = recentMatches.length > 1 ? plotW / (recentMatches.length - 1) : plotW / 2;

              const points = recentMatches.map((m, i) => ({
                x: padding.left + i * stepX,
                y: padding.top + plotH - ((m.goals + m.assists) / maxPoints) * plotH,
                pts: m.goals + m.assists,
                result: m.result,
                goals: m.goals,
                assists: m.assists,
              }));

              // Build the area path
              const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              const areaPath = linePath + ` L ${points[points.length - 1]!.x} ${padding.top + plotH} L ${points[0]!.x} ${padding.top + plotH} Z`;

              return (
                <div>
                  <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={12} className="text-[#0a7ea4]" /> Formkurva
                  </h3>
                  <div className="bg-[#2a2a2a] rounded-xl p-3 border border-[#3a3a3a]">
                    <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full">
                      {/* Grid lines */}
                      {[0, 0.5, 1].map(pct => (
                        <line key={pct}
                          x1={padding.left} y1={padding.top + plotH * (1 - pct)}
                          x2={padding.left + plotW} y2={padding.top + plotH * (1 - pct)}
                          stroke="#3a3a3a" strokeWidth="0.5" strokeDasharray="3,3" />
                      ))}
                      {/* Area fill */}
                      <path d={areaPath} fill="url(#formGradient)" />
                      {/* Line */}
                      <path d={linePath} fill="none" stroke="#0a7ea4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      {/* Dots and labels */}
                      {points.map((p, i) => {
                        const dotColor = p.result === 'win' ? '#22C55E' : p.result === 'loss' ? '#EF4444' : '#9BA1A6';
                        return (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r={4} fill={dotColor} stroke="#1a1a1a" strokeWidth="1.5" />
                            {p.pts > 0 && (
                              <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#0a7ea4" fontSize="8" fontWeight="700">
                                {p.pts}p
                              </text>
                            )}
                            <text x={p.x} y={chartHeight - 4} textAnchor="middle" fill="#687076" fontSize="7">
                              {i + 1}
                            </text>
                          </g>
                        );
                      })}
                      <defs>
                        <linearGradient id="formGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0a7ea4" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#0a7ea4" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="flex items-center justify-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        <span className="text-[#687076] text-[9px]">Vinst</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
                        <span className="text-[#687076] text-[9px]">Förlust</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#9BA1A6]" />
                        <span className="text-[#687076] text-[9px]">Oavgjort</span>
                      </div>
                      <span className="text-[#687076] text-[9px]">Senaste {recentMatches.length} matcher</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MVP History */}
            {profile.mvpMonths && profile.mvpMonths.length > 0 && (
              <div>
                <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Trophy size={12} className="text-[#F59E0B]" /> MVP-utmärkelser
                </h3>
                <div className="space-y-1.5">
                  {profile.mvpMonths.map((mvp, i) => (
                    <div key={i} className="bg-gradient-to-r from-[#F59E0B]/10 to-[#F59E0B]/5 rounded-lg p-2.5 border border-[#F59E0B]/30 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#F59E0B]/20 flex items-center justify-center flex-shrink-0">
                        <Trophy size={14} className="text-[#F59E0B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#F59E0B] font-bold text-xs">{mvp.month}</p>
                        <p className="text-[#9BA1A6] text-[10px]">
                          {mvp.points} poäng ({mvp.goals}m {mvp.assists}a){mvp.gwg > 0 && ` · ${mvp.gwg} GWG`}
                        </p>
                      </div>
                      <span className="text-lg flex-shrink-0">🏆</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match History */}
            <div>
              <h3 className="text-[#ECEDEE] font-bold text-xs mb-2 uppercase tracking-wider">Matchhistorik</h3>
              <div className="space-y-1">
                {profile.matchHistory.map((match, i) => {
                  const resultColor = match.result === 'win' ? '#22C55E' : match.result === 'loss' ? '#EF4444' : '#9BA1A6';
                  const resultText = match.result === 'win' ? 'V' : match.result === 'loss' ? 'F' : 'O';
                  const teamColor = match.team === 'green' ? '#22C55E' : '#ECEDEE';
                  const posColor = positionColors[match.position] || '#687076';

                  return (
                    <div key={i} className="bg-[#2a2a2a] rounded-lg p-2.5 border border-[#3a3a3a]">
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
                          <div className="text-[#ECEDEE] text-xs truncate">{match.matchName}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {/* Team indicator */}
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor, border: match.team === 'white' ? '1px solid #687076' : 'none' }} />
                              <span className="text-[#687076] text-[10px]">{match.team === 'white' ? 'Vita' : 'Gröna'}</span>
                            </div>
                            {/* Position badge */}
                            {match.position && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: `${posColor}20`, color: posColor }}
                              >
                                {match.position}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-sm font-bold ${match.whiteScore > match.greenScore ? 'text-white' : 'text-[#9BA1A6]'}`}>
                            {match.whiteScore}
                          </span>
                          <span className="text-[#687076] text-xs">-</span>
                          <span className={`text-sm font-bold ${match.greenScore > match.whiteScore ? 'text-[#22C55E]' : 'text-[#9BA1A6]'}`}>
                            {match.greenScore}
                          </span>
                        </div>

                        {/* Goals + Assists in this match */}
                        {(match.goals > 0 || match.assists > 0) && (
                          <span className="text-[#0a7ea4] text-xs font-bold flex-shrink-0 ml-1">
                            {match.goals > 0 ? `${match.goals}G` : ''}{match.goals > 0 && match.assists > 0 ? ' ' : ''}{match.assists > 0 ? `${match.assists}A` : ''}
                          </span>
                        )}
                      </div>

                      {/* Goal details */}
                      {match.goalDetails.length > 0 && (
                        <div className="mt-1.5 pl-8 flex flex-wrap gap-1">
                          {match.goalDetails.map((gd, j) => (
                            <span key={j} className="text-[9px] bg-[#0a7ea4]/15 text-[#0a7ea4] px-1.5 py-0.5 rounded">
                              ⚽ {gd.other ? gd.other : 'Mål'}{gd.assist ? ` (${gd.assist})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
