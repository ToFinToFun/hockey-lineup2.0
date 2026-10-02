/**
 * Media → Video: grafiken som läggs på videon (ritas här, sätts ihop på servern).
 *
 *  - intro 2: titelkort (kategori, spelare/kort, ställning, statistik, sponsor)
 *  - overlay: genomskinlig PNG ovanpå klippet (namnlist, ställning, loggor)
 *  - outro:   tack till sponsor
 *
 * Samma grafiska profil som Media-bilderna (arenan, Oswald/Inter, lagens färger).
 * I Reel-läget hålls overlayn inom Instagrams säkra yta: Metas riktlinje är att
 * hålla text borta från de översta 14 % och nedersta 35 % (profilnamn, bildtext
 * och knappar) och 6 % på sidorna. Titelkorten (intro 2, outro) visas bara ett
 * par sekunder och får gå ner till 78 % – annars blir allt för trångt.
 */
import { club, clubHeading, teamLogo } from "@shared/club";
import { teamColor } from "@shared/teams";
import { canvasEnv } from "@shared/canvasEnv";
import type { CardCell } from "@shared/cardRender";
import { HEAD, BODY, tryLoad, ensureFonts, fit } from "@/lib/matchReportImages";
import { roundRect } from "@/lib/canvas";

export type VideoFormat = "reel" | "feed";
export type VideoKind = "goal" | "interview" | "stars" | "result" | "free";
export type Side = "green" | "white";

export const VIDEO_KINDS: Array<{ id: VideoKind; name: string }> = [
  { id: "goal", name: "Mål" },
  { id: "interview", name: "Intervju" },
  { id: "stars", name: "Matchens stjärnor" },
  { id: "result", name: "Resultat" },
  { id: "free", name: "Fri" },
];

export const VIDEO_SIZE: Record<VideoFormat, { w: number; h: number }> = {
  reel: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
};

/** Ytan där text och loggor får ligga (card = intro 2 och outro) */
export function safeArea(format: VideoFormat, part: "overlay" | "card" = "overlay") {
  const { w, h } = VIDEO_SIZE[format];
  return format === "reel"
    ? { left: Math.round(w * 0.06), right: Math.round(w * 0.94), top: Math.round(h * 0.14), bottom: Math.round(h * (part === "card" ? 0.78 : 0.65)) }
    : { left: 60, right: w - 60, top: 60, bottom: h - 60 };
}

export interface VideoShow {
  intro: { picture: boolean; stats: boolean; dateLine: boolean; sponsor: boolean };
  overlay: { nameBar: boolean; score: boolean; stats: boolean; clubLogo: boolean; sponsorLogo: boolean };
  outro: { sponsor: boolean };
}

/** Standardval per kategori */
export function defaultShow(kind: VideoKind): VideoShow {
  const player = kind === "goal" || kind === "interview" || kind === "stars";
  return {
    intro: { picture: player, stats: kind === "interview" || kind === "stars", dateLine: true, sponsor: true },
    overlay: { nameBar: player, score: kind === "goal", stats: false, clubLogo: true, sponsorLogo: false },
    outro: { sponsor: true },
  };
}

export interface VideoSponsor { name: string; logo: string | null }

export interface VideoGraphicsData {
  format: VideoFormat;
  kind: VideoKind;
  /** Lagets färg och logga (samma sida som pucken landar på) */
  team: Side;
  /** Stor rubrik, t.ex. "MÅL", "INTERVJU", "MATCHENS ★★★" */
  heading: string;
  /** Under rubriken: ställning ("3–2"), resultat ("Vita 5–3 Gröna") eller fri text */
  headline: string;
  /** Liten rad under: assist, matchens siffror, underrubrik */
  subline: string;
  player: { name: string; number: string } | null;
  dateLine: string;
  stats: { title: string; cells: CardCell[] } | null;
  /** Hockeykortet (färdigritat) eller spelarens foto */
  picture: { image: CanvasImageSource & { width: number; height: number }; isCard: boolean } | null;
  introSponsor: VideoSponsor | null;
  outroSponsor: VideoSponsor | null;
  show: VideoShow;
}

const loadImage = (src: string) => canvasEnv().loadImage(src);

function newCanvas(format: VideoFormat): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const { w, h } = VIDEO_SIZE[format];
  const c = canvasEnv().createCanvas(w, h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte");
  return [c, ctx];
}

function rgba(hex: string, a: number) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
}

