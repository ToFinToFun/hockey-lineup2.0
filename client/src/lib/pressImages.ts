/**
 * Stålbladet – Media-mallar i tidningsstil (en påhittad, neutral lokaltidning som
 * skriver om klubben): profilen (huvud, etiketter, annonser) och löpsedeln här,
 * förstasidan, artikeln och intervjun i pressPages.ts. Samma format som övriga
 * Media-bilder (4:5, eller 9:16 med innehållet i den säkra ytan).
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, fit, canvas, contentArea, frameHeight, type PostFormat } from "@/lib/matchReportImages";

export const PRESS_NAME = "Stålbladet";
export const SERIF_HEAD = "'Playfair Display', serif";
export const SERIF_BODY = "'Source Serif 4', serif";

export type BillStyle = "yellow" | "white" | "black";
export const BILL_STYLES: Array<{ id: BillStyle; name: string }> = [
  { id: "yellow", name: "Gul" },
  { id: "white", name: "Vit" },
  { id: "black", name: "Svart" },
];

export interface PressCommon {
  format?: PostFormat;
  dateLine: string;
  sponsor: { name: string; logo: string | null; slogan?: string | null } | null;
}

export interface BillPostData extends PressCommon {
  kind: "bill";
  /** Äldre löpsedlar (gul/vit/svart) – alla ritas nu i tidningens stil */
  style?: BillStyle;
  kicker: string;
  headline: string;
  sub: string;
  photo?: HTMLImageElement | null;
}

/** Bryt text i rader (ord för ord) */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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
export function clip(ctx: CanvasRenderingContext2D, lines: string[], max: number, maxW: number): string[] {
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  cut[max - 1] = fit(ctx, `${cut[max - 1]}…`, maxW);
  return cut;
}

/** Tidningspapper: färg med lätt brus (fast slump – samma bild varje gång) */
export function paper(ctx: CanvasRenderingContext2D, color: string, grain = 0.05) {
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

/** Bild som fyller rutan (beskärs) */
export function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

// ─── Tidningens profil (samma på alla sidor) ─────────────────────────────────
/** Neutral lokaltidning i nordisk marinblå med ett städ som symbol (Stålstaden) */
export const PRESS = {
  blue: "#173a63",
  blueDark: "#0f2847",
  red: "#b3122a",
  paper: "#efede7",
  ink: "#141414",
  muted: "#5b5f66",
  rule: "#b9bec6",
  box: "#e4e9f0",
  boxBorder: "#c3cad4",
};

/** Vecka och årgång till tidningshuvudet ("Nr 41 · Årgång 26") */
export function issueOf(date = new Date()): { nr: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { nr: Math.ceil(((+d - +y0) / 86_400_000 + 1) / 7), year: date.getFullYear() - 2000 };
}

/** Städet: tidningens symbol (Stålstaden), med gnistor */
export function anvil(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color = PRESS.blue, sparks = true) {
  const P = (px: number, py: number): [number, number] => [x + px * w, y + py * w];
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  // Ovansidan (banan) med hornet till vänster, midja, bred fot
  ctx.moveTo(...P(0.3, 0.18));
  ctx.lineTo(...P(0.98, 0.18));
  ctx.lineTo(...P(1.0, 0.2));
  ctx.lineTo(...P(1.0, 0.34));
  ctx.lineTo(...P(0.9, 0.36));
  ctx.quadraticCurveTo(...P(0.76, 0.4), ...P(0.74, 0.5));
  ctx.lineTo(...P(0.74, 0.56));
  ctx.quadraticCurveTo(...P(0.76, 0.6), ...P(0.86, 0.62));
  ctx.lineTo(...P(0.9, 0.62));
  ctx.lineTo(...P(0.92, 0.72));
  ctx.lineTo(...P(0.28, 0.72));
  ctx.lineTo(...P(0.3, 0.62));
  ctx.lineTo(...P(0.34, 0.62));
  ctx.quadraticCurveTo(...P(0.44, 0.6), ...P(0.46, 0.56));
  ctx.lineTo(...P(0.46, 0.5));
  ctx.quadraticCurveTo(...P(0.44, 0.42), ...P(0.34, 0.38));
  ctx.quadraticCurveTo(...P(0.16, 0.34), ...P(0.02, 0.2));
  ctx.quadraticCurveTo(...P(0.16, 0.2), ...P(0.3, 0.18));
  ctx.closePath();
  ctx.fill();
  if (sparks) {
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, w * 0.025);
    const [cx, cy] = P(0.66, 0.12);
    for (const [ang, len] of [[-155, 0.08], [-125, 0.11], [-95, 0.12], [-65, 0.11], [-35, 0.08]] as const) {
      const a = (ang * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * w * 0.05, cy + Math.sin(a) * w * 0.05);
      ctx.lineTo(cx + Math.cos(a) * w * (0.05 + len), cy + Math.sin(a) * w * (0.05 + len));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Text med tryckslitage (fläckar i färgen, som på tidningspapper) */
function worn(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, h: number) {
  const [tmp, t] = canvas(Math.ceil(h * 1.4));
  t.font = font;
  t.fillStyle = color;
  t.textAlign = "left";
  t.textBaseline = "alphabetic";
  t.fillText(text, x, h * 1.1);
  t.globalCompositeOperation = "destination-out";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    t.globalAlpha = 0.15 + rnd() * 0.5;
    const r = rnd() < 0.9 ? 0.4 + rnd() * 0.8 : 1 + rnd() * 1.4;
    t.beginPath();
    t.arc(rnd() * IG_W, rnd() * h * 1.4, r, 0, Math.PI * 2);
    t.fill();
  }
  t.globalAlpha = 1;
  t.globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, y - h * 1.1);
}

const WEEKDAY_RE = /^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\s+/i;
export type MastSize = "full" | "compact" | "small";

/** Hjärta (ritat, inte tecken – typsnitten saknar det) */
function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.35, cy - s * 0.55, cx, cy - s * 0.2);
  ctx.bezierCurveTo(cx + s * 0.35, cy - s * 0.55, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35);
  ctx.fill();
}

