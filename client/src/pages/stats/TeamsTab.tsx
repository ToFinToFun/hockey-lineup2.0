/**
 * TeamsTab – Team comparison (Vita vs Gröna) with visual bars
 */
import { useMemo } from "react";
import { Shield, Target, Trophy, Users, Flame } from "lucide-react";
import { IMAGES } from "@/lib/scoreConstants";

interface TeamsTabProps {
  teamData: any;
  stats: any;
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
export default function TeamsTab({ teamData, stats }: TeamsTabProps) {
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
        <p className="text-[#687076] text-xs">{teamData.totalMatches} matcher, {teamData.draws} oavgjorda</p>
      </div>

      {/* Win comparison donut */}
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
    </div>
  );
}
