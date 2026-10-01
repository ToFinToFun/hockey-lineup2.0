/**
 * Ritar ett hockeykort i klassiskt format (5:7) på canvas.
 *
 * Lager: foto (beskuret, justerat och färgtonat efter stilen) → vinjett →
 * mörk toning nertill → lagmärke och nummer → namnskylt → statistikruta →
 * ram → glans. Bildbehandlingen görs pixel för pixel så att resultatet blir
 * likadant i alla webbläsare.
 */
import { clubHeading, club } from "./club";
import { skinById, resolveLogo, type CardSkin, type CardLogo, type RetroColors } from "./cardSkins";

import { canvasEnv, setCanvasEnv, browserCanvasEnv, type CanvasEnv } from "./canvasEnv";

/** Miljön kortet ritas i (se canvasEnv.ts). Behålls för bakåtkompatibilitet. */
export type CardEnv = CanvasEnv;
export const browserCardEnv = browserCanvasEnv;
export const setCardEnv = setCanvasEnv;
const env = { createCanvas: (w: number, h: number) => canvasEnv().createCanvas(w, h), loadImage: (src: string) => canvasEnv().loadImage(src) };

const loadImage = (src: string) => env.loadImage(src);

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

export const CARD_W = 750;
export const CARD_H = 1050;

export interface CardCell { label: string; value: string }

export interface CardSettings {
  skin: string;
  /** Beskärning: zoom (1 = hela bredden), fotots mittpunkt som andel (0–1) */
  photo: { zoom: number; x: number; y: number };
  /** Egna justeringar ovanpå autonivåerna (1 = oförändrat). tint = hur mycket
   *  fotot tonas mot stilens färger (1 = stilens standard, 0 = ingen toning, 2 = dubbelt) */
  adjust: { brightness: number; contrast: number; saturation: number; tint?: number };
  /** Autonivåer räknade ur fotot när det laddades upp */
  auto: { brightness: number; contrast: number };
  name: string;
  number: string;
  position: string;
  captain: "" | "C" | "A";
  /** Lagmärke: "auto" = stilens standard, "none" = inget, annars märkets id */
  logo: string;
  /** Äldre sparade kort: false = inget märke */
  showLogo?: boolean;
  /** Raden under namnet (retro), t.ex. "Stålstadens SF" */
  /** Raden under namnet; saknas den används klubbens namn */
  subtitle?: string;
  statsMode: "season" | "career" | "form" | "custom" | "none";
  /** Stars of the Game-kort: 1 = första stjärnan (tre stjärnor i toppen), 2, 3 */
  starRank?: 1 | 2 | 3;
  /** Utan foto: visa klubbens märke stort i fotorutan i stället för "Ladda upp ett foto" */
  placeholderLogo?: boolean;
  /** Friläggning: ersätt fotots bakgrund med kortets (amount 0–1 = hur mycket) */
  cutout?: { enabled: boolean; amount: number };
  statsTitle: string;
  cells: CardCell[];
  form?: string;
}

export const DEFAULT_SETTINGS: CardSettings = {
  skin: "retro-svart",
  photo: { zoom: 1, x: 0.5, y: 0.4 },
  adjust: { brightness: 1, contrast: 1, saturation: 1, tint: 1 },
  auto: { brightness: 1, contrast: 1 },
  name: "",
  number: "",
  position: "",
  captain: "",
  logo: "auto",
  subtitle: undefined,
  statsMode: "season",
  statsTitle: "",
  cells: [],
};

const HEAD = "'Oswald', sans-serif";
const BODY = "'Inter', sans-serif";

/**
 * Autonivåer: ljushet och kontrast som ger alla foton ungefär samma
 * genomsnittsljus (≈ 0,48) och spridning (≈ 0,22). Exporteras för test.
 */
export function autoLevels(data: Uint8ClampedArray): { brightness: number; contrast: number } {
  let sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += l; sum2 += l * l; n++;
  }
  if (!n) return { brightness: 1, contrast: 1 };
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    brightness: Math.round(clamp(0.48 / Math.max(mean, 0.05), 0.7, 1.6) * 100) / 100,
    contrast: Math.round(clamp(0.22 / Math.max(std, 0.03), 0.8, 1.5) * 100) / 100,
  };
}

