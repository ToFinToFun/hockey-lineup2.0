/**
 * Ritar bilden till laget.se-nyheten i samma stil som den delade länken:
 * arenabakgrund, mörka lagpaneler, positionsbrickor i positionsfärgerna
 * och C/A-märken. Matchbandet (lagloggor, datum, plats/tid, sponsor)
 * ligger exakt i bildens mitt, så det är det som syns i laget.se-flödet.
 */
import type { Player } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { POSITION_COLORS, CAPTAIN_COLORS } from "@/lib/positionColors";
import { loadImage, roundRect } from "@/lib/canvas";
import {
  NEWS_IMAGE as L,
  teamColumns,
  teamPanelHeight,
  computeNewsLayout,
  type NewsSection,
  type TeamKey,
} from "@/lib/lagetNews";

export interface NewsTeam {
  name: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  logoUrl: string;
  accent: string;
}

export interface NewsImageOptions {
  teamA: NewsTeam; // alltid överst
  teamB: NewsTeam; // alltid underst
  home: TeamKey; // hemmalaget står till vänster i matchbandet
  dateLine: string; // "Lördag 23/11"
  placeLine: string; // "Luleå Energi Arena 19:00" (kan vara tom)
  sponsor?: string;
  sponsorLogoUrl?: string;
  backgroundUrl: string;
}

const FONT_HEAD = "'Oswald', sans-serif";
const FONT_BODY = "'Inter', sans-serif";

const SECTION_COLORS: Record<NewsSection["kind"], string> = {
  goalkeeper: "#fcd34d", // amber-300, som i delad länk
  defense: "#93c5fd", // blue-300
  forward: "#6ee7b7", // emerald-300
};

async function tryLoad(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [`700 48px ${FONT_HEAD}`, `600 36px ${FONT_HEAD}`, `600 28px ${FONT_BODY}`, `500 30px ${FONT_BODY}`, `400 24px ${FONT_BODY}`].map((f) =>
      document.fonts.load(f).catch(() => undefined)
    )
  );
}

