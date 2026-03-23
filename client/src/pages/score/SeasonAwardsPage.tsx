import { trpc } from "@/lib/trpc";
import { IMAGES } from "@/lib/scoreConstants";
import { useMemo, useState, useCallback, useRef } from "react";
import { ArrowLeft, Calendar, Trophy, Award, Crown, Star, Flame, Shield, Zap, Medal, Download, Share2 } from "lucide-react";
import { HockeyPuck, HockeyStick, HockeyGoalNet, GoalieMask } from "@/components/score/HockeyIcons";

type PeriodPreset = 'preseason' | 'season' | 'playoff' | 'year' | 'month' | 'week' | 'all';

function getCalendarWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: monday.toISOString().split('T')[0]!, to: sunday.toISOString().split('T')[0]! };
}

function getCalendarMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

function getCalendarYearRange(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Get the dynamic title based on period */
function getAwardsTitle(period: PeriodPreset): string {
  switch (period) {
    case 'season': return 'Säsongens Bästa';
    case 'playoff': return 'Slutspelets Bästa';
    case 'preseason': return 'Försäsongens Bästa';
    case 'month': return 'Månadens Bästa';
    case 'week': return 'Veckans Bästa';
    case 'year': return 'Årets Bästa';
    case 'all': return 'All-Time Bästa';
    default: return 'Säsongens Bästa';
  }
}

/** Period filter button labels */
const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
  { key: 'season', label: 'Säsong' },
  { key: 'playoff', label: 'Slutspel' },
  { key: 'preseason', label: 'Försäsong' },
  { key: 'month', label: 'Månad' },
  { key: 'week', label: 'Vecka' },
  { key: 'all', label: 'Alla' },
];

interface SeasonAwardsPageProps {
  onBack: () => void;
  onPlayerClick?: (playerName: string) => void;
  initialPeriod?: PeriodPreset;
}

/** Map award id to a gradient + icon (badge) + inline icon (before title) */
function getAwardStyle(id: string): { gradient: string; iconBg: string; icon: React.ReactNode; inlineIcon: React.ReactNode; borderColor: string; color: string } {
  switch (id) {
    case 'top_scorer':
      return { gradient: 'from-amber-900/40 to-amber-800/20', iconBg: 'bg-amber-500/20', icon: <HockeyPuck size={24} className="text-amber-400" />, inlineIcon: <HockeyPuck size={16} className="text-amber-400" />, borderColor: 'border-amber-500/30', color: '#F59E0B' };
    case 'points_leader':
      return { gradient: 'from-yellow-900/40 to-yellow-800/20', iconBg: 'bg-yellow-500/20', icon: <Crown size={24} className="text-yellow-400" />, inlineIcon: <Crown size={16} className="text-yellow-400" />, borderColor: 'border-yellow-500/30', color: '#EAB308' };
    case 'assist_leader':
      return { gradient: 'from-blue-900/40 to-blue-800/20', iconBg: 'bg-blue-500/20', icon: <HockeyStick size={24} className="text-blue-400" />, inlineIcon: <HockeyStick size={16} className="text-blue-400" />, borderColor: 'border-blue-500/30', color: '#60A5FA' };
    case 'mr_clutch':
      return { gradient: 'from-red-900/40 to-red-800/20', iconBg: 'bg-red-500/20', icon: <HockeyGoalNet size={24} className="text-red-400" />, inlineIcon: <HockeyGoalNet size={16} className="text-red-400" />, borderColor: 'border-red-500/30', color: '#F87171' };
    case 'best_winner':
      return { gradient: 'from-emerald-900/40 to-emerald-800/20', iconBg: 'bg-emerald-500/20', icon: <Trophy size={24} className="text-emerald-400" />, inlineIcon: <Trophy size={16} className="text-emerald-400" />, borderColor: 'border-emerald-500/30', color: '#34D399' };
    case 'iron_man':
      return { gradient: 'from-slate-700/40 to-slate-600/20', iconBg: 'bg-slate-500/20', icon: <Shield size={24} className="text-slate-300" />, inlineIcon: <Shield size={16} className="text-slate-300" />, borderColor: 'border-slate-500/30', color: '#CBD5E1' };
    case 'best_streak':
      return { gradient: 'from-orange-900/40 to-orange-800/20', iconBg: 'bg-orange-500/20', icon: <Flame size={24} className="text-orange-400" />, inlineIcon: <Flame size={16} className="text-orange-400" />, borderColor: 'border-orange-500/30', color: '#FB923C' };
    case 'unbeaten':
      return { gradient: 'from-cyan-900/40 to-cyan-800/20', iconBg: 'bg-cyan-500/20', icon: <Shield size={24} className="text-cyan-400" />, inlineIcon: <Shield size={16} className="text-cyan-400" />, borderColor: 'border-cyan-500/30', color: '#22D3EE' };
    case 'best_match':
      return { gradient: 'from-purple-900/40 to-purple-800/20', iconBg: 'bg-purple-500/20', icon: <Star size={24} className="text-purple-400" />, inlineIcon: <Star size={16} className="text-purple-400" />, borderColor: 'border-purple-500/30', color: '#C084FC' };
    case 'best_goalkeeper':
      return { gradient: 'from-teal-900/40 to-teal-800/20', iconBg: 'bg-teal-500/20', icon: <GoalieMask size={24} className="text-teal-400" />, inlineIcon: <GoalieMask size={16} className="text-teal-400" />, borderColor: 'border-teal-500/30', color: '#2DD4BF' };
    default:
      return { gradient: 'from-gray-800/40 to-gray-700/20', iconBg: 'bg-gray-500/20', icon: <Award size={24} className="text-gray-400" />, inlineIcon: <Award size={16} className="text-gray-400" />, borderColor: 'border-gray-500/30', color: '#9CA3AF' };
  }
}

