/**
 * Media – kampanjmallen (t.ex. Mustaschkampen). Temat ger logga, bakgrund, färg och
 * standardtexter; inlägget har tre lägen:
 *  - news:        stor logga, rubrik, text och slogan ("Mustaschkampen har startat")
 *  - people:      1–9 deltagarbilder, lika stora i ram, med namn under
 *  - beforeafter: två bilder bredvid varandra (t.ex. dag 1 och dag 30)
 * Samma 4:5-innehåll som övriga mallar; i 9:16 läggs det i Storyns säkra yta.
 */
import { clubHeading } from "@shared/club";
import { IG_W, IG_H, HEAD, BODY, STORY_TOP, fit, canvas, backdrop, photoBackdrop, contentArea, presentedBy, frameHeight, tryLoad } from "@/lib/matchReportImages";
import { roundRect } from "@/lib/canvas";
import type { MediaCommon } from "@/lib/mediaImages";

export type CampaignMode = "news" | "people" | "beforeafter" | "winners";
/** Vinnarnas etiketter (förval) – ettan, tvåan, trean */
export const WINNER_TAGS = ["Stålborsten", "Snorbromsen", "Dunläppen"];
/** Etiketter som läggs på automatiskt per läge (och tas bort igen i andra lägen) */
export const MODE_TAGS: Partial<Record<CampaignMode, string[]>> = { beforeafter: ["Före", "Efter"], winners: WINNER_TAGS };
/** Hur många bilder läget använder */
export const MODE_MAX: Record<CampaignMode, number> = { news: 0, people: 9, beforeafter: 2, winners: 3 };
/** "Vinnaren" med en bild, "Vinnarna" med flera */
export const winnersSubtitle = (count: number) => (count <= 1 ? "Vinnaren" : "Vinnarna");
/**
 * Förvalda texter per läge: nyheten använder temats rubrik och underrubrik,
 * bildlägena har temats underrubrik som rubrik och en kort underrubrik.
 */
export function modeTexts(mode: CampaignMode, theme: { name: string; title: string; subtitle: string } | null | undefined, count = 0, year = new Date().getFullYear()): { title: string; subtitle: string } {
  if (!theme) return { title: "", subtitle: "" };
  if (mode === "news") return { title: theme.title, subtitle: theme.subtitle };
  if (mode === "winners") return { title: `${theme.name} ${year}`, subtitle: winnersSubtitle(count) };
  return { title: theme.subtitle || theme.title, subtitle: mode === "beforeafter" ? "Före och efter" : "Deltagare" };
}
/** Beskärning: bildens mittpunkt (0–1) och zoom (1 = så stor som möjligt) */
export interface CampaignCrop { x: number; y: number; z: number }
export const DEFAULT_CROP: CampaignCrop = { x: 0.5, y: 0.4, z: 1 };
export const MAX_PEOPLE = 9;

export interface CampaignPerson {
  name: string;
  number?: string;
  /** Liten etikett på bilden, t.ex. "Dag 1" */
  tag?: string;
  crop?: CampaignCrop;
  image: HTMLImageElement | null;
}

