/**
 * Stålbladet – Media-mallar i tidningsstil (en påhittad lokaltidning som skriver
 * om klubben): löpsedeln och artikeln. Samma format som övriga Media-bilder
 * (4:5, eller 9:16 med innehållet i den säkra ytan).
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, fit, canvas, contentArea, frameHeight, type PostFormat } from "@/lib/matchReportImages";
import { club } from "@shared/club";

export const PRESS_NAME = "Stålbladet";
export const SERIF_HEAD = "'Playfair Display', serif";
export const SERIF_BODY = "'Source Serif 4', serif";

export type BillStyle = "yellow" | "white" | "black";
export const BILL_STYLES: Array<{ id: BillStyle; name: string }> = [
  { id: "yellow", name: "Gul" },
  { id: "white", name: "Vit" },
  { id: "black", name: "Svart" },
];

interface PressCommon {
  format?: PostFormat;
  dateLine: string;
  sponsor: { name: string; logo: string | null } | null;
}

export interface BillPostData extends PressCommon {
  kind: "bill";
  style: BillStyle;
  kicker: string;
  headline: string;
  sub: string;
  photo?: HTMLImageElement | null;
}

export interface ArticlePostData extends PressCommon {
  kind: "article";
  kicker: string;
  headline: string;
  ingress: string;
  body: string;
  caption: string;
  byline: string;
  /** Bild till artikeln (egen bild eller en av Medias bakgrunder) */
  photo: HTMLImageElement | null;
  /** Faktaruta, t.ex. matchfakta (rubrik + rader) */
  facts: { title: string; rows: string[] } | null;
}

/** Bryt text i rader (ord för ord) */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Klipp till max rader, sista raden med … */
function clip(ctx: CanvasRenderingContext2D, lines: string[], max: number, maxW: number): string[] {
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  cut[max - 1] = fit(ctx, `${cut[max - 1]}…`, maxW);
  return cut;
}

/** Tidningspapper: färg med lätt brus (fast slump – samma bild varje gång) */
function paper(ctx: CanvasRenderingContext2D, color: string, grain = 0.05) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${grain * rnd()})` : `rgba(255,255,255,${grain * rnd()})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
}