const hex = (c: string) => {
  const m = c.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

/** Justering och färgtoning av pixlarna (på plats). Exporteras för test. */
export function gradePixels(data: Uint8ClampedArray, s: CardSettings, skin: CardSkin) {
  const b = s.auto.brightness * s.adjust.brightness;
  const c = s.auto.contrast * s.adjust.contrast;
  const sat = s.adjust.saturation;
  const [sr, sg, sb] = hex(skin.tint.shadow);
  const [hr, hg, hb] = hex(skin.tint.highlight);
  // Färgtoningen: stilens styrka gånger kortets reglage, max helt tonat
  const k = Math.min(1, Math.max(0, skin.tint.strength * (s.adjust.tint ?? 1)));
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255, g = data[i + 1] / 255, bl = data[i + 2] / 255;
    // ljushet och kontrast kring mitten
    r = (r * b - 0.5) * c + 0.5; g = (g * b - 0.5) * c + 0.5; bl = (bl * b - 0.5) * c + 0.5;
    // mättnad
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat;
    // färgtoning: blanda mot stilens duoton efter ljusheten
    const t = Math.min(1, Math.max(0, l));
    const dr = (sr + (hr - sr) * t) / 255, dg = (sg + (hg - sg) * t) / 255, db = (sb + (hb - sb) * t) / 255;
    r = r + (dr - r) * k; g = g + (dg - g) * k; bl = bl + (db - bl) * k;
    data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[i + 2] = Math.round(Math.min(1, Math.max(0, bl)) * 255);
  }
}

/** Var i fotot som visas (källkoordinater) för en viss beskärning. Exporteras för test. */
export function photoSourceRect(imgW: number, imgH: number, boxW: number, boxH: number, photo: CardSettings["photo"]) {
  const boxRatio = boxW / boxH;
  // Zoom 1 = fotot täcker rutan precis
  let sw = imgW / imgH > boxRatio ? imgH * boxRatio : imgW;
  let sh = sw / boxRatio;
  sw /= photo.zoom; sh /= photo.zoom;
  const sx = Math.min(imgW - sw, Math.max(0, photo.x * imgW - sw / 2));
  const sy = Math.min(imgH - sh, Math.max(0, photo.y * imgH - sh / 2));
  return { sx, sy, sw, sh };
}

/** Lägger till en rundad rektangel i den aktuella banan (utan att börja en ny). */
function addRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Namn med C/A efter, lite upphöjt och mindre (som på hockeykort).
 * Namnet och märket får plats tillsammans och centreras som en grupp.
 */
function drawName(
  ctx: CanvasRenderingContext2D, name: string, captain: string, cx: number, y: number,
  maxW: number, startPx: number, minPx: number, color: string, capColor: string, spacing: string
) {
  let px = startPx;
  const measure = () => {
    ctx.font = `700 ${px}px ${HEAD}`;
    ctx.letterSpacing = spacing;
    const nw = ctx.measureText(name).width;
    ctx.letterSpacing = "0px";
    ctx.font = `700 ${Math.round(px * 0.56)}px ${HEAD}`;
    const cw = captain ? ctx.measureText(captain).width + px * 0.12 : 0;
    return { nw, cw };
  };
  let m = measure();
  while (px > minPx && m.nw + m.cw > maxW) { px -= 2; m = measure(); }
  const left = cx - (m.nw + m.cw) / 2;
  ctx.textAlign = "left";
  ctx.font = `700 ${px}px ${HEAD}`;
  ctx.letterSpacing = spacing;
  ctx.fillStyle = color;
  ctx.fillText(name, left, y);
  ctx.letterSpacing = "0px";
  if (captain) {
    ctx.font = `700 ${Math.round(px * 0.56)}px ${HEAD}`;
    ctx.fillStyle = capColor;
    // Upphöjt: ungefär i höjd med versalernas överkant
    const raise = ctx.textBaseline === "middle" ? px * 0.22 : px * 0.42;
    ctx.fillText(captain, left + m.nw + px * 0.12, y - raise);
  }
  ctx.textAlign = "center";
}

