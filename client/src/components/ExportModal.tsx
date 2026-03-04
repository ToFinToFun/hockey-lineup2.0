// ExportModal – Exportera uppställning som bild
// Fast 9:5 bildförhållande, solid bakgrund, ingen statistik

import { useRef, useState, useEffect } from "react";
import { X, Download, Share2 } from "lucide-react";
import type { Player, Position } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots } from "@/lib/lineup";
import { LOGO_GREEN_B64, LOGO_WHITE_B64 } from "@/lib/logoBase64";

interface ExportModalProps {
  onClose: () => void;
  teamAName: string;
  teamBName: string;
  teamALineup: Record<string, Player>;
  teamBLineup: Record<string, Player>;
  teamASlots: Slot[];
  teamBSlots: Slot[];
  logoGreen: string;
  logoWhite: string;
  bgUrl: string;
  allPlayers?: Player[];
}

function getToday(): string {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

// Load an image via fetch → blob URL to avoid canvas CORS taint issues
async function loadImage(src: string): Promise<HTMLImageElement> {
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("img load failed")); };
      img.src = blobUrl;
    });
  } catch {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
}

// Draw a rounded rectangle
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

// Draw a circular clipped image (logo)
function drawCircleLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  radius: number,
  fallbackColor: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();

  if (img) {
    ctx.clip();
    const d = radius * 2;
    ctx.drawImage(img, cx - radius, cy - radius, d, d);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fill();
  }

  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function getRoleColor(role: string): { bg: string; text: string } {
  if (role === "gk" || role === "res-gk") return { bg: "rgba(245,158,11,0.5)", text: "#fbbf24" };
  if (role === "def") return { bg: "rgba(96,165,250,0.5)", text: "#93c5fd" };
  if (role === "c") return { bg: "rgba(167,139,250,0.5)", text: "#c4b5fd" };
  return { bg: "rgba(52,211,153,0.5)", text: "#6ee7b7" };
}

