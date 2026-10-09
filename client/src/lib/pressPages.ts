/**
 * Stålbladet – tidningssidor i Media: förstasidan, artikeln och intervjun.
 *
 * Alla sidor har samma uppbyggnad: tidningshuvudet (blått band), etikett,
 * rubrik, citatrubrik och ingress över hela bredden – sedan texten i spalter
 * till vänster och en sidospalt till höger (porträtt, citat, puffar, senaste
 * matchen, nästa match, resultat, SHL och annonser).
 *
 * Texten går först: den får hela höjden och sidospalten fylls med det som får
 * plats. Ryms texten inte fortsätter den på sida 2 (karusell på Instagram), där
 * även det som inte fick plats i sidospalten hamnar.
 *
 * Egna radbrytningar följs (rubrik, ingress och text): Enter = ny rad,
 * tom rad = nytt stycke. Intervju: en rad som slutar med ? blir en fråga i fetstil.
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, fit, canvas, contentArea, frameHeight } from "@/lib/matchReportImages";
import { SERIF_HEAD, SERIF_BODY, PRESS, wrap, clip, paper, cover, fitHeadline, masthead, kickerTag, pressAd, type PressCommon } from "@/lib/pressImages";

export type PressPageKind = "front" | "article" | "interview";

export interface PressAd { name: string; logo: string | null; slogan?: string | null }
export interface PressTeaser { kicker: string; title: string; sub: string; page: string; image: HTMLImageElement | null }
export interface PressLatest { home: string; away: string; homeScore: number; awayScore: number; homeColor: string; awayColor: string; lines: string[] }
export interface ShlTableRow { pos: number; team: string; gp: number; pts: number; diff?: number }
export interface ShlGameRow { home: string; away: string; score: string | null; time: string }

export interface PressPageData extends PressCommon {
  kind: PressPageKind;
  kicker: string;
  headline: string;
  /** Citatrubrik under rubriken, t.ex. "Vi bygger något speciellt här" */
  quoteHead: string;
  ingress: string;
  /** Brödtext. Intervju: rader som slutar med ? blir frågor (fetstil). */
  body: string;
  /** Rubrik över texten (förstasidan), t.ex. "Om säsongen, laget och framåt" */
  boxTitle: string;
  caption: string;
  byline: string;
  pullQuote: string;
  pullQuoteBy: string;
  photo: HTMLImageElement | null;
  /** Används inte längre (artikeln låg tidigare på en bakgrund) */
  backdrop?: HTMLImageElement | null;
  teasers: PressTeaser[];
  latest: PressLatest | null;
  next: { when: string; what: string } | null;
  results: Array<{ home: string; away: string; score: string }>;
  /** SHL-tabellen och SHL-matcher (från Inställningar → Externa källor) */
  shlTable?: { rows: ShlTableRow[]; source: string; updated: string } | null;
  shlGames?: { title: string; rows: ShlGameRow[]; source: string; updated: string } | null;
  ads: PressAd[];
  issue: { nr: number; year: number };
}

const { ink: INK, muted: MUTED, rule: RULE, box: BOX, blue: BLUE, red: RED } = PRESS;
const M = 36, W = IG_W - 2 * M, SIDE_W = 286, GUTTER = 26;
const MAIN_W = W - SIDE_W - GUTTER, SIDE_X = M + MAIN_W + GUTTER;
const BOTTOM = IG_H - 26;

// ─── Text ────────────────────────────────────────────────────────────────────

export interface Para { text: string; bold: boolean; gap: boolean }

/**
 * Stycken och rader som skrivna: Enter = ny rad, tom rad = nytt stycke (luft).
 * Intervju (qa): en rad som slutar med ? blir en fråga i fetstil med luft före;
 * svaret direkt under frågan (även om det är en tom rad emellan, som i mejl).
 */
