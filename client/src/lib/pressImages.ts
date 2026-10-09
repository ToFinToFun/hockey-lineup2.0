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
/** Neutral lokaltidning: blått huvud, röda etiketter, vitt papper */
export const PRESS = {
  blue: "#0c4f96",
  red: "#c8102e",
  paper: "#fbfaf7",
  ink: "#121212",
  muted: "#5c6066",
  rule: "#c9ced6",
  box: "#eef2f7",
};

/** Vecka och årgång till tidningshuvudet ("Nr 41 · Årgång 26") */
export function issueOf(date = new Date()): { nr: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { nr: Math.ceil(((+d - +y0) / 86_400_000 + 1) / 7), year: date.getFullYear() - 2000 };
}

const WEEKDAY_RE = /^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\s+/i;

/**
 * Tidningshuvudet: blått band med "STÅLBLADET" i vitt, veckodag, datum och nummer
 * till höger (ingen logga – tidningen är neutral). Returnerar höjden.
 */
export function masthead(ctx: CanvasRenderingContext2D, dateLine: string, issue: { nr: number; year: number }, h = 124): number {
  const M = 36;
  ctx.fillStyle = PRESS.blue;
  // Bandet går upp till bildens överkant även i 9:16 (där innehållet är nedflyttat)
  ctx.fillRect(0, -400, IG_W, h + 400);
  ctx.fillStyle = PRESS.red;
  ctx.fillRect(0, h, IG_W, 5);
  const date = dateLine.trim() || new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const wd = date.match(WEEKDAY_RE)?.[1] ?? "";
  const rest = wd ? date.slice(wd.length).trim() : date;
  const rightW = 300;
  // Namnet så stort som får plats
  let px = Math.round(h * 0.86);
  ctx.font = `700 ${px}px ${HEAD}`;
  while (px > 40 && ctx.measureText(PRESS_NAME.toUpperCase()).width > IG_W - 2 * M - rightW - 20) { px -= 2; ctx.font = `700 ${px}px ${HEAD}`; }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "1px";
  ctx.fillText(PRESS_NAME.toUpperCase(), M - 2, h / 2 + 3);
  ctx.letterSpacing = "0px";
  // Höger: veckodag, datum, nummer
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  let y = h * 0.14;
  if (wd) {
    ctx.font = `700 ${Math.round(h * 0.27)}px ${HEAD}`;
    ctx.letterSpacing = "2px";
    ctx.fillText(wd.toUpperCase(), IG_W - M, y);
    ctx.letterSpacing = "0px";
    y += h * 0.32;
  }
  ctx.font = `500 ${Math.round(h * 0.16)}px ${BODY}`;
  ctx.fillText(fit(ctx, rest, rightW), IG_W - M, y);
  y += h * 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 ${Math.round(h * 0.13)}px ${BODY}`;
  ctx.fillText(`Nr ${issue.nr} · Årgång ${issue.year}`, IG_W - M, y);
  return h + 5;
}

/** Röd etikett ("INTERVJU", "EXTRA"). Returnerar bredd och höjd. */
export function kickerTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 26): { w: number; h: number } {
  if (!text.trim()) return { w: 0, h: 0 };
  ctx.font = `700 ${size}px ${HEAD}`;
  ctx.letterSpacing = "1.5px";
  const t = text.trim().toUpperCase();
  const w = ctx.measureText(t).width + size * 0.8;
  const h = Math.round(size * 1.5);
  ctx.fillStyle = PRESS.red;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(t, x + size * 0.4, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return { w, h };
}

/** Annons som i tidningen: liten "ANNONS"-rad, logga och annonstext */
export function pressAd(ctx: CanvasRenderingContext2D, ad: { name: string; slogan?: string | null }, logo: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PRESS.muted;
  ctx.font = `600 13px ${BODY}`;
  ctx.letterSpacing = "2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ANNONS", x, y);
  ctx.letterSpacing = "0px";
  const by = y + 20, bh = h - 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, by, w, bh);
  ctx.strokeStyle = PRESS.rule;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, by, w, bh);
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
    ctx.fillStyle = PRESS.ink;
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
  let y = masthead(ctx, d.dateLine, issueOf(), 150) + 40;
  if (d.kicker) y += kickerTag(ctx, d.kicker, M, y, 44).h + 30;

  // Rubriken så stor som möjligt (egna radbrytningar följs), blocket centreras i ytan
  const LH = 1.04;
  const limit = d.sponsor ? IG_H - 230 : IG_H - 60;
  const photoH = d.photo ? 330 : 0;
  const subReserve = d.sub ? 140 : 0;
  const head = fitHeadline(ctx, d.headline || "Rubrik", IG_W - 2 * M, limit - y - photoH - subReserve - 20, (px) => `900 ${px}px ${SERIF_HEAD}`, LH, 220, 60);
  ctx.font = `600 44px ${SERIF_BODY}`;
  const subLines = d.sub ? clip(ctx, wrap(ctx, d.sub, IG_W - 2 * M), 2, IG_W - 2 * M) : [];
  const headH = head.lines.length * head.px * LH;
  const blockH = headH + (subLines.length ? 28 + subLines.length * 56 : 0) + (photoH ? 36 + photoH : 0);
  y += Math.max(0, (limit - y - blockH) / 2);
  ctx.fillStyle = PRESS.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `900 ${head.px}px ${SERIF_HEAD}`;
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
