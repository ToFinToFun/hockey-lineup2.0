/**
 * AwardsTab – Season awards with beautiful cards and export
 */
import { ShareButton, ShareImageModal } from "@/components/stats/ShareImageModal";
import { renderStatsTable } from "@/lib/statsImages";
import { useStatsPeriod } from "./shareContext";
import { clubHeading, club, teamLogo } from "@shared/club";
import { useState, useRef, useCallback } from "react";
import { Award, Download, Share2, Trophy, ChevronDown, ChevronUp, Crown, HandHelping, Zap, Medal, Dumbbell, Flame, ShieldCheck, Star } from "lucide-react";
import { CardThumb } from "@/components/CardThumb";
import { IMAGES } from "@/lib/scoreConstants";
import {
  HockeyPuck,
  HockeyStick,
  HockeyGoalNet,
  HockeyGoal,
} from "@/components/score/HockeyIcons";

interface AwardsTabProps {
  awards: any;
  onPlayerClick: (name: string) => void;
  periodLabel: string;
  periodPreset: string;
}

// Award icon + gradient mapping
const AWARD_STYLES: Record<
  string,
  { icon: any; gradient: string; accent: string }
> = {
  top_scorer: {
    icon: HockeyPuck,
    gradient: "from-amber-500/20 via-amber-600/10 to-transparent",
    accent: "#F59E0B",
  },
  points_leader: {
    icon: Crown,
    gradient: "from-yellow-400/20 via-yellow-500/10 to-transparent",
    accent: "#FBBF24",
  },
  assist_leader: {
    icon: HandHelping,
    gradient: "from-sky-400/20 via-sky-500/10 to-transparent",
    accent: "#38BDF8",
  },
  mr_clutch: {
    icon: Zap,
    gradient: "from-red-500/20 via-red-600/10 to-transparent",
    accent: "#EF4444",
  },
  best_winner: {
    icon: Medal,
    gradient: "from-emerald-500/20 via-emerald-600/10 to-transparent",
    accent: "#22C55E",
  },
  iron_man: {
    icon: Dumbbell,
    gradient: "from-slate-400/20 via-slate-500/10 to-transparent",
    accent: "#94A3B8",
  },
  best_streak: {
    icon: Flame,
    gradient: "from-orange-500/20 via-orange-600/10 to-transparent",
    accent: "#F97316",
  },
  unbeaten: {
    icon: ShieldCheck,
    gradient: "from-violet-500/20 via-violet-600/10 to-transparent",
    accent: "#8B5CF6",
  },
  best_match: {
    icon: Star,
    gradient: "from-pink-500/20 via-pink-600/10 to-transparent",
    accent: "#EC4899",
  },
  best_goalkeeper: {
    icon: HockeyGoal,
    gradient: "from-cyan-500/20 via-cyan-600/10 to-transparent",
    accent: "#06B6D4",
  },
};

function getAwardStyle(id: string) {
  return (
    AWARD_STYLES[id] ?? {
      icon: Award,
      gradient: "from-[#0a7ea4]/20 via-[#0a7ea4]/10 to-transparent",
      accent: "#0a7ea4",
    }
  );
}

// ─── Award Card ─────────────────────────────────────────────────────────────
function AwardCard({
  award,
  onPlayerClick,
}: {
  award: any;
  onPlayerClick: (name: string) => void;
}) {
  const style = getAwardStyle(award.id);
  const Icon = style.icon;

  return (
    <button
      onClick={() => onPlayerClick(award.winner)}
      className="w-full text-left group"
    >
      <div
        className={`relative overflow-hidden rounded-xl border border-[#2a2a2a] bg-gradient-to-br ${style.gradient} bg-[#111] p-5 transition-all duration-300 hover:border-opacity-60 hover:scale-[1.01]`}
        style={{ borderColor: `${style.accent}20` }}
      >
        {/* Decorative glow */}
        <div
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10 blur-2xl"
          style={{ backgroundColor: style.accent }}
        />

        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <CardThumb
            playerName={award.winner ?? ""}
            height={56}
            fallback={
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${style.accent}15`,
                  border: `1px solid ${style.accent}30`,
                }}
              >
                <Icon size={20} style={{ color: style.accent }} />
              </div>
            }
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-[#687076]">
              {award.title}
            </p>
            <p className="text-[#ECEDEE] font-bold text-lg group-hover:text-[#0a7ea4] transition-colors truncate">
              {award.winner}
            </p>
          </div>
          <span className="text-2xl">{award.emoji}</span>
        </div>

        {/* Value */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-sm font-bold"
            style={{ color: style.accent }}
          >
            {award.value}
          </span>
        </div>

        {/* Description */}
        <p className="text-[#687076] text-[11px] leading-relaxed">
          {award.description}
        </p>

        {/* 2:a och 3:e plats */}
        {(award.runnerUp || award.third) && (
          <div className="mt-3 pt-3 border-t border-[#2a2a2a]/50 space-y-1">
            {([[award.runnerUp, award.runnerUpValue, "2:a"], [award.third, award.thirdValue, "3:e"]] as const).map(([who, val, place]) => who && (
              <div key={place} className="flex items-center gap-2">
                <span className="text-[#687076] text-[10px] w-7">{place}</span>
                <span className="text-[#9BA1A6] text-[10px] font-medium">{who}</span>
                {val && <span className="text-[#687076] text-[10px]">({val})</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Dela som bild ───────────────────────────────────────────────────────────
function ShareAwards({ awards }: { awards: any[] }) {
  const [open, setOpen] = useState(false);
  const period = useStatsPeriod();
  return (
    <>
      <ShareButton onClick={() => setOpen(true)} />
      {open && (
        <ShareImageModal
          title="Utmärkelser"
          fileName={`utmarkelser-${period}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          onClose={() => setOpen(false)}
          build={({ format, background }) => renderStatsTable({
            title: "Utmärkelser", subtitle: period, format, background,
            columns: [{ label: "" }], highlight: 0,
            rows: awards.slice(0, 10).map((a) => ({ rank: a.emoji, name: a.winner, sub: a.title, cells: [String(a.value).replace(/ \(.*\)$/, "")] })),
          })}
        />
      )}
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function AwardsTab({
  awards: awardsData,
  onPlayerClick,
  periodLabel,
  periodPreset,
}: AwardsTabProps) {

  const awardsList = awardsData?.awards ?? [];
  const totalMatches = awardsData?.totalMatches ?? 0;

  if (awardsList.length === 0) {
    return (
      <div className="text-center py-16 text-[#687076]">
        <Award size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Inga utmärkelser för vald period</p>
        <p className="text-[10px] mt-1">Minst ett antal matcher krävs</p>
      </div>
    );
  }

  // Show top 6 by default, expand to show all
  const visible = awardsList; // alla visas direkt

  return (
    <div className="space-y-6">
      {/* Header with export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#ECEDEE] text-lg font-bold flex items-center gap-2">
            <Award size={18} className="text-amber-400" />
            Utmärkelser
          </h2>
          <p className="text-[#687076] text-xs mt-0.5">
            {periodLabel} — {totalMatches} matcher
          </p>
        </div>
        <ShareAwards awards={awardsList} />
      </div>

      {/* Awards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((award: any) => (
          <AwardCard
            key={award.id}
            award={award}
            onPlayerClick={onPlayerClick}
          />
        ))}
      </div>

    </div>
  );
}