export function toParagraphs(text: string, qa = false): Para[] {
  const out: Para[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((l, i) => {
      const q = qa && /\?["”»)]?$/.test(l) && !/^[–—-]/.test(l);
      const prev = out[out.length - 1];
      const afterQuestion = qa && !!prev?.bold && !q;
      const gap = !!prev && !afterQuestion && (i === 0 || (q && !prev.bold));
      out.push({ text: l, bold: q, gap });
    });
  }
  return out;
}

type Line = { t: string; bold: boolean; gap: boolean; p: number };

function layoutLines(ctx: CanvasRenderingContext2D, paras: Para[], colW: number, px: number, fam = SERIF_BODY): Line[] {
  const lines: Line[] = [];
  paras.forEach((p, pi) => {
    ctx.font = `${p.bold ? 700 : 400} ${px}px ${fam}`;
    wrap(ctx, p.text, colW).forEach((t, k) => lines.push({ t, bold: p.bold, gap: k === 0 && p.gap, p: pi }));
  });
  return lines;
}

interface Region { x: number; y: number; w: number; h: number; cols: number }
const COL_GAP = 24;
const colWidth = (r: Region) => (r.w - COL_GAP * (r.cols - 1)) / r.cols;

/** Hur många rader (från start) som ryms i ytan */
function fitCount(lines: Line[], start: number, r: Region, lh: number, reserveLast = 0): number {
  let col = 0, cy = 0, i = start;
  for (; i < lines.length; i++) {
    const add = lines[i].gap && cy > 0 ? lh * 0.55 : 0;
    const limit = col === r.cols - 1 ? r.h - reserveLast : r.h;
    if (cy + add + lh > limit + 0.5) {
      col++; cy = 0;
      if (col >= r.cols) break;
      i--; continue;
    }
    cy += add + lh;
  }
  return i - start;
}

/** Lägsta höjd där raderna ryms i spalterna (högst max) */
function balancedHeight(lines: Line[], cols: number, lh: number, max: number): number {
  const r: Region = { x: 0, y: 0, w: 100, h: max, cols };
  if (fitCount(lines, 0, r, lh) < lines.length) return max;
  let lo = 0, hi = max;
  while (hi - lo > 2) { const mid = (lo + hi) / 2; if (fitCount(lines, 0, { ...r, h: mid }, lh) >= lines.length) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}

/** Rita rader i spalter; returnerar index för första raden som inte fick plats */
function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], start: number, region: Region, px: number, lh: number, opts: { more?: string } = {}): number {
  let r = region;
  // Ryms allt: jämna ut spalterna (som i tidningen) i stället för en full och en tom
  if (!opts.more && r.cols > 1 && fitCount(lines, start, r, lh) >= lines.length - start) {
    let lo = lh, hi = r.h;
    while (hi - lo > 2) { const mid = (lo + hi) / 2; if (fitCount(lines, start, { ...r, h: mid }, lh) >= lines.length - start) hi = mid; else lo = mid; }
    r = { ...r, h: Math.ceil(hi) };
  }
  const n = fitCount(lines, start, r, lh, opts.more ? lh : 0);
  const end = start + n;
  const colW = colWidth(r);
  let col = 0, cy = 0;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = start; i < end; i++) {
    const l = lines[i];
    const add = l.gap && cy > 0 ? lh * 0.55 : 0;
    const limit = col === r.cols - 1 && opts.more ? r.h - lh : r.h;
    if (cy + add + lh > limit + 0.5) { col++; cy = 0; }
    else cy += add;
    ctx.font = `${l.bold ? 700 : 400} ${px}px ${SERIF_BODY}`;
    ctx.fillText(l.t, r.x + col * (colW + COL_GAP), r.y + cy);
    cy += lh;
  }
  if (r.cols > 1) {
    ctx.fillStyle = RULE;
    for (let c = 1; c < r.cols; c++) ctx.fillRect(r.x + c * (colW + COL_GAP) - COL_GAP / 2, r.y, 1, r.h);
  }
  if (opts.more && end < lines.length) {
    ctx.fillStyle = RED;
    ctx.font = `700 ${Math.round(px * 0.85)}px ${HEAD}`;
    ctx.letterSpacing = "1px";
    ctx.textAlign = "right";
    ctx.fillText(opts.more, r.x + r.w, r.y + r.h - lh * 0.9);
    ctx.letterSpacing = "0px";
  }
  return end;
}

