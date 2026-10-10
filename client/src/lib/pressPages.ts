/**
 * Stålbladet – tidningssidor i Media: förstasidan, artikeln och intervjun.
 *
 * Uppbyggnad som i en dagstidning: tidningshuvudet, en huvudspalt (rubrik,
 * bild och text) och en sidospalt med rutor – Luleå i SHL, kvällens matcher,
 * SHL-tabellen, citat, porträtt, våra egna matcher och annonser. Förstasidan
 * har rubriken över bilden och puffar längst ner.
 *
 * Texten går först: den får plats i huvudspalten och sidospalten fylls med det
 * som ryms. Blir det plats över under texten läggs fler rutor där. Ryms texten
 * inte fortsätter den på sida 2 (karusell på Instagram) tillsammans med rutorna
 * som inte fick plats.
 *
 * Egna radbrytningar följs: Enter = ny rad, tom rad = nytt stycke. Intervju:
 * en rad som slutar med ? blir en fråga (fetstil), svaret direkt under.
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, fit, canvas, contentArea, frameHeight } from "@/lib/matchReportImages";
import { SERIF_HEAD, SERIF_BODY, PRESS, wrap, clip, paper, cover, fitHeadline, masthead, kickerTag, pressAd, type PressCommon } from "@/lib/pressImages";

export type PressPageKind = "front" | "article" | "interview";

export interface PressAd { name: string; logo: string | null; slogan?: string | null }
export interface PressTeaser { kicker: string; title: string; sub: string; page: string; image: HTMLImageElement | null }
export interface PressLatest { home: string; away: string; homeScore: number; awayScore: number; homeColor: string; awayColor: string; lines: string[] }
export interface ShlTableRow { pos: number; team: string; gp: number; pts: number; diff?: number }
export interface ShlGameRow { home: string; away: string; score: string | null; time: string; live?: boolean }
/** Luleå i SHL: senaste (eller pågående) och nästa match, form och tabellplats */
export interface PressFocus {
  team: string;
  last: { home: string; away: string; homeScore: number; awayScore: number; live: boolean; when: string } | null;
  next: { home: string; away: string; when: string } | null;
  form: Array<"V" | "F">;
  pos: number | null;
  pts: number | null;
  gp: number | null;
  source: string;
  updated: string;
}

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
  /** SHL (Inställningar → Externa källor) */
  focus?: PressFocus | null;
  shlTable?: { rows: ShlTableRow[]; source: string; updated: string } | null;
  shlGames?: { title: string; rows: ShlGameRow[]; source: string; updated: string } | null;
  ads: PressAd[];
  issue: { nr: number; year: number };
  /** Förstasida som första bild: rad efter utdraget, t.ex. "Läs hela intervjun på nästa bild ›" */
  readMore?: string;
}

const { ink: INK, muted: MUTED, rule: RULE, blue: BLUE, red: RED } = PRESS;
const M = 36, W = IG_W - 2 * M, SIDE_W = 286, GUTTER = 24;
const MAIN_W = W - SIDE_W - GUTTER, SIDE_X = M + MAIN_W + GUTTER;
const BOTTOM = IG_H - 24;
const BOX_FILL = "#f7f6f2";
const isFocusName = (n: string) => /lule/i.test(n);

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
/** Frågor i fet sans-serif (som i tidningens intervjuer), annars serif */
const bodyFont = (bold: boolean, px: number) => (bold ? `700 ${Math.round(px * 0.88)}px ${BODY}` : `400 ${px}px ${SERIF_BODY}`);

function layoutLines(ctx: CanvasRenderingContext2D, paras: Para[], colW: number, px: number): Line[] {
  const lines: Line[] = [];
  paras.forEach((p, pi) => {
    ctx.font = bodyFont(p.bold, px);
    wrap(ctx, p.text, colW).forEach((t, k) => lines.push({ t, bold: p.bold, gap: k === 0 && p.gap, p: pi }));
  });
  return lines;
}

