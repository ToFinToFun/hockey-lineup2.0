/**
 * Stålbladet – tidningssidor i Media: förstasidan, artikeln och intervjun.
 *
 * Allt är fritext (rubriker, ingress, brödtext, frågor och svar, citat, puffar)
 * med egna bilder. Runt omkring finns det som får sidan att kännas levande:
 * senaste matchen, nästa match, resultatbörsen och sponsorernas annonser –
 * annonser som i en riktig tidning (logga och en kort text), inte "presenteras av".
 *
 * Samma format som övriga Media-bilder: 4:5, eller 9:16 där bakgrunden fyller
 * hela höjden och sidan ligger i den säkra ytan.
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, fit, canvas, contentArea, frameHeight } from "@/lib/matchReportImages";
import { PRESS_NAME, SERIF_HEAD, SERIF_BODY, wrap, clip, paper, cover, fitHeadline, type PressCommon } from "@/lib/pressImages";
import { club } from "@shared/club";
import { teamColor } from "@shared/teams";

export type PressPageKind = "front" | "article" | "interview";

export interface PressAd { name: string; logo: string | null; slogan?: string | null }
export interface PressTeaser { kicker: string; title: string; sub: string; page: string; image: HTMLImageElement | null }
export interface PressLatest { home: string; away: string; homeScore: number; awayScore: number; homeColor: string; awayColor: string; lines: string[] }

export interface PressPageData extends PressCommon {
  kind: PressPageKind;
  kicker: string;
  headline: string;
  /** Citatrubrik under rubriken, t.ex. "Vi bygger något speciellt här" */
  quoteHead: string;
  ingress: string;
  /** Brödtext. Intervju: stycken där första raden slutar med ? blir frågor (fetstil). */
  body: string;
  /** Rubrik på textrutan (förstasidan), t.ex. "Om säsongen, laget och framåt" */
  boxTitle: string;
  caption: string;
  byline: string;
  pullQuote: string;
  pullQuoteBy: string;
  photo: HTMLImageElement | null;
  /** Artikeln: bilden bakom tidningssidan */
  backdrop: HTMLImageElement | null;
  teasers: PressTeaser[];
  latest: PressLatest | null;
  next: { when: string; what: string } | null;
  results: Array<{ home: string; away: string; score: string }>;
  ads: PressAd[];
  issue: { nr: number; year: number };
}

const INK = "#141414";
const PAPER = "#f2eee6";
const MUTED = "#5b5b5b";
const LIGHT = "#e6e0d3";
/** Tidningens färg: klubbens gröna (mörk nog för vit text) */
const accent = () => shade(teamColor("green"), -0.35);