/**
 * Tidningshuvudet som i en riktig dagstidning: överrad (tidningen, avdelningar,
 * datum och nummer), namnet i stort med tryckslitage och städet, och en rad med
 * avdelningar. "compact" och "small" för artikel/intervju och sida 2.
 * Returnerar höjden.
 */
export function masthead(ctx: CanvasRenderingContext2D, dateLine: string, issue: { nr: number; year: number }, size: MastSize = "full"): number {
  const M = 36, W = IG_W - 2 * M;
  const INK = PRESS.ink;
  const date = (dateLine.trim() || new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })).toUpperCase();
  const nr = `NR ${issue.nr}  |  ÅRGÅNG ${issue.year}`;
  const line = (y: number, t = 1.5) => { ctx.fillStyle = INK; ctx.fillRect(M, y, W, t); };
  const small = (text: string, x: number, y: number, align: CanvasTextAlign, px = 15, weight = 600, color = INK, maxW = 9999) => {
    ctx.font = `${weight} ${px}px ${HEAD}`;
    ctx.fillStyle = color;
    ctx.letterSpacing = "0.8px";
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, text, maxW), x, y);
    ctx.letterSpacing = "0px";
  };
  let y = 14;
  if (size === "full") {
    small("DIN LOKALA TIDNING FÖR", M, y, "left");
    small("ISHOCKEYN I STÅLSTADEN", M, y + 19, "left");
    small("MATCHER  •  MÄNNISKOR  •  FÖRENINGSLIV  •  GEMENSKAP", IG_W / 2 + 20, y + 9, "center", 16);
    small(date, IG_W - M, y, "right", 15, 600, INK, 300);
    small(nr, IG_W - M, y + 19, "right", 14, 500);
    y += 46;
    line(y, 2.5);
    y += 8;
  }
  // Namnet och städet
  const nameH = size === "full" ? 132 : size === "compact" ? 92 : 62;
  const logoW = size === "full" ? 150 : size === "compact" ? 104 : 72;
  const rightW = size === "full" ? 0 : size === "compact" ? 250 : 230;
  const name = PRESS_NAME.toUpperCase();
  let px = nameH;
  const font = (p: number) => `900 ${p}px ${SERIF_HEAD}`;
  ctx.font = font(px);
  const maxW = W - logoW - 16 - (rightW ? rightW + 20 : 0);
  while (px > 30 && ctx.measureText(name).width > maxW) { px -= 2; ctx.font = font(px); }
  const textW = ctx.measureText(name).width;
  // Versalhöjden i Playfair ≈ 0.71 em; ringen över Å behöver lite luft ovanför
  const capH = px * 0.71;
  const top = y + px * 0.16;
  worn(ctx, name, M - 3, top + capH, font(px), INK, px);
  const lx = rightW ? M + textW + 18 : IG_W - M - logoW;
  anvil(ctx, lx, top + capH - logoW * 0.7, logoW, PRESS.blue);
  if (rightW) {
    small(date, IG_W - M, top + capH * 0.2, "right", size === "compact" ? 17 : 15, 600, INK, rightW);
    small(nr, IG_W - M, top + capH * 0.2 + (size === "compact" ? 24 : 20), "right", size === "compact" ? 15 : 13, 500);
  }
  y = top + capH + px * 0.1;
  if (size === "small") { line(y + 4, 2.5); return y + 8; }
  line(y + 6, 1.5);
  // Avdelningar
  const ry = y + 16;
  small("ISHOCKEY   |   SHL   |   LAGET   |   MATCHER   |   MÄNNISKOR   |   STÖRRE ÄN BARA RESULTAT", M, ry, "left", size === "full" ? 16 : 14, 500);
  ctx.font = `700 ${size === "full" ? 16 : 14}px ${HEAD}`;
  const tag = "VI BEVAKAR STÅLSTADEN";
  small(tag, IG_W - M - 24, ry, "right", size === "full" ? 16 : 14, 700, PRESS.blue);
  ctx.fillStyle = PRESS.blue;
  heart(ctx, IG_W - M - 9, ry + 9, 18);
  line(ry + 28, 2.5);
  return ry + 34;
}

