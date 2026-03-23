import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronDown, Swords, Users, Target, Trophy, BarChart3 } from "lucide-react";

interface HeadToHeadSectionProps {
  dateFilter?: { from?: string; to?: string };
}

export function HeadToHeadSection({ dateFilter }: HeadToHeadSectionProps) {
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [showPicker, setShowPicker] = useState<1 | 2 | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: playerStats } = trpc.score.playerStats.useQuery(dateFilter);

  const playerNames = useMemo(() => {
    if (!playerStats) return [];
    return playerStats.map((p) => p.name).sort();
  }, [playerStats]);

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
  };

  const StatBar = ({
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
  }) => {
    const max = Math.max(val1, val2, 1);
    const p1Better = higherIsBetter ? val1 > val2 : val1 < val2;
    const p2Better = higherIsBetter ? val2 > val1 : val2 < val1;
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[#9BA1A6] mb-1">
          <span className={p1Better ? "text-[#0a7ea4] font-bold" : ""}>
            {val1}{suffix}
          </span>
          <span className="text-[#687076]">{label}</span>
          <span className={p2Better ? "text-[#F59E0B] font-bold" : ""}>
            {val2}{suffix}
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
  };

  return (
    <div className="bg-[#2a2a2a] rounded-2xl border border-[#3a3a3a] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <h2 className="text-[#ECEDEE] font-bold text-sm flex items-center gap-1.5">
          <Swords size={14} className="text-[#F59E0B]" /> Head-to-Head
        </h2>
        <ChevronDown
          size={16}
          className={`text-[#687076] transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Player selectors */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[#687076] text-[10px] mb-1 block">SPELARE 1</label>
              <button
                onClick={() => setShowPicker(showPicker === 1 ? null : 1)}
                className="w-full text-left bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white truncate"
              >
                {player1 || "Välj spelare..."}
              </button>
            </div>
            <div>
              <label className="text-[#687076] text-[10px] mb-1 block">SPELARE 2</label>
              <button
                onClick={() => setShowPicker(showPicker === 2 ? null : 2)}
                className="w-full text-left bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white truncate"
              >
                {player2 || "Välj spelare..."}
              </button>
            </div>
          </div>

          {/* Player picker dropdown */}
          {showPicker && (
            <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg max-h-48 overflow-y-auto mb-4">
              {playerNames
                .filter((n) =>
                  showPicker === 1 ? n !== player2 : n !== player1
                )
                .map((name) => (
                  <button
                    key={name}
                    onClick={() => selectPlayer(name)}
                    className="w-full text-left px-3 py-2 text-sm text-[#ECEDEE] hover:bg-[#3a3a3a] border-b border-[#2a2a2a] last:border-0"
                  >
                    {name}
                  </button>
                ))}
            </div>
          )}

          {/* Results */}
          {player1 && player2 && (
            <>
              {isLoading ? (
                <div className="text-center py-6 text-[#687076] text-sm">
                  Laddar jämförelse...
                </div>
              ) : h2h ? (
                <div className="space-y-4">
                  {/* Player names header */}
                  <div className="flex justify-between items-center text-center">
                    <div className="flex-1">
                      <span className="text-[#0a7ea4] font-bold text-sm">
                        {h2h.player1.name.split(" #")[0]}
                      </span>
                    </div>
                    <div className="px-2">
                      <span className="text-[#687076] text-xs">VS</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-[#F59E0B] font-bold text-sm">
                        {h2h.player2.name.split(" #")[0]}
                      </span>
                    </div>
                  </div>

                  {/* Win rates circle */}
                  <div className="flex justify-around items-center py-2">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[#0a7ea4]">
                        {h2h.player1.winRate}%
                      </div>
                      <div className="text-[10px] text-[#687076]">VINST%</div>
                    </div>
                    <div className="text-center">
                      <Trophy size={20} className="text-[#F59E0B] mx-auto mb-1" />
                      <div className="text-[10px] text-[#687076]">
                        {h2h.sharedMatches} gemensamma
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[#F59E0B]">
                        {h2h.player2.winRate}%
                      </div>
                      <div className="text-[10px] text-[#687076]">VINST%</div>
                    </div>
                  </div>

                  {/* Stat bars */}
                  <div className="bg-[#1a1a1a] rounded-xl p-3">
                    <StatBar label="Matcher" val1={h2h.player1.matchesPlayed} val2={h2h.player2.matchesPlayed} />
                    <StatBar label="Vinster" val1={h2h.player1.wins} val2={h2h.player2.wins} />
                    <StatBar label="Förluster" val1={h2h.player1.losses} val2={h2h.player2.losses} higherIsBetter={false} />
                    <StatBar label="Mål" val1={h2h.player1.goals} val2={h2h.player2.goals} />
                    <StatBar label="Assist" val1={h2h.player1.assists} val2={h2h.player2.assists} />
                    <StatBar label="Poäng" val1={h2h.player1.points} val2={h2h.player2.points} />
                    <StatBar label="Vita" val1={h2h.player1.matchesWhite} val2={h2h.player2.matchesWhite} />
                    <StatBar label="Gröna" val1={h2h.player1.matchesGreen} val2={h2h.player2.matchesGreen} />
                  </div>

                  {/* Shared match analysis */}
                  {h2h.sharedMatches > 0 && (
                    <div className="bg-[#1a1a1a] rounded-xl p-3">
                      <h3 className="text-[#ECEDEE] text-xs font-bold mb-2 flex items-center gap-1">
                        <Users size={12} /> Gemensamma matcher
                      </h3>
                      {h2h.player1.sameTeamMatches > 0 && (
                        <div className="mb-2">
                          <p className="text-[#687076] text-[10px] mb-1">SAMMA LAG ({h2h.player1.sameTeamMatches} matcher)</p>
                          <div className="flex gap-2 text-xs">
                            <span className="text-[#22C55E]">{h2h.sameTeamRecord.wins}V</span>
                            <span className="text-[#EF4444]">{h2h.sameTeamRecord.losses}F</span>
                            <span className="text-[#9BA1A6]">{h2h.sameTeamRecord.draws}O</span>
                          </div>
                        </div>
                      )}
                      {h2h.player1.oppositeTeamMatches > 0 && (
                        <div>
                          <p className="text-[#687076] text-[10px] mb-1">MOTSTÅNDARE ({h2h.player1.oppositeTeamMatches} matcher)</p>
                          <div className="flex justify-between text-xs">
                            <span>
                              <span className="text-[#0a7ea4]">{h2h.oppositeTeamRecord.p1Wins}</span> vinster
                            </span>
                            <span className="text-[#9BA1A6]">{h2h.oppositeTeamRecord.draws} oavgjort</span>
                            <span>
                              <span className="text-[#F59E0B]">{h2h.oppositeTeamRecord.p2Wins}</span> vinster
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Position breakdown */}
                  <div className="grid grid-cols-2 gap-3">
                    {[h2h.player1, h2h.player2].map((p, i) => {
                      const positions = Object.entries(p.positionCounts).sort(
                        (a, b) => b[1] - a[1]
                      );
                      if (positions.length === 0) return null;
                      return (
                        <div key={i} className="bg-[#1a1a1a] rounded-xl p-3">
                          <p className={`text-[10px] font-bold mb-1 ${i === 0 ? "text-[#0a7ea4]" : "text-[#F59E0B]"}`}>
                            POSITIONER
                          </p>
                          {positions.map(([pos, count]) => (
                            <div key={pos} className="flex justify-between text-xs text-[#9BA1A6]">
                              <span>{pos}</span>
                              <span>{count}x</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