export interface CampaignPostData extends MediaCommon {
  kind: "campaign";
  mode: CampaignMode;
  title: string;
  subtitle: string;
  /** Text under loggan (läget news) */
  body: string;
  slogan: string;
  accent: string;
  logo: HTMLImageElement | null;
  people: CampaignPerson[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Vilken del av bilden som syns i en ruta med proportionerna aspect (b/h).
 * Rutan fylls alltid; zoom > 1 visar en mindre del. Exporteras för test och
 * för beskärningen i redigeringen (samma uträkning).
 */
export function cropRect(iw: number, ih: number, aspect: number, crop: CampaignCrop = DEFAULT_CROP) {
  const z = clamp(Number.isFinite(crop.z) ? crop.z : 1, 1, 4);
  let sw = Math.min(iw, ih * aspect);
  let sh = sw / aspect;
  sw /= z; sh /= z;
  const sx = clamp(crop.x * iw - sw / 2, 0, iw - sw);
  const sy = clamp(crop.y * ih - sh / 2, 0, ih - sh);
  return { sx, sy, sw, sh };
}

/** Flytta bildutsnittet: dx/dy i bildens pixlar. Mittpunkten hålls där bilden fyller rutan. */
export function moveCrop(iw: number, ih: number, aspect: number, crop: CampaignCrop, dx: number, dy: number): CampaignCrop {
  const r = cropRect(iw, ih, aspect, crop);
  const next = cropRect(iw, ih, aspect, { ...crop, x: (r.sx + r.sw / 2 - dx) / iw, y: (r.sy + r.sh / 2 - dy) / ih });
  return { x: (next.sx + next.sw / 2) / iw, y: (next.sy + next.sh / 2) / ih, z: crop.z };
}

/** Zooma kring samma mittpunkt (1–3) */
export function zoomCrop(iw: number, ih: number, aspect: number, crop: CampaignCrop, z: number): CampaignCrop {
  const zz = clamp(z, 1, 3);
  const next = cropRect(iw, ih, aspect, { ...crop, z: zz });
  return { x: (next.sx + next.sw / 2) / iw, y: (next.sy + next.sh / 2) / ih, z: zz };
}

/** Var deltagarbild nr index ritades (hela bildens koordinater) – för att dra och nypa i förhandsvisningen */
export interface CampaignHit { index: number; x: number; y: number; w: number; h: number }
export type CampaignCanvas = HTMLCanvasElement & { campaignHits?: CampaignHit[] };

/** Kolumner per antal bilder: 1–3 i en rad, 4 = 2×2, 5–6 = 3+3, 7–8 = 4+4, 9 = 3×3 (exporteras för test) */
export function peopleColumns(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 3;
}

export interface PeopleSlot { x: number; y: number; w: number; h: number }

/**
 * Rutorna för deltagarbilderna: lika stora, centrerade, ofullständig rad i
 * mitten. labelH = plats under varje bild för namnet. aspect = bredd/höjd.
 */
export function peopleSlots(n: number, top: number, bottom: number, opts: { aspect?: number; labelH?: (w: number) => number; maxW?: number } = {}): PeopleSlot[] {
  const count = clamp(n, 0, MAX_PEOPLE);
  if (!count) return [];
  const aspect = opts.aspect ?? 1;
  const labelH = opts.labelH ?? (() => 0);
  const cols = peopleColumns(count);
  const rows = Math.ceil(count / cols);
  const areaW = IG_W - 100, areaH = bottom - top;
  const gapX = count > 4 ? 22 : 34;
  let w = Math.min(opts.maxW ?? 640, (areaW - gapX * (cols - 1)) / cols);
  // Krymp tills raderna (bild + namn) ryms på höjden
  const gapY = () => Math.max(14, w * 0.08);
  const totalH = () => rows * (w / aspect + labelH(w)) + (rows - 1) * gapY();
  while (w > 40 && totalH() > areaH) w -= 2;
  const h = w / aspect;
  const y0 = top + (areaH - totalH()) / 2;
  const out: PeopleSlot[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const rowW = inRow * w + (inRow - 1) * gapX;
    const x0 = IG_W / 2 - rowW / 2;
    out.push({ x: x0 + (i % cols) * (w + gapX), y: y0 + r * (h + labelH(w) + gapY()), w, h });
  }
  return out;
}

/** Rubrik i en eller två rader: så stor som möjligt inom min–max */
function fitTitle(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number, min: number, maxLines = 2): { size: number; lines: string[] } {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const wrap = (size: number) => {
    ctx.font = `700 ${size}px ${HEAD}`;
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (!line || ctx.measureText(t).width <= maxW) line = t;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  };
  for (let size = max; size >= min; size -= 2) {
    const lines = wrap(size);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { size, lines };
  }
  const lines = wrap(min).slice(0, maxLines);
  ctx.font = `700 ${min}px ${HEAD}`;
  return { size: min, lines: lines.map((l) => fit(ctx, l, maxW)) };
}

/** Bild i ram (som hockeykorten): ljus kant, rundade hörn och skugga */
function framedPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, slot: PeopleSlot, crop: CampaignCrop | undefined, accent: string, frame = "#f4f4f2") {
  const border = Math.max(4, Math.round(slot.w * (frame === "#f4f4f2" ? 0.022 : 0.03)));
  const r = Math.max(8, slot.w * 0.05);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = Math.max(14, slot.w * 0.08); ctx.shadowOffsetY = Math.max(5, slot.w * 0.025);
  ctx.fillStyle = frame;
  roundRect(ctx, slot.x - border, slot.y - border, slot.w + border * 2, slot.h + border * 2, r + border);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, slot.x, slot.y, slot.w, slot.h, r);
  ctx.clip();
  if (img) {
    const c = cropRect(img.width, img.height, slot.w / slot.h, crop);
    ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, slot.x, slot.y, slot.w, slot.h);
  } else {
    ctx.fillStyle = "#1b1f1d";
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
  }
  ctx.restore();
  // Tunn accentlinje längst ned i ramen
  ctx.fillStyle = accent;
  const lw = Math.min(120, slot.w * 0.32);
  ctx.fillRect(slot.x + slot.w / 2 - lw / 2, slot.y + slot.h + border / 2 - 2, lw, Math.max(3, border * 0.5));
  return border;
}