function shade(hex: string, amt: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#1d4d2e";
  const c = m.slice(1).map((h) => Math.round(Math.min(255, Math.max(0, parseInt(h, 16) * (1 + amt)))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Text ────────────────────────────────────────────────────────────────────

interface Para { text: string; bold: boolean }

/** Stycken (tom rad emellan). Intervju: en rad som slutar med ? blir en fråga. */
export function toParagraphs(text: string, qa = false): Para[] {
  const out: Para[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (qa && /\?\s*$/.test(lines[0])) {
      out.push({ text: lines[0], bold: true });
      if (lines.length > 1) out.push({ text: lines.slice(1).join(" "), bold: false });
    } else out.push({ text: lines.join(" "), bold: false });
  }
  return out;
}

/**
 * Text i en eller flera spalter: största storleken (maxPx → minPx) där allt
 * ryms, annars minsta storleken och … på slutet. Frågor i fetstil, luft mellan stycken.
 */
function columns(ctx: CanvasRenderingContext2D, paras: Para[], x: number, y: number, w: number, h: number, cols: number, opts: { maxPx: number; minPx: number; gap?: number; color?: string; family?: string; rule?: boolean }) {
  const gap = opts.gap ?? 30;
  const colW = (w - gap * (cols - 1)) / cols;
  const fam = opts.family ?? SERIF_BODY;
  type Line = { t: string; bold: boolean; space: boolean };
  let px = opts.maxPx, lines: Line[] = [], perCol = 0, lh = 0;
  for (; px >= opts.minPx; px -= 1) {
    lh = Math.round(px * 1.32);
    lines = [];
    paras.forEach((p, i) => {
      ctx.font = `${p.bold ? 700 : 400} ${px}px ${fam}`;
      const ls = wrap(ctx, p.text, colW);
      ls.forEach((t, k) => lines.push({ t, bold: p.bold, space: k === 0 && i > 0 && !paras[i - 1].bold }));
    });
    perCol = Math.floor(h / lh);
    const needed = lines.reduce((n, l) => n + (l.space ? 0.5 : 0) + 1, 0);
    if (needed <= perCol * cols) break;
  }
  px = Math.max(px, opts.minPx);
  ctx.fillStyle = opts.color ?? INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let col = 0, cy = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const add = l.space ? lh * 0.5 : 0;
    if (cy + add + lh > h + 1) {
      col++; cy = 0;
      if (col >= cols) {
        // Ryms inte: … på sista raden
        const lx = x + (cols - 1) * (colW + gap);
        ctx.fillStyle = PAPER;
        ctx.fillRect(lx, y + h - lh, colW, lh);
        ctx.fillStyle = opts.color ?? INK;
        ctx.font = `400 ${px}px ${fam}`;
        ctx.fillText(fit(ctx, `${lines[i - 1]?.t ?? ""}…`, colW), lx, y + h - lh);
        break;
      }
    } else cy += cy === 0 ? 0 : add;
    ctx.font = `${l.bold ? 700 : 400} ${px}px ${fam}`;
    ctx.fillText(l.t, x + col * (colW + gap), y + cy);
    cy += lh;
  }
  if (opts.rule && cols > 1) {
    ctx.fillStyle = "#c9c1b0";
    for (let c = 1; c < cols; c++) ctx.fillRect(x + c * (colW + gap) - gap / 2, y, 1, h);
  }
}

/** Text som ska fylla en ruta: största storleken där den ryms (rader centrerade eller vänster) */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, font: (px: number) => string, maxPx: number, minPx: number, lh = 1.15, align: CanvasTextAlign = "left") {
  if (!text) return 0;
  let px = maxPx, lines: string[] = [];
  for (; px >= minPx; px -= 2) {
    ctx.font = font(px);
    lines = wrap(ctx, text, w);
    if (lines.length * px * lh <= h) break;
  }
  ctx.font = font(Math.max(px, minPx));
  const max = Math.max(1, Math.floor(h / (Math.max(px, minPx) * lh)));
  lines = clip(ctx, lines, max, w);
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const ax = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
  lines.forEach((l, i) => ctx.fillText(l, ax, y + i * Math.max(px, minPx) * lh));
  return lines.length * Math.max(px, minPx) * lh;
}

// ─── Byggstenar ──────────────────────────────────────────────────────────────

function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, thick = 1.5) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, thick);
}

/** Etikett i färg med snedstreck ("INTERVJU ///") */
function kickerBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 44) {
  if (!text) return 0;
  ctx.font = `700 ${size}px ${HEAD}`;
  ctx.letterSpacing = "2px";
  const t = text.toUpperCase();
  const w = ctx.measureText(t).width + size * 0.9;
  const h = size * 1.45;
  ctx.fillStyle = accent();
  ctx.fillRect(x, y, w, h);
  // Snedstreck
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const sx = x + w + 10 + i * 18;
    ctx.moveTo(sx, y + h); ctx.lineTo(sx + 12, y + h); ctx.lineTo(sx + 12 + h * 0.35, y); ctx.lineTo(sx + h * 0.35, y); ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(t, x + size * 0.45, y + h / 2 + 2);
  ctx.letterSpacing = "0px";
  return h;
}

