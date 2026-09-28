/**
 * Matchrapport för Instagram: två bilder i 4:5 (1080×1350), som ett karusellinlägg.
 *  1. Resultatet: logotyper, stort resultat, vinnare, poängbäst, sponsorer.
 *  2. Målen: alla mål i tidsordning med ställning, målskytt och assist.
 *     Raderna anpassas efter antalet mål; många mål ger två kolumner.
 */
import { loadImage, roundRect } from "@/lib/canvas";

export const IG_W = 1080;
export const IG_H = 1350;

export interface ReportGoal {
  team: "white" | "green";
  time?: string; // "HH:MM" eller "HH:MM:SS"
  scorer?: string;
  assist?: string;
  penalty?: boolean;
}

export interface ReportData {
  whiteName: string;
  greenName: string;
  whiteScore: number;
  greenScore: number;
  dateLine: string; // "Tisdag 29/9"
  goals: ReportGoal[]; // i tidsordning, äldst först
  topScorer?: { name: string; goals: number; assists: number } | null;
  sponsors: Array<{ name: string; logo: string | null }>;
  logoWhite: string;
  logoGreen: string;
  background: string;
}

const HEAD = "'Oswald', sans-serif";
const BODY = "'Inter', sans-serif";
const WHITE = "#e2e8f0";
const GREEN = "#34d399";

async function tryLoad(src: string | null | undefined) {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [`700 200px ${HEAD}`, `600 40px ${HEAD}`, `600 34px ${BODY}`, `400 26px ${BODY}`, `500 28px ${BODY}`].map((f) =>
      document.fonts.load(f).catch(() => undefined)
    )
  );
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = IG_W;
  c.height = IG_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte");
  return [c, ctx];
}

function backdrop(ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null, dim = 0.62) {
  ctx.fillStyle = "#0b1410";
  ctx.fillRect(0, 0, IG_W, IG_H);
  if (bg) {
    const s = Math.max(IG_W / bg.width, IG_H / bg.height);
    ctx.drawImage(bg, (IG_W - bg.width * s) / 2, (IG_H - bg.height * s) / 2, bg.width * s, bg.height * s);
  }
  ctx.fillStyle = `rgba(0,0,0,${dim})`;
  ctx.fillRect(0, 0, IG_W, IG_H);
  // Mörkare nertill för texten
  const g = ctx.createLinearGradient(0, IG_H * 0.55, 0, IG_H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, IG_W, IG_H);
}

function header(ctx: CanvasRenderingContext2D, title: string, dateLine: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText("STÅLSTADENS SF", IG_W / 2, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 64px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(title, IG_W / 2, 190);
  ctx.letterSpacing = "2px";
  ctx.font = `500 30px ${BODY}`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(dateLine, IG_W / 2, 240);
  ctx.letterSpacing = "0px";
}

function logo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number, ring: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = ring;
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.stroke();
}