// Compact team block drawing for 9:5 export
function drawTeamBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  teamName: string,
  accentColor: string,
  slots: Slot[],
  lineup: Record<string, Player>,
  logoImg: HTMLImageElement | null,
  logoFallbackColor: string,
  scale: number
): number {
  let curY = y;

  // Logo + team name row
  const logoRadius = Math.round(16 * scale);
  const logoCx = x + logoRadius;
  const logoCy = curY + logoRadius;
  drawCircleLogo(ctx, logoImg, logoCx, logoCy, logoRadius, logoFallbackColor);

  ctx.font = `bold ${Math.round(18 * scale)}px 'Arial', sans-serif`;
  ctx.fillStyle = accentColor;
  ctx.letterSpacing = "2px";
  ctx.fillText(teamName.toUpperCase(), x + logoRadius * 2 + 8, curY + logoRadius + Math.round(6 * scale));

  // Player count
  const playerCount = Object.keys(lineup).filter(k => slots.some(s => s.id === k && lineup[k])).length;
  const registeredCount = Object.values(lineup).filter(p => slots.some(s => lineup[s.id] === p) && p.isRegistered).length;
  ctx.font = `${Math.round(10 * scale)}px 'Arial', sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.letterSpacing = "0px";
  const countText = `${registeredCount} anmälda av ${playerCount} i laget`;
  ctx.fillText(countText, x + logoRadius * 2 + 8, curY + logoRadius + Math.round(18 * scale));

  curY += logoRadius * 2 + Math.round(8 * scale);

  // Filter to only filled slots
  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defenseSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const forwardSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defenseGroups = groupSlots(defenseSlots).filter((g) => g.slots.length > 0);
  const forwardGroups = groupSlots(forwardSlots).filter((g) => g.slots.length > 0);

  const rowH = Math.round(18 * scale);
  const rowGap = Math.round(2 * scale);
  const sectionGap = Math.round(4 * scale);
  const labelH = Math.round(13 * scale);
  const groupLabelH = Math.round(11 * scale);

  const drawSection = (label: string, labelColor: string, slotsArr: unknown[], drawContent: () => void) => {
    if (slotsArr.length === 0) return;
    ctx.font = `bold ${Math.round(8 * scale)}px 'Arial', sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.letterSpacing = "2px";
    ctx.fillText(label.toUpperCase(), x, curY + Math.round(8 * scale));
    curY += labelH;
    drawContent();
    curY += sectionGap;
  };

  const drawSlotRow = (slot: Slot, player: Player | null, rowX: number, rowWidth: number) => {
    const { bg, text } = getRoleColor(slot.role);

    // Row background - solid dark
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    roundRect(ctx, rowX, curY, rowWidth, rowH, Math.round(3 * scale));
    ctx.fill();

    // Badge
    const badgeW = Math.round(24 * scale);
    ctx.fillStyle = bg;
    roundRect(ctx, rowX + 2, curY + 2, badgeW, rowH - 4, Math.round(2 * scale));
    ctx.fill();
    ctx.font = `bold ${Math.round(7 * scale)}px 'Arial', sans-serif`;
    ctx.fillStyle = text;
    ctx.letterSpacing = "0px";
    ctx.textAlign = "center";
    ctx.fillText(slot.shortLabel, rowX + 2 + badgeW / 2, curY + Math.round(12 * scale));
    ctx.textAlign = "left";

    // Player name
    ctx.font = player ? `${Math.round(11 * scale)}px 'Arial', sans-serif` : `italic ${Math.round(10 * scale)}px 'Arial', sans-serif`;
    ctx.fillStyle = player ? "#ffffff" : "rgba(255,255,255,0.2)";
    ctx.letterSpacing = "0px";
    const nameX = rowX + badgeW + Math.round(6 * scale);
    const nameText = player
      ? (player.number ? `${player.name}  #${player.number}` : player.name)
      : "—";
    ctx.fillText(nameText, nameX, curY + Math.round(12 * scale));

    // Captain badge
    if (player?.captainRole) {
      const nameWidth = ctx.measureText(nameText).width;
      ctx.font = `bold ${Math.round(11 * scale)}px 'Arial', sans-serif`;
      ctx.fillStyle = player.captainRole === "C" ? "#fde047" : "#7dd3fc";
      ctx.fillText(player.captainRole, nameX + nameWidth + 4, curY + Math.round(12 * scale));
    }

    curY += rowH + rowGap;
  };

  // Goalkeepers
  drawSection("Målvakter", "#fbbf24", goalkeeperSlots, () => {
    goalkeeperSlots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, x, width));
  });

  // Defense groups in 2-column grid
  drawSection("Backar", "#93c5fd", defenseSlots, () => {
    const colW = (width - Math.round(4 * scale)) / 2;
    const baseY = curY;
    const rowHeights: number[] = [];
    for (let i = 0; i < defenseGroups.length; i += 2) {
      const leftH = groupLabelH + defenseGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < defenseGroups.length) ? groupLabelH + defenseGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      rowHeights.push(Math.max(leftH, rightH) + Math.round(2 * scale));
    }
    defenseGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + Math.round(4 * scale));
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];
      curY = gy;

      ctx.font = `bold ${Math.round(7 * scale)}px 'Arial', sans-serif`;
      ctx.fillStyle = "rgba(96,165,250,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + Math.round(7 * scale));
      curY += groupLabelH;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
  });

  // Forward groups in 2-column grid
  drawSection("Forwards", "#6ee7b7", forwardSlots, () => {
    const colW = (width - Math.round(4 * scale)) / 2;
    const baseY = curY;
    const rowHeights: number[] = [];
    for (let i = 0; i < forwardGroups.length; i += 2) {
      const leftH = groupLabelH + forwardGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < forwardGroups.length) ? groupLabelH + forwardGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      rowHeights.push(Math.max(leftH, rightH) + Math.round(2 * scale));
    }
    forwardGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + Math.round(4 * scale));
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];
      curY = gy;

      ctx.font = `bold ${Math.round(7 * scale)}px 'Arial', sans-serif`;
      ctx.fillStyle = "rgba(52,211,153,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + Math.round(7 * scale));
      curY += groupLabelH;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
  });

  return curY;
}