function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, start: number, min: number) {
  let px = start;
  ctx.font = font(px);
  while (px > min && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([`700 90px ${HEAD}`, `600 30px ${HEAD}`, `600 26px ${BODY}`, `400 20px ${BODY}`].map((f) => document.fonts.load(f).catch(() => undefined)));
}

export interface RenderInput {
  settings: CardSettings;
  photo: HTMLImageElement | ImageBitmap | null;
  /** Friläggningsmask i fotots proportioner: ljust = spelaren */
  mask?: HTMLImageElement | ImageBitmap | null;
  scale?: number; // 1 = 750×1050
}

/** Märket som ska ritas för kortet (hänsyn till äldre kort med showLogo=false). */
function cardLogo(s: CardSettings, skin: CardSkin): CardLogo | null {
  if (s.showLogo === false && (!s.logo || s.logo === "auto")) return null;
  return resolveLogo(s.logo, skin);
}

/** Ritar ett märke: runt som det är, eller städet i en ljus romb. */
async function drawLogo(ctx: CanvasRenderingContext2D, logo: CardLogo, cx: number, cy: number, size: number, paper: string, ink: string) {
  let img: HTMLImageElement | null = null;
  try { img = await loadImage(logo.url); } catch { return; }
  if (logo.shape === "diamond") {
    const h = size / 2;
    const diamond = (r: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    diamond(h); ctx.fillStyle = paper; ctx.fill();
    ctx.restore();
    diamond(h); ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.stroke();
    // Loggan har redan en tunn romb – rita den lite innanför
    const inset = h * 0.9;
    ctx.drawImage(img, cx - inset, cy - inset, inset * 2, inset * 2);
    return;
  }
  const r = size / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** Bakgrunden bakom en frilagd spelare: strålkastarljus i kortets färger med svaga diagonala linjer. */
function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, skin: CardSkin) {
  const center = skin.retro ? skin.retro.stripeB : skin.frame[1] ?? "#3a3a3a";
  const edge = skin.retro ? skin.retro.panel : skin.background;
  const g = ctx.createRadialGradient(w / 2, h * 0.38, w * 0.05, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  g.addColorStop(0, center);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, w / 180);
  for (let x = -h; x < w; x += w / 14) {
    ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke();
  }
  ctx.restore();
  // Mörkare nertill så att spelaren "står" i bilden
  const f = ctx.createLinearGradient(0, h * 0.6, 0, h);
  f.addColorStop(0, "rgba(0,0,0,0)");
  f.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Fotolagret: beskuret, justerat och färgtonat – och om det finns en mask och
 * friläggning är på: spelaren på kortets bakgrund (amount styr hur mycket av
 * originalbakgrunden som ersätts).
 */
function photoLayer(
  photo: HTMLImageElement | ImageBitmap, mask: HTMLImageElement | ImageBitmap | null | undefined,
  s: CardSettings, gradeSettings: CardSettings, skin: CardSkin, boxW: number, boxH: number, scale: number
): HTMLCanvasElement {
  const pw = Math.round(boxW * scale), ph = Math.round(boxH * scale);
  const r = photoSourceRect(photo.width, photo.height, boxW, boxH, s.photo);
  const tmp = env.createCanvas(pw, ph);
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(photo, r.sx, r.sy, r.sw, r.sh, 0, 0, pw, ph);
  const img = tctx.getImageData(0, 0, pw, ph);
  gradePixels(img.data, gradeSettings, skin);
  tctx.putImageData(img, 0, 0);

  const amount = s.cutout?.enabled && mask ? Math.min(1, Math.max(0, s.cutout.amount)) : 0;
  if (!amount || !mask) return tmp;

  // Masken i samma beskärning, omgjord till genomskinlighet
  const mx = mask.width / photo.width, my = mask.height / photo.height;
  const mc = env.createCanvas(pw, ph);
  const mctx = mc.getContext("2d", { willReadFrequently: true })!;
  mctx.drawImage(mask, r.sx * mx, r.sy * my, r.sw * mx, r.sh * my, 0, 0, pw, ph);
  const md = mctx.getImageData(0, 0, pw, ph);
  const pd = tctx.getImageData(0, 0, pw, ph);
  for (let i = 0; i < pd.data.length; i += 4) pd.data[i + 3] = md.data[i]; // rött = gråskala
  const person = env.createCanvas(pw, ph);
  person.getContext("2d")!.putImageData(pd, 0, 0);

  const out = env.createCanvas(pw, ph);
  const octx = out.getContext("2d")!;
  paintBackdrop(octx, pw, ph, skin);
  // Originalbakgrunden syns i den mån friläggningen inte är fullt på
  octx.globalAlpha = 1 - amount;
  octx.drawImage(tmp, 0, 0);
  octx.globalAlpha = 1;
  octx.drawImage(person, 0, 0);
  return out;
}

export async function renderCard(input: RenderInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  return skinById(input.settings.skin).layout === "retro" ? renderRetro(input) : renderModern(input);
}

async function renderModern({ settings: s, photo, mask, scale = 1 }: RenderInput): Promise<HTMLCanvasElement> {
  const skin = skinById(s.skin);
  const canvas = env.createCanvas(Math.round(CARD_W * scale), Math.round(CARD_H * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas stöds inte");
  ctx.scale(scale, scale);

  const R = 30; // hörnradie
  const B = 20; // ramens bredd
  const inner = { x: B, y: B, w: CARD_W - 2 * B, h: CARD_H - 2 * B };

  // Bakgrund
  ctx.fillStyle = skin.background;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();

  // Foto (beskuret, justerat, färgtonat)
  ctx.save();
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, R - 10);
  ctx.clip();
  if (photo) {
    ctx.drawImage(photoLayer(photo, mask, s, s, skin, inner.w, inner.h, scale), inner.x, inner.y, inner.w, inner.h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
    g.addColorStop(0, skin.frame[1]);
    g.addColorStop(1, skin.background);
    ctx.fillStyle = g;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `600 30px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Ladda upp ett foto", CARD_W / 2, CARD_H * 0.38);
  }
  // Vinjett och toning mot namnskylten
  const vig = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.38, CARD_W * 0.25, CARD_W / 2, CARD_H * 0.45, CARD_W * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  const fade = ctx.createLinearGradient(0, CARD_H * 0.52, 0, CARD_H);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.55, "rgba(0,0,0,0.55)");
  fade.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = fade;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  ctx.restore();

  // Lagmärke uppe till vänster
  const logo = cardLogo(s, skin);
  if (logo) await drawLogo(ctx, logo, inner.x + 28 + 56, inner.y + 28 + 56, 112, "#ece3cf", "#141414");

  // Nummer uppe till höger, position och C/A under
  const rightX = inner.x + inner.w - 34;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  if (s.number) {
    ctx.font = `700 118px ${HEAD}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(s.number, rightX, inner.y + 140);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(s.number, rightX, inner.y + 140);
  }
  let chipY = inner.y + (s.number ? 168 : 60);
  const chip = (text: string, bg: string, fg: string) => {
    ctx.font = `700 24px ${HEAD}`;
    ctx.letterSpacing = "2px";
    const w = ctx.measureText(text).width + 26;
    ctx.fillStyle = bg;
    roundRect(ctx, rightX - w, chipY, w, 38, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rightX - w / 2 + 1, chipY + 20);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = "0px";
    chipY += 48;
  };
  if (s.position) chip(s.position, skin.accent, skin.id === "svart" ? "#111" : "#0b1a0c");

  // Namnskylt och statistikruta
  const hasStats = s.statsMode !== "none" && (s.statsMode === "form" ? !!s.form : s.cells.length > 0);
  const panelH = hasStats ? 262 : 150;
  const panelY = inner.y + inner.h - panelH - 22;
  const panelX = inner.x + 22, panelW = inner.w - 44;

  ctx.textAlign = "center";
  const name = (s.name || "SPELARE").toUpperCase();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 16;
  drawName(ctx, name, s.captain, CARD_W / 2, panelY + 70, panelW - 20, 78, 40, "#ffffff", s.captain === "C" ? "#facc15" : "#fdba74", "3px");
  ctx.restore();

  // Linje under namnet
  ctx.fillStyle = skin.accent;
  ctx.fillRect(CARD_W / 2 - 60, panelY + 90, 120, 4);

  if (hasStats) {
    const boxY = panelY + 112;
    const boxH = panelH - 112;
    ctx.fillStyle = skin.panel;
    roundRect(ctx, panelX, boxY, panelW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = skin.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    roundRect(ctx, panelX, boxY, panelW, boxH, 16);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Rubrik (t.ex. säsongen)
    const title = (s.statsTitle || (s.statsMode === "form" ? "FORM" : "")).toUpperCase();
    if (title) {
      ctx.font = `600 18px ${BODY}`;
      ctx.letterSpacing = "4px";
      ctx.fillStyle = skin.accent;
      ctx.fillText(title, CARD_W / 2, boxY + 30);
      ctx.letterSpacing = "0px";
    }

    if (s.statsMode === "form" && s.form) {
      const n = s.form.length;
      const size = 34, gap = 8;
      const startX = CARD_W / 2 - (n * size + (n - 1) * gap) / 2;
      const color: Record<string, string> = { V: "#22c55e", O: "#9ca3af", F: "#ef4444" };
      s.form.split("").forEach((ch, i) => {
        const x = startX + i * (size + gap);
        ctx.fillStyle = color[ch] ?? "#555";
        roundRect(ctx, x, boxY + 58, size, size, 6);
        ctx.fill();
        ctx.fillStyle = "#0b0b0b";
        ctx.font = `700 20px ${HEAD}`;
        ctx.textBaseline = "middle";
        ctx.fillText(ch, x + size / 2, boxY + 58 + size / 2 + 1);
        ctx.textBaseline = "alphabetic";
      });
    } else {
      const cells = s.cells.slice(0, 5);
      const cw = panelW / cells.length;
      cells.forEach((c, i) => {
        const cx = panelX + cw * i + cw / 2;
        if (i > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(panelX + cw * i, boxY + (title ? 46 : 22), 1.5, boxH - (title ? 62 : 44));
        }
        ctx.fillStyle = skin.panelText;
        fit(ctx, c.value, (px) => `700 ${px}px ${HEAD}`, cw - 14, 50, 26);
        ctx.fillText(c.value, cx, boxY + (title ? 100 : 80));
        ctx.font = `600 17px ${BODY}`;
        ctx.letterSpacing = "2px";
        ctx.fillStyle = skin.accent;
        ctx.fillText(c.label.toUpperCase(), cx, boxY + (title ? 128 : 108));
        ctx.letterSpacing = "0px";
      });
    }
  }

  // Ram: metallisk gradient med tunn linje innanför
  ctx.save();
  const fg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  skin.frame.forEach((c, i) => fg.addColorStop(i / (skin.frame.length - 1), c));
  ctx.fillStyle = fg;
  // Ramen = yttre rektangel minus den inre (samma bana, udda-jämn-fyllning)
  ctx.beginPath();
  addRoundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  addRoundRect(ctx, inner.x, inner.y, inner.w, inner.h, R - 10);
  ctx.fill("evenodd");
  ctx.restore();
  ctx.strokeStyle = skin.accent;
  ctx.lineWidth = 2;
  roundRect(ctx, inner.x + 8, inner.y + 8, inner.w - 16, inner.h - 16, R - 16);
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Glans snett över kortet
  const sheen = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.10)");
  sheen.addColorStop(0.58, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();

  // Klubbens namn längst ner i ramen
  ctx.font = `600 14px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillStyle = skin.id === "vit" ? "rgba(20,28,36,0.8)" : "rgba(255,255,255,0.75)";
  ctx.textAlign = "center";
  ctx.fillText(clubHeading(), CARD_W / 2, CARD_H - 5);
  ctx.letterSpacing = "0px";

  return canvas;
}

// ─── Retro ───────────────────────────────────────────────────────────────────
// Matt, gammaldags samlarkort efter klubbens skisser: papperskant, ram med
// diagonala ränder och stjärnor, fotoruta med fasade hörn, namnskylt med
// nummer och position, och en statistiktabell.

/** Liten deterministisk slump så att samma kort får samma "slitage". */
function rng(seedText: string) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Fotorutans form: rundade övre hörn, fasade nedre hörn. */
function windowPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, cham: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - cham);
  ctx.lineTo(x + w - cham, y + h);
  ctx.lineTo(x + cham, y + h);
  ctx.lineTo(x, y + h - cham);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

/** Diagonalt band (parallellogram) mellan två linjer y = x + c (lutning 1). */
function band(ctx: CanvasRenderingContext2D, c1: number, c2: number, dir: 1 | -1) {
  const W = CARD_W, Hh = CARD_H;
  ctx.beginPath();
  if (dir === 1) {
    // går från nere till vänster upp till höger: y = -x + c
    ctx.moveTo(0, c1); ctx.lineTo(c1, 0); ctx.lineTo(c2, 0); ctx.lineTo(0, c2);
  } else {
    // spegelvänd: y = x - (W - c)
    ctx.moveTo(W, c1); ctx.lineTo(W - c1, 0); ctx.lineTo(W - c2, 0); ctx.lineTo(W, c2);
  }
  ctx.closePath();
  void Hh;
}

/** Papperskorn och repor, bara på det som redan är ritat. */
function wear(ctx: CanvasRenderingContext2D, seed: string, alpha: number) {
  const r = rng(seed);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 2600; i++) {
    const x = r() * CARD_W, y = r() * CARD_H;
    ctx.fillStyle = r() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  ctx.globalAlpha = alpha * 1.4;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 28; i++) {
    const x = r() * CARD_W, y = r() * CARD_H, len = 8 + r() * 40, a = r() * Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  ctx.restore();
}

/** En guldstjärna med gradient och mörk kontur. */
function goldStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  starPath(ctx, cx, cy, r);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, "#fff3c4");
  g.addColorStop(0.45, "#f2c94c");
  g.addColorStop(1, "#b8860b");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#3a2a06";
  ctx.stroke();
}

/** Skylt med 3/2/1 guldstjärnor och "FIRST/SECOND/THIRD STAR" (Stars of the Game-kort). */
function drawStarRibbon(ctx: CanvasRenderingContext2D, rank: 1 | 2 | 3, cx: number, top: number, c: RetroColors) {
  const count = 4 - rank;
  const r = 21, gap = 9;
  const starsW = count * r * 2 + (count - 1) * gap;
  const label = ["FIRST STAR", "SECOND STAR", "THIRD STAR"][rank - 1];
  ctx.font = `700 20px ${HEAD}`;
  ctx.letterSpacing = "5px";
  const labelW = ctx.measureText(label).width;
  ctx.letterSpacing = "0px";
  const w = Math.max(starsW, labelW) + 56, h = r * 2 + 44;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  ctx.fillStyle = c.panel;
  roundRect(ctx, cx - w / 2, top, w, h, 14);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#e9cf86"; ctx.lineWidth = 3;
  roundRect(ctx, cx - w / 2, top, w, h, 14);
  ctx.stroke();
  ctx.strokeStyle = "rgba(233,207,134,0.45)"; ctx.lineWidth = 1.5;
  roundRect(ctx, cx - w / 2 + 6, top + 6, w - 12, h - 12, 10);
  ctx.stroke();
  for (let i = 0; i < count; i++) goldStar(ctx, cx - starsW / 2 + r + i * (2 * r + gap), top + 14 + r, r);
  ctx.fillStyle = "#ecd592";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "5px";
  ctx.fillText(label, cx + 2, top + h - 17);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";
}

async function renderRetro({ settings: s, photo, mask, scale = 1 }: RenderInput): Promise<HTMLCanvasElement> {
  const skin = skinById(s.skin);
  const c = skin.retro!;
  const canvas = env.createCanvas(Math.round(CARD_W * scale), Math.round(CARD_H * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas stöds inte");
  ctx.scale(scale, scale);
  const seed = `${s.name}|${s.number}|${s.skin}`;

  // 1. Papper med tunn kontur
  ctx.fillStyle = c.paper;
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 34);
  ctx.fill();
  ctx.strokeStyle = c.ink; ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 34);
  ctx.stroke();

  // 2. Ramen (mörkt fält) med ränder och stjärnor
  const P = { x: 24, y: 24, w: CARD_W - 48, h: CARD_H - 48 };
  ctx.save();
  roundRect(ctx, P.x, P.y, P.w, P.h, 26);
  ctx.clip();
  ctx.fillStyle = c.panel;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Hörnet uppe till vänster: brett ljust, smalt färgat, smalt ljust
  ctx.fillStyle = c.stripeA; band(ctx, 150, 190, 1); ctx.fill();
  ctx.fillStyle = c.stripeB; band(ctx, 200, 222, 1); ctx.fill();
  ctx.fillStyle = c.stripeA; band(ctx, 232, 244, 1); ctx.fill();
  ctx.restore();
  // Chevroner på sidorna (övre och nedre par), bara i sidfälten – spegelvända på höger sida
  for (const dir of [1, -1] as const) {
    ctx.save();
    ctx.beginPath();
    if (dir === 1) ctx.rect(P.x, 250, 60, 500);
    else ctx.rect(CARD_W - P.x - 60, 250, 60, 500);
    ctx.clip();
    for (const top of [350, 700]) {
      ctx.fillStyle = c.stripeA; band(ctx, top, top + 14, dir); ctx.fill();
      ctx.fillStyle = c.stripeB; band(ctx, top + 26, top + 62, dir); ctx.fill();
      ctx.fillStyle = c.stripeA; band(ctx, top + 74, top + 88, dir); ctx.fill();
    }
    ctx.restore();
  }

  // Fotoruta
  // Stjärnkort: fotorutan börjar längre ner så att stjärnskylten ligger i ramen
  // ovanför fotot och aldrig över ansiktet. Nederkanten ligger kvar.
  const photoTop = s.starRank ? 146 : 96;
  const W = { x: 96, y: photoTop, w: CARD_W - 192, h: 742 - photoTop, r: 22, ch: 34 };
  // Ränderna ska bara synas i sidfälten – täck mitten med ramfärg under fotot
  ctx.fillStyle = c.panel;
  windowPath(ctx, W.x - 16, W.y - 16, W.w + 32, W.h + 32, W.r + 10, W.ch + 12);
  ctx.fill();
  // Dubbel kant runt fotot
  ctx.strokeStyle = c.onPanel; ctx.lineWidth = 3;
  windowPath(ctx, W.x - 10, W.y - 10, W.w + 20, W.h + 20, W.r + 8, W.ch + 8);
  ctx.stroke();
  ctx.strokeStyle = c.stripeB; ctx.lineWidth = 2;
  windowPath(ctx, W.x - 4, W.y - 4, W.w + 8, W.h + 8, W.r + 3, W.ch + 3);
  ctx.stroke();

  // Stjärnor på sidorna
  ctx.fillStyle = c.onPanel;
  for (const y of [462, 522, 582]) {
    starPath(ctx, 60, y, 17); ctx.fill();
    starPath(ctx, CARD_W - 60, y, 17); ctx.fill();
  }

  // Fotot: färgtonat, lite avmättat och med filmkorn för det matta uttrycket
  ctx.save();
  windowPath(ctx, W.x, W.y, W.w, W.h, W.r, W.ch);
  ctx.clip();
  if (photo) {
    const matte = { ...s, adjust: { ...s.adjust, saturation: s.adjust.saturation * 0.85 } };
    ctx.drawImage(photoLayer(photo, mask, s, matte, skin, W.w, W.h, scale), W.x, W.y, W.w, W.h);
    const vig = ctx.createRadialGradient(CARD_W / 2, W.y + W.h * 0.42, W.w * 0.3, CARD_W / 2, W.y + W.h * 0.5, W.w * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vig;
    ctx.fillRect(W.x, W.y, W.w, W.h);
  } else if (s.placeholderLogo) {
    // Inget foto: klubbens märke stort på kortets bakgrund
    const bg = env.createCanvas(Math.round(W.w), Math.round(W.h));
    paintBackdrop(bg.getContext("2d")!, W.w, W.h, skin);
    ctx.drawImage(bg, W.x, W.y, W.w, W.h);
    // Städet stort i mitten på guld (lagets märke sitter i hörnet)
    const big = resolveLogo("anvil", skin);
    if (big) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      await drawLogo(ctx, big, CARD_W / 2, W.y + W.h * 0.56, W.w * 0.62, c.paper, c.ink);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = "#f7f4ee";
    ctx.fillRect(W.x, W.y, W.w, W.h);
    ctx.fillStyle = "rgba(20,20,20,0.35)";
    ctx.font = `600 28px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Ladda upp ett foto", CARD_W / 2, W.y + W.h / 2);
  }
  ctx.restore();

  // Märket uppe till höger, över fotorutans hörn
  const logo = cardLogo(s, skin);
  if (logo) await drawLogo(ctx, logo, W.x + W.w - 18, W.y + 30, logo.shape === "diamond" ? 176 : 150, c.paper, c.ink);

  // Stars of the Game: 1–3 guldstjärnor på en skylt i toppen av fotot
  if (s.starRank) drawStarRibbon(ctx, s.starRank, CARD_W / 2, 34, c);

  // 3. Namnskylt, klubbrad, nummer och position
  const N = { x: 48, y: 762, w: 528, nameH: 80, subH: 46 };
  const box = (x: number, y: number, w: number, h: number, fill: string, r = 10) => {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  };
  box(N.x, N.y, N.w, N.nameH + N.subH, c.paper);
  // Klubbraden i ramens färg längst ner i skylten
  ctx.fillStyle = c.panel;
  roundRect(ctx, N.x + 6, N.y + N.nameH, N.w - 12, N.subH - 6, 6);
  ctx.fill();

  const name = (s.name || "SPELARE").toUpperCase();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawName(ctx, name, s.captain, N.x + N.w / 2, N.y + N.nameH / 2 + 3, N.w - 30, 74, 34, c.ink, c.ink, "1px");

  const sub = s.subtitle ?? club().name;
  if (sub) {
    const midY = N.y + N.nameH + (N.subH - 6) / 2;
    ctx.fillStyle = c.onPanel;
    fit(ctx, sub, (px) => `600 ${px}px ${BODY}`, N.w - 170, 30, 18);
    const tw = ctx.measureText(sub).width;
    ctx.fillText(sub, N.x + N.w / 2, midY + 1);
    ctx.fillRect(N.x + 30, midY, Math.max(0, N.w / 2 - tw / 2 - 48), 2.5);
    ctx.fillRect(N.x + N.w / 2 + tw / 2 + 18, midY, Math.max(0, N.w / 2 - tw / 2 - 48), 2.5);
  }

  // Nummer och position till höger
  const R = { x: N.x + N.w + 12, w: CARD_W - 48 - (N.x + N.w + 12) };
  box(R.x, N.y, R.w, 74, c.panel);
  if (s.number) {
    ctx.fillStyle = c.onPanel;
    ctx.save();
    ctx.translate(R.x + R.w / 2, N.y + 40);
    ctx.transform(1, 0, -0.15, 1, 0, 0); // kursivt
    fit(ctx, `#${s.number}`, (px) => `700 ${px}px ${HEAD}`, R.w - 16, 60, 30);
    ctx.fillText(`#${s.number}`, 0, 0);
    ctx.restore();
  }
  box(R.x, N.y + 82, R.w, N.nameH + N.subH - 82, c.paper);
  const pos = s.position;
  if (pos) {
    ctx.fillStyle = c.ink;
    ctx.save();
    ctx.translate(R.x + R.w / 2, N.y + 82 + (N.nameH + N.subH - 82) / 2 + 2);
    ctx.transform(1, 0, -0.15, 1, 0, 0);
    fit(ctx, pos, (px) => `700 ${px}px ${HEAD}`, R.w - 16, 34, 18);
    ctx.fillText(pos, 0, 0);
    ctx.restore();
  }

  // 4. Statistiktabell
  const T = { x: 48, y: 900, w: CARD_W - 96, headH: 40, valH: 60 };
  const hasTable = s.statsMode !== "none" && (s.statsMode === "form" ? !!s.form : s.cells.length > 0);
  if (hasTable) {
    box(T.x, T.y, T.w, T.headH + T.valH, c.paper, 10);
    ctx.fillStyle = c.panel;
    ctx.save();
    roundRect(ctx, T.x, T.y, T.w, T.headH + T.valH, 10);
    ctx.clip();
    ctx.fillRect(T.x, T.y, T.w, T.headH);
    ctx.restore();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 3;
    roundRect(ctx, T.x, T.y, T.w, T.headH + T.valH, 10);
    ctx.stroke();

    if (s.statsMode === "form" && s.form) {
      ctx.fillStyle = c.onPanel;
      ctx.font = `700 22px ${HEAD}`;
      ctx.letterSpacing = "3px";
      ctx.fillText("FORM – SENASTE MATCHERNA", CARD_W / 2, T.y + T.headH / 2 + 1);
      ctx.letterSpacing = "0px";
      const n = s.form.length, size = 36, gap = 10;
      const startX = CARD_W / 2 - (n * size + (n - 1) * gap) / 2;
      const col: Record<string, string> = { V: "#2e7d32", O: "#8a8a8a", F: "#b3261e" };
      s.form.split("").forEach((ch, i) => {
        const x = startX + i * (size + gap), y = T.y + T.headH + (T.valH - size) / 2;
        ctx.fillStyle = col[ch] ?? "#555";
        roundRect(ctx, x, y, size, size, 5); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 22px ${HEAD}`;
        ctx.fillText(ch, x + size / 2, y + size / 2 + 1);
      });
    } else {
      const cells = s.cells.slice(0, 5);
      const cw = T.w / cells.length;
      cells.forEach((cell, i) => {
        const cx = T.x + cw * i + cw / 2;
        if (i > 0) {
          ctx.fillStyle = c.onPanel;
          ctx.fillRect(T.x + cw * i - 1, T.y + 8, 2, T.headH - 16);
          ctx.fillStyle = c.ink;
          ctx.fillRect(T.x + cw * i - 1, T.y + T.headH + 6, 2, T.valH - 12);
        }
        ctx.fillStyle = c.onPanel;
        ctx.font = `700 22px ${HEAD}`;
        ctx.letterSpacing = "1px";
        ctx.fillText(cell.label.toUpperCase(), cx, T.y + T.headH / 2 + 1);
        ctx.letterSpacing = "0px";
        ctx.fillStyle = c.ink;
        fit(ctx, cell.value || "–", (px) => `700 ${px}px ${HEAD}`, cw - 14, 38, 20);
        ctx.fillText(cell.value || "–", cx, T.y + T.headH + T.valH / 2 + 2);
      });
    }
    // Säsong/karriär som liten text under tabellen
    if (s.statsTitle && s.statsMode !== "form") {
      ctx.fillStyle = c.onPanel;
      ctx.globalAlpha = 0.7;
      ctx.font = `600 15px ${BODY}`;
      ctx.letterSpacing = "3px";
      ctx.fillText(s.statsTitle.toUpperCase(), CARD_W / 2, T.y + T.headH + T.valH + 13);
      ctx.letterSpacing = "0px";
      ctx.globalAlpha = 1;
    }
  }
  ctx.textBaseline = "alphabetic";

  // 5. Slitage över allt för det matta, gamla uttrycket
  ctx.save();
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 34);
  ctx.clip();
  wear(ctx, seed, 0.08);
  ctx.restore();

  // 6. Specialkort: folieglans i två diagonala stråk över hela kortet
  if (skin.foil) {
    ctx.save();
    roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 34);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    g.addColorStop(0.0, "rgba(255,230,160,0)");
    g.addColorStop(0.28, "rgba(255,230,160,0.22)");
    g.addColorStop(0.34, "rgba(255,255,255,0.05)");
    g.addColorStop(0.62, "rgba(255,220,140,0)");
    g.addColorStop(0.72, "rgba(255,236,180,0.18)");
    g.addColorStop(1.0, "rgba(255,220,140,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.restore();
  }

  return canvas;
}