function sponsorsRow(ctx: CanvasRenderingContext2D, sponsors: Array<{ name: string; img: HTMLImageElement | null }>, y: number) {
  if (!sponsors.length) return;
  ctx.textAlign = "center";
  ctx.font = `600 22px ${BODY}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("MATCHENS SPONSORER", IG_W / 2, y);
  ctx.letterSpacing = "0px";

  const items = sponsors.slice(0, 4);
  const slotW = Math.min(240, (IG_W - 160) / items.length);
  const startX = IG_W / 2 - (slotW * items.length) / 2;
  items.forEach((s, i) => {
    const cx = startX + slotW * i + slotW / 2;
    const cy = y + 62;
    if (s.img) {
      const scale = Math.min(56 / s.img.height, (slotW - 30) / s.img.width);
      ctx.drawImage(s.img, cx - (s.img.width * scale) / 2, cy - (s.img.height * scale) / 2, s.img.width * scale, s.img.height * scale);
    } else {
      ctx.font = `700 34px ${HEAD}`;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, s.name, slotW - 20), cx, cy);
      ctx.textBaseline = "alphabetic";
    }
  });
}

/** Bild 1: resultatet */
export async function renderResultImage(d: ReportData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [bg, lw, lg, ...sp] = await Promise.all([
    tryLoad(d.background), tryLoad(d.logoWhite), tryLoad(d.logoGreen), ...d.sponsors.map((s) => tryLoad(s.logo)),
  ]);
  const [c, ctx] = canvas();
  backdrop(ctx, bg);
  header(ctx, "SLUTRESULTAT", d.dateLine);

  const whiteWon = d.whiteScore > d.greenScore;
  const greenWon = d.greenScore > d.whiteScore;
  const cy = 560;
  logo(ctx, lw, 250, cy, 130, whiteWon ? WHITE : "rgba(226,232,240,0.35)");
  logo(ctx, lg, IG_W - 250, cy, 130, greenWon ? GREEN : "rgba(52,211,153,0.35)");

  ctx.textAlign = "center";
  ctx.font = `700 46px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillStyle = WHITE;
  ctx.fillText(d.whiteName.toUpperCase(), 250, cy + 205);
  ctx.fillStyle = GREEN;
  ctx.fillText(d.greenName.toUpperCase(), IG_W - 250, cy + 205);
  ctx.letterSpacing = "0px";

  // Resultatet
  ctx.font = `700 230px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = whiteWon ? "#ffffff" : "rgba(255,255,255,0.55)";
  ctx.textAlign = "right";
  ctx.fillText(String(d.whiteScore), IG_W / 2 - 34, cy + 4);
  ctx.textAlign = "left";
  ctx.fillStyle = greenWon ? GREEN : "rgba(255,255,255,0.55)";
  ctx.fillText(String(d.greenScore), IG_W / 2 + 34, cy + 4);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `700 110px ${HEAD}`;
  ctx.fillText("–", IG_W / 2, cy);
  ctx.textBaseline = "alphabetic";

  // Vinnare
  const verdict = whiteWon ? `${d.whiteName.toUpperCase()} VANN` : greenWon ? `${d.greenName.toUpperCase()} VANN` : "OAVGJORT";
  const verdictColor = whiteWon ? WHITE : greenWon ? GREEN : "rgba(255,255,255,0.8)";
  ctx.font = `700 40px ${HEAD}`;
  ctx.letterSpacing = "8px";
  const vw = ctx.measureText(verdict).width + 70;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, IG_W / 2 - vw / 2, 850, vw, 72, 36);
  ctx.fill();
  ctx.strokeStyle = verdictColor;
  ctx.lineWidth = 2;
  roundRect(ctx, IG_W / 2 - vw / 2, 850, vw, 72, 36);
  ctx.stroke();
  ctx.fillStyle = verdictColor;
  ctx.textBaseline = "middle";
  ctx.fillText(verdict, IG_W / 2 + 4, 887);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";

  // Matchens poängbäst
  if (d.topScorer) {
    ctx.font = `600 24px ${BODY}`;
    ctx.letterSpacing = "4px";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("MATCHENS POÄNGBÄST", IG_W / 2, 1000);
    ctx.letterSpacing = "0px";
    ctx.font = `700 50px ${HEAD}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(fit(ctx, d.topScorer.name, IG_W - 200), IG_W / 2, 1062);
    ctx.font = `500 28px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const parts = [
      d.topScorer.goals ? `${d.topScorer.goals} ${d.topScorer.goals === 1 ? "mål" : "mål"}` : "",
      d.topScorer.assists ? `${d.topScorer.assists} assist` : "",
    ].filter(Boolean).join(" · ");
    ctx.fillText(parts, IG_W / 2, 1104);
  }

  sponsorsRow(ctx, d.sponsors.map((s, i) => ({ name: s.name, img: sp[i] })), 1190);
  return c;
}

/** Hur målraderna ska se ut för ett visst antal mål (exporteras för test). */
export function goalsLayout(n: number, top = 300, bottom = IG_H - 90) {
  const avail = bottom - top;
  const columns = n > 12 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(n / columns));
  const rowH = Math.min(118, Math.floor(avail / perCol));
  const scale = Math.max(0.55, Math.min(1, rowH / 118));
  return { columns, perCol, rowH, scale, top: top + Math.max(0, Math.floor((avail - perCol * rowH) / 2)) };
}

/** Bild 2: målen */
export async function renderGoalsImage(d: ReportData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [bg] = await Promise.all([tryLoad(d.background)]);
  const [c, ctx] = canvas();
  backdrop(ctx, bg, 0.72);
  header(ctx, "MÅLEN", `${d.whiteName} ${d.whiteScore}–${d.greenScore} ${d.greenName} · ${d.dateLine}`);

  if (d.goals.length === 0) {
    ctx.textAlign = "center";
    ctx.font = `600 44px ${HEAD}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("Mållöst", IG_W / 2, IG_H / 2);
    return c;
  }

  const L = goalsLayout(d.goals.length);
  const margin = 60;
  const gap = 24;
  const colW = (IG_W - margin * 2 - gap * (L.columns - 1)) / L.columns;
  let w = 0;
  let g = 0;

  d.goals.forEach((goal, i) => {
    if (goal.team === "white") w++;
    else g++;
    const col = Math.floor(i / L.perCol);
    const row = i % L.perCol;
    const x = margin + col * (colW + gap);
    const y = L.top + row * L.rowH;
    const h = L.rowH - Math.max(6, 12 * L.scale);
    const color = goal.team === "white" ? WHITE : GREEN;
    const s = L.scale;

    // Rad med lagfärg i kanten
    ctx.save();
    roundRect(ctx, x, y, colW, h, 14 * s);
    ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, colW, h);
    ctx.fillStyle = goal.team === "white" ? "rgba(226,232,240,0.08)" : "rgba(52,211,153,0.10)";
    ctx.fillRect(x, y, colW, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 8, h);
    ctx.restore();

    const mid = y + h / 2;
    ctx.textBaseline = "middle";

    // Ställning efter målet
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(40 * s)}px ${HEAD}`;
    const scoreX = x + 30 * s + 60 * s;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("–", scoreX, mid);
    ctx.textAlign = "right";
    ctx.fillStyle = goal.team === "white" ? "#ffffff" : "rgba(255,255,255,0.6)";
    ctx.fillText(String(w), scoreX - 12 * s, mid);
    ctx.textAlign = "left";
    ctx.fillStyle = goal.team === "green" ? GREEN : "rgba(255,255,255,0.6)";
    ctx.fillText(String(g), scoreX + 12 * s, mid);

    // Målskytt och assist
    const textX = x + 190 * s;
    const right = x + colW - 24 * s;
    // Två kolumner: namnet får platsen i stället för klockslaget
    const timeText = goal.time && L.columns === 1 ? goal.time.slice(0, 5) : "";
    ctx.font = `400 ${Math.round(24 * s)}px ${BODY}`;
    const timeW = timeText ? ctx.measureText(timeText).width + 16 : 0;
    const tagText = goal.penalty ? "STRAFF" : "";
    ctx.font = `700 ${Math.round(18 * s)}px ${BODY}`;
    const tagW = tagText ? ctx.measureText(tagText).width + 22 * s + 12 : 0;
    const maxText = right - textX - timeW - tagW;

    const hasAssist = !!goal.assist && h > 60;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(34 * s)}px ${BODY}`;
    ctx.fillText(fit(ctx, goal.scorer || "Okänd målskytt", maxText), textX, hasAssist ? mid - 16 * s : mid);
    if (hasAssist) {
      ctx.font = `400 ${Math.round(24 * s)}px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(fit(ctx, `Assist: ${goal.assist}`, maxText), textX, mid + 20 * s);
    }

    // Straff-märke och tid
    let rx = right;
    if (timeText) {
      ctx.textAlign = "right";
      ctx.font = `400 ${Math.round(24 * s)}px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(timeText, rx, mid);
      rx -= timeW;
    }
    if (tagText) {
      ctx.font = `700 ${Math.round(18 * s)}px ${BODY}`;
      const tw = ctx.measureText(tagText).width + 22 * s;
      const th = 30 * s;
      ctx.fillStyle = "#ef4444";
      roundRect(ctx, rx - tw, mid - th / 2, tw, th, 6);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(tagText, rx - tw / 2, mid + 1);
    }
    ctx.textBaseline = "alphabetic";
  });

  return c;
}