/** Kortar text med "…" så att den ryms i maxWidth. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number, fallback: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = fallback;
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(2, r / 25);
  ctx.stroke();
}

function drawRow(ctx: CanvasRenderingContext2D, slot: Slot, player: Player, x: number, y: number, w: number) {
  const color = POSITION_COLORS[slot.shortLabel] ?? "#ffffff";
  const h = L.ROW_H;

  // Rad med svag ton och kant i positionsfärgen
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `${color}1f`;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 6, h);
  ctx.restore();

  // Positionsbricka
  const badgeW = 62;
  const badgeH = 36;
  const bx = x + 18;
  const by = y + (h - badgeH) / 2;
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, badgeW, badgeH, 6);
  ctx.fill();
  ctx.font = `700 22px ${FONT_HEAD}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(slot.shortLabel, bx + badgeW / 2, by + badgeH / 2 + 1);
  ctx.textAlign = "left";

  let tx = bx + badgeW + 16;
  const cy = y + h / 2 + 1;

  // C / A
  if (player.captainRole === "C" || player.captainRole === "A") {
    ctx.font = `700 26px ${FONT_HEAD}`;
    ctx.fillStyle = CAPTAIN_COLORS[player.captainRole];
    ctx.fillText(player.captainRole, tx, cy);
    tx += ctx.measureText(player.captainRole).width + 12;
  }

  // Namn + nummer
  const right = x + w - 16;
  const num = player.number ? `#${player.number}` : "";
  ctx.font = `400 24px ${FONT_BODY}`;
  const numW = num ? ctx.measureText(num).width + 10 : 0;
  ctx.font = `600 28px ${FONT_BODY}`;
  const name = fitText(ctx, player.name, right - tx - numW);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(name, tx, cy);
  if (num) {
    const nx = tx + ctx.measureText(name).width + 10;
    ctx.font = `400 24px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(num, nx, cy);
  }
  ctx.textBaseline = "alphabetic";
}

function drawColumn(ctx: CanvasRenderingContext2D, sections: NewsSection[], lineup: Record<string, Player>, x: number, y: number, w: number) {
  let cy = y;
  sections.forEach((section, si) => {
    if (si > 0) cy += L.SECTION_GAP;
    ctx.font = `700 24px ${FONT_HEAD}`;
    ctx.fillStyle = SECTION_COLORS[section.kind];
    ctx.letterSpacing = "4px";
    ctx.textBaseline = "middle";
    ctx.fillText(section.title.toUpperCase(), x + 2, cy + L.SECTION_H / 2 - 4);
    ctx.letterSpacing = "0px";
    cy += L.SECTION_H;

    section.groups.forEach((group, gi) => {
      if (gi > 0) cy += L.GROUP_GAP;
      if (group.label) {
        ctx.font = `600 19px ${FONT_BODY}`;
        ctx.fillStyle = "rgba(255,255,255,0.38)";
        ctx.letterSpacing = "2px";
        ctx.fillText(group.label.toUpperCase(), x + 4, cy + L.GROUP_H / 2 - 3);
        ctx.letterSpacing = "0px";
        cy += L.GROUP_H;
      }
      group.slots.forEach((slot, ri) => {
        if (ri > 0) cy += L.ROW_GAP;
        drawRow(ctx, slot, lineup[slot.id], x, cy, w);
        cy += L.ROW_H;
      });
    });
    ctx.textBaseline = "alphabetic";
  });
}

function drawTeamPanel(ctx: CanvasRenderingContext2D, team: NewsTeam, logo: HTMLImageElement | null, y: number, h: number) {
  const x = L.PAD;
  const w = L.WIDTH - 2 * L.PAD;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 28);
  ctx.stroke();

  // Rubrik: logga + lagnamn
  const headerMid = y + L.PANEL_PAD + L.HEADER_H / 2;
  const logoR = 38;
  drawLogo(ctx, logo, x + L.PANEL_PAD + logoR, headerMid, logoR, team.accent);
  ctx.font = `700 48px ${FONT_HEAD}`;
  ctx.fillStyle = team.accent;
  ctx.letterSpacing = "6px";
  ctx.textBaseline = "middle";
  ctx.fillText(team.name.toUpperCase(), x + L.PANEL_PAD + logoR * 2 + 22, headerMid + 2);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";

  const cols = teamColumns(team.slots, team.lineup);
  const bodyY = y + L.PANEL_PAD + L.HEADER_H + L.PANEL_PAD;
  if (cols.left.length || cols.right.length) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(x + L.PANEL_PAD, y + L.PANEL_PAD + L.HEADER_H + L.PANEL_PAD / 2, w - 2 * L.PANEL_PAD, 2);
  }
  const colW = (w - 2 * L.PANEL_PAD - L.COL_GAP) / 2;
  drawColumn(ctx, cols.left, team.lineup, x + L.PANEL_PAD, bodyY, colW);
  drawColumn(ctx, cols.right, team.lineup, x + L.PANEL_PAD + colW + L.COL_GAP, bodyY, colW);
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  opts: NewsImageOptions,
  logos: { a: HTMLImageElement | null; b: HTMLImageElement | null },
  sponsorLogo: HTMLImageElement | null,
  y: number,
  h: number
) {
  const W = L.WIDTH;
  const mid = W / 2;

  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = "rgba(52,211,153,0.55)"; // emerald-400
  ctx.fillRect(0, y, W, 3);
  ctx.fillRect(0, y + h - 3, W, 3);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Datum och plats/tid
  ctx.font = `700 58px ${FONT_HEAD}`;
  ctx.fillStyle = "#ffffff";
  ctx.letterSpacing = "5px";
  ctx.fillText(opts.dateLine.toUpperCase(), mid, y + 100);
  ctx.letterSpacing = "0px";
  if (opts.placeLine) {
    ctx.font = `500 30px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(fitText(ctx, opts.placeLine, W - 160), mid, y + 144);
  }

  // Lagloggor: hemmalaget till vänster
  const left = opts.home === "a" ? { team: opts.teamA, logo: logos.a } : { team: opts.teamB, logo: logos.b };
  const right = opts.home === "a" ? { team: opts.teamB, logo: logos.b } : { team: opts.teamA, logo: logos.a };
  const logoR = 92;
  const logoY = y + 262;
  const dx = 250;
  drawLogo(ctx, left.logo, mid - dx, logoY, logoR, left.team.accent);
  drawLogo(ctx, right.logo, mid + dx, logoY, logoR, right.team.accent);

  ctx.font = `700 64px ${FONT_HEAD}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", mid, logoY + 4);

  ctx.font = `700 34px ${FONT_HEAD}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = left.team.accent;
  ctx.fillText(left.team.name.toUpperCase(), mid - dx, logoY + logoR + 34);
  ctx.fillStyle = right.team.accent;
  ctx.fillText(right.team.name.toUpperCase(), mid + dx, logoY + logoR + 34);
  ctx.letterSpacing = "0px";

  // Matchsponsor: etikett + logga, eller namnet om loggan saknas
  if (opts.sponsor) {
    // Allt viktigt hålls inom mittersta ca 2,4:1 (45 px marginal i topp och botten),
    // så att även smala listvyer och delningar visar hela innehållet.
    const sy = y + h - 82;
    const label = "MATCHSPONSOR";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `600 22px ${FONT_BODY}`;
    ctx.letterSpacing = "3px";
    const labelW = ctx.measureText(label).width;
    ctx.letterSpacing = "0px";

    let contentW: number;
    let drawContent: (cx: number) => void;
    if (sponsorLogo) {
      const scale = Math.min(64 / sponsorLogo.height, 360 / sponsorLogo.width);
      const lw = sponsorLogo.width * scale;
      const lh = sponsorLogo.height * scale;
      contentW = lw;
      drawContent = (cx) => ctx.drawImage(sponsorLogo, cx, sy - lh / 2, lw, lh);
    } else {
      ctx.font = `700 46px ${FONT_HEAD}`;
      contentW = ctx.measureText(opts.sponsor).width;
      drawContent = (cx) => {
        ctx.font = `700 46px ${FONT_HEAD}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(opts.sponsor!, cx, sy + 2);
      };
    }

    const sx = mid - (labelW + 22 + contentW) / 2;
    ctx.font = `600 22px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.letterSpacing = "3px";
    ctx.fillText(label, sx, sy);
    ctx.letterSpacing = "0px";
    drawContent(sx + labelW + 22);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Ritar hela nyhetsbilden och returnerar canvasen. */
export async function renderNewsImage(opts: NewsImageOptions): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [bg, logoA, logoB, sponsorLogo] = await Promise.all([
    tryLoad(opts.backgroundUrl),
    tryLoad(opts.teamA.logoUrl),
    tryLoad(opts.teamB.logoUrl),
    tryLoad(opts.sponsor ? opts.sponsorLogoUrl : undefined),
  ]);

  const hA = teamPanelHeight(teamColumns(opts.teamA.slots, opts.teamA.lineup));
  const hB = teamPanelHeight(teamColumns(opts.teamB.slots, opts.teamB.lineup));
  const layout = computeNewsLayout(hA, hB);

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte i den här webbläsaren");

  ctx.fillStyle = "#0b1410";
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (bg) drawCover(ctx, bg, layout.width, layout.height);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, layout.width, layout.height);

  drawTeamPanel(ctx, opts.teamA, logoA, layout.panelA.y, layout.panelA.h);
  drawBand(ctx, opts, { a: logoA, b: logoB }, sponsorLogo, layout.band.y, layout.band.h);
  drawTeamPanel(ctx, opts.teamB, logoB, layout.panelB.y, layout.panelB.h);

  return canvas;
}