/** Ruta med rubrikrad i tidningens färg */
function boxHeader(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, w: number, h = 40) {
  ctx.fillStyle = accent();
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(h * 0.6)}px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, title.toUpperCase(), w - 24), x + 12, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return h;
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = "#f7f4ee") {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#b9b1a0";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

/** Tröja i lagets färg (som i resultatrutan) */
function jersey(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.5); ctx.lineTo(-s * 0.5, -s * 0.38); ctx.lineTo(-s * 0.62, -s * 0.05); ctx.lineTo(-s * 0.45, s * 0.02);
  ctx.lineTo(-s * 0.4, -s * 0.12); ctx.lineTo(-s * 0.4, s * 0.5); ctx.lineTo(s * 0.4, s * 0.5); ctx.lineTo(s * 0.4, -s * 0.12);
  ctx.lineTo(s * 0.45, s * 0.02); ctx.lineTo(s * 0.62, -s * 0.05); ctx.lineTo(s * 0.5, -s * 0.38); ctx.lineTo(s * 0.28, -s * 0.5);
  ctx.quadraticCurveTo(0, -s * 0.3, -s * 0.28, -s * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Senaste matchen: lagen, resultatet och några rader matchfakta */
function latestBox(ctx: CanvasRenderingContext2D, m: PressLatest, x: number, y: number, w: number, h: number) {
  frame(ctx, x, y, w, h);
  const hh = boxHeader(ctx, "Senaste matchen", x, y, w);
  const cy = y + hh + 62;
  jersey(ctx, x + 40, cy - 6, 56, m.homeColor);
  jersey(ctx, x + w - 40, cy - 6, 56, m.awayColor);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 54px ${HEAD}`;
  ctx.fillText(`${m.homeScore}–${m.awayScore}`, x + w / 2, cy);
  ctx.font = `600 19px ${BODY}`;
  ctx.fillText(fit(ctx, m.home, w / 2 - 14), x + w / 4 + 4, cy + 50);
  ctx.fillText(fit(ctx, m.away, w / 2 - 14), x + (w * 3) / 4 - 4, cy + 50);
  let ly = cy + 82;
  if (m.lines.length && ly < y + h - 30) {
    ctx.font = `700 18px ${HEAD}`;
    ctx.textAlign = "left";
    ctx.letterSpacing = "1px";
    ctx.fillStyle = accent();
    ctx.fillText("MATCHFAKTA", x + 14, ly);
    ctx.letterSpacing = "0px";
    ly += 14;
    ctx.fillStyle = "#b9b1a0";
    ctx.fillRect(x + 14, ly, w - 28, 1);
    ly += 8;
    ctx.fillStyle = INK;
    ctx.font = `400 18px ${SERIF_BODY}`;
    ctx.textBaseline = "top";
    for (const l of m.lines) {
      for (const t of wrap(ctx, l, w - 28)) {
        if (ly + 24 > y + h - 8) return;
        ctx.fillText(t, x + 14, ly);
        ly += 24;
      }
    }
  }
}

function quoteBox(ctx: CanvasRenderingContext2D, quote: string, by: string, x: number, y: number, w: number, h: number) {
  frame(ctx, x, y, w, h, "#dfe6e1");
  ctx.fillStyle = accent();
  ctx.font = `900 96px ${SERIF_HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("”", x + 16, y - 6);
  ctx.fillStyle = INK;
  const used = fitText(ctx, `”${quote}”`, x + 18, y + 70, w - 36, h - 70 - (by ? 56 : 20), (px) => `italic 700 ${px}px ${SERIF_BODY}`, 34, 18, 1.2);
  if (by) {
    ctx.fillStyle = accent();
    ctx.font = `700 17px ${HEAD}`;
    ctx.letterSpacing = "1px";
    ctx.textAlign = "left";
    const [name, ...role] = by.split(/,\s*/);
    const ty = Math.min(y + h - 50, y + 80 + used);
    ctx.fillText(fit(ctx, name.toUpperCase(), w - 36), x + 18, ty);
    ctx.letterSpacing = "0px";
    if (role.length) {
      ctx.fillStyle = MUTED;
      ctx.font = `500 16px ${BODY}`;
      ctx.fillText(fit(ctx, role.join(", "), w - 36), x + 18, ty + 22);
    }
  }
}

/** Annons som i tidningen: liten "ANNONS"-rad, logga och annonstext */
function adBox(ctx: CanvasRenderingContext2D, ad: PressAd, logo: HTMLImageElement | null, x: number, y: number, w: number, h: number, variant = 0) {
  const dark = variant % 2 === 1;
  ctx.fillStyle = MUTED;
  ctx.font = `700 14px ${BODY}`;
  ctx.letterSpacing = "2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("ANNONS", x, y - 6);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = dark ? "#16261c" : "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dark ? "#16261c" : "#b9b1a0";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  const slogan = ad.slogan?.trim() || "";
  const pad = 14;
  const textH = slogan ? Math.min(h * 0.42, 90) : 0;
  const lx = x + pad, ly = y + pad, lw = w - 2 * pad, lh = h - 2 * pad - textH;
  if (logo) {
    const s = Math.min(lw / logo.width, lh / logo.height);
    if (dark) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x + w / 2 - (logo.width * s) / 2 - 10, ly + (lh - logo.height * s) / 2 - 8, logo.width * s + 20, logo.height * s + 16); }
    ctx.drawImage(logo, x + w / 2 - (logo.width * s) / 2, ly + (lh - logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = dark ? "#fff" : INK;
    fitText(ctx, ad.name.toUpperCase(), lx, ly + lh / 2 - Math.min(60, lh) / 2, lw, Math.min(60, lh), (px) => `700 ${px}px ${HEAD}`, 52, 18, 1.0, "center");
  }
  if (slogan) {
    ctx.fillStyle = dark ? "#e8efe9" : INK;
    fitText(ctx, slogan, lx, y + h - pad - textH, lw, textH, (px) => `italic 600 ${px}px ${SERIF_BODY}`, 26, 14, 1.15, "center");
  }
}

function resultsBox(ctx: CanvasRenderingContext2D, rows: PressPageData["results"], x: number, y: number, w: number, h: number) {
  frame(ctx, x, y, w, h);
  const hh = boxHeader(ctx, "Resultatbörsen", x, y, w);
  let ry = y + hh + 14;
  ctx.textBaseline = "top";
  for (const r of rows) {
    if (ry + 30 > y + h) break;
    ctx.fillStyle = INK;
    ctx.font = `400 19px ${SERIF_BODY}`;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, `${r.home}–${r.away}`, w - 90), x + 14, ry);
    ctx.font = `700 19px ${HEAD}`;
    ctx.textAlign = "right";
    ctx.fillText(r.score, x + w - 14, ry);
    ry += 30;
    ctx.fillStyle = "#d8d0bf";
    ctx.fillRect(x + 14, ry - 6, w - 28, 1);
  }
}

function nextBox(ctx: CanvasRenderingContext2D, n: { when: string; what: string }, x: number, y: number, w: number, h: number) {
  frame(ctx, x, y, w, h, "#e9e4d8");
  ctx.fillStyle = accent();
  ctx.font = `700 22px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("NÄSTA MATCH", x + 18, y + 16);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#b9b1a0";
  ctx.fillRect(x + 18, y + 48, w - 36, 1);
  ctx.fillStyle = INK;
  fitText(ctx, n.when.toUpperCase(), x + 18, y + 60, w - 36, 36, (px) => `700 ${px}px ${HEAD}`, 30, 18);
  ctx.fillStyle = MUTED;
  fitText(ctx, n.what, x + 18, y + 100, w - 36, h - 110, (px) => `400 ${px}px ${SERIF_BODY}`, 22, 15);
}

function teaser(ctx: CanvasRenderingContext2D, t: PressTeaser, x: number, y: number, w: number, h: number) {
  const iw = t.image ? Math.round(w * 0.42) : 0;
  if (t.image) cover(ctx, t.image, x, y, iw, h);
  const tx = x + iw + (iw ? 14 : 0), tw = w - iw - (iw ? 14 : 0);
  let ty = y;
  if (t.kicker) {
    ctx.font = `700 15px ${HEAD}`;
    ctx.letterSpacing = "1px";
    const k = t.kicker.toUpperCase();
    const kw = Math.min(tw, ctx.measureText(k).width + 14);
    ctx.fillStyle = accent();
    ctx.fillRect(tx, ty, kw, 24);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, k, tw - 14), tx + 7, ty + 13);
    ctx.letterSpacing = "0px";
    ty += 32;
  }
  ctx.fillStyle = INK;
  const used = fitText(ctx, t.title, tx, ty, tw, h - (ty - y) - (t.sub ? 44 : 26), (px) => `700 ${px}px ${SERIF_HEAD}`, 28, 18, 1.1);
  ty += used + 4;
  if (t.sub) {
    ctx.fillStyle = MUTED;
    fitText(ctx, t.sub, tx, ty, tw, Math.max(20, y + h - 26 - ty), (px) => `400 ${px}px ${SERIF_BODY}`, 18, 14, 1.15);
  }
  if (t.page) {
    ctx.fillStyle = INK;
    ctx.font = `700 15px ${HEAD}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(t.page.toUpperCase(), tx, y + h);
  }
}

