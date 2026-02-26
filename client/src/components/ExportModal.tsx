// ExportModal – Exportera uppställning som bild
// Använder ren Canvas API för att rita uppställningen – fungerar i alla miljöer utan CORS-problem

import { useRef, useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import type { Player } from "@/lib/players";
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
}

function getToday(): string {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

// Load an image via fetch → blob URL to avoid canvas CORS taint issues
async function loadImage(src: string): Promise<HTMLImageElement> {
  // Try fetch first (works even without CORS headers since we use blob URL)
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
    // Fallback: load with crossOrigin=anonymous to avoid tainting canvas
    // If the server doesn't send CORS headers this will fail, but we reject cleanly
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

// Draw a circular clipped image (logo) at cx, cy with given radius
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
    // Draw image centered inside the circle
    const d = radius * 2;
    ctx.drawImage(img, cx - radius, cy - radius, d, d);
  } else {
    // Fallback: solid color circle
    ctx.fillStyle = fallbackColor;
    ctx.fill();
  }

  // Subtle border ring
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
  if (role === "gk" || role === "res-gk") return { bg: "rgba(245,158,11,0.35)", text: "#f59e0b" };
  if (role === "def") return { bg: "rgba(96,165,250,0.35)", text: "#60a5fa" };
  if (role === "c") return { bg: "rgba(167,139,250,0.35)", text: "#a78bfa" };
  return { bg: "rgba(52,211,153,0.35)", text: "#34d399" };
}

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
  logoFallbackColor: string
): number {
  let curY = y;

  // Logo circle (40px diameter) + team name on the same row
  const logoRadius = 20;
  const logoCx = x + logoRadius;
  const logoCy = curY + logoRadius;
  drawCircleLogo(ctx, logoImg, logoCx, logoCy, logoRadius, logoFallbackColor);

  // Team name to the right of the logo
  ctx.font = "bold 20px 'Arial', sans-serif";
  ctx.fillStyle = accentColor;
  ctx.letterSpacing = "2px";
  ctx.fillText(teamName.toUpperCase(), x + logoRadius * 2 + 12, curY + logoRadius + 7);

  curY += logoRadius * 2 + 10; // advance past logo row

  // Sections – only include slots that have a player assigned
  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defenseSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const forwardSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defenseGroups = groupSlots(defenseSlots).filter((g) => g.slots.length > 0);
  const forwardGroups = groupSlots(forwardSlots).filter((g) => g.slots.length > 0);

  const drawSection = (label: string, labelColor: string, slotsArr: unknown[], drawContent: () => void) => {
    if (slotsArr.length === 0) return; // skip empty sections
    ctx.font = "bold 9px 'Arial', sans-serif";
    ctx.fillStyle = labelColor;
    ctx.letterSpacing = "2px";
    ctx.fillText(label.toUpperCase(), x, curY + 9);
    curY += 16;
    drawContent();
    curY += 6;
  };

  const drawSlotRow = (slot: Slot, player: Player | null, rowX: number, rowWidth: number) => {
    const rowH = 20;
    const { bg, text } = getRoleColor(slot.role);

    // Row background
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, rowX, curY, rowWidth, rowH, 3);
    ctx.fill();

    // Badge
    const badgeW = 26;
    ctx.fillStyle = bg;
    roundRect(ctx, rowX + 3, curY + 3, badgeW, rowH - 6, 2);
    ctx.fill();
    ctx.font = "bold 8px 'Arial', sans-serif";
    ctx.fillStyle = text;
    ctx.letterSpacing = "0px";
    ctx.textAlign = "center";
    ctx.fillText(slot.shortLabel, rowX + 3 + badgeW / 2, curY + 13);
    ctx.textAlign = "left";

    // Player name, then captain badge (A/C) after name+number
    ctx.font = player ? "13px 'Arial', sans-serif" : "italic 11px 'Arial', sans-serif";
    ctx.fillStyle = player ? "#ffffff" : "rgba(255,255,255,0.25)";
    ctx.letterSpacing = "0px";
    const nameX = rowX + badgeW + 10;
    const nameText = player
      ? (player.number ? `${player.name}  #${player.number}` : player.name)
      : "—";
    ctx.fillText(nameText, nameX, curY + 14);
    if (player?.captainRole) {
      // Draw C or A badge after name+number
      const nameWidth = ctx.measureText(nameText).width;
      ctx.font = "bold 13px 'Arial', sans-serif";
      ctx.fillStyle = player.captainRole === "C" ? "#fde047" : "#7dd3fc";
      ctx.fillText(player.captainRole, nameX + nameWidth + 6, curY + 14);
    }

    curY += rowH + 2;
  };

  // Goalkeepers
  drawSection("Målvakter", "#f59e0b", goalkeeperSlots, () => {
    goalkeeperSlots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, x, width));
  });

  // Defense groups in 2-column grid – dynamic height per row
  drawSection("Backar", "#60a5fa", defenseSlots, () => {
    const colW = (width - 6) / 2;
    const baseY = curY;
    // Pre-calculate row Y offsets based on actual group heights
    const rowHeights: number[] = [];
    for (let i = 0; i < defenseGroups.length; i += 2) {
      const leftH = 13 + defenseGroups[i].slots.length * 22;
      const rightH = (i + 1 < defenseGroups.length) ? 13 + defenseGroups[i + 1].slots.length * 22 : 0;
      rowHeights.push(Math.max(leftH, rightH) + 4);
    }
    defenseGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + 6);
      // Calculate gy from accumulated row heights
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];

      // Set curY so drawSlotRow draws at the correct position
      curY = gy;

      // Group label
      ctx.font = "bold 8px 'Arial', sans-serif";
      ctx.fillStyle = "rgba(96,165,250,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + 8);
      curY += 13;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    // Advance curY past all rows
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
  });

  // Forward groups in 2-column grid – dynamic height per row
  drawSection("Forwards", "#34d399", forwardSlots, () => {
    const colW = (width - 6) / 2;
    const baseY = curY;
    // Pre-calculate row Y offsets based on actual group heights
    const rowHeights: number[] = [];
    for (let i = 0; i < forwardGroups.length; i += 2) {
      const leftH = 13 + forwardGroups[i].slots.length * 22;
      const rightH = (i + 1 < forwardGroups.length) ? 13 + forwardGroups[i + 1].slots.length * 22 : 0;
      rowHeights.push(Math.max(leftH, rightH) + 4);
    }
    forwardGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + 6);
      // Calculate gy from accumulated row heights
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];

      // Set curY so drawSlotRow draws at the correct position
      curY = gy;

      ctx.font = "bold 8px 'Arial', sans-serif";
      ctx.fillStyle = "rgba(52,211,153,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + 8);
      curY += 13;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    // Advance curY past all rows
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
  });

  return curY;
}