/** Text som ska fylla en ruta: största storleken där den ryms. Returnerar använd höjd. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, font: (px: number) => string, maxPx: number, minPx: number, lh = 1.15, align: CanvasTextAlign = "left", draw = true) {
  if (!text) return 0;
  let px = maxPx, lines: string[] = [];
  for (; px >= minPx; px -= 1) {
    ctx.font = font(px);
    lines = wrap(ctx, text, w);
    if (lines.length * px * lh <= h) break;
  }
  px = Math.max(px, minPx);
  ctx.font = font(px);
  lines = clip(ctx, lines, Math.max(1, Math.floor(h / (px * lh))), w);
  if (draw) {
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    const ax = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
    lines.forEach((l, i) => ctx.fillText(l, ax, y + i * px * lh));
  }
  return lines.length * px * lh;
}

// ─── Rutor i sidospalten ─────────────────────────────────────────────────────

interface SideBox { id: string; h: number; flex?: boolean; minH?: number; draw: (y: number, h: number) => void }

function boxHeader(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, w: number, h = 36) {
  ctx.fillStyle = BLUE;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(h * 0.56)}px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, title.toUpperCase(), w - 24), x + 12, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return h;
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = BOX) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function source(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  ctx.fillStyle = MUTED;
  ctx.font = `500 12px ${BODY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fit(ctx, text, w), x, y);
}

/** Tröja i lagets färg */
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
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function latestBox(ctx: CanvasRenderingContext2D, m: PressLatest): SideBox {
  const lineH = 22;
  ctx.font = `400 17px ${SERIF_BODY}`;
  const lines = m.lines.flatMap((l) => wrap(ctx, l, SIDE_W - 24)).slice(0, 4);
  const h = 36 + 150 + (lines.length ? lines.length * lineH + 14 : 0);
  return {
    id: "latest", h,
    draw: (y) => {
      const x = SIDE_X, w = SIDE_W;
      frame(ctx, x, y, w, h);
      boxHeader(ctx, "Senaste matchen", x, y, w);
      const cy = y + 36 + 62;
      jersey(ctx, x + 40, cy - 4, 54, m.homeColor);
      jersey(ctx, x + w - 40, cy - 4, 54, m.awayColor);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 56px ${HEAD}`;
      ctx.fillText(`${m.homeScore}–${m.awayScore}`, x + w / 2, cy);
      ctx.font = `600 17px ${BODY}`;
      ctx.fillText(fit(ctx, m.home, w / 2 - 14), x + w / 4 + 2, cy + 52);
      ctx.fillText(fit(ctx, m.away, w / 2 - 14), x + (w * 3) / 4 - 2, cy + 52);
      let ly = y + 36 + 150;
      ctx.fillStyle = RULE;
      if (lines.length) ctx.fillRect(x + 12, ly - 6, w - 24, 1);
      ctx.fillStyle = INK;
      ctx.font = `400 17px ${SERIF_BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (const t of lines) { ctx.fillText(t, x + 12, ly + 2); ly += lineH; }
    },
  };
}

function nextBox(ctx: CanvasRenderingContext2D, n: { when: string; what: string }): SideBox {
  const h = 128;
  return {
    id: "next", h,
    draw: (y) => {
      const x = SIDE_X, w = SIDE_W;
      frame(ctx, x, y, w, h);
      ctx.fillStyle = RED;
      ctx.fillRect(x, y, 6, h);
      ctx.fillStyle = RED;
      ctx.font = `700 19px ${HEAD}`;
      ctx.letterSpacing = "1.5px";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("NÄSTA MATCH", x + 20, y + 12);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = INK;
      fitText(ctx, n.when.toUpperCase(), x + 20, y + 40, w - 34, 34, (px) => `700 ${px}px ${HEAD}`, 28, 16);
      ctx.fillStyle = MUTED;
      fitText(ctx, n.what, x + 20, y + 78, w - 34, h - 86, (px) => `400 ${px}px ${SERIF_BODY}`, 19, 14);
    },
  };
}

function listBox(ctx: CanvasRenderingContext2D, id: string, title: string, rows: Array<{ left: string; right: string; strong?: boolean }>, foot: string, rowH = 28): SideBox {
  const h = 36 + 8 + rows.length * rowH + (foot ? 26 : 8);
  return {
    id, h,
    draw: (y) => {
      const x = SIDE_X, w = SIDE_W;
      frame(ctx, x, y, w, h);
      boxHeader(ctx, title, x, y, w);
      let ry = y + 36 + 8;
      for (const r of rows) {
        if (r.strong) { ctx.fillStyle = "#d9e5f3"; ctx.fillRect(x, ry - 2, w, rowH); }
        ctx.fillStyle = INK;
        ctx.textBaseline = "top";
        ctx.font = `${r.strong ? 700 : 400} ${rowH > 26 ? 18 : 16}px ${SERIF_BODY}`;
        ctx.textAlign = "left";
        ctx.fillText(fit(ctx, r.left, w - 96), x + 12, ry + 3);
        ctx.font = `700 ${rowH > 26 ? 18 : 16}px ${HEAD}`;
        ctx.textAlign = "right";
        ctx.fillText(r.right, x + w - 12, ry + 2);
        ry += rowH;
        ctx.fillStyle = RULE;
        ctx.fillRect(x + 12, ry - 2, w - 24, 1);
      }
      if (foot) source(ctx, foot, x + 12, y + h - 9, w - 24);
    },
  };
}

function shlTableBox(ctx: CanvasRenderingContext2D, t: NonNullable<PressPageData["shlTable"]>): SideBox {
  const rowH = 23;
  const h = 36 + 28 + t.rows.length * rowH + 26;
  return {
    id: "shlTable", h,
    draw: (y) => {
      const x = SIDE_X, w = SIDE_W;
      frame(ctx, x, y, w, h);
      boxHeader(ctx, "SHL-tabellen", x, y, w);
      const cG = x + w - 64, cP = x + w - 12;
      ctx.fillStyle = MUTED;
      ctx.font = `600 13px ${BODY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      ctx.fillText("M", cG, y + 44);
      ctx.fillText("P", cP, y + 44);
      let ry = y + 36 + 28;
      for (const r of t.rows) {
        const local = /lule/i.test(r.team);
        if (local) { ctx.fillStyle = "#d9e5f3"; ctx.fillRect(x, ry - 2, w, rowH); }
        ctx.fillStyle = INK;
        ctx.font = `${local ? 700 : 400} 16px ${SERIF_BODY}`;
        ctx.textAlign = "right";
        ctx.fillText(`${r.pos}.`, x + 34, ry + 1);
        ctx.textAlign = "left";
        ctx.fillText(fit(ctx, r.team, cG - x - 80), x + 42, ry + 1);
        ctx.font = `${local ? 700 : 500} 16px ${HEAD}`;
        ctx.textAlign = "right";
        ctx.fillText(String(r.gp), cG, ry + 1);
        ctx.font = `700 16px ${HEAD}`;
        ctx.fillText(String(r.pts), cP, ry + 1);
        ry += rowH;
        // Streck efter plats 6 och 10 (slutspel, play in) och före kvalet
        const n = t.rows.length;
        if (r.pos === 6 || r.pos === 10 || r.pos === n - 2) { ctx.fillStyle = r.pos === n - 2 ? RED : BLUE; ctx.fillRect(x + 8, ry - 2, w - 16, 1.5); }
      }
      source(ctx, `Källa: ${t.source} · ${t.updated}`, x + 12, y + h - 9, w - 24);
    },
  };
}

function quoteBox(ctx: CanvasRenderingContext2D, quote: string, by: string): SideBox {
  const textW = SIDE_W - 36;
  const qh = fitText(ctx, `”${quote}”`, 0, 0, textW, 260, (px) => `italic 700 ${px}px ${SERIF_BODY}`, 32, 19, 1.2, "left", false);
  const h = 64 + qh + (by ? 58 : 16);
  return {
    id: "quote", h,
    draw: (y) => {
      const x = SIDE_X, w = SIDE_W;
      ctx.fillStyle = BLUE;
      ctx.fillRect(x, y, w, 4);
      ctx.font = `900 92px ${SERIF_HEAD}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("”", x + 4, y + 2);
      ctx.fillStyle = INK;
      fitText(ctx, `”${quote}”`, x + 4, y + 64, textW, 260, (px) => `italic 700 ${px}px ${SERIF_BODY}`, 32, 19, 1.2);
      if (by) {
        const [name, ...role] = by.split(/,\s*/);
        const ty = y + 64 + qh + 12;
        ctx.fillStyle = BLUE;
        ctx.font = `700 17px ${HEAD}`;
        ctx.letterSpacing = "1px";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(fit(ctx, name.toUpperCase(), w - 8), x + 4, ty);
        ctx.letterSpacing = "0px";
        if (role.length) {
          ctx.fillStyle = MUTED;
          ctx.font = `500 15px ${BODY}`;
          ctx.fillText(fit(ctx, role.join(", "), w - 8), x + 4, ty + 22);
        }
      }
      ctx.fillStyle = BLUE;
      ctx.fillRect(x, y + h - 4, w, 4);
    },
  };
}

function teaserBox(ctx: CanvasRenderingContext2D, t: PressTeaser, i: number): SideBox {
  const w = SIDE_W;
  const imgH = t.image ? 150 : 0;
  ctx.font = `700 24px ${SERIF_HEAD}`;
  const titleLines = clip(ctx, wrap(ctx, t.title, w), 3, w);
  ctx.font = `400 16px ${SERIF_BODY}`;
  const subLines = t.sub ? clip(ctx, wrap(ctx, t.sub, w), 2, w) : [];
  const h = imgH + (imgH ? 10 : 0) + (t.kicker ? 22 : 0) + titleLines.length * 28 + subLines.length * 20 + (t.page ? 24 : 4) + 4;
  return {
    id: `teaser${i}`, h,
    draw: (y) => {
      const x = SIDE_X;
      let ty = y;
      if (t.image) { cover(ctx, t.image, x, ty, w, imgH); ty += imgH + 10; }
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      if (t.kicker) {
        ctx.fillStyle = RED;
        ctx.font = `700 16px ${HEAD}`;
        ctx.letterSpacing = "1px";
        ctx.fillText(fit(ctx, t.kicker.toUpperCase(), w), x, ty);
        ctx.letterSpacing = "0px";
        ty += 22;
      }
      ctx.fillStyle = INK;
      ctx.font = `700 24px ${SERIF_HEAD}`;
      titleLines.forEach((l) => { ctx.fillText(l, x, ty); ty += 28; });
      ctx.fillStyle = MUTED;
      ctx.font = `400 16px ${SERIF_BODY}`;
      subLines.forEach((l) => { ctx.fillText(l, x, ty + 1); ty += 20; });
      if (t.page) {
        ctx.fillStyle = BLUE;
        ctx.font = `700 14px ${HEAD}`;
        ctx.letterSpacing = "1px";
        ctx.fillText(`${t.page.toUpperCase()} ›`, x, ty + 5);
        ctx.letterSpacing = "0px";
      }
      ctx.fillStyle = RULE;
      ctx.fillRect(x, y + h - 1, w, 1);
    },
  };
}

function portraitBox(ctx: CanvasRenderingContext2D, img: HTMLImageElement, caption: string): SideBox {
  const h = 360 + (caption ? 24 : 0);
  return {
    id: "portrait", h,
    draw: (y) => {
      cover(ctx, img, SIDE_X, y, SIDE_W, 360);
      if (caption) {
        ctx.fillStyle = MUTED;
        ctx.font = `500 13px ${BODY}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(fit(ctx, caption, SIDE_W), SIDE_X, y + 366);
      }
    },
  };
}

function adBox(ctx: CanvasRenderingContext2D, ad: PressAd, logo: HTMLImageElement | null, i: number): SideBox {
  return { id: `ad${i}`, h: 230, flex: true, minH: 150, draw: (y, h) => pressAd(ctx, ad, logo, SIDE_X, y, SIDE_W, Math.min(h, 380)) };
}

/** Lägg rutorna uppifrån; det som inte ryms returneras (till sida 2) */
function placeSide(boxes: SideBox[], top: number, bottom: number): { placed: Array<{ b: SideBox; y: number; h: number }>; rest: SideBox[] } {
  const placed: Array<{ b: SideBox; y: number; h: number }> = [];
  const rest: SideBox[] = [];
  let y = top;
  const GAP = 20;
  // Första annonsen syns alltid: plats reserveras innan övriga rutor läggs
  const firstAd = boxes.find((b) => b.flex);
  const reserve = firstAd ? (firstAd.minH ?? firstAd.h) + GAP : 0;
  for (const b of boxes) {
    const need = b.flex ? b.minH ?? b.h : b.h;
    const limit = b === firstAd ? bottom : bottom - (placed.some((p) => p.b === firstAd) ? 0 : reserve);
    if (y + need <= limit) { placed.push({ b, y, h: b.flex ? need : b.h }); y += (b.flex ? need : b.h) + GAP; }
    else rest.push(b);
  }
  // Flexibla rutor (annonser) fyller ut ytan som blir över
  const spare = bottom - (y - GAP);
  const flex = placed.filter((p) => p.b.flex);
  if (flex.length && spare > 0) {
    let shift = 0;
    for (const p of placed) {
      p.y += shift;
      if (p.b.flex) { const add = Math.min(spare / flex.length, 360 - p.h); p.h += Math.max(0, add); shift += Math.max(0, add); }
    }
  }
  // Rutor som inte behövde flytta: centrera inte, men låt sista flex-rutan nå botten
  for (const p of placed) if (p.b.flex && p.h < (p.b.minH ?? 0)) p.h = p.b.minH ?? p.h;
  return { placed, rest };
}

// ─── Sidorna ─────────────────────────────────────────────────────────────────

interface Ctx2 { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }

function newPage(d: PressPageData): Ctx2 {
  const [c, ctx] = canvas(frameHeight(d.format));
  paper(ctx, PRESS.paper, 0.025);
  contentArea(ctx);
  return { c, ctx };
}

/** Rubrikblocket över hela bredden. Returnerar y efter blocket. */
function headBlock(ctx: CanvasRenderingContext2D, d: PressPageData, y: number, maxHeadPx: number, maxHeadH: number): number {
  const kick = kickerTag(ctx, d.kicker || (d.kind === "interview" ? "Intervju" : ""), M, y, 24);
  if (kick.h) y += kick.h + 12;
  const head = fitHeadline(ctx, d.headline || "Rubrik", W, maxHeadH, (px) => `900 ${px}px ${SERIF_HEAD}`, 1.04, maxHeadPx, 40);
  ctx.fillStyle = INK;
  ctx.font = `900 ${head.px}px ${SERIF_HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  head.lines.forEach((l, i) => ctx.fillText(l, M - 2, y + i * head.px * 1.04));
  y += head.lines.length * head.px * 1.04 + 6;
  if (d.quoteHead) {
    ctx.fillStyle = BLUE;
    y += fitText(ctx, `”${d.quoteHead.replace(/^["”“]|["”“]$/g, "")}”`, M, y, W, 120, (px) => `italic 700 ${px}px ${SERIF_BODY}`, 50, 26, 1.12) + 8;
  }
  if (d.ingress) {
    ctx.fillStyle = INK;
    y += fitText(ctx, d.ingress, M, y + 4, W, 150, (px) => `600 ${px}px ${SERIF_BODY}`, 27, 19, 1.3) + 10;
  }
  if (d.byline) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 15px ${BODY}`;
    ctx.letterSpacing = "1px";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, d.byline.toUpperCase(), W), M, y);
    ctx.letterSpacing = "0px";
    y += 24;
  }
  ctx.fillStyle = INK;
  ctx.fillRect(M, y + 2, W, 1.5);
  return y + 18;
}

/** Sida 2: kort huvud med rubriken (forts.) */
function contHead(ctx: CanvasRenderingContext2D, d: PressPageData, y: number): number {
  const kick = kickerTag(ctx, d.kicker || (d.kind === "interview" ? "Intervju" : "Forts."), M, y, 20);
  ctx.fillStyle = INK;
  const x = M + (kick.w ? kick.w + 14 : 0);
  ctx.font = `700 30px ${SERIF_HEAD}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, `${(d.headline || "").replace(/\s*\n\s*/g, " ")} (forts.)`, W - (x - M)), x, y + (kick.h || 30) / 2 + 1);
  y += Math.max(kick.h, 30) + 14;
  ctx.fillRect(M, y, W, 1.5);
  return y + 16;
}

const BODY_MAX = 24, BODY_MIN = 19, BODY_CONT_MIN = 15;

/** Förstasida, artikel och intervju – en eller två sidor */
export async function renderPressPages(d: PressPageData): Promise<HTMLCanvasElement[]> {
  const adLogos = await Promise.all(d.ads.map((a) => tryLoad(a.logo)));
  const p1 = newPage(d);
  const ctx = p1.ctx;
  let y = masthead(ctx, d.dateLine, d.issue) + 18;
  y = headBlock(ctx, d, y, d.kind === "front" ? 112 : 92, d.kind === "front" ? 300 : 230);

  // Huvudspalten: bild (förstasida/artikel) och text
  const bannerAd = d.kind === "front" && d.ads[1] ? d.ads[1] : null;
  const bottom = bannerAd ? BOTTOM - 150 : BOTTOM;
  const sideAds = d.ads.map((a, i) => ({ a, i })).filter(({ i }) => !(bannerAd && i === 1));
  let my = y;
  const mainPhoto = d.photo && d.kind !== "interview";
  const paras = toParagraphs(d.body, d.kind === "interview" || d.kind === "front");
  const colW = colWidth({ x: M, y: 0, w: MAIN_W, h: 0, cols: 2 });
  if (mainPhoto) {
    // Bilden får det texten inte behöver (kort text = större bild)
    const avail = bottom - y - (d.caption ? 26 : 6) - 10 - (d.boxTitle ? 42 : 0);
    const lhMax = Math.round(BODY_MAX * 1.34);
    const need = paras.length ? balancedHeight(layoutLines(ctx, paras, colW, BODY_MAX), 2, lhMax, avail) : 0;
    const ph = Math.round(Math.max(240, Math.min(avail * 0.62, avail - need)));
    cover(ctx, d.photo!, M, my, MAIN_W, ph);
    my += ph + 6;
    if (d.caption) {
      ctx.fillStyle = MUTED;
      ctx.font = `500 14px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fit(ctx, d.caption, MAIN_W), M, my);
      my += 20;
    }
    my += 10;
  }
  if (d.boxTitle) {
    ctx.fillStyle = BLUE;
    my += fitText(ctx, d.boxTitle.toUpperCase(), M, my, MAIN_W, 34, (px) => `700 ${px}px ${HEAD}`, 28, 18) + 8;
  }
  const region1: Region = { x: M, y: my, w: MAIN_W, h: bottom - my, cols: 2 };
  // Största storlek där allt ryms på sidan 1, annars fortsättning på sida 2
  let px = BODY_MAX, lines: Line[] = [], cont = false;
  for (; px >= BODY_MIN; px--) {
    lines = layoutLines(ctx, paras, colW, px);
    if (fitCount(lines, 0, region1, Math.round(px * 1.34)) >= lines.length) break;
  }
  if (px < BODY_MIN) { px = 20; lines = layoutLines(ctx, paras, colW, px); cont = true; }
  const lh = Math.round(px * 1.34);
  const end1 = drawLines(ctx, lines, 0, region1, px, lh, cont ? { more: "FORTS. NÄSTA SIDA ›" } : {});

  // Sidospalten
  const side1 = placeSide(sideBoxes(ctx, d, sideAds, adLogos), y, bottom);
  side1.placed.forEach((p) => p.b.draw(p.y, p.h));
  if (bannerAd) pressAd(ctx, bannerAd, adLogos[1] ?? null, M, BOTTOM - 130, W, 130);

  const pages = [p1.c];
  if (end1 < lines.length) {
    // Sida 2: resten av texten och det som inte fick plats i sidospalten
    const p2 = newPage(d);
    const c2 = p2.ctx;
    let y2 = masthead(c2, d.dateLine, d.issue, 96) + 16;
    y2 = contHead(c2, d, y2);
    const restIds = new Set(side1.rest.map((b) => b.id).filter((id) => !id.startsWith("teaser") && id !== "portrait"));
    const rest = sideBoxes(c2, d, sideAds, adLogos).filter((b) => restIds.has(b.id));
    const wide = rest.length === 0;
    const r2: Region = wide ? { x: M, y: y2, w: W, h: BOTTOM - y2, cols: 3 } : { x: M, y: y2, w: MAIN_W, h: BOTTOM - y2, cols: 2 };
    const restParas = linesToParas(lines.slice(end1));
    let px2 = px, lines2: Line[] = [];
    for (; px2 >= BODY_CONT_MIN; px2--) {
      lines2 = layoutLines(c2, restParas, colWidth(r2), px2);
      if (fitCount(lines2, 0, r2, Math.round(px2 * 1.34)) >= lines2.length) break;
    }
    px2 = Math.max(px2, BODY_CONT_MIN);
    lines2 = layoutLines(c2, restParas, colWidth(r2), px2);
    const end2 = drawLines(c2, lines2, 0, r2, px2, Math.round(px2 * 1.34));
    if (end2 < lines2.length) {
      // Ryms inte ens på sida 2: … på sista raden
      c2.fillStyle = RED;
      c2.font = `700 16px ${HEAD}`;
      c2.textAlign = "right";
      c2.textBaseline = "bottom";
      c2.fillText("(texten är för lång)", r2.x + r2.w, BOTTOM + 18);
    }
    if (!wide) {
      // Rutorna ritas med sidospaltens x – samma på sida 2
      const side2 = placeSide(rest, y2, BOTTOM);
      side2.placed.forEach((p) => p.b.draw(p.y, p.h));
    }
    pages.push(p2.c);
  }
  return pages;
}

/** Sidospaltens rutor i turordning (porträtt, citat, puffar, matcher, tabeller, annonser) */
function sideBoxes(ctx: CanvasRenderingContext2D, d: PressPageData, ads: Array<{ a: PressAd; i: number }>, logos: Array<HTMLImageElement | null>): SideBox[] {
  const boxes: SideBox[] = [];
  if (d.kind === "interview" && d.photo) boxes.push(portraitBox(ctx, d.photo, d.caption));
  if (d.pullQuote) boxes.push(quoteBox(ctx, d.pullQuote, d.pullQuoteBy));
  if (d.kind === "front") d.teasers.filter((t) => t.title).slice(0, 3).forEach((t, i) => boxes.push(teaserBox(ctx, t, i)));
  if (d.latest) boxes.push(latestBox(ctx, d.latest));
  if (d.next) boxes.push(nextBox(ctx, d.next));
  if (d.shlTable?.rows.length) boxes.push(shlTableBox(ctx, d.shlTable));
  if (d.shlGames?.rows.length) boxes.push(listBox(ctx, "shlGames", d.shlGames.title, d.shlGames.rows.map((r) => ({ left: `${r.home}–${r.away}`, right: r.score ?? r.time, strong: /lule/i.test(r.home + r.away) })), `Källa: ${d.shlGames.source} · ${d.shlGames.updated}`, 26));
  if (d.results.length) boxes.push(listBox(ctx, "results", "Resultatbörsen", d.results.map((r) => ({ left: `${r.home}–${r.away}`, right: r.score })), ""));
  ads.forEach(({ a, i }) => boxes.push(adBox(ctx, a, logos[i] ?? null, i)));
  return boxes;
}

/** Raderna som blev över tillbaka till stycken (för ny radbrytning på sida 2) */
function linesToParas(lines: Line[]): Para[] {
  const out: Para[] = [];
  let last = -1;
  for (const l of lines) {
    if (l.p === last) out[out.length - 1].text += ` ${l.t}`;
    else out.push({ text: l.t, bold: l.bold, gap: l.gap && out.length > 0 });
    last = l.p;
  }
  return out;
}

/** Första sidan (förhandsvisning och video) */
export async function renderPressPage(d: PressPageData): Promise<HTMLCanvasElement> {
  return (await renderPressPages(d))[0];
}
