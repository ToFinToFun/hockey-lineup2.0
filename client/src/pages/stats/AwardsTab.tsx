/**
 * AwardsTab – Season awards with beautiful cards and export
 */
import { useState, useRef, useCallback } from "react";
import { Award, Download, Share2, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { IMAGES } from "@/lib/scoreConstants";
import {
  HockeyPuck,
  HockeyStick,
  HockeyGoalNet,
  GoalieMask,
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
    icon: Trophy,
    gradient: "from-yellow-400/20 via-yellow-500/10 to-transparent",
    accent: "#FBBF24",
  },
  assist_leader: {
    icon: HockeyStick,
    gradient: "from-sky-400/20 via-sky-500/10 to-transparent",
    accent: "#38BDF8",
  },
  mr_clutch: {
    icon: HockeyGoalNet,
    gradient: "from-red-500/20 via-red-600/10 to-transparent",
    accent: "#EF4444",
  },
  best_winner: {
    icon: Trophy,
    gradient: "from-emerald-500/20 via-emerald-600/10 to-transparent",
    accent: "#22C55E",
  },
  iron_man: {
    icon: Trophy,
    gradient: "from-slate-400/20 via-slate-500/10 to-transparent",
    accent: "#94A3B8",
  },
  best_streak: {
    icon: Trophy,
    gradient: "from-orange-500/20 via-orange-600/10 to-transparent",
    accent: "#F97316",
  },
  unbeaten: {
    icon: Trophy,
    gradient: "from-violet-500/20 via-violet-600/10 to-transparent",
    accent: "#8B5CF6",
  },
  best_match: {
    icon: Trophy,
    gradient: "from-pink-500/20 via-pink-600/10 to-transparent",
    accent: "#EC4899",
  },
  best_goalkeeper: {
    icon: GoalieMask,
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
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: `${style.accent}15`,
              border: `1px solid ${style.accent}30`,
            }}
          >
            <Icon size={20} style={{ color: style.accent }} />
          </div>
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

        {/* Runner up */}
        {award.runnerUp && (
          <div className="mt-3 pt-3 border-t border-[#2a2a2a]/50 flex items-center gap-2">
            <span className="text-[#687076] text-[10px]">2:a plats:</span>
            <span className="text-[#9BA1A6] text-[10px] font-medium">
              {award.runnerUp}
            </span>
            {award.runnerUpValue && (
              <span className="text-[#687076] text-[10px]">
                ({award.runnerUpValue})
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Export Canvas ───────────────────────────────────────────────────────────
function ExportPanel({
  awards,
  periodLabel,
  totalMatches,
}: {
  awards: any[];
  periodLabel: string;
  totalMatches: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);

    const ctx = canvas.getContext("2d")!;
    const w = 1080;
    const h = 1440;
    canvas.width = w;
    canvas.height = h;

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#0a0a0a");
    bgGrad.addColorStop(0.5, "#111");
    bgGrad.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Header accent
    const accentGrad = ctx.createLinearGradient(0, 0, w, 0);
    accentGrad.addColorStop(0, "rgba(10,126,164,0.3)");
    accentGrad.addColorStop(0.5, "rgba(10,126,164,0.6)");
    accentGrad.addColorStop(1, "rgba(10,126,164,0.3)");
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, w, 3);

    // Title
    ctx.fillStyle = "#ECEDEE";
    ctx.font = "bold 48px 'Oswald', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("STÅLSTADENS SF", w / 2, 80);

    ctx.fillStyle = "#0a7ea4";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`UTMÄRKELSER — ${periodLabel.toUpperCase()}`, w / 2, 120);

    ctx.fillStyle = "#687076";
    ctx.font = "16px sans-serif";
    ctx.fillText(`${totalMatches} matcher spelade`, w / 2, 150);

    // Awards grid
    let y = 190;
    const cardW = 480;
    const cardH = 130;
    const gap = 16;

    for (let i = 0; i < awards.length; i++) {
      const award = awards[i];
      const col = i % 2;
      const x = col === 0 ? (w / 2 - cardW - gap / 2) : (w / 2 + gap / 2);

      // Card background
      const style = getAwardStyle(award.id);
      ctx.fillStyle = "rgba(26,26,26,0.8)";
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, 12);
      ctx.fill();

      // Border
      ctx.strokeStyle = `${style.accent}40`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Emoji
      ctx.font = "32px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(award.emoji, x + 16, y + 48);

      // Title
      ctx.fillStyle = "#687076";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(award.title.toUpperCase(), x + 60, y + 28);

      // Winner
      ctx.fillStyle = "#ECEDEE";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(award.winner, x + 60, y + 56);

      // Value
      ctx.fillStyle = style.accent;
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(award.value, x + 60, y + 82);

      // Runner up
      if (award.runnerUp) {
        ctx.fillStyle = "#687076";
        ctx.font = "13px sans-serif";
        ctx.fillText(`2:a: ${award.runnerUp} ${award.runnerUpValue ? `(${award.runnerUpValue})` : ""}`, x + 60, y + 106);
      }

      if (col === 1 || i === awards.length - 1) {
        y += cardH + gap;
      }
    }

    // Footer
    ctx.textAlign = "center";
    ctx.fillStyle = "#687076";
    ctx.font = "12px sans-serif";
    ctx.fillText("app.stalstadens.se", w / 2, h - 30);

    // Download
    const link = document.createElement("a");
    link.download = `stalstadens-utmarkelser-${periodLabel.toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    setExporting(false);
  }, [awards, periodLabel, totalMatches]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <button
        onClick={exportImage}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a7ea4]/10 border border-[#0a7ea4]/30 text-[#0a7ea4] text-xs font-medium hover:bg-[#0a7ea4]/20 transition-colors disabled:opacity-50"
      >
        <Download size={14} />
        {exporting ? "Exporterar..." : "Exportera bild"}
      </button>
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
  const [showAll, setShowAll] = useState(false);

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
  const visible = showAll ? awardsList : awardsList.slice(0, 6);

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
        <ExportPanel
          awards={awardsList}
          periodLabel={periodLabel}
          totalMatches={totalMatches}
        />
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

      {/* Show more */}
      {awardsList.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1 py-3 text-xs text-[#0a7ea4] hover:text-[#0a7ea4]/80 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp size={14} /> Visa färre
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Visa alla ({awardsList.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}
