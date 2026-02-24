// ExportModal – Exportera uppställning som bild
// Använder ren Canvas API för att rita uppställningen – fungerar i alla miljöer utan CORS-problem

import { useRef, useState } from "react";
import { X, Download } from "lucide-react";
import type { Player } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots } from "@/lib/lineup";

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
  lineup: Record<string, Player>
): number {
  let curY = y;

  // Team name
  ctx.font = "bold 20px 'Arial', sans-serif";
  ctx.fillStyle = accentColor;
  ctx.letterSpacing = "2px";
  ctx.fillText(teamName.toUpperCase(), x, curY + 20);
  curY += 34;

  // Sections – only include slots that have a player assigned
  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper" && lineup[s.id]);
  const defenseSlots = slots.filter((s) => s.type === "defense" && lineup[s.id]);
  const forwardSlots = slots.filter((s) => s.type === "forward" && lineup[s.id]);
  const defenseGroups = groupSlots(defenseSlots).filter((g) => g.slots.length > 0);
  const forwardGroups = groupSlots(forwardSlots).filter((g) => g.slots.length > 0);

  const drawSection = (label: string, labelColor: string, slots: unknown[], drawContent: () => void) => {
    if (slots.length === 0) return; // skip empty sections
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

    // Player name
    ctx.font = player ? "13px 'Arial', sans-serif" : "italic 11px 'Arial', sans-serif";
    ctx.fillStyle = player ? "#ffffff" : "rgba(255,255,255,0.25)";
    ctx.letterSpacing = "0px";
    const nameText = player
      ? (player.number ? `#${player.number}  ${player.name}` : player.name)
      : "—";
    ctx.fillText(nameText, rowX + badgeW + 10, curY + 14);

    curY += rowH + 2;
  };

  // Goalkeepers
  drawSection("Målvakter", "#f59e0b", goalkeeperSlots, () => {
    goalkeeperSlots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, x, width));
  });

  // Defense groups in 2-column grid
  drawSection("Backar", "#60a5fa", defenseSlots, () => {
    const colW = (width - 6) / 2;
    const startY = curY;
    defenseGroups.forEach((group, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const gx = x + col * (colW + 6);
      const gy = startY + row * (group.slots.length * 22 + 22);
      const savedY = curY;
      curY = gy;

      // Group label
      ctx.font = "bold 8px 'Arial', sans-serif";
      ctx.fillStyle = "rgba(96,165,250,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + 8);
      curY += 13;

      group.slots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW));

      const endY = curY;
      curY = savedY;
      if (endY > curY) curY = endY;
    });
    // Advance past all groups
    const rows = Math.ceil(defenseGroups.length / 2);
    const slotsPerGroup = defenseGroups[0]?.slots.length ?? 2;
    curY = startY + rows * (slotsPerGroup * 22 + 22);
  });

  // Forward groups in 2-column grid
  drawSection("Forwards", "#34d399", forwardSlots, () => {
    const colW = (width - 6) / 2;
    const startY = curY;
    forwardGroups.forEach((group, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const gx = x + col * (colW + 6);
      const gy = startY + row * (group.slots.length * 22 + 22);
      const savedY = curY;
      curY = gy;

      ctx.font = "bold 8px 'Arial', sans-serif";
      ctx.fillStyle = "rgba(52,211,153,0.5)";
      ctx.letterSpacing = "1px";
      ctx.fillText(group.groupLabel.toUpperCase(), gx, curY + 8);
      curY += 13;

      group.slots.forEach((slot) => drawSlotRow(slot, lineup[slot.id] ?? null, gx, colW));

      const endY = curY;
      curY = savedY;
      if (endY > curY) curY = endY;
    });
    const rows = Math.ceil(forwardGroups.length / 2);
    const slotsPerGroup = forwardGroups[0]?.slots.length ?? 3;
    curY = startY + rows * (slotsPerGroup * 22 + 22);
  });

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
  logoGreen,
  logoWhite,
}: ExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exporting, setExporting] = useState(false);
  const [rendered, setRendered] = useState(false);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 960;
    const H = 700;
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

    // Draw both teams
    const colW = (W - 72) / 2;
    const startY = 88;

    drawTeamBlock(ctx, 24, startY, colW, teamAName, "#e2e8f0", teamASlots, teamALineup);

    // Center separator
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 82);
    ctx.lineTo(W / 2, H - 20);
    ctx.stroke();

    drawTeamBlock(ctx, W / 2 + 24, startY, colW, teamBName, "#34d399", teamBSlots, teamBLineup);

    // Footer
    ctx.font = "9px 'Arial', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.letterSpacing = "1px";
    ctx.fillText("STÅLSTADENS SPORTFÖRENING", W / 2, H - 10);

    setRendered(true);
  };

  // Render on mount
  useState(() => {
    setTimeout(renderCanvas, 50);
  });

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    try {
      canvas.toBlob((blob) => {
        if (!blob) { setExporting(false); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `stalstadens-lineup-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setExporting(false);
        }, 200);
      }, "image/png");
    } catch (e) {
      console.error("Export failed", e);
      setExporting(false);
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

        {/* Canvas-förhandsvisning */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/20">
          <canvas
            ref={canvasRef}
            className="rounded-xl shadow-2xl border border-white/10"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>

        <div className="px-5 py-2 border-t border-white/10 shrink-0">
          <p className="text-white/30 text-xs">Förhandsvisning av exporten. Klicka "Ladda ner bild" för att spara som PNG.</p>
        </div>
      </div>
    </div>
  );
}
