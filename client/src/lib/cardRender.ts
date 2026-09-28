/**
 * Ritar ett hockeykort i klassiskt format (5:7) på canvas.
 *
 * Lager: foto (beskuret, justerat och färgtonat efter stilen) → vinjett →
 * mörk toning nertill → lagmärke och nummer → namnskylt → statistikruta →
 * ram → glans. Bildbehandlingen görs pixel för pixel så att resultatet blir
 * likadant i alla webbläsare.
 */
import { loadImage, roundRect } from "@/lib/canvas";
import { skinById, type CardSkin } from "@/lib/cardSkins";

export const CARD_W = 750;
export const CARD_H = 1050;

export interface CardCell { label: string; value: string }

export interface CardSettings {
  skin: string;
  /** Beskärning: zoom (1 = hela bredden), fotots mittpunkt som andel (0–1) */
  photo: { zoom: number; x: number; y: number };
  /** Egna justeringar ovanpå autonivåerna (1 = oförändrat) */
  adjust: { brightness: number; contrast: number; saturation: number };
  /** Autonivåer räknade ur fotot när det laddades upp */
  auto: { brightness: number; contrast: number };
  name: string;
  number: string;
  position: string;
  captain: "" | "C" | "A";
  showLogo: boolean;
  statsMode: "season" | "career" | "form" | "custom" | "none";
  statsTitle: string;
  cells: CardCell[];
  form?: string;
}

export const DEFAULT_SETTINGS: CardSettings = {
  skin: "gron",
  photo: { zoom: 1, x: 0.5, y: 0.4 },
  adjust: { brightness: 1, contrast: 1, saturation: 1 },
  auto: { brightness: 1, contrast: 1 },
  name: "",
  number: "",
  position: "",
  captain: "",
  showLogo: true,
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
  const k = skin.tint.strength;
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
  logoUrl?: string;
  scale?: number; // 1 = 750×1050
}

export async function renderCard({ settings: s, photo, logoUrl, scale = 1 }: RenderInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const skin = skinById(s.skin);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(CARD_W * scale);
  canvas.height = Math.round(CARD_H * scale);
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
    const pw = Math.round(inner.w * scale), ph = Math.round(inner.h * scale);
    const tmp = document.createElement("canvas");
    tmp.width = pw; tmp.height = ph;
    const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
    const r = photoSourceRect(photo.width, photo.height, inner.w, inner.h, s.photo);
    tctx.drawImage(photo, r.sx, r.sy, r.sw, r.sh, 0, 0, pw, ph);
    const img = tctx.getImageData(0, 0, pw, ph);
    gradePixels(img.data, s, skin);
    tctx.putImageData(img, 0, 0);
    ctx.drawImage(tmp, inner.x, inner.y, inner.w, inner.h);
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
  if (s.showLogo && logoUrl) {
    try {
      const logo = await loadImage(logoUrl);
      const lr = 52, lx = inner.x + 28 + lr, ly = inner.y + 28 + lr;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, lx - lr, ly - lr, lr * 2, lr * 2);
      ctx.restore();
      ctx.beginPath(); ctx.arc(lx, ly, lr + 2, 0, Math.PI * 2);
      ctx.strokeStyle = skin.accent; ctx.lineWidth = 3; ctx.stroke();
    } catch { /* utan logga */ }
  }

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
  if (s.captain) chip(s.captain, s.captain === "C" ? "#facc15" : "#fb923c", "#111");

  // Namnskylt och statistikruta
  const hasStats = s.statsMode !== "none" && (s.statsMode === "form" ? !!s.form : s.cells.length > 0);
  const panelH = hasStats ? 262 : 150;
  const panelY = inner.y + inner.h - panelH - 22;
  const panelX = inner.x + 22, panelW = inner.w - 44;

  ctx.textAlign = "center";
  const name = (s.name || "SPELARE").toUpperCase();
  ctx.fillStyle = "#ffffff";
  ctx.letterSpacing = "3px";
  fit(ctx, name, (px) => `700 ${px}px ${HEAD}`, panelW - 20, 78, 40);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 16;
  ctx.fillText(name, CARD_W / 2, panelY + 70);
  ctx.restore();
  ctx.letterSpacing = "0px";

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
  ctx.fillText("STÅLSTADENS SF", CARD_W / 2, CARD_H - 5);
  ctx.letterSpacing = "0px";

  return canvas;
}

/** Laddar ett foto från fil, förminskar till max 1200 px och ger JPEG (base64) + autonivåer. */
export async function prepareSourcePhoto(file: File): Promise<{ base64: string; auto: CardSettings["auto"] }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("Bilden kunde inte läsas"));
        i.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  });
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const auto = autoLevels(ctx.getImageData(0, 0, c.width, c.height).data);
  let q = 0.86;
  let dataUrl = c.toDataURL("image/jpeg", q);
  while (dataUrl.length > 1_400_000 && q > 0.5) {
    q -= 0.08;
    dataUrl = c.toDataURL("image/jpeg", q);
  }
  return { base64: dataUrl.split(",")[1] ?? "", auto };
}
