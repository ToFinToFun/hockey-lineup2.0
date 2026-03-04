// ExportModal – Exportera uppställning som bild
// Fast 9:5 bildförhållande (1800×1000), solid bakgrund, ingen statistik

import { useRef, useState, useEffect } from "react";
import { X, Download, Share2 } from "lucide-react";
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
  allPlayers?: Player[];
}

function getToday(): string {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

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
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function getRoleColor(role: string): { bg: string; text: string } {
  if (role === "gk" || role === "res-gk") return { bg: "rgba(245,158,11,0.6)", text: "#fbbf24" };
  if (role === "def") return { bg: "rgba(96,165,250,0.6)", text: "#93c5fd" };
  if (role === "c") return { bg: "rgba(167,139,250,0.6)", text: "#c4b5fd" };
  return { bg: "rgba(52,211,153,0.6)", text: "#6ee7b7" };
}

// ─── Sizing constants (at native 1800×1000) ───
const ROW_H = 34;
const ROW_GAP = 4;
const SECTION_LABEL_H = 28;
const GROUP_LABEL_H = 22;
const SECTION_GAP = 10;
const LOGO_HEADER_H = 52; // logo + team name row height (reduced)
const FONT_PLAYER = 20;
const FONT_BADGE = 14;
const FONT_SECTION = 16;
const FONT_GROUP = 14;
const BADGE_W = 44;

// Calculate total height needed for a team at native size
function calcTeamHeight(slots: Slot[], lineup: Record<string, Player>): number {
  const gkSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const fwdSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defGroups = groupSlots(defSlots).filter((g) => g.slots.length > 0);
  const fwdGroups = groupSlots(fwdSlots).filter((g) => g.slots.length > 0);

  let h = LOGO_HEADER_H;
  if (gkSlots.length > 0) h += SECTION_LABEL_H + gkSlots.length * (ROW_H + ROW_GAP) + SECTION_GAP;
  if (defSlots.length > 0) {
    h += SECTION_LABEL_H;
    for (let i = 0; i < defGroups.length; i += 2) {
      const leftH = GROUP_LABEL_H + defGroups[i].slots.length * (ROW_H + ROW_GAP);
      const rightH = (i + 1 < defGroups.length) ? GROUP_LABEL_H + defGroups[i + 1].slots.length * (ROW_H + ROW_GAP) : 0;
      h += Math.max(leftH, rightH) + 4;
    }
    h += SECTION_GAP;
  }
  if (fwdSlots.length > 0) {
    h += SECTION_LABEL_H;
    for (let i = 0; i < fwdGroups.length; i += 2) {
      const leftH = GROUP_LABEL_H + fwdGroups[i].slots.length * (ROW_H + ROW_GAP);
      const rightH = (i + 1 < fwdGroups.length) ? GROUP_LABEL_H + fwdGroups[i + 1].slots.length * (ROW_H + ROW_GAP) : 0;
      h += Math.max(leftH, rightH) + 4;
    }
    h += SECTION_GAP;
  }
  return h;
}

// Draw one team block — returns the Y position after drawing
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
  s: number // scale factor (1.0 = native, <1 if we need to shrink)
): number {
  let curY = y;

  // ── Logo + team name (compact) ──
  const logoR = Math.round(22 * s);
  const logoCx = x + logoR;
  const logoCy = curY + logoR;
  drawCircleLogo(ctx, logoImg, logoCx, logoCy, logoR, logoFallbackColor);

  ctx.font = `bold ${Math.round(24 * s)}px 'Oswald', sans-serif`;
  ctx.fillStyle = accentColor;
  ctx.letterSpacing = "3px";
  ctx.fillText(teamName.toUpperCase(), x + logoR * 2 + 10, curY + logoR + Math.round(5 * s));

  // (attendance count removed)

  curY += Math.round(LOGO_HEADER_H * s);

  // Filter to filled slots only
  const goalkeeperSlots = slots.filter((sl) => sl.type === "goalkeeper" && lineup[sl.id]);
  const defenseSlots = slots.filter((sl) => sl.type === "defense" && lineup[sl.id]);
  const forwardSlots = slots.filter((sl) => sl.type === "forward" && lineup[sl.id]);
  const defenseGroups = groupSlots(defenseSlots).filter((g) => g.slots.length > 0);
  const forwardGroups = groupSlots(forwardSlots).filter((g) => g.slots.length > 0);

  const rowH = Math.round(ROW_H * s);
  const rowGap = Math.round(ROW_GAP * s);
  const sectionGap = Math.round(SECTION_GAP * s);
  const labelH = Math.round(SECTION_LABEL_H * s);
  const groupLabelH = Math.round(GROUP_LABEL_H * s);
  const badgeW = Math.round(BADGE_W * s);

  const drawSectionLabel = (label: string, labelColor: string, hasContent: boolean) => {
    if (!hasContent) return;
    ctx.font = `bold ${Math.round(FONT_SECTION * s)}px 'Oswald', sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.letterSpacing = "3px";
    ctx.fillText(label.toUpperCase(), x, curY + Math.round(16 * s));
    curY += labelH;
  };

  const drawSlotRow = (slot: Slot, player: Player | null, rowX: number, rowWidth: number) => {
    const { bg, text } = getRoleColor(slot.role);

    // Row background
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, rowX, curY, rowWidth, rowH, Math.round(4 * s));
    ctx.fill();

    // Badge
    ctx.fillStyle = bg;
    roundRect(ctx, rowX + 3, curY + 3, badgeW, rowH - 6, Math.round(3 * s));
    ctx.fill();
    ctx.font = `bold ${Math.round(FONT_BADGE * s)}px 'Oswald', sans-serif`;
    ctx.fillStyle = text;
    ctx.letterSpacing = "0px";
    ctx.textAlign = "center";
    ctx.fillText(slot.shortLabel, rowX + 3 + badgeW / 2, curY + Math.round(22 * s));
    ctx.textAlign = "left";

    // Player name + number
    const nameX = rowX + badgeW + Math.round(10 * s);
    if (player) {
      ctx.font = `${Math.round(FONT_PLAYER * s)}px 'Oswald', sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.letterSpacing = "0px";
      const truncatedName = player.name.length > 18 ? player.name.slice(0, 18).trimEnd() + "…" : player.name;
      const nameText = truncatedName;
      ctx.fillText(nameText, nameX, curY + Math.round(22 * s));

      // Captain badge
      if (player.captainRole) {
        const nameWidth = ctx.measureText(nameText).width;
        ctx.font = `bold ${Math.round(FONT_PLAYER * s)}px 'Oswald', sans-serif`;
        ctx.fillStyle = player.captainRole === "C" ? "#fde047" : "#7dd3fc";
        ctx.fillText(player.captainRole, nameX + nameWidth + 8, curY + Math.round(22 * s));
      }
    } else {
      ctx.font = `italic ${Math.round((FONT_PLAYER - 2) * s)}px 'Oswald', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.letterSpacing = "0px";
      ctx.fillText("—", nameX, curY + Math.round(22 * s));
    }

    curY += rowH + rowGap;
  };

  // ── Goalkeepers ──
  drawSectionLabel("Målvakter", "#fbbf24", goalkeeperSlots.length > 0);
  if (goalkeeperSlots.length > 0) {
    goalkeeperSlots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, x, width));
    curY += sectionGap;
  }

  // ── Defense (2-column grid) ──
  drawSectionLabel("Backar", "#93c5fd", defenseSlots.length > 0);
  if (defenseSlots.length > 0) {
    const colW = (width - Math.round(8 * s)) / 2;
    const baseY = curY;
    const rowHeights: number[] = [];
    for (let i = 0; i < defenseGroups.length; i += 2) {
      const leftH = groupLabelH + defenseGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < defenseGroups.length) ? groupLabelH + defenseGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      rowHeights.push(Math.max(leftH, rightH) + Math.round(4 * s));
    }
    defenseGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + Math.round(8 * s));
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];
      curY = gy;

      ctx.font = `bold ${Math.round(FONT_GROUP * s)}px 'Oswald', sans-serif`;
      ctx.fillStyle = "rgba(96,165,250,0.6)";
      ctx.letterSpacing = "2px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + Math.round(12 * s));
      curY += groupLabelH;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
    curY += sectionGap;
  }

  // ── Forwards (2-column grid) ──
  drawSectionLabel("Forwards", "#6ee7b7", forwardSlots.length > 0);
  if (forwardSlots.length > 0) {
    const colW = (width - Math.round(8 * s)) / 2;
    const baseY = curY;
    const rowHeights: number[] = [];
    for (let i = 0; i < forwardGroups.length; i += 2) {
      const leftH = groupLabelH + forwardGroups[i].slots.length * (rowH + rowGap);
      const rightH = (i + 1 < forwardGroups.length) ? groupLabelH + forwardGroups[i + 1].slots.length * (rowH + rowGap) : 0;
      rowHeights.push(Math.max(leftH, rightH) + Math.round(4 * s));
    }
    forwardGroups.forEach((group, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const gx = x + col * (colW + Math.round(8 * s));
      let gy = baseY;
      for (let r = 0; r < rowIdx; r++) gy += rowHeights[r];
      curY = gy;

      ctx.font = `bold ${Math.round(FONT_GROUP * s)}px 'Oswald', sans-serif`;
      ctx.fillStyle = "rgba(52,211,153,0.6)";
      ctx.letterSpacing = "2px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + Math.round(12 * s));
      curY += groupLabelH;

      group.slots.forEach((slot) => {
        drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW);
      });
    });
    curY = baseY;
    for (const rh of rowHeights) curY += rh;
    curY += sectionGap;
  }

  return curY;
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

    // Ensure Oswald font is loaded before rendering
    try {
      await document.fonts.load("bold 48px 'Oswald'");
      await document.fonts.load("600 32px 'Oswald'");
      await document.fonts.load("400 20px 'Oswald'");
    } catch {
      // Font may already be loaded or fallback to sans-serif
    }

    // Load logos + sponsors
    let imgWhite: HTMLImageElement | null = null;
    let imgGreen: HTMLImageElement | null = null;
    const sponsorUrls = [
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/SXvJKubXoqm5p7aDCmZ97X/sponsor-ren_99c2ef22.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/SXvJKubXoqm5p7aDCmZ97X/sponsor-kirunabilfrakt_725b571b.png",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/SXvJKubXoqm5p7aDCmZ97X/sponsor-lindstroms_a0e64384.png",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/SXvJKubXoqm5p7aDCmZ97X/sponsor-polar_60ed05a2.png",
    ];
    const [resWhite, resGreen, ...sponsorResults] = await Promise.allSettled([
      loadImage(LOGO_WHITE_B64),
      loadImage(LOGO_GREEN_B64),
      ...sponsorUrls.map(url => loadImage(url)),
    ]);
    if (resWhite.status === "fulfilled") imgWhite = resWhite.value;
    if (resGreen.status === "fulfilled") imgGreen = resGreen.value;
    const sponsorImages: HTMLImageElement[] = [];
    for (const r of sponsorResults) {
      if (r.status === "fulfilled") sponsorImages.push(r.value);
    }

    // ── Native 1800×1000 canvas (9:5) ──
    const W = 1800;
    const H = 1000;
    canvas.width = W;
    canvas.height = H;
    // CSS display size — fit in modal
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    // ── Solid dark background ──
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, W, H);

    // Subtle radial gradient for depth
    const grad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, "rgba(20,40,70,0.4)");
    grad.addColorStop(1, "rgba(5,12,25,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Thin border
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    const padding = 40;

    // ── Header ──
    const headerH = 100;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, headerH);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(W, headerH);
    ctx.stroke();

    // Title
    ctx.font = "bold 48px 'Oswald', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.letterSpacing = "5px";
    ctx.fillText("STÅLSTADENS", padding, 60);
    const titleW = ctx.measureText("STÅLSTADENS").width;
    ctx.fillStyle = "#34d399";
    ctx.fillText(" LINEUP", padding + titleW, 60);

    // Date subtitle
    ctx.font = "18px 'Oswald', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.letterSpacing = "3px";
    ctx.fillText(`A-LAG HERRAR  ·  ${getToday().toUpperCase()}`, padding, 86);

    // ── Sponsor logos (right-aligned in header) ──
    if (sponsorImages.length > 0) {
      const sponsorH = 50; // max height for sponsor logos
      const sponsorGap = 20;
      const sponsorY = (headerH - sponsorH) / 2; // vertically center in header
      let sponsorX = W - padding; // start from right edge
      // Draw sponsors right-to-left
      for (let i = sponsorImages.length - 1; i >= 0; i--) {
        const img = sponsorImages[i];
        const aspect = img.naturalWidth / img.naturalHeight;
        const drawH = sponsorH;
        const drawW = drawH * aspect;
        sponsorX -= drawW;
        // White rounded background for readability
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        roundRect(ctx, sponsorX - 4, sponsorY - 2, drawW + 8, drawH + 4, 4);
        ctx.fill();
        ctx.restore();
        ctx.drawImage(img, sponsorX, sponsorY, drawW, drawH);
        sponsorX -= sponsorGap;
      }
    }

    // ── Content area ──
    const contentY = headerH + 16;
    const footerH = 36;
    const contentH = H - headerH - footerH - 16;
    const contentW = W - padding * 2;

    // Determine which teams have players
    const teamAHasPlayers = Object.keys(teamALineup).length > 0;
    const teamBHasPlayers = Object.keys(teamBLineup).length > 0;
    const bothTeams = teamAHasPlayers && teamBHasPlayers;

    // Calculate scale to fill the available space (scale up if content is small, scale down if too tall)
    const teamAH = teamAHasPlayers ? calcTeamHeight(teamASlots, teamALineup) : 0;
    const teamBH = teamBHasPlayers ? calcTeamHeight(teamBSlots, teamBLineup) : 0;
    const maxTeamH = bothTeams ? Math.max(teamAH, teamBH) : (teamAH + teamBH);
    // Allow scaling up to 1.6x to fill the canvas, but never shrink below what fits
    const scale = Math.min(1.6, contentH / maxTeamH);

    if (bothTeams) {
      const gap = 30;
      const colW = (contentW - gap) / 2;

      // Subtle column backgrounds
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 6, contentY - 4, colW + 12, contentH + 8, 8);
      ctx.fill();
      roundRect(ctx, padding + colW + gap - 6, contentY - 4, colW + 12, contentH + 8, 8);
      ctx.fill();

      // VITA
      drawTeamBlock(ctx, padding, contentY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff", scale);

      // Center separator
      const sepX = padding + colW + gap / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sepX, contentY);
      ctx.lineTo(sepX, H - footerH);
      ctx.stroke();

      // GRÖNA
      drawTeamBlock(ctx, padding + colW + gap, contentY, colW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931", scale);
    } else if (teamAHasPlayers) {
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 6, contentY - 4, contentW + 12, contentH + 8, 8);
      ctx.fill();
      drawTeamBlock(ctx, padding, contentY, contentW, teamAName, "#e2e8f0", teamASlots, teamALineup, imgWhite, "#ffffff", scale);
    } else if (teamBHasPlayers) {
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      roundRect(ctx, padding - 6, contentY - 4, contentW + 12, contentH + 8, 8);
      ctx.fill();
      drawTeamBlock(ctx, padding, contentY, contentW, teamBName, "#34d399", teamBSlots, teamBLineup, imgGreen, "#337931", scale);
    }

    // ── Footer ──
    ctx.font = "14px 'Oswald', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.letterSpacing = "2px";
    ctx.textAlign = "center";
    ctx.fillText("STÅLSTADENS SPORTFÖRENING", W / 2, H - 12);
    ctx.textAlign = "left";

    setRendered(true);
  };

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
        {/* Modal header */}
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
          <div className="w-full max-w-4xl">
            <canvas
              ref={canvasRef}
              className="rounded-xl shadow-2xl border border-white/10 w-full h-auto"
            />
          </div>
        </div>

        <div className="px-5 py-2 border-t border-white/10 shrink-0">
          <p className="text-white/30 text-xs">Förhandsvisning (1800×1000 px). Klicka "Ladda ner bild" för att spara som PNG.</p>
        </div>
      </div>
    </div>
  );
}
