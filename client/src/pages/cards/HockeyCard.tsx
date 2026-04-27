/**
 * HockeyCard – A single hockey trading card with holographic effects
 * Supports White/Green themes, player photo upload, and PNG export
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { IMAGES } from "@/lib/scoreConstants";

export interface CardStats {
  season: string;
  matches: number;
  wins: number;
  topStreak: number;
  goals: number;
  assists: number;
  points: number;
  gwg: number;
  winRate: number;
  // Goalkeeper-specific
  isGoalkeeper?: boolean;
  goalsAgainstPerMatch?: number;
  cleanSheets?: number;
  savePercentage?: number;
}

export interface HockeyCardProps {
  playerName: string;
  playerNumber?: string;
  position?: string;
  team: "white" | "green";
  stats: CardStats;
  photoUrl?: string | null;
  captainRole?: string;
  pirRating?: number;
  /** Custom stats to display (overrides defaults) */
  customStats?: { label: string; value: string | number }[];
  /** Whether to show interactive holographic effect */
  interactive?: boolean;
  /** Scale factor for export (1 = normal, 2 = 2x resolution) */
  scale?: number;
}

// ─── Holographic CSS ──────────────────────────────────────────────────────────
const holoStyles = `
  .hockey-card {
    perspective: 1000px;
    transform-style: preserve-3d;
  }
  .hockey-card-inner {
    position: relative;
    transition: transform 0.1s ease-out;
    transform-style: preserve-3d;
  }
  .hockey-card-inner::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      125deg,
      transparent 0%,
      rgba(255,255,255,0.03) 20%,
      rgba(255,255,255,0.08) 40%,
      rgba(120,200,255,0.06) 50%,
      rgba(255,200,120,0.06) 60%,
      rgba(255,255,255,0.03) 80%,
      transparent 100%
    );
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 10;
    pointer-events: none;
  }
  .hockey-card-inner:hover::before {
    opacity: 1;
  }
  .holo-shimmer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      var(--holo-angle, 135deg),
      transparent 0%,
      rgba(255,100,100,0.08) 15%,
      rgba(255,255,100,0.08) 30%,
      rgba(100,255,100,0.08) 45%,
      rgba(100,100,255,0.08) 60%,
      rgba(255,100,255,0.08) 75%,
      transparent 100%
    );
    mix-blend-mode: screen;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 11;
    pointer-events: none;
  }
  .hockey-card-inner:hover .holo-shimmer {
    opacity: 1;
  }
  .holo-sparkle {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15) 0%, transparent 2%),
                      radial-gradient(circle at 70% 60%, rgba(255,255,255,0.1) 0%, transparent 2%),
                      radial-gradient(circle at 40% 80%, rgba(255,255,255,0.12) 0%, transparent 2%),
                      radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 2%),
                      radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 3%);
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 12;
    pointer-events: none;
  }
  .hockey-card-inner:hover .holo-sparkle {
    opacity: 1;
  }
  @keyframes card-shine {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .card-border-shine {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    background-size: 200% 100%;
    animation: card-shine 3s ease-in-out infinite;
  }
`;