/** Samma bakgrund som slutet av puckintrot: mörk arena med glöd i lagets färg */
async function background(ctx: CanvasRenderingContext2D, format: VideoFormat, team: Side) {
  const { w, h } = VIDEO_SIZE[format];
  ctx.fillStyle = "#0b1410";
  ctx.fillRect(0, 0, w, h);
  const bg = await tryLoad("/images/background.jpg");
  if (bg) {
    const s = Math.max(w / bg.width, h / bg.height);
    ctx.drawImage(bg, (w - bg.width * s) / 2, (h - bg.height * s) / 2, bg.width * s, bg.height * s);
  }
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, w, h);
  const cy = h * 0.47;
  const g = ctx.createRadialGradient(w / 2, cy, w * 0.18, w / 2, cy, w * 0.72);
  g.addColorStop(0, rgba(teamColor(team), 0.45));
  g.addColorStop(1, rgba(teamColor(team), 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawContain(ctx: CanvasRenderingContext2D, img: { width: number; height: number } & CanvasImageSource, cx: number, cy: number, maxW: number, maxH: number) {
  const k = Math.min(maxW / img.width, maxH / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  return { w: dw, h: dh };
}

/** Statistikrad: celler med etikett och värde */
function statsRow(ctx: CanvasRenderingContext2D, cells: CardCell[], cx: number, y: number, maxW: number, cellH: number, accent: string) {
  const n = cells.length;
  if (!n) return;
  const gap = Math.round(cellH * 0.12);
  const cw = Math.min(cellH * 1.25, (maxW - gap * (n - 1)) / n);
  let x = cx - (cw * n + gap * (n - 1)) / 2;
  ctx.textAlign = "center";
  for (const cell of cells) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x, y, cw, cellH, cellH * 0.14);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(x + cw * 0.2, y, cw * 0.6, Math.max(3, cellH * 0.04));
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.round(cellH * 0.46)}px ${HEAD}`;
    ctx.fillText(cell.value, x + cw / 2, y + cellH * 0.58);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 ${Math.round(cellH * 0.17)}px ${BODY}`;
    ctx.fillText(cell.label, x + cw / 2, y + cellH * 0.85);
    x += cw + gap;
  }
}

function sponsorBlock(ctx: CanvasRenderingContext2D, label: string, sponsor: VideoSponsor, img: HTMLImageElement | null, cx: number, y: number, maxW: number, logoH: number) {
  ctx.textAlign = "center";
  ctx.font = `600 ${Math.round(logoH * 0.26)}px ${BODY}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(label, cx, y + logoH * 0.26);
  ctx.letterSpacing = "0px";
  const ly = y + logoH * 0.45;
  if (img) drawContain(ctx, img, cx, ly + logoH / 2, maxW, logoH);
  else {
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.round(logoH * 0.55)}px ${HEAD}`;
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, sponsor.name, maxW), cx, ly + logoH / 2);
    ctx.textBaseline = "alphabetic";
  }
}
const sponsorBlockHeight = (logoH: number) => logoH * 1.45;

const playerLabel = (p: { name: string; number: string }) => `${p.number ? `#${p.number} ` : ""}${p.name}`.toUpperCase();

// ─── Intro 2 ────────────────────────────────────────────────────────────────