// Calculate the total height a team block will occupy
function calcTeamHeight(slots: Slot[], lineup: Record<string, Player>, scale: number): number {
  const gkSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const fwdSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defGroups = groupSlots(defSlots).filter((g) => g.slots.length > 0);
  const fwdGroups = groupSlots(fwdSlots).filter((g) => g.slots.length > 0);

  const rowH = Math.round(18 * scale);
  const rowGap = Math.round(2 * scale);
  const labelH = Math.round(13 * scale);
  const groupLabelH = Math.round(11 * scale);
  const sectionGap = Math.round(4 * scale);

  let h = Math.round(16 * scale) * 2 + Math.round(8 * scale); // logo row
  if (gkSlots.length > 0) h += labelH + gkSlots.length * (rowH + rowGap) + sectionGap;
  if (defSlots.length > 0) {
    h += labelH;
    for (let i = 0; i < defGroups.length; i += 2) {
      const leftH = groupLabelH + defGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < defGroups.length) ? groupLabelH + defGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      h += Math.max(leftH, rightH) + Math.round(2 * scale);
    }
    h += sectionGap;
  }
  if (fwdSlots.length > 0) {
    h += labelH;
    for (let i = 0; i < fwdGroups.length; i += 2) {
      const leftH = groupLabelH + fwdGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < fwdGroups.length) ? groupLabelH + fwdGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      h += Math.max(leftH, rightH) + Math.round(2 * scale);
    }
    h += sectionGap;
  }
  return h;
}