// ─── Default generic player silhouette (SVG) ──────────────────────────────────
function PlayerSilhouette({ team }: { team: "white" | "green" }) {
  const color = team === "white" ? "rgba(255,255,255,0.15)" : "rgba(34,197,94,0.15)";
  return (
    <svg viewBox="0 0 200 260" className="w-full h-full" fill="none">
      {/* Head */}
      <circle cx="100" cy="70" r="35" fill={color} />
      {/* Body */}
      <path d="M50 130 C50 100, 70 95, 100 95 C130 95, 150 100, 150 130 L155 200 C155 210, 145 215, 100 215 C55 215, 45 210, 45 200 Z" fill={color} />
      {/* Stick */}
      <line x1="140" y1="110" x2="180" y2="230" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <line x1="180" y1="230" x2="160" y2="250" stroke={color} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function HockeyCard({
  playerName, playerNumber, position, team, stats, photoUrl, captainRole, pirRating,
  customStats, interactive = true, scale = 1,
}: HockeyCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [holoAngle, setHoloAngle] = useState(135);

  const isWhite = team === "white";
  const logo = isWhite ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo;

  // Theme colors
  const theme = isWhite
    ? {
        bg: "linear-gradient(145deg, #1a1f2e 0%, #0d1117 50%, #1a1f2e 100%)",
        accent: "rgba(200,210,230,0.9)",
        accentLight: "rgba(200,210,230,0.15)",
        border: "rgba(200,210,230,0.25)",
        statBg: "rgba(200,210,230,0.08)",
        statBorder: "rgba(200,210,230,0.12)",
        nameShadow: "0 2px 8px rgba(0,0,0,0.5)",
        topGradient: "linear-gradient(180deg, rgba(200,210,230,0.12) 0%, transparent 100%)",
      }
    : {
        bg: "linear-gradient(145deg, #0a1f0a 0%, #0d1117 50%, #0a1f0a 100%)",
        accent: "rgba(34,197,94,0.9)",
        accentLight: "rgba(34,197,94,0.15)",
        border: "rgba(34,197,94,0.25)",
        statBg: "rgba(34,197,94,0.08)",
        statBorder: "rgba(34,197,94,0.12)",
        nameShadow: "0 2px 8px rgba(0,0,0,0.5)",
        topGradient: "linear-gradient(180deg, rgba(34,197,94,0.12) 0%, transparent 100%)",
      };

  // Interactive tilt effect
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!interactive || !innerRef.current || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (y - 0.5) * -8;
    const rotateY = (x - 0.5) * 8;
    innerRef.current.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    setHoloAngle(Math.atan2(y - 0.5, x - 0.5) * (180 / Math.PI) + 135);
  }, [interactive]);

  const handleMouseLeave = useCallback(() => {
    if (!interactive || !innerRef.current) return;
    innerRef.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    setHoloAngle(135);
  }, [interactive]);

  // Build stat rows
  const displayStats = customStats ?? (stats.isGoalkeeper
    ? [
        { label: "Matcher", value: stats.matches },
        { label: "Vinster", value: stats.wins },
        { label: "Vinstprocent", value: `${stats.winRate}%` },
        { label: "Nollor", value: stats.cleanSheets ?? 0 },
        { label: "Insläppta/match", value: stats.goalsAgainstPerMatch?.toFixed(1) ?? "-" },
        { label: "Top Streak", value: stats.topStreak },
      ]
    : [
        { label: "Matcher", value: stats.matches },
        { label: "Vinster", value: stats.wins },
        { label: "Top Streak", value: stats.topStreak },
        { label: "Mål", value: stats.goals },
        { label: "Assist", value: stats.assists },
        { label: "GWG", value: stats.gwg },
      ]
  );

  const w = 320 * scale;
  const h = 448 * scale;

  return (
    <>
      <style>{holoStyles}</style>
      <div
        ref={cardRef}
        className="hockey-card"
        style={{ width: w, height: h }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={innerRef}
          className="hockey-card-inner w-full h-full rounded-2xl overflow-hidden"
          style={{
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 ${theme.accentLight}`,
            fontSize: `${scale * 100}%`,
          }}
        >
          {/* Holographic overlays */}
          <div className="holo-shimmer rounded-2xl" style={{ "--holo-angle": `${holoAngle}deg` } as any} />
          <div className="holo-sparkle rounded-2xl" />

          {/* Top gradient accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 pointer-events-none" style={{ background: theme.topGradient }} />

          {/* Card content */}
          <div className="relative z-[5] flex flex-col h-full p-4">
            {/* Header: Logo + Season */}
            <div className="flex items-center justify-between mb-2">
              <img src={logo} alt="" className="w-8 h-8 object-contain opacity-80" />
              <div className="text-right">
                <p className="text-[8px] uppercase tracking-[0.2em] opacity-40" style={{ color: theme.accent }}>
                  Stålstadens SF
                </p>
                <p className="text-[10px] font-bold opacity-60" style={{ color: theme.accent }}>
                  {stats.season}
                </p>
              </div>
            </div>

            {/* Player photo area */}
            <div
              className="relative mx-auto mb-3 rounded-xl overflow-hidden"
              style={{
                width: "70%",
                aspectRatio: "3/4",
                background: theme.statBg,
                border: `1px solid ${theme.statBorder}`,
              }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={playerName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PlayerSilhouette team={team} />
                </div>
              )}

              {/* Position badge */}
              {position && (
                <div
                  className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-black"
                  style={{
                    background: theme.accentLight,
                    color: theme.accent,
                    border: `1px solid ${theme.border}`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {position}
                </div>
              )}

              {/* Number badge */}
              {playerNumber && (
                <div
                  className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-black"
                  style={{
                    background: theme.accentLight,
                    color: theme.accent,
                    border: `1px solid ${theme.border}`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  #{playerNumber}
                </div>
              )}

              {/* Captain badge */}
              {captainRole && captainRole !== "none" && (
                <div
                  className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-black"
                  style={{
                    background: "rgba(245,158,11,0.2)",
                    color: "rgba(245,158,11,0.9)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {captainRole === "captain" ? "C" : "A"}
                </div>
              )}

              {/* PIR badge */}
              {pirRating !== undefined && pirRating !== null && (
                <div
                  className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    background: pirRating >= 1100 ? "rgba(245,158,11,0.2)" : pirRating >= 1000 ? "rgba(34,197,94,0.2)" : "rgba(100,100,100,0.2)",
                    color: pirRating >= 1100 ? "rgba(245,158,11,0.9)" : pirRating >= 1000 ? "rgba(34,197,94,0.9)" : "rgba(150,150,150,0.9)",
                    border: `1px solid ${pirRating >= 1100 ? "rgba(245,158,11,0.3)" : pirRating >= 1000 ? "rgba(34,197,94,0.3)" : "rgba(100,100,100,0.3)"}`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  PIR {pirRating}
                </div>
              )}
            </div>

            {/* Player name */}
            <div className="text-center mb-2">
              <h2
                className="text-lg font-black uppercase tracking-wide leading-tight"
                style={{
                  color: theme.accent,
                  textShadow: theme.nameShadow,
                  fontFamily: "'Oswald', sans-serif",
                }}
              >
                {playerName}
              </h2>
            </div>

            {/* Divider */}
            <div className="card-border-shine h-px mb-2 opacity-30" />

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              {displayStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg p-1.5 text-center"
                  style={{
                    background: theme.statBg,
                    border: `1px solid ${theme.statBorder}`,
                  }}
                >
                  <p className="text-sm font-black" style={{ color: theme.accent }}>
                    {stat.value}
                  </p>
                  <p className="text-[7px] uppercase tracking-wider opacity-40" style={{ color: theme.accent }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t" style={{ borderColor: theme.statBorder }}>
              <img src={isWhite ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo} alt="" className="w-4 h-4 object-contain opacity-30" />
              <p className="text-[7px] uppercase tracking-[0.15em] opacity-25" style={{ color: theme.accent }}>
                Stålstadens SF • Hockeykort
              </p>
              <img src={isWhite ? IMAGES.teamGreenLogo : IMAGES.teamWhiteLogo} alt="" className="w-4 h-4 object-contain opacity-30" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Export helper ──────────────────────────────────────────────────────────
export async function exportCardAsImage(cardElement: HTMLElement, playerName: string): Promise<void> {
  // Use html2canvas for export
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(cardElement, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
  });
  const link = document.createElement("a");
  link.download = `hockeykort-${playerName.replace(/\s+/g, "-").toLowerCase()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
