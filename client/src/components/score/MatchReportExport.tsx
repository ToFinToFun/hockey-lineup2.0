import { useRef, useState, useCallback, useEffect } from "react";
import { IMAGES } from "@/lib/scoreConstants";
import { Download, Share2, Image, FileText, Loader2, AlertCircle, X, Check, Copy, Sun, Moon } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

interface GoalEvent {
  team: "white" | "green";
  timestamp: string;
  scorer?: string;
  assist?: string;
  other?: string;
  sponsor?: string;
}

interface MatchData {
  name: string;
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory: GoalEvent[];
  matchStartTime?: string;
  createdAt: string;
  lineup?: any;
}

interface MatchReportExportProps {
  match: MatchData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = "social" | "a4";
type ExportTheme = "dark" | "light";

// Load image with timeout and fallback - uses fetch + blob to avoid CORS
function loadImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[Export] Image load timeout:", url);
      resolve(null);
    }, timeoutMs);

    // Try fetch + blob approach first (avoids CORS canvas tainting)
    fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
          clearTimeout(timer);
          resolve(img);
        };
        img.onerror = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        img.src = objectUrl;
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

// Helper: draw rounded rect
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Helper: truncate text to fit width
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

export default function MatchReportExport({ match, open, onOpenChange }: MatchReportExportProps) {
  const [generating, setGenerating] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("social");
  const [theme, setTheme] = useState<ExportTheme>("dark");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<{
    whiteLogo: HTMLImageElement | null;
    greenLogo: HTMLImageElement | null;
    sponsors: (HTMLImageElement | null)[];
  }>({ whiteLogo: null, greenLogo: null, sponsors: [] });

  const goalHistory = (match.goalHistory ?? []) as GoalEvent[];

  // CRITICAL: Force remove Radix Dialog's pointer-events:none and scroll-lock on body
  // Radix Dialog sets body { pointer-events: none; data-scroll-locked } which blocks
  // all React event delegation even for portaled content
  useEffect(() => {
    if (!open) return;
    
    // Small delay to ensure Dialog has finished its close animation
    const timer = setTimeout(() => {
      // Remove pointer-events:none
      document.body.style.pointerEvents = '';
      // Remove scroll lock attributes
      document.body.removeAttribute('data-scroll-locked');
      // Also remove any Radix overlay styles
      const style = document.body.getAttribute('style') || '';
      if (style.includes('pointer-events')) {
        document.body.setAttribute('style', style.replace(/pointer-events:\s*none;?/g, ''));
      }
    }, 100);

    // Also set up a MutationObserver to catch any re-application
    const observer = new MutationObserver(() => {
      if (open && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [open]);

  // Pre-load all images on mount
  useEffect(() => {
    let cancelled = false;
    async function preload() {
      try {
        const [whiteLogo, greenLogo, ...sponsors] = await Promise.all([
          loadImage(IMAGES.teamWhiteLogo),
          loadImage(IMAGES.teamGreenLogo),
          loadImage(IMAGES.sponsorPolar),
          loadImage(IMAGES.sponsorLindstroms),
          loadImage(IMAGES.sponsorKirunabilfrakt),
          loadImage(IMAGES.sponsorRen),
        ]);
        if (!cancelled) {
          imagesRef.current = { whiteLogo, greenLogo, sponsors };
          setImagesLoaded(true);
        }
      } catch {
        if (!cancelled) {
          imagesRef.current = { whiteLogo: null, greenLogo: null, sponsors: [] };
          setImagesLoaded(true);
        }
      }
    }
    preload();
    return () => { cancelled = true; };
  }, []);

  // Parse match date
  const getMatchDate = useCallback(() => {
    const parts = match.name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1]}${parts[2] ? " " + parts[2] : ""}`;
    }
    return match.name;
  }, [match.name]);

  // Get lineup data
  const getLineupData = useCallback(() => {
    const lineup = match.lineup;
    if (!lineup) return null;
    const lineupEntries = lineup.lineup || {};
    const teamAName = lineup.teamAName || "Lag A";
    const isTeamAWhite = (teamAName || "").toLowerCase().includes("vit");
    const whitePrefix = isTeamAWhite ? "team-a" : "team-b";
    const greenPrefix = isTeamAWhite ? "team-b" : "team-a";

    const goalStats: Record<string, { goals: number; assists: number }> = {};
    for (const g of goalHistory) {
      if (g.scorer) {
        if (!goalStats[g.scorer]) goalStats[g.scorer] = { goals: 0, assists: 0 };
        goalStats[g.scorer].goals++;
      }
      if (g.assist) {
        if (!goalStats[g.assist]) goalStats[g.assist] = { goals: 0, assists: 0 };
        goalStats[g.assist].assists++;
      }
    }

    const getPlayers = (prefix: string) => {
      const players: { name: string; number: string; position: string; goals: number; assists: number }[] = [];
      for (const [slotId, p] of Object.entries(lineupEntries)) {
        if (!slotId.startsWith(prefix) || !p) continue;
        const pl = p as any;
        let pos = "";
        if (slotId.includes("-gk-")) pos = slotId.includes("-2") ? "RES" : "MV";
        else if (slotId.includes("-fwd-")) {
          const parts = slotId.split("-");
          const lastPart = parts[parts.length - 1];
          pos = lastPart === "c" ? "C" : lastPart === "lw" ? "LW" : lastPart === "rw" ? "RW" : "F";
        } else if (slotId.includes("-def-")) pos = "B";
        const playerKey = pl.number ? `${pl.name} #${pl.number}` : pl.name;
        const stats = goalStats[playerKey] || { goals: 0, assists: 0 };
        players.push({ name: pl.name || "", number: pl.number || "", position: pos, goals: stats.goals, assists: stats.assists });
      }
      return players.sort((a, b) => {
        if (a.position === "MV" && b.position !== "MV") return -1;
        if (b.position === "MV" && a.position !== "MV") return 1;
        return b.goals + b.assists - (a.goals + a.assists);
      });
    };

    return {
      whitePlayers: getPlayers(whitePrefix),
      greenPlayers: getPlayers(greenPrefix),
    };
  }, [match, goalHistory]);

  const generateCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const isSocial = format === "social";
    const isLight = theme === "light";
    const W = isSocial ? 1080 : 794;
    const H = isSocial ? 1440 : 1123;
    const canvas = canvasRef.current!;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Theme-aware color palette
    const colors = isLight ? {
      bg: "#f5f5f5",
      cardBg: "rgba(255,255,255,0.95)",
      cardBorder: "#d4d4d4",
      text: "#1a1a1a",
      textMuted: "#666",
      textDim: "#999",
      line: "#d4d4d4",
      scoreBadgeBg: "#e5e5e5",
      scoreBadgeText: "#1a1a1a",
      whiteTeamText: "#1a1a1a",
      greenTeamText: "#16a34a",
      greenTeamLight: "#22c55e",
      accentBlue: "#0a7ea4",
      positionBg: "#e5e5e5",
      positionText: "#666",
      statColor: "#d97706",
      iceTexture: "#000000",
      footer: "#999",
      sponsorAlpha: 0.7,
    } : {
      bg: "#111111",
      cardBg: "rgba(26,26,26,0.9)",
      cardBorder: "#333",
      text: "#ECEDEE",
      textMuted: "#888",
      textDim: "#666",
      line: "#333",
      scoreBadgeBg: "#1a1a1a",
      scoreBadgeText: "#ECEDEE",
      whiteTeamText: "#ECEDEE",
      greenTeamText: "#22C55E",
      greenTeamLight: "#4ade80",
      accentBlue: "#0a7ea4",
      positionBg: "#333",
      positionText: "#888",
      statColor: "#F59E0B",
      iceTexture: "#ffffff",
      footer: "#444",
      sponsorAlpha: 0.5,
    };

    const { whiteLogo, greenLogo, sponsors: sponsorLogos } = imagesRef.current;

    // ─── Background ───
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle ice texture pattern
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const len = Math.random() * 60 + 20;
      const angle = Math.random() * Math.PI;
      ctx.strokeStyle = colors.iceTexture;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Top accent bar (gradient)
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, "#0a7ea4");
    topGrad.addColorStop(0.5, "#0d9bc4");
    topGrad.addColorStop(1, "#22C55E");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, isSocial ? 8 : 5);

    const pad = isSocial ? 60 : 40;
    let y = isSocial ? 50 : 30;

    // ─── Header: STÅLSTADENS ───
    ctx.fillStyle = colors.accentBlue;
    ctx.font = `bold ${isSocial ? 20 : 13}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("STÅLSTADENS SCORE TRACKER", W / 2, y);
    y += isSocial ? 20 : 14;

    // Thin line under header
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - (isSocial ? 160 : 100), y);
    ctx.lineTo(W / 2 + (isSocial ? 160 : 100), y);
    ctx.stroke();
    y += isSocial ? 30 : 20;

    // ─── Match date ───
    ctx.fillStyle = colors.textMuted;
    ctx.font = `${isSocial ? 22 : 14}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(getMatchDate(), W / 2, y);
    y += isSocial ? 55 : 35;

    // ─── Score card area ───
    const cardH = isSocial ? 220 : 140;
    const cardY = y;

    // Card background
    ctx.fillStyle = colors.cardBg;
    roundRect(ctx, pad, cardY, W - pad * 2, cardH, isSocial ? 20 : 12);
    ctx.fill();
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, pad, cardY, W - pad * 2, cardH, isSocial ? 20 : 12);
    ctx.stroke();

    // Team logos in card
    const logoSize = isSocial ? 90 : 55;
    const logoY = cardY + (cardH - logoSize) / 2;
    const leftLogoX = pad + (isSocial ? 50 : 30);
    const rightLogoX = W - pad - (isSocial ? 50 : 30) - logoSize;

    if (whiteLogo) {
      ctx.drawImage(whiteLogo, leftLogoX, logoY, logoSize, logoSize);
    }
    if (greenLogo) {
      ctx.drawImage(greenLogo, rightLogoX, logoY, logoSize, logoSize);
    }

    // Team labels
    ctx.font = `bold ${isSocial ? 16 : 11}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = colors.whiteTeamText;
    ctx.fillText("VITA", leftLogoX + logoSize / 2, logoY + logoSize + (isSocial ? 20 : 14));
    ctx.fillStyle = colors.greenTeamText;
    ctx.fillText("GRÖNA", rightLogoX + logoSize / 2, logoY + logoSize + (isSocial ? 20 : 14));

    // Score in center
    const scoreSize = isSocial ? 80 : 50;
    const scoreCenterY = cardY + cardH / 2 + scoreSize * 0.35;

    ctx.fillStyle = colors.whiteTeamText;
    ctx.font = `bold ${scoreSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${match.teamWhiteScore}`, W / 2 - (isSocial ? 25 : 15), scoreCenterY);

    ctx.fillStyle = colors.textDim;
    ctx.font = `${isSocial ? 40 : 26}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("–", W / 2, scoreCenterY - (isSocial ? 5 : 3));

    ctx.fillStyle = colors.greenTeamText;
    ctx.font = `bold ${scoreSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`${match.teamGreenScore}`, W / 2 + (isSocial ? 25 : 15), scoreCenterY);

    // Winner indicator
    const winner = match.teamWhiteScore > match.teamGreenScore ? "white" : match.teamGreenScore > match.teamWhiteScore ? "green" : null;
    if (winner) {
      const indicatorX = winner === "white" ? leftLogoX + logoSize / 2 : rightLogoX + logoSize / 2;
      const indicatorY = logoY - (isSocial ? 12 : 8);
      ctx.fillStyle = winner === "white" ? colors.accentBlue : colors.greenTeamText;
      ctx.font = `bold ${isSocial ? 14 : 10}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("VINNARE", indicatorX, indicatorY);
    }

    y = cardY + cardH + (isSocial ? 40 : 25);

    // ─── Goal scorers section ───
    const whiteMap = new Map<string, { count: number; assists: string[] }>();
    const greenMap = new Map<string, { count: number; assists: string[] }>();

    for (const g of goalHistory) {
      const map = g.team === "white" ? whiteMap : greenMap;
      const scorerName = g.scorer || "Okänd";
      const existing = map.get(scorerName) || { count: 0, assists: [] };
      existing.count++;
      if (g.assist) existing.assists.push(g.assist);
      map.set(scorerName, existing);
    }

    const whiteGoals = Array.from(whiteMap.entries()).map(([scorer, data]) => ({
      scorer,
      count: data.count,
      assists: data.assists,
    }));
    const greenGoals = Array.from(greenMap.entries()).map(([scorer, data]) => ({
      scorer,
      count: data.count,
      assists: data.assists,
    }));

    if (whiteGoals.length > 0 || greenGoals.length > 0) {
      // Section header
      ctx.fillStyle = colors.accentBlue;
      ctx.font = `bold ${isSocial ? 16 : 11}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("MÅLGÖRARE", pad, y);
      y += isSocial ? 8 : 5;

      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
      y += isSocial ? 20 : 14;

      const colW = (W - pad * 2 - (isSocial ? 30 : 20)) / 2;
      const leftX = pad;
      const rightX = pad + colW + (isSocial ? 30 : 20);

      const renderGoals = (goals: typeof whiteGoals, x: number, color: string) => {
        let localY = y;
        for (const g of goals) {
          ctx.fillStyle = color;
          ctx.font = `bold ${isSocial ? 18 : 12}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "left";
          const label = g.count > 1 ? `${g.scorer} (${g.count})` : g.scorer;
          ctx.fillText(truncateText(ctx, label, colW), x, localY);
          localY += isSocial ? 6 : 4;

          if (g.assists.length > 0) {
            ctx.fillStyle = colors.textDim;
            ctx.font = `${isSocial ? 13 : 9}px system-ui, -apple-system, sans-serif`;
            const uniqueAssists = Array.from(new Set(g.assists));
            ctx.fillText(truncateText(ctx, `Assist: ${uniqueAssists.join(", ")}`, colW), x, localY + (isSocial ? 10 : 7));
            localY += isSocial ? 18 : 12;
          }
          localY += isSocial ? 20 : 14;
        }
        return localY;
      };

      const wEnd = renderGoals(whiteGoals, leftX, colors.whiteTeamText);
      const gEnd = renderGoals(greenGoals, rightX, colors.greenTeamLight);
      y = Math.max(wEnd, gEnd) + (isSocial ? 10 : 5);
    }

    // ─── Goal timeline (social only) ───
    if (isSocial && goalHistory.length > 0) {
      ctx.fillStyle = colors.accentBlue;
      ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("MÅLHISTORIK", pad, y);
      y += 8;

      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
      y += 20;

      let whiteScore = 0;
      let greenScore = 0;
      for (const g of goalHistory) {
        if (g.team === "white") whiteScore++;
        else greenScore++;

        const scoreText = `${whiteScore}-${greenScore}`;
        const scorerText = g.scorer || g.other || "Mål";
        const assistText = g.assist ? ` (${g.assist})` : "";
        const isWhite = g.team === "white";

        // Score badge
        ctx.fillStyle = colors.scoreBadgeBg;
        roundRect(ctx, pad, y - 14, 60, 24, 6);
        ctx.fill();
        ctx.fillStyle = colors.scoreBadgeText;
        ctx.font = "bold 14px system-ui, -apple-system, monospace";
        ctx.textAlign = "center";
        ctx.fillText(scoreText, pad + 30, y + 2);

        // Scorer name
        ctx.fillStyle = isWhite ? colors.whiteTeamText : colors.greenTeamLight;
        ctx.font = "14px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        const fullText = scorerText + assistText;
        ctx.fillText(truncateText(ctx, fullText, W - pad * 2 - 80), pad + 70, y + 2);

        y += 30;
        if (y > H - 120) break;
      }
      y += 10;
    }

    // ─── A4: Detailed goal history + lineup ───
    if (!isSocial) {
      // Goal history table
      if (goalHistory.length > 0) {
        ctx.fillStyle = colors.accentBlue;
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("MÅLHISTORIK", pad, y);
        y += 5;
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(W - pad, y);
        ctx.stroke();
        y += 14;

        let whiteScore = 0;
        let greenScore = 0;
        for (const g of goalHistory) {
          if (g.team === "white") whiteScore++;
          else greenScore++;
          if (y > H - 100) break;

          ctx.fillStyle = colors.scoreBadgeBg;
          roundRect(ctx, pad, y - 10, 40, 16, 4);
          ctx.fill();
          ctx.fillStyle = colors.scoreBadgeText;
          ctx.font = "bold 10px system-ui, -apple-system, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${whiteScore}-${greenScore}`, pad + 20, y + 1);

          ctx.fillStyle = g.team === "white" ? colors.whiteTeamText : colors.greenTeamLight;
          ctx.font = "10px system-ui, -apple-system, sans-serif";
          ctx.textAlign = "left";
          const scorer = g.scorer || g.other || "Mål";
          const assist = g.assist ? ` (${g.assist})` : "";
          ctx.fillText(truncateText(ctx, scorer + assist, W - pad * 2 - 60), pad + 48, y + 1);

          y += 20;
        }
        y += 10;
      }

      // Lineup section
      const lineupData = getLineupData();
      if (lineupData && y < H - 80) {
        ctx.fillStyle = colors.accentBlue;
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("LAGUPPSTÄLLNING", pad, y);
        y += 5;
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(W - pad, y);
        ctx.stroke();
        y += 14;

        const colW = (W - pad * 2 - 20) / 2;
        const leftX = pad;
        const rightX = pad + colW + 20;

        // Column headers
        ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = colors.whiteTeamText;
        ctx.fillText("VITA", leftX + 5, y);
        ctx.fillStyle = colors.greenTeamText;
        ctx.fillText("GRÖNA", rightX + 5, y);
        y += 14;

        const renderPlayers = (players: any[], x: number, color: string) => {
          let localY = y;
          for (const p of players) {
            if (localY > H - 70) break;
            ctx.fillStyle = color;
            ctx.font = "10px system-ui, -apple-system, sans-serif";
            ctx.textAlign = "left";
            const label = p.number ? `#${p.number} ${p.name}` : p.name;
            const display = truncateText(ctx, label, colW - 60);
            ctx.fillText(display, x + 5, localY);

            if (p.position) {
              ctx.fillStyle = colors.positionBg;
              roundRect(ctx, x + colW - 50, localY - 9, 22, 13, 3);
              ctx.fill();
              ctx.fillStyle = colors.positionText;
              ctx.font = "bold 8px system-ui, -apple-system, monospace";
              ctx.textAlign = "center";
              ctx.fillText(p.position, x + colW - 39, localY);
            }

            if (p.goals > 0 || p.assists > 0) {
              ctx.fillStyle = colors.statColor;
              ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
              ctx.textAlign = "right";
              const stats = [];
              if (p.goals > 0) stats.push(`${p.goals}G`);
              if (p.assists > 0) stats.push(`${p.assists}A`);
              ctx.fillText(stats.join(" "), x + colW - 5, localY);
            }

            localY += 15;
          }
          return localY;
        };

        const wEnd = renderPlayers(lineupData.whitePlayers, leftX, isLight ? "#333" : "#ccc");
        const gEnd = renderPlayers(lineupData.greenPlayers, rightX, colors.greenTeamLight);
        y = Math.max(wEnd, gEnd) + 10;
      }
    }

    // ─── Sponsor logos ───
    const sponsorY = H - (isSocial ? 75 : 48);
    const sponsorSize = isSocial ? 50 : 30;
    const validSponsors = sponsorLogos.filter((s): s is HTMLImageElement => s !== null);
    if (validSponsors.length > 0) {
      const gap = isSocial ? 25 : 15;
      const totalWidth = validSponsors.length * sponsorSize + (validSponsors.length - 1) * gap;
      let sx = (W - totalWidth) / 2;
      for (const logo of validSponsors) {
        ctx.globalAlpha = colors.sponsorAlpha;
        ctx.drawImage(logo, sx, sponsorY, sponsorSize, sponsorSize);
        ctx.globalAlpha = 1;
        sx += sponsorSize + gap;
      }
    }

    // ─── Footer ───
    ctx.fillStyle = colors.footer;
    ctx.font = `${isSocial ? 13 : 9}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("stalstadens-score-tracker", W / 2, H - (isSocial ? 18 : 12));

    // Bottom accent bar
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, H - (isSocial ? 4 : 3), W, isSocial ? 4 : 3);

    return canvas;
  }, [format, theme, match, goalHistory, getMatchDate, getLineupData]);

  const generatePreview = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const canvas = await generateCanvas();
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.error("Failed to generate preview:", err);
      setError("Kunde inte generera förhandsgranskning. Försök igen.");
    } finally {
      setGenerating(false);
    }
  }, [generateCanvas]);

  const downloadImage = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const canvas = await generateCanvas();
      canvas.toBlob((blob) => {
        if (!blob) {
          setError("Kunde inte skapa bild.");
          toast.error("Export misslyckades", { description: "Kunde inte skapa bilden. Försök igen." });
          setGenerating(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `matchrapport-${match.name.replace(/\s+/g, "-")}-${format}.png`;
        link.href = url;
        link.style.display = "none";
        // Temporarily restore pointer-events on body (Radix Dialog sets it to none)
        const prevPointerEvents = document.body.style.pointerEvents;
        document.body.style.pointerEvents = "auto";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        document.body.style.pointerEvents = prevPointerEvents;
        URL.revokeObjectURL(url);
        setGenerating(false);
        toast.success("Bild sparad!", {
          description: format === "social" ? "Sociala medier-format (1080×1440)" : "A4-dokument med lineup",
          duration: 3000,
        });
      }, "image/png");
    } catch (err) {
      console.error("Failed to download:", err);
      setError("Kunde inte ladda ner bilden. Försök igen.");
      toast.error("Export misslyckades", { description: "Kunde inte ladda ner bilden. Försök igen." });
      setGenerating(false);
    }
  }, [generateCanvas, match.name, format]);

  const shareImage = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const canvas = await generateCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setError("Kunde inte skapa bild för delning.");
        setGenerating(false);
        return;
      }
      try {
        if (navigator.share) {
          const file = new File([blob], `matchrapport-${match.name.replace(/\s+/g, "-")}.png`, { type: "image/png" });
          await navigator.share({ files: [file], title: `Matchrapport: ${match.name}` });
          toast.success("Delad!", { duration: 2000 });
        } else {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast.success("Kopierad till urklipp!", {
            description: "Bilden är redo att klistras in.",
            duration: 3000,
          });
        }
      } catch {
        // User cancelled share
      }
    } catch (err) {
      console.error("Failed to share:", err);
      setError("Kunde inte dela bilden. Försök igen.");
      toast.error("Delning misslyckades", { description: "Kunde inte dela bilden. Försök igen." });
    } finally {
      setGenerating(false);
    }
  }, [generateCanvas, match.name]);

  const copyToClipboard = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const canvas = await generateCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setError("Kunde inte skapa bild.");
        toast.error("Kopiering misslyckades", { description: "Kunde inte skapa bilden." });
        setGenerating(false);
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("Kopierad till urklipp!", {
        description: "Bilden är redo att klistras in.",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Kunde inte kopiera bilden. Din webbläsare kanske inte stöder detta.");
      toast.error("Kopiering misslyckades", { description: "Din webbläsare kanske inte stöder clipboard API." });
    } finally {
      setGenerating(false);
    }
  }, [generateCanvas]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ pointerEvents: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" style={{ pointerEvents: "none" }} />

      {/* Content */}
      <div
        className="relative bg-[#151515] border border-[#2a2a2a] rounded-2xl max-w-md w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-0">
          <h2 className="text-[#ECEDEE] font-bold text-lg">Exportera matchrapport</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[#888] hover:text-white transition-colors p-1 rounded-lg hover:bg-[#2a2a2a]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Match preview card */}
          <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a]">
            <p className="text-[#888] text-xs text-center mb-3 font-medium">{getMatchDate()}</p>
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-10 h-10 object-contain" />
                <span className="text-white text-2xl font-bold">{match.teamWhiteScore}</span>
                <span className="text-[#888] text-[10px] font-medium">VITA</span>
              </div>
              <span className="text-[#555] text-xl font-light">–</span>
              <div className="flex flex-col items-center gap-1">
                <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-10 h-10 object-contain" />
                <span className="text-[#22C55E] text-2xl font-bold">{match.teamGreenScore}</span>
                <span className="text-[#22C55E]/60 text-[10px] font-medium">GRÖNA</span>
              </div>
            </div>
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <p className="text-[#888] text-xs font-medium uppercase tracking-wider">Välj format</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setFormat("social"); setPreviewUrl(null); setError(null); }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                  format === "social"
                    ? "border-[#0a7ea4] bg-[#0a7ea4]/10 text-[#0a7ea4]"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#888] hover:border-[#444]"
                }`}
              >
                <Image size={20} />
                <span className="text-xs font-medium">Sociala medier</span>
                <span className="text-[10px] opacity-60">1080 × 1440px</span>
              </button>
              <button
                onClick={() => { setFormat("a4"); setPreviewUrl(null); setError(null); }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                  format === "a4"
                    ? "border-[#0a7ea4] bg-[#0a7ea4]/10 text-[#0a7ea4]"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#888] hover:border-[#444]"
                }`}
              >
                <FileText size={20} />
                <span className="text-xs font-medium">A4-dokument</span>
                <span className="text-[10px] opacity-60">Målhistorik + lineup</span>
              </button>
            </div>
          </div>

          {/* Theme selection */}
          <div className="space-y-2">
            <p className="text-[#888] text-xs font-medium uppercase tracking-wider">Tema</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setTheme("dark"); setPreviewUrl(null); setError(null); }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                  theme === "dark"
                    ? "border-[#0a7ea4] bg-[#0a7ea4]/10 text-[#0a7ea4]"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#888] hover:border-[#444]"
                }`}
              >
                <Moon size={16} />
                <span className="text-xs font-medium">Mörkt</span>
              </button>
              <button
                onClick={() => { setTheme("light"); setPreviewUrl(null); setError(null); }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                  theme === "light"
                    ? "border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#888] hover:border-[#444]"
                }`}
              >
                <Sun size={16} />
                <span className="text-xs font-medium">Ljust</span>
              </button>
            </div>
          </div>

          {/* Format info */}
          <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#2a2a2a]">
            <p className="text-[#888] text-[11px] leading-relaxed">
              {format === "social"
                ? "Optimerat för Instagram/Stories. Resultat, målgörare, assist och sponsorloggor. Perfekt för snabb delning."
                : "Komplett A4-rapport med resultat, målgörare, assist, fullständig målhistorik, laguppställning och sponsorloggor."}
            </p>
          </div>

          {/* Image loading status */}
          {!imagesLoaded && (
            <div className="flex items-center gap-2 text-[#888] text-xs">
              <Loader2 size={12} className="animate-spin" />
              <span>Laddar bilder...</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-[#2a2a2a]">
              <img src={previewUrl} alt="Förhandsgranskning" className="w-full" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={generatePreview}
              disabled={generating || !imagesLoaded}
              className="flex-1 flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] text-[#ECEDEE] py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
              Förhandsgranska
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={downloadImage}
              disabled={generating || !imagesLoaded}
              className="flex-1 flex items-center justify-center gap-2 bg-[#0a7ea4] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#0a7ea4]/80 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Ladda ner
            </button>
            <button
              onClick={copyToClipboard}
              disabled={generating || !imagesLoaded}
              className="flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#8B5CF6]/30 text-[#8B5CF6] px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#8B5CF6]/10 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
              Kopiera
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={shareImage}
              disabled={generating || !imagesLoaded}
              className="flex-1 flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl text-sm font-medium hover:bg-[#22C55E]/10 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              Dela
            </button>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>,
    document.body
  );
}