/** Etikett ("INTERVJU ///") i tidningens blå med snedstreck */
export function kickerTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 26, color = PRESS.blue): { w: number; h: number } {
  if (!text.trim()) return { w: 0, h: 0 };
  ctx.font = `700 ${size}px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  const t = text.trim().toUpperCase();
  const w = ctx.measureText(t).width + size * 0.8;
  const h = Math.round(size * 1.5);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 3; i++) {
    const sx = x + w + 8 + i * (size * 0.42);
    ctx.beginPath();
    ctx.moveTo(sx, y + h); ctx.lineTo(sx + size * 0.22, y + h); ctx.lineTo(sx + size * 0.22 + h * 0.4, y); ctx.lineTo(sx + h * 0.4, y); ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(t, x + size * 0.4, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return { w: w + 8 + 3 * size * 0.42 + h * 0.4, h };
}

/** Annons som i tidningen: "ANNONS" i ramen, logga och annonstext */
export function pressAd(ctx: CanvasRenderingContext2D, ad: { name: string; slogan?: string | null }, logo: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PRESS.boxBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = PRESS.ink;
  ctx.font = `700 13px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ANNONS", x + 8, y + 6);
  ctx.letterSpacing = "0px";
  const by = y + 24, bh = h - 24;
  const slogan = ad.slogan?.trim() || "";
  const pad = 14;
  const textH = slogan ? Math.min(bh * 0.4, 84) : 0;
  const lw = w - 2 * pad, lh = bh - 2 * pad - textH - (slogan ? 6 : 0);
  if (logo) {
    const s = Math.min(lw / logo.width, lh / logo.height);
    ctx.drawImage(logo, x + w / 2 - (logo.width * s) / 2, by + pad + (lh - logo.height * s) / 2, logo.width * s, logo.height * s);
  } else {
    ctx.fillStyle = PRESS.ink;
    let px = Math.min(56, lh);
    ctx.font = `700 ${px}px ${HEAD}`;
    while (px > 16 && ctx.measureText(ad.name.toUpperCase()).width > lw) { px -= 2; ctx.font = `700 ${px}px ${HEAD}`; }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ad.name.toUpperCase(), x + w / 2, by + pad + lh / 2);
  }
  if (slogan) {
    ctx.fillStyle = PRESS.blue;
    let px = 24, lines: string[] = [];
    for (; px >= 13; px -= 1) {
      ctx.font = `italic 600 ${px}px ${SERIF_BODY}`;
      lines = wrap(ctx, slogan, lw);
      if (lines.length * px * 1.18 <= textH) break;
    }
    lines = clip(ctx, lines, Math.max(1, Math.floor(textH / (px * 1.18))), lw);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const ty = by + bh - pad - lines.length * px * 1.18;
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, ty + i * px * 1.18));
  }
}