/** Etikett uppe till vänster på bilden, t.ex. "DAG 1" */
function photoTag(ctx: CanvasRenderingContext2D, text: string, slot: PeopleSlot, accent: string) {
  const h = clamp(slot.w * 0.11, 34, 60);
  ctx.font = `700 ${Math.round(h * 0.56)}px ${HEAD}`;
  ctx.letterSpacing = "2px";
  const label = fit(ctx, text.toUpperCase(), slot.w * 0.8);
  const w = ctx.measureText(label).width + h * 0.8;
  const x = slot.x + h * 0.3, y = slot.y + h * 0.3;
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
  ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2 + 1, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
}

/** Namn (vitt) och nummer (i accentfärg) centrerat på en rad */
/** Största textstorlek (ner till 70 %) där namnet och numret ryms – annars kortas namnet med … */
function nameSize(ctx: CanvasRenderingContext2D, name: string, number: string | undefined, size: number, maxW: number): number {
  const full = `${(name || "").toUpperCase()}${number ? ` #${number}` : ""}`;
  const min = Math.max(16, Math.round(size * 0.7));
  for (; size > min; size--) {
    ctx.font = `600 ${size}px ${HEAD}`; ctx.letterSpacing = `${Math.round(size * 0.06)}px`;
    if (ctx.measureText(full).width + size * 0.2 <= maxW) break;
  }
  ctx.letterSpacing = "0px";
  return size;
}

function nameLine(ctx: CanvasRenderingContext2D, name: string, number: string | undefined, cx: number, y: number, size: number, maxW: number, accent: string) {
  const num = number ? `#${number}` : "";
  ctx.font = `600 ${size}px ${HEAD}`;
  ctx.letterSpacing = `${Math.round(size * 0.06)}px`;
  ctx.textBaseline = "alphabetic";
  const numW = num ? ctx.measureText(num).width + size * 0.35 : 0;
  const nm = fit(ctx, (name || "").toUpperCase(), Math.max(20, maxW - numW));
  const nmW = ctx.measureText(nm).width;
  const x0 = cx - (nmW + numW) / 2;
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(nm, x0, y);
  if (num) { ctx.fillStyle = accent; ctx.fillText(num, x0 + nmW + size * 0.35, y); }
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  ctx.letterSpacing = "0px";
  ctx.textAlign = "center";
}

/** Sloganen i en ram längst ned (som info-raden i mallen Bild) */
function sloganPill(ctx: CanvasRenderingContext2D, text: string, y: number, accent: string) {
  const h = 76;
  ctx.font = `700 40px ${HEAD}`;
  ctx.letterSpacing = "4px";
  const label = fit(ctx, text.toUpperCase(), IG_W - 190);
  const w = ctx.measureText(label).width + 80;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, IG_W / 2 - w / 2, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  roundRect(ctx, IG_W / 2 - w / 2, y, w, h, h / 2); ctx.stroke();
  ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, IG_W / 2 + 2, y + h / 2 + 2);
  ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
  return h;
}