interface Region { x: number; y: number; w: number; h: number; cols: number }
const COL_GAP = 26;
const colWidth = (r: { w: number; cols: number }) => (r.w - COL_GAP * (r.cols - 1)) / r.cols;

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
function balancedHeight(lines: Line[], start: number, cols: number, lh: number, max: number): number {
  const r: Region = { x: 0, y: 0, w: 100, h: max, cols };
  const n = lines.length - start;
  if (n <= 0) return 0;
  if (fitCount(lines, start, r, lh) < n) return max;
  let lo = 0, hi = max;
  while (hi - lo > 2) { const mid = (lo + hi) / 2; if (fitCount(lines, start, { ...r, h: mid }, lh) >= n) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}

/** Rita rader i spalter; returnerar index för första raden som inte fick plats */
function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], start: number, r: Region, px: number, lh: number, opts: { more?: string } = {}): number {
  const n = fitCount(lines, start, r, lh, opts.more ? lh : 0);
  const end = start + n;
  const colW = colWidth(r);
  let col = 0, cy = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = start; i < end; i++) {
    const l = lines[i];
    const add = l.gap && cy > 0 ? lh * 0.55 : 0;
    const limit = col === r.cols - 1 && opts.more ? r.h - lh : r.h;
    if (cy + add + lh > limit + 0.5) { col++; cy = 0; }
    else cy += add;
    ctx.font = bodyFont(l.bold, px);
    ctx.fillStyle = l.bold ? INK : "#222";
    ctx.fillText(l.t, r.x + col * (colW + COL_GAP), r.y + cy + (l.bold ? px * 0.06 : 0));
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
    ctx.fillText("FORTS. NÄSTA SIDA ›", r.x + r.w, r.y + r.h - lh * 0.9);
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

// ─── Rutor ───────────────────────────────────────────────────────────────────

interface Box { id: string; h: number; flex?: boolean; minH?: number; draw: (x: number, y: number, w: number, h: number) => void }
/** Rutan byggs för en viss bredd (sidospalten eller en halv huvudspalt) */
interface BoxDef { id: string; make: (w: number, maxH?: number) => Box }

function header(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, w: number, h = 36, right = "") {
  ctx.fillStyle = BLUE;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.round(h * 0.56)}px ${HEAD}`;
  ctx.letterSpacing = "1.2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, title.toUpperCase(), w - 24 - (right ? 70 : 0)), x + 12, y + h / 2 + 1);
  if (right) {
    ctx.font = `600 ${Math.round(h * 0.42)}px ${HEAD}`;
    ctx.textAlign = "right";
    ctx.fillText(right, x + w - 10, y + h / 2 + 1);
  }
  ctx.letterSpacing = "0px";
  return h;
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = BOX_FILL) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PRESS.boxBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function sourceLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  ctx.fillStyle = MUTED;
  ctx.font = `500 12px ${BODY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fit(ctx, text, w), x, y);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = BLUE, px = 15) {
  ctx.fillStyle = color;
  ctx.font = `700 ${px}px ${HEAD}`;
  ctx.letterSpacing = "1.2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
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
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Luleå i SHL: resultatet stort, formen, tabellplatsen och nästa match */
function focusBox(ctx: CanvasRenderingContext2D, f: PressFocus): BoxDef {
  return {
    id: "focus",
    make: (w) => {
      const h = 36 + (f.last ? 112 : 0) + (f.form.length || f.pos ? 44 : 0) + (f.next ? 58 : 0) + 30;
      return {
        id: "focus", h,
        draw: (x, y) => {
          frame(ctx, x, y, w, h);
          header(ctx, `${f.team} i SHL`, x, y, w, 36, f.pos ? `${f.pos}:A` : "");
          let cy = y + 36 + 10;
          if (f.last) {
            const m = f.last;
            label(ctx, m.live ? "● PÅGÅR" : `SENAST · ${m.when.toUpperCase()}`, x + 12, cy, m.live ? RED : MUTED, 13);
            cy += 22;
            ctx.textBaseline = "middle";
            const mid = cy + 34;
            ctx.fillStyle = INK;
            ctx.font = `700 54px ${HEAD}`;
            ctx.textAlign = "center";
            const score = `${m.homeScore}–${m.awayScore}`;
            ctx.fillText(score, x + w / 2, mid);
            const sw = ctx.measureText(score).width / 2 + 10;
            const side = (name: string, align: CanvasTextAlign, ax: number) => {
              const maxW = w / 2 - sw - 12;
              let p = 21;
              const f = (q: number) => `${isFocusName(name) ? 700 : 500} ${q}px ${HEAD}`;
              ctx.font = f(p);
              while (p > 13 && ctx.measureText(name.toUpperCase()).width > maxW) ctx.font = f(--p);
              ctx.fillStyle = isFocusName(name) ? BLUE : INK;
              ctx.textAlign = align;
              ctx.fillText(fit(ctx, name.toUpperCase(), maxW), ax, mid + 2);
            };
            side(m.home, "left", x + 12);
            side(m.away, "right", x + w - 12);
            cy += 90;
          }
          if (f.form.length || f.pos) {
            ctx.fillStyle = RULE;
            ctx.fillRect(x + 12, cy - 4, w - 24, 1);
            let fx = x + 12;
            if (f.form.length) {
              label(ctx, "FORM", fx, cy + 8, MUTED, 13);
              fx += 46;
              for (const r of f.form) {
                ctx.fillStyle = r === "V" ? "#1f7a3f" : RED;
                ctx.fillRect(fx, cy + 4, 22, 24);
                ctx.fillStyle = "#fff";
                ctx.font = `700 15px ${HEAD}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(r, fx + 11, cy + 17);
                fx += 26;
              }
            }
            if (f.pts != null) {
              ctx.fillStyle = INK;
              ctx.font = `600 15px ${HEAD}`;
              ctx.textAlign = "right";
              ctx.textBaseline = "middle";
              ctx.fillText(`${f.pts} P${f.gp != null ? ` · ${f.gp} M` : ""}`, x + w - 12, cy + 17);
            }
            cy += 44;
          }
          if (f.next) {
            ctx.fillStyle = RULE;
            ctx.fillRect(x + 12, cy - 4, w - 24, 1);
            label(ctx, `NÄSTA · ${f.next.when.toUpperCase()}`, x + 12, cy + 4, BLUE, 13);
            ctx.fillStyle = INK;
            ctx.font = `600 19px ${HEAD}`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(fit(ctx, `${f.next.home} – ${f.next.away}`.toUpperCase(), w - 24), x + 12, cy + 26);
            cy += 58;
          }
          sourceLine(ctx, `Källa: ${f.source} · ${f.updated}`, x + 12, y + h - 10, w - 24);
        },
      };
    },
  };
}

function gamesBox(ctx: CanvasRenderingContext2D, g: NonNullable<PressPageData["shlGames"]>): BoxDef {
  return {
    id: "shlGames",
    make: (w) => {
      const rowH = 27;
      const h = 36 + 8 + g.rows.length * rowH + 26;
      return {
        id: "shlGames", h,
        draw: (x, y) => {
          frame(ctx, x, y, w, h);
          header(ctx, g.title, x, y, w);
          let ry = y + 36 + 8;
          for (const r of g.rows) {
            const focus = isFocusName(r.home) || isFocusName(r.away);
            if (focus) { ctx.fillStyle = "#d9e3f0"; ctx.fillRect(x + 1, ry - 2, w - 2, rowH); }
            ctx.fillStyle = INK;
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            ctx.font = `${focus ? 700 : 400} 17px ${SERIF_BODY}`;
            ctx.fillText(fit(ctx, `${r.home}–${r.away}`, w - 92), x + 12, ry + 3);
            ctx.textAlign = "right";
            if (r.live) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(x + w - 70, ry + 12, 4, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = r.score ? INK : MUTED;
            ctx.font = `${r.score ? 700 : 500} 17px ${HEAD}`;
            ctx.fillText(r.score ?? r.time, x + w - 12, ry + 2);
            ry += rowH;
            ctx.fillStyle = RULE;
            ctx.fillRect(x + 12, ry - 2, w - 24, 1);
          }
          sourceLine(ctx, `Källa: ${g.source} · ${g.updated}`, x + 12, y + h - 9, w - 24);
        },
      };
    },
  };
}

function tableBox(ctx: CanvasRenderingContext2D, t: NonNullable<PressPageData["shlTable"]>): BoxDef {
  return {
    id: "shlTable",
    make: (w, maxH = Infinity) => {
      const rowH = 23;
      // Ryms inte hela tabellen: toppen och Luleå (minst sex rader)
      const fitRows = Math.max(6, Math.floor((maxH - 88) / rowH));
      let rows = t.rows;
      if (fitRows < rows.length) {
        const focusIdx = rows.findIndex((r) => isFocusName(r.team));
        rows = focusIdx < fitRows ? rows.slice(0, fitRows) : [...rows.slice(0, fitRows - 1), rows[focusIdx]];
      }
      const h = 36 + 26 + rows.length * rowH + 26;
      return {
        id: "shlTable", h,
        draw: (x, y) => {
          frame(ctx, x, y, w, h);
          header(ctx, "SHL-tabellen", x, y, w);
          const cG = x + w - 62, cP = x + w - 12;
          ctx.fillStyle = MUTED;
          ctx.font = `600 13px ${BODY}`;
          ctx.textBaseline = "top";
          ctx.textAlign = "right";
          ctx.fillText("M", cG, y + 42);
          ctx.fillText("P", cP, y + 42);
          let ry = y + 36 + 26;
          const n = t.rows.length;
          for (const r of rows) {
            const local = isFocusName(r.team);
            if (local) { ctx.fillStyle = "#d9e3f0"; ctx.fillRect(x + 1, ry - 2, w - 2, rowH); }
            ctx.fillStyle = local ? BLUE : INK;
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
            // Streck: slutspel (6), play in (10), kval (två sista)
            if (r.pos === 6 || r.pos === 10 || r.pos === n - 2) { ctx.fillStyle = r.pos === n - 2 ? RED : BLUE; ctx.fillRect(x + 8, ry - 2, w - 16, 1.5); }
          }
          sourceLine(ctx, `Källa: ${t.source} · ${t.updated}`, x + 12, y + h - 9, w - 24);
        },
      };
    },
  };
}

function latestBox(ctx: CanvasRenderingContext2D, m: PressLatest): BoxDef {
  return {
    id: "latest",
    make: (w) => {
      ctx.font = `400 16px ${SERIF_BODY}`;
      const lines = m.lines.flatMap((l) => wrap(ctx, l, w - 24)).slice(0, 4);
      const h = 36 + 128 + (lines.length ? lines.length * 21 + 12 : 0);
      return {
        id: "latest", h,
        draw: (x, y) => {
          frame(ctx, x, y, w, h);
          header(ctx, "Senaste internmatchen", x, y, w);
          const cy = y + 36 + 54;
          jersey(ctx, x + 40, cy - 4, 50, m.homeColor);
          jersey(ctx, x + w - 40, cy - 4, 50, m.awayColor);
          ctx.fillStyle = INK;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `700 50px ${HEAD}`;
          ctx.fillText(`${m.homeScore}–${m.awayScore}`, x + w / 2, cy);
          ctx.font = `600 16px ${BODY}`;
          ctx.fillText(fit(ctx, m.home, w / 2 - 14), x + w / 4 + 2, cy + 48);
          ctx.fillText(fit(ctx, m.away, w / 2 - 14), x + (w * 3) / 4 - 2, cy + 48);
          let ly = y + 36 + 128;
          if (lines.length) { ctx.fillStyle = RULE; ctx.fillRect(x + 12, ly - 6, w - 24, 1); }
          ctx.fillStyle = INK;
          ctx.font = `400 16px ${SERIF_BODY}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          for (const t of lines) { ctx.fillText(t, x + 12, ly); ly += 21; }
        },
      };
    },
  };
}

function nextBox(ctx: CanvasRenderingContext2D, n: { when: string; what: string }): BoxDef {
  return {
    id: "next",
    make: (w) => ({
      id: "next", h: 118,
      draw: (x, y) => {
        frame(ctx, x, y, w, 118);
        ctx.fillStyle = BLUE;
        ctx.fillRect(x, y, 6, 118);
        label(ctx, "NÄSTA TRÄNING / MATCH", x + 20, y + 12, BLUE, 16);
        ctx.fillStyle = INK;
        fitText(ctx, n.when.toUpperCase(), x + 20, y + 38, w - 34, 32, (px) => `700 ${px}px ${HEAD}`, 27, 16);
        ctx.fillStyle = MUTED;
        fitText(ctx, n.what, x + 20, y + 74, w - 34, 38, (px) => `400 ${px}px ${SERIF_BODY}`, 18, 14);
      },
    }),
  };
}

function resultsBox(ctx: CanvasRenderingContext2D, rows: PressPageData["results"]): BoxDef {
  return {
    id: "results",
    make: (w) => {
      const rowH = 27;
      const h = 36 + 8 + rows.length * rowH + 6;
      return {
        id: "results", h,
        draw: (x, y) => {
          frame(ctx, x, y, w, h);
          header(ctx, "Våra senaste matcher", x, y, w);
          let ry = y + 44;
          for (const r of rows) {
            ctx.fillStyle = INK;
            ctx.textBaseline = "top";
            ctx.font = `400 17px ${SERIF_BODY}`;
            ctx.textAlign = "left";
            ctx.fillText(fit(ctx, `${r.home}–${r.away}`, w - 80), x + 12, ry + 3);
            ctx.font = `700 17px ${HEAD}`;
            ctx.textAlign = "right";
            ctx.fillText(r.score, x + w - 12, ry + 2);
            ry += rowH;
            ctx.fillStyle = RULE;
            ctx.fillRect(x + 12, ry - 2, w - 24, 1);
          }
        },
      };
    },
  };
}

function quoteBox(ctx: CanvasRenderingContext2D, quote: string, by: string): BoxDef {
  return {
    id: "quote",
    make: (w) => {
      const tw = w - 36;
      const qh = fitText(ctx, `”${quote}”`, 0, 0, tw, 260, (px) => `italic 700 ${px}px ${SERIF_BODY}`, 31, 19, 1.2, "left", false);
      const h = 70 + qh + (by ? 58 : 18);
      return {
        id: "quote", h,
        draw: (x, y) => {
          ctx.fillStyle = PRESS.box;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = BLUE;
          ctx.font = `900 96px ${SERIF_HEAD}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("”", x + 16, y - 4);
          ctx.fillStyle = INK;
          fitText(ctx, `”${quote}”`, x + 18, y + 70, tw, 260, (px) => `italic 700 ${px}px ${SERIF_BODY}`, 31, 19, 1.2);
          if (by) {
            const [name, ...role] = by.split(/,\s*/);
            const ty = y + 70 + qh + 12;
            ctx.fillStyle = BLUE;
            ctx.letterSpacing = "1px";
            fitText(ctx, name.toUpperCase(), x + 18, ty, w - 36, 20, (p) => `700 ${p}px ${HEAD}`, 16, 11, 1.1);
            ctx.letterSpacing = "0px";
            if (role.length) {
              ctx.fillStyle = MUTED;
              ctx.font = `500 14px ${BODY}`;
              ctx.fillText(fit(ctx, role.join(", "), w - 36), x + 18, ty + 22);
            }
          }
        },
      };
    },
  };
}

function portraitBox(ctx: CanvasRenderingContext2D, img: HTMLImageElement, caption: string): BoxDef {
  return {
    id: "portrait",
    make: (w) => {
      const ph = Math.round(w * 1.25);
      const h = ph + (caption ? 22 : 0);
      return {
        id: "portrait", h,
        draw: (x, y) => {
          cover(ctx, img, x, y, w, ph);
          if (caption) {
            ctx.fillStyle = MUTED;
            ctx.font = `600 12px ${HEAD}`;
            ctx.letterSpacing = "0.8px";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(fit(ctx, caption.toUpperCase(), w), x, y + ph + 6);
            ctx.letterSpacing = "0px";
          }
        },
      };
    },
  };
}

function adBox(ctx: CanvasRenderingContext2D, ad: PressAd, logo: HTMLImageElement | null, i: number): BoxDef {
  return { id: `ad${i}`, make: () => ({ id: `ad${i}`, h: 210, flex: true, minH: 150, draw: (x, y, w, h) => pressAd(ctx, ad, logo, x, y, w, Math.min(h, 340)) }) };
}

/** Puff längst ner på förstasidan: bild, etikett, rubrik, kort text och sida */
function teaserCell(ctx: CanvasRenderingContext2D, t: PressTeaser, x: number, y: number, w: number, h: number) {
  const iw = t.image ? Math.round(w * 0.44) : 0;
  if (t.image) cover(ctx, t.image, x, y, iw, h);
  const tx = x + iw + (iw ? 14 : 0), tw = w - iw - (iw ? 14 : 0);
  let ty = y;
  if (t.kicker) {
    ctx.font = `600 14px ${HEAD}`;
    ctx.letterSpacing = "1px";
    const k = t.kicker.toUpperCase();
    const kw = Math.min(tw, ctx.measureText(k).width + 14);
    ctx.fillStyle = BLUE;
    ctx.fillRect(tx, ty, kw, 22);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, k, tw - 14), tx + 7, ty + 12);
    ctx.letterSpacing = "0px";
    ty += 30;
  }
  ctx.fillStyle = INK;
  const used = fitText(ctx, t.title, tx, ty, tw, h - (ty - y) - (t.sub ? 40 : 22), (px) => `700 ${px}px ${HEAD}`, 25, 16, 1.08);
  ty += used + 4;
  if (t.sub) {
    ctx.fillStyle = MUTED;
    fitText(ctx, t.sub, tx, ty, tw, Math.max(18, y + h - 22 - ty), (px) => `400 ${px}px ${SERIF_BODY}`, 16, 13, 1.15);
  }
  if (t.page) label(ctx, t.page.toUpperCase(), tx, y + h - 16, INK, 13);
}

/** Rutorna i turordning: det viktigaste först */
function boxDefs(ctx: CanvasRenderingContext2D, d: PressPageData, logos: Array<HTMLImageElement | null>): BoxDef[] {
  const defs: BoxDef[] = [];
  if (d.kind === "interview" && d.photo) defs.push(portraitBox(ctx, d.photo, d.caption));
  if (d.pullQuote) defs.push(quoteBox(ctx, d.pullQuote, d.pullQuoteBy));
  if (d.focus && (d.focus.last || d.focus.next)) defs.push(focusBox(ctx, d.focus));
  if (d.ads[0]) defs.push(adBox(ctx, d.ads[0], logos[0] ?? null, 0));
  if (d.shlGames?.rows.length) defs.push(gamesBox(ctx, d.shlGames));
  if (d.shlTable?.rows.length) defs.push(tableBox(ctx, d.shlTable));
  if (d.latest) defs.push(latestBox(ctx, d.latest));
  if (d.next) defs.push(nextBox(ctx, d.next));
  if (d.results.length) defs.push(resultsBox(ctx, d.results));
  // Andra annonsen bara utan SHL – då får tabellen och matcherna platsen
  const shl = !!(d.focus || d.shlGames?.rows.length || d.shlTable?.rows.length);
  if (d.ads[1] && !shl) defs.push(adBox(ctx, d.ads[1], logos[1] ?? null, 1));
  return defs;
}

const GAP = 18;
/** Lägg rutor uppifrån i en spalt; returnerar de som inte fick plats */
function stack(defs: BoxDef[], x: number, w: number, top: number, bottom: number, reserveFirstAd = true): { placed: Array<{ b: Box; y: number; h: number }>; rest: BoxDef[] } {
  const placed: Array<{ b: Box; y: number; h: number }> = [];
  const rest: BoxDef[] = [];
  const adDef = reserveFirstAd ? defs.find((d) => d.id.startsWith("ad")) : undefined;
  const firstAd = adDef ? adDef.make(w) : undefined;
  const reserve = firstAd ? (firstAd.minH ?? firstAd.h) + GAP : 0;
  let y = top;
  defs.forEach((def, i) => {
    const adPlacedYet = placed.some((p) => p.b === firstAd);
    const room = bottom - y - (firstAd && !adPlacedYet && def !== adDef ? reserve : 0);
    const b = def === adDef && firstAd ? firstAd : def.make(w, room);
    const need = b.flex ? b.minH ?? b.h : b.h;
    const adPlaced = placed.some((p) => p.b === firstAd);
    const limit = b === firstAd || adPlaced || !firstAd ? bottom : bottom - reserve;
    if (y + need <= limit + 0.5) { placed.push({ b, y, h: need }); y += need + GAP; }
    else rest.push(defs[i]);
  });
  // Annonserna fyller ut det som blir över i spalten
  let spare = bottom - (y - GAP);
  const flex = placed.filter((p) => p.b.flex);
  if (flex.length && spare > 0) {
    let shift = 0;
    for (const p of placed) {
      p.y += shift;
      if (p.b.flex) { const add = Math.max(0, Math.min(spare / flex.length, 340 - p.h)); p.h += add; shift += add; }
    }
    spare = 0;
  }
  return { placed: placed.map((p) => ({ ...p, x, w })) as never, rest };
}

function drawStack(s: { placed: Array<{ b: Box; y: number; h: number }> }, x: number, w: number) {
  for (const p of s.placed) p.b.draw(x, p.y, w, p.h);
}

/** Två spalter med rutor (under texten när det blir plats över, eller på sida 2) */
function twoCols(defs: BoxDef[], x: number, w: number, top: number, bottom: number): { rest: BoxDef[]; y: number } {
  const cw = (w - GUTTER) / 2;
  const cols = [{ x, y: top }, { x: x + cw + GUTTER, y: top }];
  const rest: BoxDef[] = [];
  for (const d of defs) {
    const c0 = cols[0].y <= cols[1].y ? cols[0] : cols[1];
    const b = d.make(cw, bottom - c0.y);
    const h = b.flex ? Math.min(220, Math.max(b.minH ?? 150, bottom - Math.min(cols[0].y, cols[1].y))) : b.h;
    const c = cols[0].y <= cols[1].y ? cols[0] : cols[1];
    if (c.y + h <= bottom + 0.5) { b.draw(c.x, c.y, cw, h); c.y += h + GAP; }
    else rest.push(d);
  }
  return { rest, y: Math.max(cols[0].y, cols[1].y) };
}

// ─── Sidorna ─────────────────────────────────────────────────────────────────

function newPage(d: PressPageData) {
  const [c, ctx] = canvas(frameHeight(d.format));
  paper(ctx, PRESS.paper, 0.045);
  contentArea(ctx);
  return { c, ctx };
}

const headFont = (px: number) => `700 ${px}px ${HEAD}`;
/** Radavstånd i rubriken – luft för ringen i Å och prickarna i Ä/Ö */
const HEAD_LH = 1.14;

/** Etikett, rubrik, citatrubrik och ingress i en viss bredd. Returnerar höjden. */
function headText(ctx: CanvasRenderingContext2D, d: PressPageData, x: number, y: number, w: number, maxHeadPx: number, maxHeadH: number, draw = true): number {
  const y0 = y;
  const kickerText = d.kicker || (d.kind === "interview" ? "Intervju" : "");
  if (kickerText) {
    if (draw) y += kickerTag(ctx, kickerText, x, y, 30).h + 12;
    else y += 45 + 12;
  }
  const head = fitHeadline(ctx, (d.headline || "Rubrik").toUpperCase(), w, maxHeadH, headFont, HEAD_LH, maxHeadPx, 40);
  if (draw) {
    ctx.fillStyle = INK;
    ctx.font = headFont(head.px);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    head.lines.forEach((l, i) => ctx.fillText(l, x - 2, y + i * head.px * HEAD_LH));
  }
  y += head.lines.length * head.px * HEAD_LH + 8;
  if (d.quoteHead) {
    ctx.fillStyle = INK;
    y += fitText(ctx, `”${d.quoteHead.replace(/^["”“]|["”“]$/g, "")}”`, x, y, w, 130, (px) => `700 ${px}px ${SERIF_HEAD}`, 54, 26, 1.08, "left", draw) + 10;
  }
  if (d.ingress) {
    ctx.fillStyle = INK;
    y += fitText(ctx, d.ingress, x, y + 2, w, 140, (px) => `400 ${px}px ${SERIF_BODY}`, 25, 18, 1.3, "left", draw) + 10;
  }
  if (d.byline) {
    if (draw) label(ctx, fit(ctx, d.byline.toUpperCase(), w), x, y, MUTED, 14);
    y += 24;
  }
  return y - y0;
}

const BODY_MAX = 23, BODY_MIN = 18, BODY_CONT_MIN = 15;
const lhOf = (px: number) => Math.round(px * 1.36);

/** Förstasida, artikel och intervju – en eller två sidor */
export async function renderPressPages(d: PressPageData): Promise<HTMLCanvasElement[]> {
  const logos = await Promise.all(d.ads.map((a) => tryLoad(a.logo)));
  const p1 = newPage(d);
  const ctx = p1.ctx;
  const front = d.kind === "front";
  const top = masthead(ctx, d.dateLine, d.issue, front ? "full" : "compact") + 16;
  const teasers = front ? d.teasers.filter((t) => t.title).slice(0, 3) : [];
  const bottom = teasers.length ? BOTTOM - 176 : BOTTOM;

  let my: number; // huvudspaltens nästa y
  const sideTop = top;
  if (front) {
    // Rubriken över bilden (bilden till höger, tonar ut mot papperet)
    const tw = d.photo ? Math.round(MAIN_W * 0.6) : MAIN_W;
    const textH = headText(ctx, d, M, top + 8, tw, 104, 330, false);
    const heroH = Math.round(Math.min(620, Math.max(textH + 24, d.photo ? 500 : 0)));
    if (d.photo) {
      const px = M + Math.round(MAIN_W * 0.34);
      const pw = M + MAIN_W - px;
      cover(ctx, d.photo, px, top, pw, heroH);
      const g = ctx.createLinearGradient(px, 0, px + pw * 0.42, 0);
      g.addColorStop(0, PRESS.paper);
      g.addColorStop(0.5, "rgba(239,237,231,0.7)");
      g.addColorStop(1, "rgba(239,237,231,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - 1, top, pw * 0.42 + 1, heroH);
      if (d.caption) {
        ctx.fillStyle = "#fff";
        ctx.font = `600 13px ${HEAD}`;
        ctx.letterSpacing = "1px";
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
        ctx.fillText(fit(ctx, d.caption.toUpperCase(), pw - 30), M + MAIN_W - 12, top + heroH - 12);
        ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
        ctx.letterSpacing = "0px";
      }
    }
    headText(ctx, d, M, top + 8, tw, 104, 330, true);
    my = top + heroH + 18;
  } else {
    my = top + headText(ctx, d, M, top, W, 92, 230, true);
    ctx.fillStyle = INK;
    ctx.fillRect(M, my + 2, W, 1.5);
    my += 18;
  }
  const sideStart = front ? sideTop : my;

  // Artikeln: bilden överst i huvudspalten (kort text = större bild)
  const paras = toParagraphs(d.body, d.kind !== "article");
  const boxed = front && !!d.body;
  const padX = boxed ? 22 : 0;
  const textW = MAIN_W - padX * 2;
  const colW = colWidth({ w: textW, cols: 2 });
  if (d.kind === "article" && d.photo) {
    const avail = bottom - my - (d.caption ? 24 : 4) - 10;
    const need = paras.length ? balancedHeight(layoutLines(ctx, paras, colW, BODY_MAX), 0, 2, lhOf(BODY_MAX), avail) : 0;
    const ph = Math.round(Math.max(240, Math.min(avail * 0.58, avail - need)));
    cover(ctx, d.photo, M, my, MAIN_W, ph);
    my += ph + 6;
    if (d.caption) {
      ctx.fillStyle = MUTED;
      ctx.font = `600 12px ${HEAD}`;
      ctx.letterSpacing = "0.8px";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fit(ctx, d.caption.toUpperCase(), MAIN_W), M, my);
      ctx.letterSpacing = "0px";
      my += 18;
    }
    my += 10;
  }

  // Texten: största storleken där allt ryms, annars fortsättning på sida 2
  const titleH = d.boxTitle ? 40 : 0;
  const textTop = my + (boxed ? 16 : 0) + titleH;
  const moreH = d.readMore ? 34 : 0;
  const textMaxH = bottom - textTop - (boxed ? 16 : 0) - moreH;
  let px = BODY_MAX, lines: Line[] = [], cont = false;
  for (; px >= BODY_MIN; px--) {
    lines = layoutLines(ctx, paras, colW, px);
    if (fitCount(lines, 0, { x: 0, y: 0, w: textW, h: textMaxH, cols: 2 }, lhOf(px)) >= lines.length) break;
  }
  if (px < BODY_MIN) { px = 19; lines = layoutLines(ctx, paras, colW, px); cont = true; }
  const lh = lhOf(px);
  const textH = cont ? textMaxH : balancedHeight(lines, 0, 2, lh, textMaxH);
  if (boxed) {
    const bh = textH + titleH + 32 + moreH;
    ctx.fillStyle = "#e9ecf0";
    ctx.fillRect(M, my, MAIN_W, bh);
    ctx.fillStyle = BLUE;
    ctx.fillRect(M, my, 6, bh);
  }
  if (d.boxTitle) {
    ctx.fillStyle = BLUE;
    fitText(ctx, d.boxTitle.toUpperCase(), M + padX, my + (boxed ? 14 : 0), textW, 32, (p) => `700 ${p}px ${HEAD}`, 28, 18);
  }
  const end1 = lines.length ? drawLines(ctx, lines, 0, { x: M + padX, y: textTop, w: textW, h: textH, cols: 2 }, px, lh, cont ? { more: "x" } : {}) : 0;
  if (d.readMore) {
    ctx.fillStyle = RED;
    ctx.font = `700 19px ${HEAD}`;
    ctx.letterSpacing = "1px";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(d.readMore.toUpperCase(), M + padX + textW, textTop + textH + 6);
    ctx.letterSpacing = "0px";
  }
  let mainFree = textTop + textH + moreH + (boxed ? 16 : 0) + 22;
  // Förstasidan: "Luleå i SHL" stort i huvudspalten när det finns plats under texten
  let focusInMain = false;
  if (front && d.focus && (d.focus.last || d.focus.next)) {
    const fb = focusBox(ctx, d.focus).make(MAIN_W);
    if (bottom - mainFree >= fb.h) { fb.draw(M, mainFree, MAIN_W, fb.h); mainFree += fb.h + GAP + 4; focusInMain = true; }
  }

  // Sidospalten, sedan rutor under texten om det blev plats över
  const defs = boxDefs(ctx, d, logos).filter((b) => !(focusInMain && b.id === "focus"));
  const side = stack(defs, SIDE_X, SIDE_W, sideStart, bottom);
  drawStack(side, SIDE_X, SIDE_W);
  let rest = side.rest;
  if (!cont && rest.length && bottom - mainFree >= 140) { const r = twoCols(rest, M, MAIN_W, mainFree, bottom); rest = r.rest; mainFree = Math.max(mainFree, r.y); }
  // Annonserna som syntes på sidan 1 – sida 2 får en annan
  const shownOnP1 = new Set(defs.filter((dd) => !rest.includes(dd)).map((dd) => dd.id));
  // Förstasidan: blir det yta över i huvudspalten får den en stor annons (en annan sponsor)
  if (front && !cont && bottom - mainFree >= 150) {
    const i = d.ads.findIndex((_, k) => !shownOnP1.has(`ad${k}`));
    if (i >= 0) { pressAd(ctx, d.ads[i], logos[i] ?? null, M, mainFree, MAIN_W, Math.min(320, bottom - mainFree)); shownOnP1.add(`ad${i}`); }
  }

  // Puffarna längst ner (förstasidan)
  if (teasers.length) {
    const ty = BOTTOM - 160;
    ctx.fillStyle = INK;
    ctx.fillRect(M, ty - 14, W, 2);
    const tw = (W - 24 * (teasers.length - 1)) / teasers.length;
    teasers.forEach((t, i) => {
      teaserCell(ctx, t, M + i * (tw + 24), ty, tw, 150);
      if (i > 0) { ctx.fillStyle = RULE; ctx.fillRect(M + i * (tw + 24) - 12, ty, 1, 150); }
    });
    ctx.fillStyle = INK;
    ctx.fillRect(M, BOTTOM + 6, W, 2);
  }

  const pages = [p1.c];
  if (end1 < lines.length) {
    // Sida 2: resten av texten och rutorna som inte fick plats
    const p2 = newPage(d);
    const c2 = p2.ctx;
    let y2 = masthead(c2, d.dateLine, d.issue, "small") + 14;
    const kick = kickerTag(c2, d.kicker || (d.kind === "interview" ? "Intervju" : "Forts."), M, y2, 20);
    c2.fillStyle = INK;
    c2.font = `700 30px ${HEAD}`;
    c2.textAlign = "left";
    c2.textBaseline = "middle";
    const hx = M + (kick.w ? kick.w + 10 : 0);
    c2.fillText(fit(c2, `${(d.headline || "").replace(/\s*\n\s*/g, " ").toUpperCase()} (FORTS.)`, W - (hx - M)), hx, y2 + (kick.h || 30) / 2 + 1);
    y2 += Math.max(kick.h, 30) + 12;
    c2.fillRect(M, y2, W, 1.5);
    y2 += 16;
    const restDefs = boxDefs(c2, d, logos).filter((b) => rest.some((r) => r.id === b.id) && b.id !== "portrait" && !b.id.startsWith("ad"));
    const nextAd = d.ads.findIndex((_, i) => !shownOnP1.has(`ad${i}`));
    if (nextAd >= 0) restDefs.push(adBox(c2, d.ads[nextAd], logos[nextAd] ?? null, nextAd));
    const wide = restDefs.length === 0;
    const r2: Region = wide ? { x: M, y: y2, w: W, h: BOTTOM - y2, cols: 3 } : { x: M, y: y2, w: MAIN_W, h: BOTTOM - y2, cols: 2 };
    const restParas = linesToParas(lines.slice(end1));
    let px2 = px, lines2: Line[] = [];
    for (; px2 >= BODY_CONT_MIN; px2--) {
      lines2 = layoutLines(c2, restParas, colWidth(r2), px2);
      if (fitCount(lines2, 0, r2, lhOf(px2)) >= lines2.length) break;
    }
    px2 = Math.max(px2, BODY_CONT_MIN);
    lines2 = layoutLines(c2, restParas, colWidth(r2), px2);
    const bal = balancedHeight(lines2, 0, r2.cols, lhOf(px2), r2.h);
    const end2 = drawLines(c2, lines2, 0, { ...r2, h: bal }, px2, lhOf(px2));
    if (end2 < lines2.length) {
      c2.fillStyle = RED;
      c2.font = `700 15px ${HEAD}`;
      c2.textAlign = "right";
      c2.textBaseline = "bottom";
      c2.fillText("(TEXTEN ÄR FÖR LÅNG)", r2.x + r2.w, BOTTOM + 18);
    }
    if (!wide) {
      const s2 = stack(restDefs, SIDE_X, SIDE_W, y2, BOTTOM, true);
      drawStack(s2, SIDE_X, SIDE_W);
      const free = y2 + bal + 22;
      if (s2.rest.length && BOTTOM - free >= 140) twoCols(s2.rest, M, MAIN_W, free, BOTTOM);
    }
    pages.push(p2.c);
  }
  return pages;
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
