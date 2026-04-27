/**
 * LeadersTab – Scoring leaders with podium and expandable tables
 */
import { useState, useMemo } from "react";
import { Trophy, Target, Users, ChevronDown, ChevronUp, Crown, Medal } from "lucide-react";
import { HockeyPuck, HockeyStick, HockeyGoalNet } from "@/components/score/HockeyIcons";

interface LeadersTabProps {
  stats: any;
  onPlayerClick: (name: string) => void;
  periodLabel: string;
}

type LeaderCategory = "points" | "goals" | "assists" | "gwg";

// ─── Podium ─────────────────────────────────────────────────────────────────
function Podium({
  players,
  valueKey,
  valueLabel,
  onPlayerClick,
}: {
  players: any[];
  valueKey: string;
  valueLabel: string;
  onPlayerClick: (name: string) => void;
}) {
  if (players.length === 0) return null;

  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd
  const heights = [88, 110, 68];
  const colors = ["#C0C0C0", "#FFD700", "#CD7F32"];
  const bgColors = ["rgba(192,192,192,0.08)", "rgba(255,215,0,0.08)", "rgba(205,127,50,0.08)"];
  const borderColors = ["rgba(192,192,192,0.2)", "rgba(255,215,0,0.2)", "rgba(205,127,50,0.2)"];

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 mb-6 px-2">
      {podiumOrder.map((rank) => {
        const player = players[rank];
        if (!player) return <div key={rank} className="w-20 sm:w-24" />;
        const isFirst = rank === 0;
        return (
          <button
            key={rank}
            onClick={() => onPlayerClick(player.name)}
            className="flex flex-col items-center group transition-transform hover:scale-105"
          >
            {/* Medal */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
              style={{ backgroundColor: bgColors[rank], border: `1px solid ${borderColors[rank]}` }}
            >
              {rank === 0 ? (
                <Crown size={16} style={{ color: colors[rank] }} />
              ) : (
                <Medal size={14} style={{ color: colors[rank] }} />
              )}
            </div>

            {/* Name */}
            <p
              className={`text-[#ECEDEE] font-semibold truncate max-w-[80px] sm:max-w-[96px] text-center group-hover:text-[#0a7ea4] transition-colors ${
                isFirst ? "text-sm" : "text-xs"
              }`}
            >
              {player.name}
            </p>

            {/* Value */}
            <p className="text-[#687076] text-[10px] mb-1">
              {player[valueKey]} {valueLabel}
            </p>

            {/* Podium bar */}
            <div
              className="w-20 sm:w-24 rounded-t-lg flex items-center justify-center"
              style={{
                height: heights[rank],
                background: `linear-gradient(180deg, ${bgColors[rank]} 0%, rgba(10,10,10,0.3) 100%)`,
                border: `1px solid ${borderColors[rank]}`,
                borderBottom: "none",
              }}
            >
              <span className="text-2xl font-bold" style={{ color: colors[rank] }}>
                {rank + 1}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Expandable Table ───────────────────────────────────────────────────────
function LeaderTable({
  players,
  columns,
  onPlayerClick,
  initialShow = 5,
}: {
  players: any[];
  columns: { key: string; label: string; width?: string }[];
  onPlayerClick: (name: string) => void;
  initialShow?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? players : players.slice(0, initialShow);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center px-3 py-1.5 text-[10px] text-[#687076] uppercase tracking-wider border-b border-[#2a2a2a]">
        <span className="w-6">#</span>
        <span className="flex-1">Spelare</span>
        {columns.map((col) => (
          <span key={col.key} className={`text-right ${col.width ?? "w-12"}`}>
            {col.label}
          </span>
        ))}
      </div>

      {/* Rows */}
      {visible.map((p: any, i: number) => (
        <button
          key={p.name}
          onClick={() => onPlayerClick(p.name)}
          className={`w-full flex items-center px-3 py-2 text-xs hover:bg-[#1a1a1a] transition-colors ${
            i < 3 ? "bg-[#1a1a1a]/30" : ""
          }`}
        >
          <span className={`w-6 font-medium ${i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-[#687076]"}`}>
            {i + 1}
          </span>
          <span className="flex-1 text-left text-[#ECEDEE] truncate hover:text-[#0a7ea4] transition-colors">
            {p.name}
          </span>
          {columns.map((col) => (
            <span key={col.key} className={`text-right font-medium text-[#9BA1A6] ${col.width ?? "w-12"}`}>
              {p[col.key]}
            </span>
          ))}
        </button>
      ))}

      {/* Expand/collapse */}
      {players.length > initialShow && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-[#0a7ea4] hover:text-[#0a7ea4]/80 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Visa färre
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Visa alla ({players.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function LeadersTab({ stats, onPlayerClick, periodLabel }: LeadersTabProps) {
  const [category, setCategory] = useState<LeaderCategory>("points");

  const topScorers = stats?.topScorers ?? [];

  // Build different sorted lists
  const byPoints = useMemo(
    () => [...topScorers].sort((a: any, b: any) => b.points - a.points || b.goals - a.goals || b.assists - a.assists || b.gwg - a.gwg),
    [topScorers]
  );
  const byGoals = useMemo(
    () => [...topScorers].sort((a: any, b: any) => b.goals - a.goals || b.assists - a.assists || b.gwg - a.gwg),
    [topScorers]
  );
  const byAssists = useMemo(
    () => [...topScorers].sort((a: any, b: any) => b.assists - a.assists || b.goals - a.goals || b.gwg - a.gwg),
    [topScorers]
  );
  const byGwg = useMemo(
    () => [...topScorers].filter((p: any) => p.gwg > 0).sort((a: any, b: any) => b.gwg - a.gwg || b.goals - a.goals),
    [topScorers]
  );

  const categories: { key: LeaderCategory; label: string; icon: any; data: any[]; valueKey: string; valueLabel: string; columns: { key: string; label: string; width?: string }[] }[] = [
    {
      key: "points",
      label: "Poäng",
      icon: Crown,
      data: byPoints,
      valueKey: "points",
      valueLabel: "p",
      columns: [
        { key: "goals", label: "M", width: "w-8" },
        { key: "assists", label: "A", width: "w-8" },
        { key: "points", label: "P", width: "w-8" },
        { key: "gwg", label: "GWG", width: "w-10" },
      ],
    },
    {
      key: "goals",
      label: "Mål",
      icon: HockeyPuck,
      data: byGoals,
      valueKey: "goals",
      valueLabel: "mål",
      columns: [
        { key: "goals", label: "M", width: "w-8" },
        { key: "assists", label: "A", width: "w-8" },
        { key: "points", label: "P", width: "w-8" },
      ],
    },
    {
      key: "assists",
      label: "Assist",
      icon: HockeyStick,
      data: byAssists,
      valueKey: "assists",
      valueLabel: "assist",
      columns: [
        { key: "assists", label: "A", width: "w-8" },
        { key: "goals", label: "M", width: "w-8" },
        { key: "points", label: "P", width: "w-8" },
      ],
    },
    {
      key: "gwg",
      label: "GWG",
      icon: HockeyGoalNet,
      data: byGwg,
      valueKey: "gwg",
      valueLabel: "GWG",
      columns: [
        { key: "gwg", label: "GWG", width: "w-10" },
        { key: "goals", label: "M", width: "w-8" },
        { key: "points", label: "P", width: "w-8" },
      ],
    },
  ];

  const active = categories.find((c) => c.key === category)!;

  if (!stats || topScorers.length === 0) {
    return (
      <div className="text-center py-16 text-[#687076]">
        <Trophy size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Ingen poängdata för vald period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category selector */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = category === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                isActive
                  ? "bg-[#0a7ea4]/10 text-[#0a7ea4] border-[#0a7ea4]/30"
                  : "bg-[#1a1a1a] text-[#687076] border-[#2a2a2a] hover:text-[#9BA1A6]"
              }`}
            >
              <Icon size={14} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Period badge */}
      <div className="text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[10px] text-[#687076] uppercase tracking-wider">
          {periodLabel}
        </span>
      </div>

      {/* Podium */}
      <Podium
        players={active.data.slice(0, 3)}
        valueKey={active.valueKey}
        valueLabel={active.valueLabel}
        onPlayerClick={onPlayerClick}
      />

      {/* Full table */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] overflow-hidden">
        <LeaderTable
          players={active.data}
          columns={active.columns}
          onPlayerClick={onPlayerClick}
          initialShow={10}
        />
      </div>

      {/* Monthly MVP */}
      {stats.monthlyMvp && stats.monthlyMvp.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-xl border border-[#2a2a2a] p-5">
          <h3 className="text-[#ECEDEE] text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" />
            Månadens spelare
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.monthlyMvp.map((mvp: any) => {
              const monthName = new Date(mvp.month + "-01").toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
              return (
                <button
                  key={mvp.month}
                  onClick={() => onPlayerClick(mvp.playerName)}
                  className="flex items-center gap-3 bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a] hover:border-amber-500/30 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Trophy size={14} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#ECEDEE] text-xs font-semibold truncate">{mvp.playerName}</p>
                    <p className="text-[#687076] text-[10px] capitalize">{monthName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 text-xs font-bold">{mvp.points}p</p>
                    <p className="text-[#687076] text-[10px]">
                      {mvp.goals}+{mvp.assists}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