export async function renderIntro2(d: VideoGraphicsData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [c, ctx] = newCanvas(d.format);
  const { w } = VIDEO_SIZE[d.format];
  await background(ctx, d.format, d.team);
  const sa = safeArea(d.format, "card");
  const cx = w / 2;
  const maxW = sa.right - sa.left;
  const accent = teamColor(d.team);
  const sponsorImg = d.show.intro.sponsor && d.introSponsor?.logo ? await tryLoad(d.introSponsor.logo) : null;

  // Höjder: överdel (klubb + datum), rubrik, bild, namn, rubrikrad, underrad, statistik, sponsor
  const reel = d.format === "reel";
  const top = { club: 34, date: 30 };
  const headingH = reel ? 120 : 104;
  const headlineH = d.headline ? (reel ? 130 : 110) : 0;
  const nameH = d.player ? 64 : 0;
  const subH = d.subline ? 44 : 0;
  const statsH = d.show.intro.stats && d.stats?.cells.length ? 128 : 0;
  const sponsorH = d.show.intro.sponsor && d.introSponsor ? sponsorBlockHeight(reel ? 110 : 90) : 0;
  const fixed = top.club + (d.show.intro.dateLine && d.dateLine ? top.date : 0) + 56 + headingH + headlineH + nameH + subH + statsH + sponsorH + 6 * 24;
  const avail = sa.bottom - sa.top;
  const picH = d.show.intro.picture && d.picture ? Math.max(0, Math.min(reel ? 560 : 400, avail - fixed)) : 0;
  const total = fixed + (picH ? picH + 24 : 0);
  let y = sa.top + Math.max(0, (avail - total) / 2);

  // Klubb och datum
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 ${top.club}px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(clubHeading(), cx, y + top.club);
  ctx.letterSpacing = "0px";
  y += top.club;
  if (d.show.intro.dateLine && d.dateLine) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 24px ${BODY}`;
    ctx.fillText(fit(ctx, d.dateLine, maxW), cx, y + top.date + 4);
    y += top.date;
  }
  y += 40;
  // Accentlinje + rubrik (linjen ovanför versalernas accenter, t.ex. Å)
  ctx.fillStyle = accent;
  ctx.fillRect(cx - 60, y - 22, 120, 6);
  y += 16;
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${headingH}px ${HEAD}`;
  let hs = headingH;
  while (hs > 48 && ctx.measureText(d.heading.toUpperCase()).width > maxW) ctx.font = `700 ${(hs -= 4)}px ${HEAD}`;
  ctx.fillText(d.heading.toUpperCase(), cx, y + headingH * 0.92);
  y += headingH + 24;

  if (picH) {
    const p = d.picture!;
    if (p.isCard) drawContain(ctx, p.image, cx, y + picH / 2, maxW, picH);
    else {
      // Rundat foto med ram i lagets färg
      const r = picH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, y + r, r, 0, Math.PI * 2);
      ctx.clip();
      const k = Math.max((2 * r) / p.image.width, (2 * r) / p.image.height);
      ctx.drawImage(p.image, cx - (p.image.width * k) / 2, y + r - (p.image.height * k) / 2, p.image.width * k, p.image.height * k);
      ctx.restore();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, y + r, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    y += picH + 24;
  }
  if (d.headline) {
    ctx.fillStyle = "#fff";
    let fs = headlineH;
    ctx.font = `700 ${fs}px ${HEAD}`;
    while (fs > 40 && ctx.measureText(d.headline).width > maxW) ctx.font = `700 ${(fs -= 4)}px ${HEAD}`;
    ctx.fillText(d.headline, cx, y + headlineH * 0.85);
    y += headlineH + 24;
  }
  if (d.player) {
    ctx.fillStyle = accent;
    ctx.font = `700 ${nameH - 8}px ${HEAD}`;
    ctx.fillText(fit(ctx, playerLabel(d.player), maxW), cx, y + nameH * 0.8);
    y += nameH + 24;
  }
  if (d.subline) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `500 30px ${BODY}`;
    ctx.fillText(fit(ctx, d.subline, maxW), cx, y + 32);
    y += subH + 24;
  }
  if (statsH) {
    if (d.stats!.title) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `600 20px ${BODY}`;
      ctx.letterSpacing = "3px";
      ctx.fillText(d.stats!.title.toUpperCase(), cx, y + 18);
      ctx.letterSpacing = "0px";
    }
    statsRow(ctx, d.stats!.cells, cx, y + 30, maxW, statsH - 30, accent);
    y += statsH + 24;
  }
  if (sponsorH) sponsorBlock(ctx, "STOLT SPONSOR", d.introSponsor!, sponsorImg, cx, y, maxW * 0.7, reel ? 110 : 90);
  return c;
}

// ─── Overlay ────────────────────────────────────────────────────────────────

/** true om overlayn har något att visa (annars skickas ingen) */
export function hasOverlay(d: VideoGraphicsData) {
  const o = d.show.overlay;
  return (o.nameBar && !!d.player) || (o.score && !!d.headline) || (o.stats && !!d.stats?.cells.length) || o.clubLogo || (o.sponsorLogo && !!d.introSponsor);
}