/** Loggan så stor som möjligt i rutan, med skugga */
function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, cx: number, top: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / logo.width, maxH / logo.height);
  const w = logo.width * s, h = logo.height * s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.drawImage(logo, cx - w / 2, top + (maxH - h) / 2, w, h);
  ctx.restore();
  return { w, h };
}

/** Rubrikblocket centrerat (läget news, och utan logga) – returnerar underkanten */
function centeredHeader(ctx: CanvasRenderingContext2D, d: CampaignPostData, maxTitle = 92): number {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 26px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(clubHeading(), IG_W / 2, 88);
  ctx.letterSpacing = "0px";
  let y = 88;
  if (d.title.trim()) {
    const t = fitTitle(ctx, d.title, IG_W - 120, maxTitle, 52);
    ctx.font = `700 ${t.size}px ${HEAD}`;
    ctx.letterSpacing = "3px";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 14;
    for (const line of t.lines) { y += t.size * 1.04; ctx.fillText(line, IG_W / 2, y); }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.letterSpacing = "0px";
  }
  const sub = [d.subtitle, d.dateLine].filter((x) => x?.trim()).join(" · ");
  if (sub) {
    y += 50;
    ctx.font = `500 32px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillText(fit(ctx, sub, IG_W - 140), IG_W / 2, y);
  }
  y += 28;
  ctx.fillStyle = d.accent;
  ctx.fillRect(IG_W / 2 - 50, y, 100, 4);
  return y + 4;
}

/** Rubrikblocket med loggan till vänster (deltagarbilderna) – returnerar underkanten */
function sideHeader(ctx: CanvasRenderingContext2D, d: CampaignPostData, logo: HTMLImageElement): number {
  const lh = 180, top = 36;
  const lw = Math.min(250, logo.width * (lh / logo.height));
  const drawn = drawLogo(ctx, logo, 50 + lw / 2, top, lw, lh);
  const x = 50 + drawn.w + 34, maxW = IG_W - x - 50;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 24px ${HEAD}`;
  ctx.letterSpacing = "8px";
  ctx.fillText(fit(ctx, clubHeading(), maxW), x, 78);
  ctx.letterSpacing = "0px";
  let y = 78;
  if (d.title.trim()) {
    const t = fitTitle(ctx, d.title, maxW, 72, 40);
    ctx.font = `700 ${t.size}px ${HEAD}`;
    ctx.letterSpacing = "2px";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12;
    for (const line of t.lines) { y += t.size * 1.04; ctx.fillText(line, x, y); }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.letterSpacing = "0px";
  }
  const sub = [d.subtitle, d.dateLine].filter((v) => v?.trim()).join(" · ");
  if (sub) {
    y += 42;
    ctx.font = `500 28px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillText(fit(ctx, sub, maxW), x, y);
  }
  y += 24;
  ctx.fillStyle = d.accent;
  ctx.fillRect(x, y, 90, 4);
  ctx.textAlign = "center";
  return Math.max(top + lh, y + 4);
}

/** Tom ruta med streckad kant (inga bilder än) */
function emptySlot(ctx: CanvasRenderingContext2D, slot: PeopleSlot, text: string) {
  ctx.save();
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 3;
  roundRect(ctx, slot.x, slot.y, slot.w, slot.h, 20);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = `500 32px ${BODY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, slot.x + slot.w / 2, slot.y + slot.h / 2);
  ctx.textBaseline = "alphabetic";
}

const labelSize = (w: number) => clamp(Math.round(w * 0.105), 22, 42);

/** Guld, silver och brons */
const METAL = ["#f5c84c", "#d5dde6", "#d4915a"];
const METAL_DARK = ["#a8791a", "#8c98a6", "#8a5326"];

export interface PodiumSlot extends PeopleSlot { place: number; blockH: number }
/**
 * Prispallen (1–3 vinnare, bilderna 4:5): tvåan till vänster, ettan i mitten
 * (störst, på högsta klossen), trean till höger. Alla står på samma golv.
 * nameH = plats för namnet mellan bilden och klossen. Exporteras för test.
 */
export function podiumSlots(n: number, top: number, bottom: number, nameH = 66): PodiumSlot[] {
  const count = clamp(n, 0, 3);
  if (!count) return [];
  const order = count === 1 ? [0] : count === 2 ? [1, 0] : [1, 0, 2];
  const small = 0.74, gap = 30, base = 420;
  const units = order.reduce((sum, p) => sum + (p === 0 ? 1 : small), 0);
  let w1 = Math.min(count === 1 ? 500 : base, (IG_W - 100 - gap * (count - 1)) / units);
  const blocks = [118, 80, 54];
  const need = (w: number) => w * 0.3 + w * 1.25 + nameH + blocks[0] * (w / base);
  while (w1 > 80 && need(w1) > bottom - top) w1 -= 2;
  const k = w1 / base;
  const total = order.reduce((sum, p) => sum + (p === 0 ? w1 : w1 * small), 0) + gap * (count - 1);
  let x = IG_W / 2 - total / 2;
  const out: PodiumSlot[] = [];
  for (const place of order) {
    const w = place === 0 ? w1 : w1 * small, h = w * 1.25, blockH = blocks[place] * k;
    out.push({ place, x, y: bottom - blockH - nameH - h, w, h, blockH });
    x += w + gap;
  }
  return out.sort((a, b) => a.place - b.place);
}

/** Guldmustasch – kronan över vinnaren */
function goldMustache(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number) {
  const h = w * 0.36;
  const half = (dir: 1 | -1) => {
    ctx.moveTo(cx, cy - h * 0.12);
    ctx.bezierCurveTo(cx + dir * w * 0.14, cy - h * 0.62, cx + dir * w * 0.34, cy - h * 0.3, cx + dir * w * 0.42, cy + h * 0.02);
    ctx.bezierCurveTo(cx + dir * w * 0.47, cy + h * 0.2, cx + dir * w * 0.53, cy - h * 0.05, cx + dir * w * 0.5, cy - h * 0.32);
    ctx.bezierCurveTo(cx + dir * w * 0.6, cy - h * 0.02, cx + dir * w * 0.52, cy + h * 0.5, cx + dir * w * 0.36, cy + h * 0.46);
    ctx.bezierCurveTo(cx + dir * w * 0.22, cy + h * 0.44, cx + dir * w * 0.1, cy + h * 0.18, cx, cy + h * 0.28);
    ctx.closePath();
  };
  ctx.save();
  ctx.beginPath(); half(1); half(-1);
  const g = ctx.createLinearGradient(0, cy - h * 0.6, 0, cy + h * 0.5);
  g.addColorStop(0, "#fff1b8"); g.addColorStop(0.45, "#f5c84c"); g.addColorStop(1, "#a8791a");
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = w * 0.08; ctx.shadowOffsetY = w * 0.03;
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(2, w * 0.022); ctx.strokeStyle = "#5c3d06"; ctx.lineJoin = "round"; ctx.stroke();
  // Glans
  ctx.globalAlpha = 0.55; ctx.strokeStyle = "#fffbe6"; ctx.lineWidth = Math.max(1.5, w * 0.012);
  for (const dir of [1, -1]) { ctx.beginPath(); ctx.moveTo(cx + dir * w * 0.06, cy - h * 0.18); ctx.quadraticCurveTo(cx + dir * w * 0.2, cy - h * 0.42, cx + dir * w * 0.34, cy - h * 0.22); ctx.stroke(); }
  ctx.restore();
}

/** Konfetti över hela bilden (fast slump – ser likadan ut varje gång) */
function confetti(ctx: CanvasRenderingContext2D, accent: string) {
  const W = ctx.canvas?.width ?? IG_W, H = ctx.canvas?.height ?? IG_H;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = [accent, "#f5c84c", "#ffffff", accent, "#d5dde6"];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 110; i++) {
    const x = rnd() * W, y = rnd() < 0.7 ? rnd() * H * 0.45 : rnd() * H, s = 6 + rnd() * 12;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.globalAlpha = 0.45 + rnd() * 0.45;
    ctx.fillStyle = cols[i % cols.length];
    if (i % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-s / 2, -s * 0.2, s, s * 0.4);
    ctx.restore();
  }
  ctx.restore();
}

/** Etikett (t.ex. STÅLBORSTEN) över bildens nederkant, i medaljens färg */
function prizeLabel(ctx: CanvasRenderingContext2D, text: string, slot: PeopleSlot, place: number) {
  const h = clamp(slot.w * 0.15, 36, 64);
  ctx.font = `700 ${Math.round(h * 0.55)}px ${HEAD}`;
  ctx.letterSpacing = "3px";
  const label = fit(ctx, text.toUpperCase(), slot.w * 1.05);
  const w = Math.min(slot.w * 1.15, ctx.measureText(label).width + h * 0.9);
  const x = slot.x + slot.w / 2 - w / 2, y = slot.y + slot.h - h * 0.55;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(10,10,10,0.9)";
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = METAL[place]; ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
  ctx.fillStyle = METAL[place]; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, slot.x + slot.w / 2 + 1, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
}

/** Klossen på prispallen med placeringens siffra */
function podiumBlock(ctx: CanvasRenderingContext2D, slot: PodiumSlot, floor: number) {
  const x = slot.x - 6, w = slot.w + 12, y = floor - slot.blockH;
  const g = ctx.createLinearGradient(0, y, 0, floor);
  g.addColorStop(0, METAL[slot.place]); g.addColorStop(1, METAL_DARK[slot.place]);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = g;
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(x, floor); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, floor); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = `700 ${Math.round(Math.min(slot.blockH * 0.75, slot.w * 0.3))}px ${HEAD}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(slot.place + 1), slot.x + slot.w / 2, y + slot.blockH / 2 + 3);
  ctx.textBaseline = "alphabetic";
}

/** bgUrl och decorate kommer från mediaImages (bakgrundslistan och överläggen) */
export async function renderCampaign(d: CampaignPostData, look: { bgUrl: string; decorate: (ctx: CanvasRenderingContext2D) => void }): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([d.photo ? Promise.resolve(null) : tryLoad(look.bgUrl), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5); else backdrop(ctx, bg, d.photoDim ?? 0.55);
  look.decorate(ctx);
  contentArea(ctx);
  // Vinnare: "Vinnaren"/"Vinnarna" efter antalet bilder (om underrubriken är förvalet)
  if (d.mode === "winners" && (d.subtitle === "Vinnaren" || d.subtitle === "Vinnarna")) d = { ...d, subtitle: winnersSubtitle(Math.min(3, d.people.length)) };
  if (d.mode === "winners") confetti(ctx, d.accent);
  const hits: CampaignHit[] = [];
  const offsetY = d.format === "story" ? STORY_TOP : 0;
  const hit = (index: number, slot: PeopleSlot) => hits.push({ index, x: slot.x, y: slot.y + offsetY, w: slot.w, h: slot.h });

  const bottom = d.sponsor ? IG_H - 205 : IG_H - 70;
  const sloganH = d.slogan.trim() ? 76 : 0;
  const sloganY = bottom - sloganH;

  if (d.mode === "news") {
    let top = centeredHeader(ctx, d) + 34;
    // Text under loggan (högst 4 rader)
    ctx.font = `500 34px ${BODY}`;
    const lines = d.body.trim() ? wrapText(ctx, d.body.trim(), IG_W - 180, 4) : [];
    const bodyH = lines.length ? lines.length * 46 + 10 : 0;
    const logoBottom = (sloganH ? sloganY - 34 : bottom) - bodyH - (bodyH ? 26 : 0);
    if (d.logo) drawLogo(ctx, d.logo, IG_W / 2, top, IG_W - 160, Math.max(120, logoBottom - top));
    top = logoBottom + (bodyH ? 26 : 0);
    if (lines.length) {
      ctx.font = `500 34px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 10;
      lines.forEach((l, i) => ctx.fillText(l, IG_W / 2, top + 34 + i * 46));
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }
  } else {
    const headerBottom = d.logo ? sideHeader(ctx, d, d.logo) : centeredHeader(ctx, d, 76);
    const top = headerBottom + 34;
    const gridBottom = sloganH ? sloganY - 30 : bottom;
    if (d.mode === "winners") {
      // Prispallen: ettan störst i mitten med guldmustasch, tvåan och trean på sidorna
      const people = d.people.slice(0, 3);
      const nameH = 66;
      const slots = podiumSlots(Math.max(1, people.length), top, gridBottom, nameH);
      for (const slot of slots) {
        const p = people[slot.place];
        podiumBlock(ctx, slot, gridBottom);
        if (!p?.image) { emptySlot(ctx, slot, "Vinnare"); continue; }
        const border = framedPhoto(ctx, p.image, slot, p.crop, d.accent, METAL[slot.place]);
        hit(slot.place, slot);
        if (p.tag?.trim()) prizeLabel(ctx, p.tag, slot, slot.place);
        if (p.name.trim()) {
          const size = clamp(Math.round(slot.w * (slot.place === 0 ? 0.095 : 0.11)), 22, 44);
          nameLine(ctx, p.name, p.number, slot.x + slot.w / 2, slot.y + slot.h + border + nameH * 0.62, nameSize(ctx, p.name, p.number, size, slot.w + 40), slot.w + 40, d.accent);
        }
        if (slot.place === 0) goldMustache(ctx, slot.x + slot.w / 2, slot.y - slot.w * 0.13, slot.w * 0.72);
      }
    } else if (d.mode === "beforeafter") {
      // Två bilder (4:5) bredvid varandra, namnet under
      const pair = [d.people[0], d.people[1]];
      const nameH = d.people[0]?.name ? 64 : 0;
      const slots = peopleSlots(2, top, gridBottom - nameH, { aspect: 4 / 5, maxW: 470 });
      slots.forEach((slot, i) => {
        const p = pair[i];
        if (!p?.image) { emptySlot(ctx, slot, i === 0 ? "Före" : "Efter"); return; }
        framedPhoto(ctx, p.image, slot, p.crop, d.accent);
        hit(i, slot);
        if (p.tag?.trim()) photoTag(ctx, p.tag, slot, d.accent);
      });
      // Pil mellan bilderna
      if (slots.length === 2) {
        const cx = (slots[0].x + slots[0].w + slots[1].x) / 2, cy = slots[0].y + slots[0].h / 2, r = 26;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12;
        ctx.fillStyle = d.accent;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "#0b0b0b"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - 11); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx - 6, cy + 11); ctx.stroke();
      }
      if (nameH && slots[0]) nameLine(ctx, d.people[0].name, d.people[0].number, IG_W / 2, slots[0].y + slots[0].h + 62, 44, IG_W - 160, d.accent);
    } else {
      const people = d.people.slice(0, MAX_PEOPLE);
      const hasNames = people.some((p) => p.name.trim());
      const label = (w: number) => (hasNames ? labelSize(w) * 1.7 : 0);
      if (!people.length) {
        const [slot] = peopleSlots(1, top, gridBottom, { maxW: 560 });
        emptySlot(ctx, slot, "Lägg till bilder");
      }
      const slots = peopleSlots(people.length, top, gridBottom, { labelH: label, maxW: people.length === 1 ? 600 : 640 });
      // Samma textstorlek för alla namn: den som ryms för det längsta
      const w0 = slots[0]?.w ?? 0, maxW = w0 + 18;
      const size = Math.min(labelSize(w0), ...people.filter((p) => p.name.trim()).map((p) => nameSize(ctx, p.name, p.number, labelSize(w0), maxW)));
      slots.forEach((slot, i) => {
        const p = people[i];
        const border = framedPhoto(ctx, p.image, slot, p.crop, d.accent);
        if (p.image) hit(i, slot);
        if (p.tag?.trim()) photoTag(ctx, p.tag, slot, d.accent);
        if (p.name.trim()) nameLine(ctx, p.name, p.number, slot.x + slot.w / 2, slot.y + slot.h + border + labelSize(w0) * 1.25, size, maxW, d.accent);
      });
    }
  }
  if (sloganH) sloganPill(ctx, d.slogan, sloganY, d.accent);
  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  (c as CampaignCanvas).campaignHits = hits;
  return c;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (!line || ctx.measureText(t).width <= maxW) line = t;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    cut[maxLines - 1] = fit(ctx, `${cut[maxLines - 1]}…`, maxW);
    return cut;
  }
  return out;
}