export function ExportModal({
  onClose,
  teamAName,
  teamBName,
  teamALineup,
  teamBLineup,
  teamASlots,
  teamBSlots,
}: ExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exporting, setExporting] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [sharing, setSharing] = useState(false);

  const renderCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load logos
    let imgWhite: HTMLImageElement | null = null;
    let imgGreen: HTMLImageElement | null = null;
    const [resWhite, resGreen] = await Promise.allSettled([
      loadImage(LOGO_WHITE_B64),
      loadImage(LOGO_GREEN_B64),
    ]);
    if (resWhite.status === "fulfilled") imgWhite = resWhite.value;
    if (resGreen.status === "fulfilled") imgGreen = resGreen.value;

    // Fixed 9:5 aspect ratio
    const W = 900;
    const H = 500;

    canvas.width = W * 2;
    canvas.height = H * 2;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(2, 2);

    // Solid dark background
    ctx.fillStyle = "#0a1628";
    ctx.fillRect(0, 0, W, H);

    // Subtle gradient overlay for depth
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(10,30,50,0.6)");
    grad.addColorStop(0.5, "rgba(5,15,25,0.3)");
    grad.addColorStop(1, "rgba(10,30,50,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle border around the entire image
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // Determine which teams have players
    const teamAHasPlayers = Object.keys(teamALineup).length > 0;
    const teamBHasPlayers = Object.keys(teamBLineup).length > 0;
    const bothTeams = teamAHasPlayers && teamBHasPlayers;

    // Header area
    const headerH = 60;
    const padding = 20;

    // Header background strip
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, headerH);

    // Bottom border of header
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(W, headerH);
    ctx.stroke();

    // Title
    ctx.font = "bold 24px 'Arial', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.letterSpacing = "3px";
    ctx.fillText("STÅLSTADENS", padding, 36);

    const titleW = ctx.measureText("STÅLSTADENS").width;
    ctx.fillStyle = "#34d399";
    ctx.fillText(" LINEUP", padding + titleW, 36);

    // Date subtitle
    ctx.font = "10px 'Arial', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.letterSpacing = "2px";
    ctx.fillText(`A-LAG HERRAR  ·  ${getToday().toUpperCase()}`, padding, 52);

    // Content area
    const contentY = headerH + 10;
    const contentH = H - headerH - 30; // leave room for footer
    const contentW = W - padding * 2;

    // Calculate scale factor to fit content in available height
    const teamAH = teamAHasPlayers ? calcTeamHeight(teamASlots, teamALineup, 1) : 0;
    const teamBH = teamBHasPlayers ? calcTeamHeight(teamBSlots, teamBLineup, 1) : 0;
    const maxTeamH = bothTeams ? Math.max(teamAH, teamBH) : (teamAH + teamBH);
    const availableH = contentH - 10;
    const scale = Math.min(1, availableH / maxTeamH);

    if (bothTeams) {
      // Two-column layout
      const colW = (contentW - 20) / 2;

      // Column backgrounds
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 4, contentY - 2, colW + 8, contentH + 4, 6);
      ctx.fill();

      roundRect(ctx, W / 2 + 6, contentY - 2, colW + 8, contentH + 4, 6);
      ctx.fill();

      // VITA team
      drawTeamBlock(ctx, padding, contentY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff", scale);

      // Center separator
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2, contentY);
      ctx.lineTo(W / 2, H - 20);
      ctx.stroke();

      // GRÖNA team
      drawTeamBlock(ctx, W / 2 + 10, contentY, colW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931", scale);
    } else if (teamAHasPlayers) {
      const colW = contentW;
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 4, contentY - 2, colW + 8, contentH + 4, 6);
      ctx.fill();
      drawTeamBlock(ctx, padding, contentY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff", scale);
    } else if (teamBHasPlayers) {
      const colW = contentW;
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 4, contentY - 2, colW + 8, contentH + 4, 6);
      ctx.fill();
      drawTeamBlock(ctx, padding, contentY, colW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931", scale);
    }

    // Footer
    ctx.font = "8px 'Arial', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.letterSpacing = "1px";
    ctx.textAlign = "center";
    ctx.fillText("STÅLSTADENS SPORTFÖRENING", W / 2, H - 8);
    ctx.textAlign = "left";

    setRendered(true);
  };

  // Render on mount
  useEffect(() => {
    const timer = setTimeout(() => { renderCanvas(); }, 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharing(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) { setSharing(false); return; }
      const filename = `stalstadens-lineup-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Stålstadens Lineup",
          text: `Uppställning ${new Date().toLocaleDateString("sv-SE")}`,
          files: [file],
        });
      } else if (navigator.share) {
        const url = URL.createObjectURL(blob);
        await navigator.share({
          title: "Stålstadens Lineup",
          text: `Uppställning ${new Date().toLocaleDateString("sv-SE")}`,
          url,
        });
        URL.revokeObjectURL(url);
      } else {
        handleExport();
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Share failed", err);
      }
    } finally {
      setSharing(false);
    }
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);

    const doDownload = (href: string, filename: string) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        setExporting(false);
      }, 200);
    };

    const filename = `stalstadens-lineup-${new Date().toISOString().slice(0, 10)}.png`;

    try {
      canvas.toBlob((blob) => {
        try {
          if (blob) {
            const url = URL.createObjectURL(blob);
            doDownload(url, filename);
            setTimeout(() => URL.revokeObjectURL(url), 500);
          } else {
            const dataUrl = canvas.toDataURL("image/png");
            doDownload(dataUrl, filename);
          }
        } catch {
          try {
            const dataUrl = canvas.toDataURL("image/png");
            doDownload(dataUrl, filename);
          } catch (e3) {
            console.error("Export fallback failed", e3);
            setExporting(false);
          }
        }
      }, "image/png");
    } catch (e) {
      try {
        const dataUrl = canvas.toDataURL("image/png");
        doDownload(dataUrl, filename);
      } catch (e2) {
        console.error("Export failed", e, e2);
        setExporting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] w-full max-w-5xl overflow-hidden">
        {/* Modal-header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-white font-black text-base uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Exportera uppställning
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={sharing || !rendered}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-bold hover:bg-sky-500/30 disabled:opacity-50 transition-all uppercase tracking-wider"
            >
              <Share2 className="w-3.5 h-3.5" />
              {sharing ? "Delar..." : "Dela"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !rendered}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 disabled:opacity-50 transition-all uppercase tracking-wider"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exporterar..." : "Ladda ner bild"}
            </button>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas preview */}
        <div className="flex-1 overflow-auto p-4 bg-black/20 flex items-center justify-center">
          {!rendered && (
            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Genererar förhandsvisning…</div>
          )}
          <div className="inline-block">
            <canvas
              ref={canvasRef}
              className="rounded-xl shadow-2xl border border-white/10 max-w-full h-auto"
              style={{ aspectRatio: "9/5" }}
            />
          </div>
        </div>

        <div className="px-5 py-2 border-t border-white/10 shrink-0">
          <p className="text-white/30 text-xs">Förhandsvisning (9:5). Klicka "Ladda ner bild" för att spara som PNG.</p>
        </div>
      </div>
    </div>
  );
}