export async function renderOverlay(d: VideoGraphicsData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [c, ctx] = newCanvas(d.format);
  const sa = safeArea(d.format);
  const accent = teamColor(d.team);
  const o = d.show.overlay;

  // Klubbens/lagets logga uppe till vänster
  if (o.clubLogo) {
    const img = await tryLoad(teamLogo(d.team) ?? club().logo);
    if (img) {
      ctx.globalAlpha = 0.92;
      drawContain(ctx, img, sa.left + 60, sa.top + 60, 120, 120);
      ctx.globalAlpha = 1;
    }
  }
  // Ställning uppe till höger, med sponsorloggan under
  let rightY = sa.top;
  if (o.score && d.headline) {
    ctx.font = `700 64px ${HEAD}`;
    const tw = ctx.measureText(d.headline).width;
    const bw = Math.max(170, tw + 56);
    const bx = sa.right - bw;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    roundRect(ctx, bx, rightY, bw, 120, 18);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(bx, rightY, bw, 6);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `600 20px ${BODY}`;
    ctx.letterSpacing = "3px";
    ctx.textAlign = "center";
    ctx.fillText(d.kind === "goal" ? "MÅL" : d.kind === "result" ? "SLUTRESULTAT" : "", bx + bw / 2, rightY + 34);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#fff";
    ctx.font = `700 64px ${HEAD}`;
    ctx.fillText(d.headline, bx + bw / 2, rightY + 102);
    rightY += 140;
  }
  if (o.sponsorLogo && d.introSponsor) {
    const img = d.introSponsor.logo ? await tryLoad(d.introSponsor.logo) : null;
    const bw = 220, bh = 90;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, sa.right - bw, rightY, bw, bh, 14);
    ctx.fill();
    if (img) drawContain(ctx, img, sa.right - bw / 2, rightY + bh / 2, bw - 30, bh - 24);
    else {
      ctx.fillStyle = "#fff";
      ctx.font = `700 34px ${HEAD}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, d.introSponsor.name, bw - 24), sa.right - bw / 2, rightY + bh / 2);
      ctx.textBaseline = "alphabetic";
    }
  }

  // Nederst i säkra ytan: statistik över namnlisten
  let by = sa.bottom;
  if (o.nameBar && d.player) {
    const barH = d.subline ? 132 : 104;
    by -= barH;
    const maxW = sa.right - sa.left;
    ctx.font = `700 54px ${HEAD}`;
    const nameW = Math.min(maxW - 150, ctx.measureText(d.player.name.toUpperCase()).width + 60);
    const numW = d.player.number ? 120 : 0;
    const bw = Math.min(maxW, numW + nameW);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, sa.left, by, bw, barH, 14);
    ctx.fill();
    if (numW) {
      ctx.fillStyle = accent;
      roundRect(ctx, sa.left, by, numW, barH, 14);
      ctx.fill();
      ctx.fillStyle = d.team === "white" ? "#111" : "#fff";
      ctx.font = `700 60px ${HEAD}`;
      ctx.textAlign = "center";
      ctx.fillText(d.player.number, sa.left + numW / 2, by + barH / 2 + 22);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `700 54px ${HEAD}`;
    ctx.fillText(fit(ctx, d.player.name.toUpperCase(), bw - numW - 50), sa.left + numW + 26, by + (d.subline ? 64 : 72));
    if (d.subline) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `500 26px ${BODY}`;
      ctx.fillText(fit(ctx, d.subline, bw - numW - 50), sa.left + numW + 26, by + 106);
    }
    by -= 16;
  }
  if (o.stats && d.stats?.cells.length) {
    const h = 96;
    by -= h;
    const n = d.stats.cells.length;
    const w = Math.min(sa.right - sa.left, n * 120 + (n - 1) * 10);
    statsRow(ctx, d.stats.cells, sa.left + w / 2, by, w, h, accent);
  }
  return c;
}

// ─── Outro ──────────────────────────────────────────────────────────────────

export async function renderOutro(d: VideoGraphicsData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [c, ctx] = newCanvas(d.format);
  const { w } = VIDEO_SIZE[d.format];
  await background(ctx, d.format, d.team);
  const sa = safeArea(d.format, "card");
  const cx = w / 2;
  const maxW = sa.right - sa.left;
  const reel = d.format === "reel";
  const logo = await tryLoad(teamLogo(d.team) ?? club().logo);
  const sp = d.show.outro.sponsor ? d.outroSponsor : null;
  const spImg = sp?.logo ? await tryLoad(sp.logo) : null;

  const logoH = reel ? 300 : 240;
  const blockH = logoH + 60 + (sp ? 70 + (reel ? 200 : 160) : 70);
  let y = sa.top + Math.max(0, (sa.bottom - sa.top - blockH) / 2);
  if (logo) drawContain(ctx, logo, cx, y + logoH / 2, logoH, logoH);
  y += logoH + 60;
  ctx.textAlign = "center";
  if (sp) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `600 34px ${BODY}`;
    ctx.letterSpacing = "6px";
    ctx.fillText("TACK TILL", cx, y + 34);
    ctx.letterSpacing = "0px";
    y += 70;
    const h = reel ? 200 : 160;
    if (spImg) drawContain(ctx, spImg, cx, y + h / 2, maxW * 0.8, h);
    else {
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(h * 0.5)}px ${HEAD}`;
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, sp.name, maxW), cx, y + h / 2);
      ctx.textBaseline = "alphabetic";
    }
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = `700 56px ${HEAD}`;
    ctx.letterSpacing = "4px";
    ctx.fillText(fit(ctx, clubHeading(), maxW), cx, y + 56);
    ctx.letterSpacing = "0px";
  }
  return c;
}

/** Alla PNG:er som skickas till servern */
export async function renderVideoGraphics(d: VideoGraphicsData) {
  const [intro2, outro, overlay] = await Promise.all([renderIntro2(d), renderOutro(d), hasOverlay(d) ? renderOverlay(d) : Promise.resolve(null)]);
  return { intro2, outro, overlay };
}

export { loadImage as loadVideoImage };