/** Annonsruta med sponsorn ("ANNONS" som i tidningen) */
function adBox(ctx: CanvasRenderingContext2D, sponsor: { name: string } | null, logo: HTMLImageElement | null, x: number, y: number, w: number, h: number, dark = false) {
  if (!sponsor) return;
  ctx.save();
  ctx.fillStyle = dark ? "#1a1a1a" : "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dark ? "#444" : "#111";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = dark ? "#aaa" : "#555";
  ctx.font = `600 18px ${BODY}`;
  ctx.letterSpacing = "4px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ANNONS", x + 14, y + 10);
  ctx.letterSpacing = "0px";
  const inner = { x: x + 20, y: y + 34, w: w - 40, h: h - 46 };
  if (logo) {
    const s = Math.min(inner.w / logo.width, inner.h / logo.height);
    ctx.drawImage(logo, inner.x + (inner.w - logo.width * s) / 2, inner.y + (inner.h - logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = dark ? "#fff" : "#111";
    ctx.font = `700 ${Math.round(Math.min(56, inner.h * 0.7))}px ${HEAD}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, sponsor.name.toUpperCase(), inner.w), x + w / 2, inner.y + inner.h / 2);
  }
  ctx.restore();
}

/** Bild som fyller rutan (beskärs) */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

// ─── Löpsedeln ───────────────────────────────────────────────────────────────
const BILL_COLORS: Record<BillStyle, { bg: string; ink: string; band: string; bandInk: string; kicker: string; kickerInk: string }> = {
  yellow: { bg: "#ffd60a", ink: "#0d0d0d", band: "#d62828", bandInk: "#ffffff", kicker: "#0d0d0d", kickerInk: "#ffd60a" },
  white: { bg: "#f7f5f0", ink: "#0d0d0d", band: "#d62828", bandInk: "#ffffff", kicker: "#d62828", kickerInk: "#ffffff" },
  black: { bg: "#111111", ink: "#ffffff", band: "#ffd60a", bandInk: "#111111", kicker: "#d62828", kickerInk: "#ffffff" },
};

/** Största teckenstorlek där rubriken ryms (exporteras för test) */
export function fitHeadline(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, font: (px: number) => string, lineH = 0.92, maxPx = 230, minPx = 70): { px: number; lines: string[] } {
  for (let px = maxPx; px >= minPx; px -= 6) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxW);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * px * lineH <= maxH && widest <= maxW) return { px, lines };
  }
  ctx.font = font(minPx);
  return { px: minPx, lines: clip(ctx, wrap(ctx, text, maxW), Math.max(1, Math.floor(maxH / (minPx * lineH))), maxW) };
}

export async function renderBill(d: BillPostData): Promise<HTMLCanvasElement> {
  const [sp] = await Promise.all([tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  const col = BILL_COLORS[d.style] ?? BILL_COLORS.yellow;
  paper(ctx, col.bg, d.style === "black" ? 0.08 : 0.05);
  contentArea(ctx);
  const M = 56;

  // Tidningshuvudet
  ctx.fillStyle = col.band;
  ctx.fillRect(0, 40, IG_W, 150);
  ctx.fillStyle = col.bandInk;
  ctx.font = `900 112px ${SERIF_HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(PRESS_NAME, M, 152);
  ctx.font = `600 24px ${BODY}`;
  ctx.textAlign = "right";
  const date = d.dateLine || new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  ctx.fillText(fit(ctx, date.toUpperCase(), 330), IG_W - M, 100);
  ctx.fillText("SPORT", IG_W - M, 136);

  // Etikett ("VÄNDNINGEN", "EXTRA" …)
  let y = 236;
  if (d.kicker) {
    ctx.font = `700 46px ${HEAD}`;
    ctx.letterSpacing = "3px";
    const k = d.kicker.toUpperCase();
    const kw = ctx.measureText(k).width + 44;
    ctx.fillStyle = col.kicker;
    ctx.fillRect(M, y, kw, 70);
    ctx.fillStyle = col.kickerInk;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(k, M + 22, y + 37);
    ctx.letterSpacing = "0px";
    y += 96;
  }

  // Rubriken: så stor som möjligt, blocket (rubrik, underrubrik, bild) centreras i ytan
  const LH = 1.08; // luft för Å, Ä och Ö
  const limit = d.sponsor ? IG_H - 200 : IG_H - 70;
  const photoH = d.photo ? 310 : 0;
  const subReserve = d.sub ? 130 : 0;
  const head = fitHeadline(ctx, (d.headline || "Rubrik").toUpperCase(), IG_W - 2 * M, limit - y - photoH - subReserve - 20, (px) => `700 ${px}px ${HEAD}`, LH, 260);
  ctx.font = `600 44px ${BODY}`;
  const subLines = d.sub ? clip(ctx, wrap(ctx, d.sub, IG_W - 2 * M), 2, IG_W - 2 * M) : [];
  const headH = head.lines.length * head.px * LH;
  const blockH = headH + (subLines.length ? 28 + subLines.length * 54 : 0) + (photoH ? 36 + photoH : 0);
  y += Math.max(0, (limit - y - blockH) / 2);
  ctx.fillStyle = col.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 ${head.px}px ${HEAD}`;
  head.lines.forEach((l, i) => ctx.fillText(l, M - 4, y + i * head.px * LH));
  y += headH;
  if (subLines.length) {
    y += 28;
    ctx.font = `600 44px ${BODY}`;
    subLines.forEach((l, i) => ctx.fillText(l, M, y + i * 54));
    y += subLines.length * 54;
  }
  if (d.photo) {
    y += 36;
    const h = Math.min(photoH, limit - y);
    if (h > 120) {
      ctx.fillStyle = col.ink;
      ctx.fillRect(M - 6, y - 6, IG_W - 2 * M + 12, h + 12);
      cover(ctx, d.photo, M, y, IG_W - 2 * M, h);
    }
  }

  adBox(ctx, d.sponsor, sp, M, IG_H - 170, IG_W - 2 * M, 120, d.style === "black");
  return c;
}

// ─── Artikeln ────────────────────────────────────────────────────────────────
export async function renderArticle(d: ArticlePostData): Promise<HTMLCanvasElement> {
  const [sp] = await Promise.all([tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  paper(ctx, "#f4efe4", 0.045);
  contentArea(ctx);
  const M = 60, W = IG_W - 2 * M;
  const ink = "#141414", red = "#b3121f";

  // Tidningshuvudet
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 120px ${SERIF_HEAD}`;
  ctx.fillText(PRESS_NAME, IG_W / 2, 150);
  ctx.fillRect(M, 172, W, 4);
  ctx.fillRect(M, 182, W, 1.5);
  ctx.font = `600 22px ${BODY}`;
  ctx.letterSpacing = "3px";
  const date = d.dateLine || new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  ctx.textAlign = "left";
  ctx.fillText(fit(ctx, date.toUpperCase(), W * 0.6), M, 216);
  ctx.textAlign = "right";
  ctx.fillText("SPORT · LÖSNUMMER 10 KR", IG_W - M, 216);
  ctx.letterSpacing = "0px";
  ctx.fillRect(M, 232, W, 1.5);

  let y = 268;
  if (d.kicker) {
    ctx.fillStyle = red;
    ctx.font = `700 30px ${HEAD}`;
    ctx.letterSpacing = "4px";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(d.kicker.toUpperCase(), M, y);
    ctx.letterSpacing = "0px";
    y += 46;
  }
  // Rubrik
  const head = fitHeadline(ctx, d.headline || "Rubrik", W, 250, (px) => `700 ${px}px ${SERIF_HEAD}`, 1.05, 96, 54);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 ${head.px}px ${SERIF_HEAD}`;
  head.lines.forEach((l, i) => ctx.fillText(l, M, y + i * head.px * 1.05));
  y += head.lines.length * head.px * 1.05 + 16;
  // Ingress
  if (d.ingress) {
    ctx.font = `600 32px ${SERIF_BODY}`;
    const lines = clip(ctx, wrap(ctx, d.ingress, W), 3, W);
    lines.forEach((l, i) => ctx.fillText(l, M, y + i * 42));
    y += lines.length * 42 + 22;
  }
  // Bild med bildtext
  const adH = d.sponsor ? 100 : 0;
  const bottom = IG_H - 50 - (adH ? adH + 24 : 0);
  if (d.photo) {
    const h = Math.max(200, Math.min(300, bottom - y - 330));
    cover(ctx, d.photo, M, y, W, h);
    y += h + 10;
    if (d.caption) {
      ctx.font = `italic 400 22px ${SERIF_BODY}`;
      ctx.fillStyle = "#555";
      ctx.fillText(fit(ctx, d.caption, W), M, y);
      y += 34;
    }
    y += 10;
  }
  // Brödtext i spalter (faktarutan tar högra spalten)
  const gap = 34;
  const colW = (W - gap) / 2;
  const cols = d.facts ? 1 : 2;
  const lineH = 33;
  const rows = Math.max(0, Math.floor((bottom - y - 34) / lineH));
  ctx.fillStyle = ink;
  ctx.font = `italic 600 22px ${SERIF_BODY}`;
  ctx.fillText(fit(ctx, d.byline || `Av ${PRESS_NAME}s utsände`, colW), M, y);
  const bodyTop = y + 34;
  ctx.font = `400 25px ${SERIF_BODY}`;
  const all = wrap(ctx, d.body, colW);
  const perCol = Math.max(0, rows - 1);
  for (let k = 0; k < cols; k++) {
    let part = all.slice(k * perCol, (k + 1) * perCol);
    if (k === cols - 1 && all.length > (k + 1) * perCol) part = clip(ctx, part.concat("…"), perCol, colW);
    part.forEach((l, i) => ctx.fillText(l, M + k * (colW + gap), bodyTop + i * lineH));
  }
  if (cols === 2) { ctx.fillStyle = "#bbb"; ctx.fillRect(M + colW + gap / 2, bodyTop, 1, perCol * lineH); }
  // Faktaruta
  if (d.facts) {
    const fx = M + colW + gap, fy = y, fw = colW, fh = bottom - y;
    ctx.fillStyle = "#e9e1cf";
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = red;
    ctx.fillRect(fx, fy, fw, 6);
    ctx.fillStyle = ink;
    ctx.font = `700 26px ${HEAD}`;
    ctx.letterSpacing = "3px";
    ctx.fillText(d.facts.title.toUpperCase(), fx + 18, fy + 22);
    ctx.letterSpacing = "0px";
    ctx.font = `400 23px ${SERIF_BODY}`;
    let ry = fy + 66;
    for (const r of d.facts.rows) {
      for (const l of wrap(ctx, r, fw - 36)) {
        if (ry > fy + fh - 30) break;
        ctx.fillText(l, fx + 18, ry);
        ry += 31;
      }
      ry += 6;
    }
  }
  adBox(ctx, d.sponsor, sp, M, IG_H - 50 - adH, W, adH);
  // Liten avslutande rad
  ctx.fillStyle = "#777";
  ctx.font = `500 18px ${BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${PRESS_NAME} – ${club().name}s egen hockeytidning`, IG_W / 2, IG_H - 18);
  return c;
}

/** Ladda tidningens typsnitt innan något ritas */
export async function ensurePressFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(PRESS_FONTS.map((f) => document.fonts.load(f).catch(() => undefined)));
}

export const PRESS_FONTS = [`900 100px ${SERIF_HEAD}`, `700 60px ${SERIF_HEAD}`, `400 25px ${SERIF_BODY}`, `600 30px ${SERIF_BODY}`, `italic 400 22px ${SERIF_BODY}`, `italic 600 22px ${SERIF_BODY}`];