/** Bild med mjuk övergång mot papperet till vänster (förstasidan) */
function fadedPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fadeW: number) {
  cover(ctx, img, x, y, w, h);
  const g = ctx.createLinearGradient(x, 0, x + fadeW, 0);
  g.addColorStop(0, PAPER);
  g.addColorStop(0.55, "rgba(242,238,230,0.75)");
  g.addColorStop(1, "rgba(242,238,230,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, fadeW, h);
}

function dateText(d: PressPageData) {
  return d.dateLine || new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Tidningshuvudet: "STÅL" svart + "BLADET" i tidningens färg, klubbens logga till höger */
function masthead(ctx: CanvasRenderingContext2D, d: PressPageData, logo: HTMLImageElement | null, y: number, size: number) {
  const M = 36;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const name = PRESS_NAME.toUpperCase();
  const split = name.startsWith("STÅL") ? 4 : Math.ceil(name.length / 2);
  let px = size;
  const avail = IG_W - 2 * M - (logo ? size * 0.95 : 0);
  for (; px > 40; px -= 4) {
    ctx.font = `700 ${px}px ${HEAD}`;
    if (ctx.measureText(name).width <= avail) break;
  }
  ctx.font = `700 ${px}px ${HEAD}`;
  ctx.fillStyle = INK;
  ctx.fillText(name.slice(0, split), M, y + px * 0.86);
  const w1 = ctx.measureText(name.slice(0, split)).width;
  ctx.fillStyle = accent();
  ctx.fillText(name.slice(split), M + w1, y + px * 0.86);
  const total = ctx.measureText(name).width;
  if (logo) {
    const s = (px * 0.95) / Math.max(logo.width, logo.height);
    ctx.drawImage(logo, Math.min(IG_W - M - logo.width * s, M + total + 18), y + (px * 0.9 - logo.height * s) / 2, logo.width * s, logo.height * s);
  }
  return px * 0.95;
}

// ─── Förstasidan ─────────────────────────────────────────────────────────────
export async function renderFront(d: PressPageData): Promise<HTMLCanvasElement> {
  const [logo, ...adLogos] = await Promise.all([tryLoad(club().logo), ...d.ads.map((a) => tryLoad(a.logo))]);
  const [c, ctx] = canvas(frameHeight(d.format));
  paper(ctx, PAPER, 0.04);
  contentArea(ctx);
  const M = 36, W = IG_W - 2 * M;
  // Överst: tidningen, avdelningarna, datum och nummer
  ctx.fillStyle = INK;
  ctx.font = `700 15px ${HEAD}`;
  ctx.letterSpacing = "1px";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("DIN LOKALA TIDNING OM", M, 18);
  ctx.fillText(fit(ctx, club().name.toUpperCase(), 260), M, 38);
  ctx.textAlign = "center";
  ctx.font = `700 17px ${HEAD}`;
  ctx.fillText("MATCHER  •  MÄNNISKOR  •  FÖRENINGSLIV", IG_W / 2, 26);
  ctx.textAlign = "right";
  ctx.font = `700 15px ${HEAD}`;
  ctx.fillText(fit(ctx, dateText(d).toUpperCase(), 280), IG_W - M, 18);
  ctx.fillText(`NR ${d.issue.nr}  |  ÅRGÅNG ${d.issue.year}`, IG_W - M, 38);
  ctx.letterSpacing = "0px";
  rule(ctx, M, 62, W, 2);
  masthead(ctx, d, logo, 70, 150);
  rule(ctx, M, 222, W, 1.5);
  ctx.fillStyle = INK;
  ctx.font = `600 16px ${HEAD}`;
  ctx.letterSpacing = "1px";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("ISHOCKEY   |   LAGET   |   MÄNNISKOR   |   RESULTAT   |   STÖRRE ÄN BARA RESULTAT", M, 236);
  ctx.textAlign = "right";
  ctx.fillStyle = accent();
  ctx.fillText(`VI BEVAKAR ${club().shortName?.toUpperCase() || club().name.toUpperCase()}`, IG_W - M, 236);
  ctx.letterSpacing = "0px";
  rule(ctx, M, 250, W, 1.5);

  // Huvudnyheten (vänster) och sidospalten (höger)
  const sideW = 238, mainW = W - sideW - 20, sideX = M + mainW + 20;
  const top = 262, mainBottom = 830;
  if (d.photo) fadedPhoto(ctx, d.photo, M, top, mainW, mainBottom - top, mainW * 0.62);
  let y = top + 12;
  y += kickerBox(ctx, d.kicker, M, y, 44) + 16;
  const textW = d.photo ? mainW * 0.62 : mainW;
  // Plats för ingressen längst ner (minst tre rader)
  const ingressH = d.ingress ? 110 : 0;
  const head = fitHeadline(ctx, (d.headline || "Rubrik").toUpperCase(), textW, Math.min(280, mainBottom - y - ingressH - (d.quoteHead ? 120 : 0) - 16), (px) => `700 ${px}px ${HEAD}`, 1.0, 104, 40);
  ctx.fillStyle = INK;
  ctx.font = `700 ${head.px}px ${HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  head.lines.forEach((l, i) => ctx.fillText(l, M, y + i * head.px));
  y += head.lines.length * head.px + 8;
  if (d.quoteHead) y += fitText(ctx, `”${d.quoteHead}”`, M, y, textW, Math.max(60, mainBottom - y - ingressH - 12), (px) => `700 ${px}px ${SERIF_HEAD}`, 64, 30, 1.08) + 12;
  if (d.ingress) {
    ctx.fillStyle = INK;
    fitText(ctx, d.ingress, M, y, textW * 0.95, mainBottom - y - 10, (px) => `400 ${px}px ${SERIF_BODY}`, 26, 17, 1.25);
  }
  if (d.photo && d.caption) {
    ctx.fillStyle = "#fff";
    ctx.font = `600 14px ${BODY}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
    ctx.fillText(fit(ctx, d.caption.toUpperCase(), mainW * 0.6), M + mainW - 12, mainBottom - 12);
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  }
  // Sidospalten
  let sy = top;
  if (d.latest) { latestBox(ctx, d.latest, sideX, sy, sideW, 300); sy += 316; }
  if (d.pullQuote) { quoteBox(ctx, d.pullQuote, d.pullQuoteBy, sideX, sy, sideW, mainBottom - sy); sy = mainBottom; }
  else if (d.results.length) { resultsBox(ctx, d.results, sideX, sy, sideW, mainBottom - sy); sy = mainBottom; }

  // Textrutan och annonsen
  const hasTeasers = d.teasers.some((t) => t.title);
  const midTop = mainBottom + 20, midBottom = hasTeasers ? 1150 : IG_H - 30;
  if (d.body) {
    ctx.fillStyle = LIGHT;
    ctx.fillRect(M, midTop, mainW, midBottom - midTop);
    ctx.fillStyle = accent();
    ctx.fillRect(M, midTop, 6, midBottom - midTop);
    let by = midTop + 14;
    if (d.boxTitle) {
      ctx.fillStyle = accent();
      by += fitText(ctx, d.boxTitle.toUpperCase(), M + 24, by, mainW - 40, 34, (px) => `700 ${px}px ${HEAD}`, 30, 18) + 8;
    }
    columns(ctx, toParagraphs(d.body, true), M + 24, by, mainW - 44, midBottom - by - 14, 2, { maxPx: 22, minPx: 15, rule: true });
  }
  if (d.ads[0]) adBox(ctx, d.ads[0], adLogos[0] ?? null, sideX, midTop + 22, sideW, midBottom - midTop - 22, 1);
  // Puffarna längst ner
  if (hasTeasers) {
    rule(ctx, M, 1166, W, 1.5);
    const list = d.teasers.filter((t) => t.title).slice(0, 3);
    const n = list.length + (list.length < 3 && d.ads[1] ? 1 : 0);
    const tw = (W - 24 * (n - 1)) / n;
    list.forEach((t, i) => {
      teaser(ctx, t, M + i * (tw + 24), 1180, tw, 140);
      if (i > 0) { ctx.fillStyle = "#c9c1b0"; ctx.fillRect(M + i * (tw + 24) - 12, 1180, 1, 140); }
    });
    if (n > list.length && d.ads[1]) adBox(ctx, d.ads[1], adLogos[1] ?? null, M + list.length * (tw + 24), 1196, tw, 124, 0);
    rule(ctx, M, IG_H - 18, W, 1.5);
  }
  return c;
}

// ─── Artikeln ────────────────────────────────────────────────────────────────
export async function renderPressArticle(d: PressPageData): Promise<HTMLCanvasElement> {
  const adLogos = await Promise.all(d.ads.map((a) => tryLoad(a.logo)));
  const [c, ctx] = canvas(frameHeight(d.format));
  // Bakom sidan: vald bild, mörkad
  const H = c.height;
  if (d.backdrop) cover(ctx, d.backdrop, 0, 0, IG_W, H); else { ctx.fillStyle = "#1b2420"; ctx.fillRect(0, 0, IG_W, H); }
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, IG_W, H);
  contentArea(ctx);
  // Tidningssidan
  const sx = 96, sy = 120, sw = IG_W - 2 * sx, sh = d.latest ? 1030 : 1150;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = PAPER;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
  paper(ctx, PAPER, 0.035);
  ctx.restore();
  const P = 34, x0 = sx + P, w0 = sw - 2 * P;
  let y = sy + 26;
  ctx.fillStyle = accent();
  ctx.font = `700 28px ${HEAD}`;
  ctx.letterSpacing = "2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(fit(ctx, (d.kicker || "Lokalsport").toUpperCase(), w0 * 0.6), x0, y);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = INK;
  ctx.font = `600 16px ${SERIF_BODY}`;
  ctx.textAlign = "right";
  ctx.fillText(fit(ctx, `${PRESS_NAME.toUpperCase()} · ${dateText(d).toUpperCase()}`, w0 * 0.45), x0 + w0, y + 8);
  y += 40;
  ctx.fillStyle = accent();
  ctx.fillRect(x0, y, w0, 3);
  y += 18;
  // Rubrik och citatrubrik
  const head = fitHeadline(ctx, d.headline || "Rubrik", w0, 200, (px) => `900 ${px}px ${SERIF_HEAD}`, 1.02, 82, 44);
  ctx.fillStyle = INK;
  ctx.font = `900 ${head.px}px ${SERIF_HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  head.lines.forEach((l, i) => ctx.fillText(l, x0, y + i * head.px * 1.02));
  y += head.lines.length * head.px * 1.02 + 4;
  if (d.quoteHead) y += fitText(ctx, `“${d.quoteHead}”`, x0, y, w0, 110, (px) => `700 ${px}px ${SERIF_HEAD}`, 48, 28, 1.1) + 14;
  // Vänster: ingress + brödtext. Höger: bild + citat.
  const bottom = sy + sh - (d.ads[0] || d.next ? 220 : 30);
  const lw = Math.round(w0 * 0.47), rx = x0 + lw + 26, rw = w0 - lw - 26;
  let ly = y;
  if (d.ingress) { ctx.fillStyle = INK; ly += fitText(ctx, d.ingress, x0, ly, lw, 190, (px) => `600 ${px}px ${SERIF_BODY}`, 28, 18, 1.25) + 18; }
  if (d.byline) {
    ctx.fillStyle = MUTED;
    ctx.font = `italic 600 17px ${SERIF_BODY}`;
    ctx.fillText(fit(ctx, d.byline, lw), x0, ly);
    ly += 28;
  }
  columns(ctx, toParagraphs(d.body), x0, ly, lw, bottom - ly, 1, { maxPx: 21, minPx: 15 });
  let ry = y;
  if (d.photo) {
    const ph = d.pullQuote ? Math.min(320, (bottom - y) * 0.46) : bottom - y;
    cover(ctx, d.photo, rx, ry, rw, ph);
    ry += ph;
    if (d.caption) {
      ctx.fillStyle = MUTED;
      ctx.font = `italic 400 15px ${SERIF_BODY}`;
      ctx.textBaseline = "top";
      ctx.fillText(fit(ctx, d.caption, rw), rx, ry + 6);
      ry += 26;
    }
    ry += 14;
  }
  if (d.pullQuote && bottom - ry > 120) quoteBox(ctx, d.pullQuote, d.pullQuoteBy, rx, ry, rw, bottom - ry);
  // Nederst på sidan: annons och nästa match
  if (d.ads[0] || d.next) {
    const by = sy + sh - 200;
    ctx.fillStyle = INK;
    ctx.fillRect(x0, by - 16, w0, 1);
    const aw = d.next ? Math.round(w0 * 0.58) : w0;
    if (d.ads[0]) adBox(ctx, d.ads[0], adLogos[0] ?? null, x0, by + 10, aw, 156, 1);
    if (d.next) nextBox(ctx, d.next, x0 + (d.ads[0] ? aw + 20 : 0), by + 10, d.ads[0] ? w0 - aw - 20 : w0, 156);
  }
  // Under sidan: senaste matchen som en resultattavla
  if (d.latest) {
    const m = d.latest;
    const bx = 150, bw = IG_W - 300, byy = sy + sh + 34, bh = 130;
    ctx.fillStyle = "rgba(10,18,14,0.88)";
    ctx.fillRect(bx, byy, bw, bh);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(bx, byy, bw, bh);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `600 16px ${HEAD}`;
    ctx.letterSpacing = "3px";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("SENASTE MATCHEN", IG_W / 2, byy + 12);
    ctx.letterSpacing = "0px";
    jersey(ctx, bx + 60, byy + 74, 50, m.homeColor);
    jersey(ctx, bx + bw - 60, byy + 74, 50, m.awayColor);
    ctx.fillStyle = "#fff";
    ctx.font = `700 22px ${HEAD}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, m.home.toUpperCase(), 180), bx + 104, byy + 74);
    ctx.textAlign = "right";
    ctx.fillText(fit(ctx, m.away.toUpperCase(), 180), bx + bw - 104, byy + 74);
    ctx.textAlign = "center";
    ctx.font = `700 62px ${HEAD}`;
    ctx.fillText(`${m.homeScore} – ${m.awayScore}`, IG_W / 2, byy + 72);
    ctx.font = `600 14px ${HEAD}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("SLUT", IG_W / 2, byy + 114);
  }
  return c;
}

// ─── Intervjun ───────────────────────────────────────────────────────────────
export async function renderInterview(d: PressPageData): Promise<HTMLCanvasElement> {
  const [logo, ...adLogos] = await Promise.all([tryLoad(club().logo), ...d.ads.map((a) => tryLoad(a.logo))]);
  const [c, ctx] = canvas(frameHeight(d.format));
  paper(ctx, PAPER, 0.04);
  contentArea(ctx);
  const M = 36, W = IG_W - 2 * M;
  // Kompakt tidningshuvud
  const mh = masthead(ctx, d, logo, 24, 92);
  ctx.fillStyle = INK;
  ctx.font = `700 15px ${HEAD}`;
  ctx.letterSpacing = "1px";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(fit(ctx, dateText(d).toUpperCase(), 300), IG_W - M, 30);
  ctx.fillText(`NR ${d.issue.nr}  |  ÅRGÅNG ${d.issue.year}`, IG_W - M, 52);
  ctx.letterSpacing = "0px";
  const top = 24 + mh + 12;
  rule(ctx, M, top, W, 2);
  // Överst: etikett, rubrik, citatrubrik och ingress till vänster, porträtt till höger
  const photoW = d.photo ? 420 : 0;
  const tw = W - photoW - (photoW ? 24 : 0);
  let y = top + 20;
  y += kickerBox(ctx, d.kicker || "Intervju", M, y, 40) + 16;
  const head = fitHeadline(ctx, (d.headline || "Namn").toUpperCase(), tw, 230, (px) => `700 ${px}px ${HEAD}`, 1.0, 96, 44);
  ctx.fillStyle = INK;
  ctx.font = `700 ${head.px}px ${HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  head.lines.forEach((l, i) => ctx.fillText(l, M, y + i * head.px));
  y += head.lines.length * head.px + 8;
  const blockBottom = top + 560;
  if (d.quoteHead) y += fitText(ctx, `”${d.quoteHead}”`, M, y, tw, Math.min(150, blockBottom - y - 90), (px) => `700 ${px}px ${SERIF_HEAD}`, 58, 30, 1.08) + 12;
  if (d.ingress) { ctx.fillStyle = INK; fitText(ctx, d.ingress, M, y, tw, blockBottom - y, (px) => `400 ${px}px ${SERIF_BODY}`, 26, 17, 1.25); }
  if (d.photo) {
    cover(ctx, d.photo, M + tw + 24, top + 20, photoW, blockBottom - top - 20);
    if (d.caption) {
      ctx.fillStyle = "#fff";
      ctx.font = `600 13px ${BODY}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
      ctx.fillText(fit(ctx, d.caption.toUpperCase(), photoW - 24), IG_W - M - 12, blockBottom - 12);
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }
  }
  // Frågor och svar + sidospalt (citat, annons)
  const qTop = blockBottom + 20;
  const bottomBar = d.latest || d.next ? 150 : 0;
  const qBottom = IG_H - 30 - bottomBar - (bottomBar ? 16 : 0);
  const sideW = 238, mainW = W - sideW - 20, sideX = M + mainW + 20;
  ctx.fillStyle = LIGHT;
  ctx.fillRect(M, qTop, mainW, qBottom - qTop);
  ctx.fillStyle = accent();
  ctx.fillRect(M, qTop, 6, qBottom - qTop);
  let by = qTop + 14;
  if (d.boxTitle) { ctx.fillStyle = accent(); by += fitText(ctx, d.boxTitle.toUpperCase(), M + 24, by, mainW - 40, 32, (px) => `700 ${px}px ${HEAD}`, 28, 18) + 8; }
  columns(ctx, toParagraphs(d.body, true), M + 24, by, mainW - 44, qBottom - by - 14, 2, { maxPx: 22, minPx: 14, rule: true });
  let sy = qTop;
  const adH = d.ads[0] ? 200 : 0;
  if (d.pullQuote) { quoteBox(ctx, d.pullQuote, d.pullQuoteBy, sideX, sy, sideW, qBottom - sy - (adH ? adH + 34 : 0)); }
  if (d.ads[0]) adBox(ctx, d.ads[0], adLogos[0] ?? null, sideX, d.pullQuote ? qBottom - adH : sy + 22, sideW, d.pullQuote ? adH : qBottom - sy - 22, 1);
  // Längst ner: senaste matchen och nästa match
  if (bottomBar) {
    const yb = IG_H - 30 - bottomBar;
    const half = d.latest && d.next ? (W - 20) / 2 : W;
    if (d.latest) {
      const m = d.latest;
      frame(ctx, M, yb, half, bottomBar);
      boxHeader(ctx, "Senaste matchen", M, yb, half, 34);
      jersey(ctx, M + 46, yb + 88, 48, m.homeColor);
      jersey(ctx, M + half - 46, yb + 88, 48, m.awayColor);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 52px ${HEAD}`;
      ctx.fillText(`${m.homeScore}–${m.awayScore}`, M + half / 2, yb + 86);
      ctx.font = `600 17px ${BODY}`;
      ctx.fillText(fit(ctx, `${m.home} – ${m.away}`, half - 160), M + half / 2, yb + 128);
    }
    if (d.next) nextBox(ctx, d.next, d.latest ? M + half + 20 : M, yb, half, bottomBar);
  }
  return c;
}

export function renderPressPage(d: PressPageData): Promise<HTMLCanvasElement> {
  return d.kind === "front" ? renderFront(d) : d.kind === "article" ? renderPressArticle(d) : renderInterview(d);
}