/** Medal position indicator */
function PositionBadge({ position }: { position: 1 | 2 }) {
  if (position === 1) {
    return (
      <div className="flex items-center gap-1">
        <div className="w-5 h-5 rounded-full bg-amber-500/30 flex items-center justify-center">
          <span className="text-amber-400 text-[10px] font-bold">1</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <div className="w-5 h-5 rounded-full bg-[#3a3a3a] flex items-center justify-center">
        <span className="text-[#9BA1A6] text-[10px] font-bold">2</span>
      </div>
    </div>
  );
}

/** Canvas-based export for awards */
async function generateAwardsImage(
  awards: { id: string; title: string; winner: string; value: string; description: string; runnerUp?: string; runnerUpValue?: string }[],
  title: string,
  totalMatches: number,
  periodLabel: string,
): Promise<HTMLCanvasElement> {
  const W = 1080;
  const padding = 60;
  const headerH = 220;
  const awardCardH = 120;
  const awardGap = 16;
  const footerH = 140;
  const totalAwardsH = awards.length * awardCardH + (awards.length - 1) * awardGap;
  const H = headerH + totalAwardsH + footerH + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(10, 126, 164, 0.08)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Header - accent line
  ctx.fillStyle = '#22C55E';
  ctx.fillRect(padding, padding, W - padding * 2, 3);

  // Title
  ctx.fillStyle = '#9BA1A6';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STÅLSTADENS SCORE TRACKER', W / 2, padding + 36);

  // Main title
  ctx.fillStyle = '#ECEDEE';
  ctx.font = 'bold 52px system-ui, -apple-system, sans-serif';
  ctx.fillText(title.toUpperCase(), W / 2, padding + 100);

  // Period + matches
  ctx.fillStyle = '#687076';
  ctx.font = '500 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${periodLabel} — ${totalMatches} matcher`, W / 2, padding + 140);

  // Accent line under header
  ctx.fillStyle = '#22C55E';
  ctx.fillRect(padding, padding + 170, W - padding * 2, 2);

  // Award cards
  let y = padding + headerH;
  const awardColors: Record<string, string> = {
    top_scorer: '#F59E0B', points_leader: '#EAB308', assist_leader: '#60A5FA',
    mr_clutch: '#F87171', best_winner: '#34D399', iron_man: '#CBD5E1',
    best_streak: '#FB923C', unbeaten: '#22D3EE', best_match: '#C084FC',
    best_goalkeeper: '#2DD4BF',
  };

  for (const award of awards) {
    const color = awardColors[award.id] || '#9CA3AF';

    // Card background
    ctx.fillStyle = 'rgba(42, 42, 42, 0.6)';
    const cardX = padding;
    const cardW = W - padding * 2;
    roundRect(ctx, cardX, y, cardW, awardCardH, 16);
    ctx.fill();

    // Left accent bar
    ctx.fillStyle = color;
    roundRect(ctx, cardX, y, 5, awardCardH, 3);
    ctx.fill();

    // Trophy emoji circle
    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.beginPath();
    ctx.arc(cardX + 55, y + awardCardH / 2, 26, 0, Math.PI * 2);
    ctx.fill();

    // Award title
    ctx.fillStyle = color;
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(award.title, cardX + 95, y + 34);

    // Winner name
    ctx.fillStyle = '#ECEDEE';
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.fillText(award.winner, cardX + 95, y + 72);

    // Value
    ctx.fillStyle = '#ECEDEE';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(award.value, cardX + cardW - 30, y + 52);

    // Runner up
    if (award.runnerUp) {
      ctx.fillStyle = '#687076';
      ctx.font = '500 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`2. ${award.runnerUp}${award.runnerUpValue ? ` (${award.runnerUpValue})` : ''}`, cardX + 95, y + 100);
    }

    y += awardCardH + awardGap;
  }

  // Footer - sponsor logos
  const sponsorY = y + 30;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(padding, sponsorY, W - padding * 2, 1);

  ctx.fillStyle = '#687076';
  ctx.font = '500 14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPONSORER', W / 2, sponsorY + 28);

  // Load and draw sponsor logos
  const sponsorUrls = [IMAGES.sponsorPolar, IMAGES.sponsorLindstroms, IMAGES.sponsorKirunabilfrakt, IMAGES.sponsorRen];
  const logoSize = 50;
  const totalLogosW = sponsorUrls.length * logoSize + (sponsorUrls.length - 1) * 30;
  let logoX = (W - totalLogosW) / 2;

  try {
    for (const url of sponsorUrls) {
      const img = await loadImage(url);
      const aspect = img.width / img.height;
      const drawW = aspect > 1 ? logoSize : logoSize * aspect;
      const drawH = aspect > 1 ? logoSize / aspect : logoSize;
      ctx.drawImage(img, logoX + (logoSize - drawW) / 2, sponsorY + 42 + (logoSize - drawH) / 2, drawW, drawH);
      logoX += logoSize + 30;
    }
  } catch {
    // Sponsors failed to load, skip
  }

  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    // Use server-side proxy to bypass CORS for CDN images
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`;
    img.src = proxyUrl;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SeasonAwardsPage({ onBack, onPlayerClick, initialPeriod }: SeasonAwardsPageProps) {
  const [period, setPeriod] = useState<PeriodPreset>(initialPeriod || 'season');
  const [isExporting, setIsExporting] = useState(false);

  // Period config from DB
  const { data: periodConfig } = trpc.score.config.getPeriods.useQuery();

  const dateFilter = useMemo((): { from?: string; to?: string } => {
    if (period === 'all') return {};
    if (period === 'preseason' && periodConfig) return { from: periodConfig.preseasonFrom, to: periodConfig.preseasonTo };
    if (period === 'season' && periodConfig) return { from: periodConfig.seasonFrom, to: periodConfig.seasonTo };
    if (period === 'playoff' && periodConfig) return { from: periodConfig.playoffFrom, to: periodConfig.playoffTo };
    if (period === 'year') return getCalendarYearRange();
    if (period === 'month') return getCalendarMonthRange();
    if (period === 'week') return getCalendarWeekRange();
    return {};
  }, [period, periodConfig]);

  const queryInput = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) return undefined;
    return dateFilter;
  }, [dateFilter]);

  const periodLabel = useMemo(() => {
    switch (period) {
      case 'preseason': return `Försäsong${periodConfig ? ` (${periodConfig.preseasonFrom.slice(5)}–${periodConfig.preseasonTo.slice(5)})` : ''}`;
      case 'season': return `Säsong${periodConfig ? ` (${periodConfig.seasonFrom.slice(0,4)}/${periodConfig.seasonTo.slice(0,4)})` : ''}`;
      case 'playoff': return `Slutspel${periodConfig ? ` (${periodConfig.playoffFrom.slice(5)})` : ''}`;
      case 'year': return `År ${new Date().getFullYear()}`;
      case 'month': {
        const months = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
        return months[new Date().getMonth()] + ' ' + new Date().getFullYear();
      }
      case 'week': return 'Denna vecka';
      default: return 'Alla matcher';
    }
  }, [period, periodConfig]);

  const title = getAwardsTitle(period);

  const { data, isLoading } = trpc.scoreStats.seasonAwards.useQuery(queryInput);

  const handleExport = useCallback(async () => {
    if (!data || data.awards.length === 0) return;
    setIsExporting(true);
    try {
      const canvas = await generateAwardsImage(data.awards, title, data.totalMatches, periodLabel);
      canvas.toBlob((blob) => {
        if (!blob) return;
        // Try native share first
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `${title.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title }).catch(() => downloadBlob(blob, title));
            return;
          }
        }
        downloadBlob(blob, title);
      }, 'image/png');
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  }, [data, title, periodLabel]);

  const handleDownload = useCallback(async () => {
    if (!data || data.awards.length === 0) return;
    setIsExporting(true);
    try {
      const canvas = await generateAwardsImage(data.awards, title, data.totalMatches, periodLabel);
      canvas.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(blob, title);
      }, 'image/png');
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  }, [data, title, periodLabel]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
          <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-[#ECEDEE] font-bold text-lg flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            {title}
          </h1>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-8 h-8 border-2 border-[#0a7ea4] border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
        <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[#ECEDEE] font-bold text-lg flex items-center gap-2 flex-1 min-w-0">
          <Trophy size={18} className="text-amber-400 flex-shrink-0" />
          <span className="truncate">{title}</span>
        </h1>
        {data && data.awards.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="p-2 rounded-lg bg-[#2a2a2a] text-[#9BA1A6] hover:text-[#ECEDEE] hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
              title="Ladda ner bild"
            >
              <Download size={16} />
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="p-2 rounded-lg bg-[#0a7ea4] text-white hover:bg-[#0a7ea4]/80 transition-colors disabled:opacity-50"
              title="Dela"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Share2 size={16} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Period filter */}
      <div className="px-4 py-2 border-b border-[#3a3a3a]/50">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                period === opt.key
                  ? 'bg-[#0a7ea4] text-white'
                  : 'bg-[#2a2a2a] text-[#9BA1A6] hover:text-[#ECEDEE]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Calendar size={11} className="text-[#687076]" />
          <span className="text-[#687076] text-[10px] uppercase tracking-wide">{periodLabel}</span>
          <span className="text-[#687076] text-[10px] ml-auto">{data?.totalMatches ?? 0} matcher</span>
        </div>
      </div>

      {/* Content */}
      {(!data || data.awards.length === 0) ? (
        <div className="text-center py-12">
          <Trophy size={48} className="mx-auto text-[#3a3a3a] mb-4" />
          <p className="text-[#9BA1A6] text-base">Inga priser ännu</p>
          <p className="text-[#687076] text-sm mt-1">Spela fler matcher för att se {title.toLowerCase()}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Hero award */}
          {data.awards.length > 0 && (() => {
            const heroAward = data.awards[0];
            const style = getAwardStyle(heroAward.id);
            return (
              <div className={`relative overflow-hidden rounded-2xl border ${style.borderColor} bg-gradient-to-br ${style.gradient}`}>
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
                  <Trophy size={128} />
                </div>
                <div className="relative p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${style.iconBg} flex items-center justify-center flex-shrink-0`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {style.inlineIcon}
                        <h3 className="text-[#ECEDEE] font-bold text-base">{heroAward.title}</h3>
                      </div>
                      <button
                        onClick={() => onPlayerClick?.(heroAward.winner)}
                        className="text-amber-400 font-bold text-xl hover:text-amber-300 transition-colors text-left truncate block w-full"
                      >
                        {heroAward.winner}
                      </button>
                      <p className="text-[#ECEDEE] text-sm font-semibold mt-1">{heroAward.value}</p>
                      <p className="text-[#9BA1A6] text-xs mt-1">{heroAward.description}</p>
                      {heroAward.runnerUp && (
                        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                          <PositionBadge position={2} />
                          <button
                            onClick={() => onPlayerClick?.(heroAward.runnerUp!)}
                            className="text-[#9BA1A6] text-xs hover:text-[#ECEDEE] transition-colors"
                          >
                            {heroAward.runnerUp}
                          </button>
                          {heroAward.runnerUpValue && (
                            <span className="text-[#687076] text-xs ml-auto">{heroAward.runnerUpValue}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Rest of awards */}
          {data.awards.slice(1).map((award) => {
            const style = getAwardStyle(award.id);
            return (
              <div
                key={award.id}
                className={`rounded-2xl border ${style.borderColor} bg-gradient-to-br ${style.gradient} overflow-hidden`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl ${style.iconBg} flex items-center justify-center flex-shrink-0`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {style.inlineIcon}
                        <h3 className="text-[#ECEDEE] font-bold text-sm">{award.title}</h3>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <button
                          onClick={() => onPlayerClick?.(award.winner)}
                          className="text-[#ECEDEE] font-bold text-base hover:text-[#0a7ea4] transition-colors truncate"
                        >
                          {award.winner}
                        </button>
                        <span className="text-[#9BA1A6] text-xs font-medium flex-shrink-0">{award.value}</span>
                      </div>
                      <p className="text-[#687076] text-[11px] mt-0.5">{award.description}</p>
                      {award.runnerUp && (
                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                          <PositionBadge position={2} />
                          <button
                            onClick={() => onPlayerClick?.(award.runnerUp!)}
                            className="text-[#687076] text-[11px] hover:text-[#9BA1A6] transition-colors"
                          >
                            {award.runnerUp}
                          </button>
                          {award.runnerUpValue && (
                            <span className="text-[#687076] text-[11px] ml-auto">{award.runnerUpValue}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div className="text-center py-4">
            <p className="text-[#687076] text-[10px]">
              Baserat på {data.totalMatches} matcher ({periodLabel})
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