// ─── Löpsedeln ───────────────────────────────────────────────────────────────

/** Största teckenstorlek där rubriken ryms (exporteras för test) */
export function fitHeadline(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, font: (px: number) => string, lineH = 0.92, maxPx = 230, minPx = 70): { px: number; lines: string[] } {
  for (let px = maxPx; px >= minPx; px -= 4) {
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
  paper(ctx, PRESS.paper, 0.03);
  contentArea(ctx);
  const M = 56;
  let y = masthead(ctx, d.dateLine, issueOf(), "full") + 36;
  if (d.kicker) y += kickerTag(ctx, d.kicker, M, y, 44, PRESS.red).h + 30;

  // Rubriken så stor som möjligt (egna radbrytningar följs), blocket centreras i ytan
  const LH = 1.0;
  const limit = d.sponsor ? IG_H - 230 : IG_H - 60;
  const photoH = d.photo ? 330 : 0;
  const subReserve = d.sub ? 140 : 0;
  const head = fitHeadline(ctx, (d.headline || "Rubrik").toUpperCase(), IG_W - 2 * M, limit - y - photoH - subReserve - 20, (px) => `700 ${px}px ${HEAD}`, LH, 240, 60);
  ctx.font = `600 44px ${SERIF_BODY}`;
  const subLines = d.sub ? clip(ctx, wrap(ctx, d.sub, IG_W - 2 * M), 2, IG_W - 2 * M) : [];
  const headH = head.lines.length * head.px * LH;
  const blockH = headH + (subLines.length ? 28 + subLines.length * 56 : 0) + (photoH ? 36 + photoH : 0);
  y += Math.max(0, (limit - y - blockH) / 2);
  ctx.fillStyle = PRESS.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 ${head.px}px ${HEAD}`;
  head.lines.forEach((l, i) => ctx.fillText(l, M - 4, y + i * head.px * LH));
  y += headH;
  if (subLines.length) {
    y += 28;
    ctx.font = `600 44px ${SERIF_BODY}`;
    subLines.forEach((l, i) => ctx.fillText(l, M, y + i * 56));
    y += subLines.length * 56;
  }
  if (d.photo) {
    y += 36;
    const h = Math.min(photoH, limit - y);
    if (h > 120) cover(ctx, d.photo, M, y, IG_W - 2 * M, h);
  }
  if (d.sponsor) pressAd(ctx, d.sponsor, sp, M, IG_H - 200, IG_W - 2 * M, 170);
  return c;
}

/** Ladda tidningens typsnitt innan något ritas */
export async function ensurePressFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(PRESS_FONTS.map((f) => document.fonts.load(f).catch(() => undefined)));
}

export const PRESS_FONTS = [`900 100px ${SERIF_HEAD}`, `700 60px ${SERIF_HEAD}`, `400 25px ${SERIF_BODY}`, `600 30px ${SERIF_BODY}`, `700 22px ${SERIF_BODY}`, `italic 400 22px ${SERIF_BODY}`, `italic 600 22px ${SERIF_BODY}`, `italic 700 22px ${SERIF_BODY}`];
