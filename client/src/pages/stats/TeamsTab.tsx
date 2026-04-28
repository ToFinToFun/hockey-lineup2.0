/**
 * TeamsTab – Team comparison (Vita vs Gröna) with visual bars + Head-to-Head player comparison
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Shield, Target, Trophy, Users, Flame, Swords, ChevronDown, Search } from "lucide-react";
import { IMAGES } from "@/lib/scoreConstants";

interface TeamsTabProps {
  teamData: any;
  stats: any;
  dateFilter?: { from?: string; to?: string };
}

// ─── Comparison Bar ─────────────────────────────────────────────────────────
function ComparisonBar({
  label,
  whiteValue,
  greenValue,
  format,
}: {
  label: string;
  whiteValue: number;
  greenValue: number;
  format?: (v: number) => string;
}) {
  const total = whiteValue + greenValue || 1;
  const whitePct = (whiteValue / total) * 100;
  const greenPct = (greenValue / total) * 100;
  const fmt = format ?? ((v: number) => String(v));
  const whiteWins = whiteValue > greenValue;
  const greenWins = greenValue > whiteValue;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-[#687076] uppercase tracking-wider">
        <span className={whiteWins ? "text-white font-semibold" : ""}>{fmt(whiteValue)}</span>
        <span>{label}</span>
        <span className={greenWins ? "text-emerald-400 font-semibold" : ""}>{fmt(greenValue)}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-[#2a2a2a]">
        <div
          className="h-full rounded-l-full transition-all duration-500"
          style={{
            width: `${whitePct}%`,
            background: whiteWins
              ? "linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.7))"
              : "rgba(255,255,255,0.25)",
          }}
        />
        <div
          className="h-full rounded-r-full transition-all duration-500"
          style={{
            width: `${greenPct}%`,
            background: greenWins
              ? "linear-gradient(90deg, rgba(34,197,94,0.7), rgba(34,197,94,0.3))"
              : "rgba(34,197,94,0.25)",
          }}
        />
      </div>
    </div>
  );
}

// ─── H2H Stat Bar ───────────────────────────────────────────────────────────
function H2HStatBar({
  label,
  val1,
  val2,
  suffix = "",
  higherIsBetter = true,
}: {
  label: string;
  val1: number;
  val2: number;
  suffix?: string;
  higherIsBetter?: boolean;
}) {
  const max = Math.max(val1, val2, 1);
  const p1Better = higherIsBetter ? val1 > val2 : val1 < val2;
  const p2Better = higherIsBetter ? val2 > val1 : val2 < val1;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-[#9BA1A6] mb-1">
        <span className={p1Better ? "text-[#0a7ea4] font-bold" : ""}>
          {val1}
          {suffix}
        </span>
        <span className="text-[#687076]">{label}</span>
        <span className={p2Better ? "text-[#F59E0B] font-bold" : ""}>
          {val2}
          {suffix}
        </span>
      </div>
      <div className="flex gap-1 items-center">
        <div className="flex-1 flex justify-end">
          <div
            className="h-2 rounded-l-full transition-all"
            style={{
              width: `${(val1 / max) * 100}%`,
              backgroundColor: p1Better ? "#0a7ea4" : "#3a3a3a",
            }}
          />
        </div>
        <div className="flex-1">
          <div
            className="h-2 rounded-r-full transition-all"
            style={{
              width: `${(val2 / max) * 100}%`,
              backgroundColor: p2Better ? "#F59E0B" : "#3a3a3a",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Head-to-Head Section ───────────────────────────────────────────────────
function HeadToHeadSection({ dateFilter }: { dateFilter?: { from?: string; to?: string } }) {
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [showPicker, setShowPicker] = useState<1 | 2 | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const { data: playerStats } = trpc.score.playerStats.useQuery(dateFilter);

  const playerNames = useMemo(() => {
    if (!playerStats) return [];
    return playerStats.map((p: any) => p.name).sort();
  }, [playerStats]);

  const filteredNames = useMemo(() => {
    const excluded = showPicker === 1 ? player2 : player1;
    let names = playerNames.filter((n: string) => n !== excluded);
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      names = names.filter((n: string) => n.toLowerCase().includes(q));
    }
    return names;
  }, [playerNames, showPicker, player1, player2, pickerSearch]);

  const queryInput = useMemo(() => {
    if (!player1 || !player2) return null;
    return {
      player1,
      player2,
      ...(dateFilter?.from ? { from: dateFilter.from } : {}),
      ...(dateFilter?.to ? { to: dateFilter.to } : {}),
    };
  }, [player1, player2, dateFilter]);

  const { data: h2h, isLoading } = trpc.scoreStats.headToHead.useQuery(queryInput!, {
    enabled: !!queryInput,
  });

  const selectPlayer = (name: string) => {
    if (showPicker === 1) {
      setPlayer1(name);
      if (name === player2) setPlayer2("");
    } else if (showPicker === 2) {
      setPlayer2(name);
      if (name === player1) setPlayer1("");
    }
    setShowPicker(null);
    setPickerSearch("");
  };

  const positionColors: Record<string, string> = {
    MV: "#F59E0B",
    LW: "#3B82F6",
    RW: "#8B5CF6",
    C: "#EF4444",
    B: "#22C55E",
  };

  return (
    <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
      <div className="p-5 border-b border-[#2a2a2a]">
        <h3 className="text-[#ECEDEE] text-sm font-semibold flex items-center gap-2">
          <Swords size={14} className="text-amber-400" />
          Head-to-Head
        </h3>
      </div>

      <div className="p-5 space-y-4">
        {/* Player selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[#687076] text-[10px] mb-1 block uppercase tracking-wider">Spelare 1</label>
            <button
              onClick={() => {
                setShowPicker(showPicker === 1 ? null : 1);
                setPickerSearch("");
              }}
              className="w-full text-left bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white truncate hover:border-[#0a7ea4]/50 transition-colors"
            >
              {player1 ? (
                <span className="text-[#0a7ea4] font-medium">{player1.split(" #")[0]}</span>
              ) : (
                <span className="text-[#687076]">Välj spelare...</span>
              )}
            </button>
          </div>
          <div>
            <label className="text-[#687076] text-[10px] mb-1 block uppercase tracking-wider">Spelare 2</label>
            <button
              onClick={() => {
                setShowPicker(showPicker === 2 ? null : 2);
                setPickerSearch("");
              }}
              className="w-full text-left bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white truncate hover:border-[#F59E0B]/50 transition-colors"
            >
              {player2 ? (
                <span className="text-[#F59E0B] font-medium">{player2.split(" #")[0]}</span>
              ) : (
                <span className="text-[#687076]">Välj spelare...</span>
              )}
            </button>
          </div>
        </div>

        {/* Player picker dropdown */}
        {showPicker && (
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg overflow-hidden">
            <div className="relative p-2 border-b border-[#2a2a2a]">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#687076]" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Sök spelare..."
                className="w-full pl-8 pr-3 py-1.5 bg-transparent text-sm text-[#ECEDEE] placeholder:text-[#687076] focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredNames.map((name: string) => (
                <button
                  key={name}
                  onClick={() => selectPlayer(name)}
                  className="w-full text-left px-3 py-2 text-sm text-[#ECEDEE] hover:bg-[#2a2a2a] border-b border-[#1a1a1a] last:border-0 transition-colors"
                >
                  {name}
                </button>
              ))}
              {filteredNames.length === 0 && (
                <p className="text-center py-4 text-[#687076] text-xs">Inga spelare hittades</p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {player1 && player2 && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[#0a7ea4] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : h2h ? (
              <div className="space-y-4">
                {/* Player names header */}
                <div className="flex justify-between items-center text-center py-2">
                  <div className="flex-1">
                    <span className="text-[#0a7ea4] font-bold text-base">{h2h.player1.name.split(" #")[0]}</span>
                  </div>
                  <div className="px-3">
                    <Swords size={16} className="text-[#687076]" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[#F59E0B] font-bold text-base">{h2h.player2.name.split(" #")[0]}</span>
                  </div>
                </div>

                {/* Win rates */}
                <div className="flex justify-around items-center py-3 bg-[#0a0a0a] rounded-xl">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#0a7ea4]">{h2h.player1.winRate}%</div>
                    <div className="text-[10px] text-[#687076] uppercase">Vinst%</div>
                  </div>
                  <div className="text-center">
                    <Trophy size={20} className="text-amber-400 mx-auto mb-1" />
                    <div className="text-[10px] text-[#687076]">{h2h.sharedMatches} gemensamma</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#F59E0B]">{h2h.player2.winRate}%</div>
                    <div className="text-[10px] text-[#687076] uppercase">Vinst%</div>
                  </div>
                </div>

                {/* Stat bars */}
                <div className="bg-[#0a0a0a] rounded-xl p-4">
                  <H2HStatBar label="Matcher" val1={h2h.player1.matchesPlayed} val2={h2h.player2.matchesPlayed} />
                  <H2HStatBar label="Vinster" val1={h2h.player1.wins} val2={h2h.player2.wins} />
                  <H2HStatBar label="Förluster" val1={h2h.player1.losses} val2={h2h.player2.losses} higherIsBetter={false} />
                  <H2HStatBar label="Mål" val1={h2h.player1.goals} val2={h2h.player2.goals} />
                  <H2HStatBar label="Assist" val1={h2h.player1.assists} val2={h2h.player2.assists} />
                  <H2HStatBar label="Poäng" val1={h2h.player1.points} val2={h2h.player2.points} />
                  <H2HStatBar label="Vita" val1={h2h.player1.matchesWhite} val2={h2h.player2.matchesWhite} />
                  <H2HStatBar label="Gröna" val1={h2h.player1.matchesGreen} val2={h2h.player2.matchesGreen} />
                </div>

                {/* Shared match analysis */}
                {h2h.sharedMatches > 0 && (
                  <div className="bg-[#0a0a0a] rounded-xl p-4">
                    <h4 className="text-[#ECEDEE] text-xs font-bold mb-3 flex items-center gap-1.5">
                      <Users size={12} className="text-[#0a7ea4]" /> Gemensamma matcher
                    </h4>
                    {h2h.player1.sameTeamMatches > 0 && (
                      <div className="mb-3">
                        <p className="text-[#687076] text-[10px] mb-1 uppercase tracking-wider">
                          Samma lag ({h2h.player1.sameTeamMatches} matcher)
                        </p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-emerald-400 font-medium">{h2h.sameTeamRecord.wins}V</span>
                          <span className="text-red-400">{h2h.sameTeamRecord.losses}F</span>
                          <span className="text-[#9BA1A6]">{h2h.sameTeamRecord.draws}O</span>
                        </div>
                      </div>
                    )}
                    {h2h.player1.oppositeTeamMatches > 0 && (
                      <div>
                        <p className="text-[#687076] text-[10px] mb-1 uppercase tracking-wider">
                          Motståndare ({h2h.player1.oppositeTeamMatches} matcher)
                        </p>
                        <div className="flex justify-between text-xs">
                          <span>
                            <span className="text-[#0a7ea4] font-bold">{h2h.oppositeTeamRecord.p1Wins}</span> vinster
                          </span>
                          <span className="text-[#9BA1A6]">{h2h.oppositeTeamRecord.draws} oavgjort</span>
                          <span>
                            <span className="text-[#F59E0B] font-bold">{h2h.oppositeTeamRecord.p2Wins}</span> vinster
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Position breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  {[h2h.player1, h2h.player2].map((p: any, i: number) => {
                    const positions = Object.entries(p.positionCounts).sort((a: any, b: any) => b[1] - a[1]);
                    if (positions.length === 0) return null;
                    return (
                      <div key={i} className="bg-[#0a0a0a] rounded-xl p-3">
                        <p className={`text-[10px] font-bold mb-2 uppercase tracking-wider ${i === 0 ? "text-[#0a7ea4]" : "text-[#F59E0B]"}`}>
                          Positioner
                        </p>
                        {positions.map(([pos, count]: any) => {
                          const posColor = positionColors[pos] || "#687076";
                          return (
                            <div key={pos} className="flex justify-between text-xs text-[#9BA1A6] mb-0.5">
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: posColor }}
                                />
                                {pos}
                              </span>
                              <span>{count}x</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Team Stat Card ─────────────────────────────────────────────────────────
function TeamStatCard({
  team,
  data,
}: {
  team: "white" | "green";
  data: any;
}) {
  const isWhite = team === "white";
  const color = isWhite ? "rgba(255,255,255,0.8)" : "rgba(34,197,94,0.8)";
  const bgColor = isWhite ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.05)";
  const borderColor = isWhite ? "rgba(255,255,255,0.1)" : "rgba(34,197,94,0.1)";
  const logo = isWhite ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo;
  const name = isWhite ? "Vita" : "Gröna";

  return (
    <div
      className="rounded-xl p-5 border"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      <div className="flex items-center gap-3 mb-4">
        <img src={logo} alt={name} className="w-10 h-10 object-contain" />
        <div>
          <h3 className="font-bold text-base" style={{ color }}>
            {name}
          </h3>
          <p className="text-[#687076] text-[10px]">{data.wins} vinster</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Vinster", value: data.wins, icon: Trophy },
          { label: "Mål", value: data.goals, icon: Target },
          { label: "Mål/match", value: data.goalsPerMatch, icon: Target },
          { label: "Nollor", value: data.cleanSheets, icon: Shield },
          { label: "GWG", value: data.gwg, icon: Flame },
          { label: "Vinstprocent", value: `${data.winRate}%`, icon: Trophy },
          { label: "Unika spelare", value: data.uniquePlayers, icon: Users },
          { label: "Poäng/match", value: data.pointsPerMatch, icon: Target },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-2">
              <Icon size={12} style={{ color }} className="opacity-50 flex-shrink-0" />
              <div>
                <p className="text-[#687076] text-[9px] uppercase tracking-wider">{stat.label}</p>
                <p className="text-[#ECEDEE] text-sm font-bold">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TeamsTab({ teamData, stats, dateFilter }: TeamsTabProps) {
  if (!teamData || teamData.totalMatches === 0) {
    return (
      <div className="text-center py-16 text-[#687076]">
        <Shield size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Ingen lagdata för vald period</p>
      </div>
    );
  }

  const w = teamData.white;
  const g = teamData.green;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-4 mb-2">
          <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-12 h-12 object-contain" />
          <span className="text-[#687076] text-lg font-bold">VS</span>
          <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-12 h-12 object-contain" />
        </div>
        <p className="text-[#687076] text-xs">
          {teamData.totalMatches} matcher, {teamData.draws} oavgjorda
        </p>
      </div>

      {/* Win comparison */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-white text-3xl font-bold">{w.wins}</p>
            <p className="text-[#687076] text-[10px] uppercase">Vita vinster</p>
          </div>
          <div className="text-center">
            <p className="text-[#687076] text-xl font-bold">{teamData.draws}</p>
            <p className="text-[#687076] text-[10px] uppercase">Oavgjort</p>
          </div>
          <div className="text-center">
            <p className="text-emerald-400 text-3xl font-bold">{g.wins}</p>
            <p className="text-[#687076] text-[10px] uppercase">Gröna vinster</p>
          </div>
        </div>

        {/* Visual bar */}
        <div className="flex h-3 rounded-full overflow-hidden mt-4 bg-[#2a2a2a]">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(w.wins / teamData.totalMatches) * 100}%`,
              background: "linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.7))",
            }}
          />
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(teamData.draws / teamData.totalMatches) * 100}%`,
              background: "rgba(107,114,128,0.3)",
            }}
          />
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(g.wins / teamData.totalMatches) * 100}%`,
              background: "linear-gradient(90deg, rgba(34,197,94,0.7), rgba(34,197,94,0.3))",
            }}
          />
        </div>
      </div>

      {/* Comparison bars */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5 space-y-4">
        <h3 className="text-[#ECEDEE] text-sm font-semibold mb-2">Jämförelse</h3>
        <ComparisonBar label="Mål" whiteValue={w.goals} greenValue={g.goals} />
        <ComparisonBar label="Mål/match" whiteValue={w.goalsPerMatch} greenValue={g.goalsPerMatch} format={(v) => v.toFixed(1)} />
        <ComparisonBar label="Nollor" whiteValue={w.cleanSheets} greenValue={g.cleanSheets} />
        <ComparisonBar label="GWG" whiteValue={w.gwg} greenValue={g.gwg} />
        <ComparisonBar label="Vinstprocent" whiteValue={w.winRate} greenValue={g.winRate} format={(v) => `${v}%`} />
        <ComparisonBar label="Poäng/match" whiteValue={w.pointsPerMatch} greenValue={g.pointsPerMatch} format={(v) => v.toFixed(1)} />
        <ComparisonBar label="Unika spelare" whiteValue={w.uniquePlayers} greenValue={g.uniquePlayers} />
        <ComparisonBar label="Straffar" whiteValue={w.penalties} greenValue={g.penalties} />
      </div>

      {/* Team stat cards side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TeamStatCard team="white" data={w} />
        <TeamStatCard team="green" data={g} />
      </div>

      {/* Head-to-Head */}
      <HeadToHeadSection dateFilter={dateFilter} />
    </div>
  );
}