// Calculate the total height a team block will occupy (including logo row)
// Uses dynamic per-row height to handle groups with different slot counts
function calcTeamHeight(slots: Slot[], lineup: Record<string, Player>): number {
  const gkSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const fwdSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defGroups = groupSlots(defSlots).filter((g) => g.slots.length > 0);
  const fwdGroups = groupSlots(fwdSlots).filter((g) => g.slots.length > 0);
  let h = 50; // logo row (40px) + 10px gap
  if (gkSlots.length > 0) h += 16 + gkSlots.length * 22 + 6;
  if (defSlots.length > 0) {
    h += 16; // section label
    for (let i = 0; i < defGroups.length; i += 2) {
      const leftH = 13 + defGroups[i].slots.length * 22;
      const rightH = (i + 1 < defGroups.length) ? 13 + defGroups[i + 1].slots.length * 22 : 0;
      h += Math.max(leftH, rightH) + 4;
    }
    h += 6;
  }
  if (fwdSlots.length > 0) {
    h += 16; // section label
    for (let i = 0; i < fwdGroups.length; i += 2) {
      const leftH = 13 + fwdGroups[i].slots.length * 22;
      const rightH = (i + 1 < fwdGroups.length) ? 13 + fwdGroups[i + 1].slots.length * 22 : 0;
      h += Math.max(leftH, rightH) + 4;
    }
    h += 6;
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
  logoGreen,
  logoWhite,
}: ExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exporting, setExporting] = useState(false);
  const [rendered, setRendered] = useState(false);

  const renderCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load logos in parallel – fall back gracefully if individual images fail
    // Load logos from embedded base64 (no CORS issues)
    let imgWhite: HTMLImageElement | null = null;
    let imgGreen: HTMLImageElement | null = null;
    const [resWhite, resGreen] = await Promise.allSettled([
      loadImage(LOGO_WHITE_B64),
      loadImage(LOGO_GREEN_B64),
    ]);
    if (resWhite.status === "fulfilled") imgWhite = resWhite.value;
    if (resGreen.status === "fulfilled") imgGreen = resGreen.value;

    // Determine which teams have players
    const teamAHasPlayers = Object.keys(teamALineup).length > 0;
    const teamBHasPlayers = Object.keys(teamBLineup).length > 0;
    const bothTeams = teamAHasPlayers && teamBHasPlayers;
    const singleTeam = teamAHasPlayers !== teamBHasPlayers;

    const W = singleTeam ? 540 : 960;
    // Dynamic height: header (88px) + max of both teams + footer (30px)
    const teamAH = teamAHasPlayers ? calcTeamHeight(teamASlots, teamALineup) : 0;
    const teamBH = teamBHasPlayers ? calcTeamHeight(teamBSlots, teamBLineup) : 0;
    const contentH = bothTeams ? Math.max(teamAH, teamBH) : (teamAH + teamBH);
    const H = Math.max(200, 88 + contentH + 30);
    canvas.width = W * 2;
    canvas.height = H * 2;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = "#0d1510";
    ctx.fillRect(0, 0, W, H);

    // Subtle gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(0,30,15,0.8)");
    grad.addColorStop(1, "rgba(0,10,5,0.95)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.font = "bold 28px 'Arial', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.letterSpacing = "4px";
    ctx.fillText("STÅLSTADENS", 24, 44);

    ctx.fillStyle = "#34d399";
    ctx.fillText(" LINEUP", 24 + ctx.measureText("STÅLSTADENS").width, 44);

    ctx.font = "11px 'Arial', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.letterSpacing = "2px";
    ctx.fillText(`A-LAG HERRAR  ·  ${getToday().toUpperCase()}`, 24, 62);

    // Divider
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 74);
    ctx.lineTo(W - 24, 74);
    ctx.stroke();

    // Draw teams
    const startY = 88;

    if (bothTeams) {
      // Two-column layout
      const colW = (W - 72) / 2;

      // VITA team – white logo
      drawTeamBlock(ctx, 24, startY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff");

      // Center separator
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2, 82);
      ctx.lineTo(W / 2, H - 20);
      ctx.stroke();

      // GRÖNA team – green logo
      drawTeamBlock(ctx, W / 2 + 24, startY, colW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931");
    } else if (teamAHasPlayers) {
      // Only VITA team
      const colW = W - 48;
      drawTeamBlock(ctx, 24, startY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff");
    } else if (teamBHasPlayers) {
      // Only GRÖNA team
      const colW = W - 48;
      drawTeamBlock(ctx, 24, startY, colW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931");
    }

    // Footer
    ctx.font = "9px 'Arial', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.letterSpacing = "1px";
    ctx.textAlign = "center";
    ctx.fillText("STÅLSTADENS SPORTFÖRENING", W / 2, H - 10);
    ctx.textAlign = "left";

    setRendered(true);
  };

  // Render on mount
  useEffect(() => {
    const timer = setTimeout(() => { renderCanvas(); }, 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Try toBlob first (better quality), fall back to toDataURL if canvas is tainted
    try {
      canvas.toBlob((blob) => {
        try {
          if (blob) {
            const url = URL.createObjectURL(blob);
            doDownload(url, filename);
            setTimeout(() => URL.revokeObjectURL(url), 500);
          } else {
            // toBlob returned null – fall back to toDataURL
            const dataUrl = canvas.toDataURL("image/png");
            doDownload(dataUrl, filename);
          }
        } catch {
          // SecurityError (tainted canvas) – try toDataURL
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
      // toBlob threw synchronously (tainted canvas) – try toDataURL
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

        {/* Canvas-förhandsvisning – scrollbar horisontellt på mobil istället för att komprimera */}
        <div className="flex-1 overflow-auto p-4 bg-black/20">
          {!rendered && (
            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Genererar förhandsvisning…</div>
          )}
          <div className="inline-block min-w-fit mx-auto">
            <canvas
              ref={canvasRef}
              className="rounded-xl shadow-2xl border border-white/10"
              style={{ minWidth: `${Object.keys(teamALineup).length > 0 && Object.keys(teamBLineup).length > 0 ? 960 : (Object.keys(teamALineup).length > 0 || Object.keys(teamBLineup).length > 0 ? 540 : 960)}px`, height: "auto" }}
            />
          </div>
        </div>

        <div className="px-5 py-2 border-t border-white/10 shrink-0">
          <p className="text-white/30 text-xs">Förhandsvisning av exporten. Klicka "Ladda ner bild" för att spara som PNG.</p>
        </div>
      </div>
    </div>
  );
}
