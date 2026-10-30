/**
 * Delningsbilder för statistiken: tabeller/topplistor, finalen och mästarbilden.
 * Samma stil och format som matchrapporten (4:5 för flödet, 9:16 för Story).
 * Bakgrunden väljs bland Medias bakgrunder.
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, ensureFonts, fit, canvas, backdrop, contentArea, frameHeight, header, logo, type PostFormat } from "@/lib/matchReportImages";
import { roundRect } from "@/lib/canvas";

export const STATS_BACKGROUND = "/images/background.jpg";
export const TROPHY = "/images/pokal.jpg";

/** Bakgrund: bild och hur mycket den mörkas (0–1) */
export interface ShareBackground { url: string; dim: number }
const DEFAULT_BG: ShareBackground = { url: STATS_BACKGROUND, dim: 0.68 };

export interface ShareColumn { label: string }
export interface ShareRow {
  rank?: string;
  name: string;
  sub?: string;
  /** Liten logga före namnet (t.ex. lagen i tabellen) */
  logo?: string | null;
  /** Namnets färg (t.ex. lagets färg) */
  color?: string;
  cells: string[];
}
export interface ShareTableData {
  title: string;
  /** Rad under rubriken, t.ex. "Säsong 26/27" */
  subtitle: string;
  columns: ShareColumn[];
  rows: ShareRow[];
  /** Kolumnen som är sorterad/viktigast (fet och i accentfärg) */
  highlight?: number;
  /** Förklaring längst ner, t.ex. "2 p för vinst, 1 p för oavgjort" */
  note?: string;
  format?: PostFormat;
  background?: ShareBackground;
}

export interface ShareFinalTeam { name: string; logo: string | null; color: string; wins: number; seed?: string }
export interface ShareFinalData {
  /** "FINAL 26/27" */
  title: string;
  /** Ettan i grundserien till vänster, tvåan till höger */
  left: ShareFinalTeam;
  right: ShareFinalTeam;
  ties: number;
  matches: Array<{ date: string; left: number; right: number }>;
  /** Vinnaren när finalen är avgjord */
  winner?: "left" | "right" | null;
  trophy?: string;
  format?: PostFormat;
  background?: ShareBackground;
}

export interface ShareChampionsData {
  /** "26/27" */
  season: string;
  team: { name: string; logo: string | null; color: string };
  /** Rader under säsongsplattan, t.ex. ["1:a i serien", "15 poäng", "Finalen 3–2"] */
  lines: string[];
  /** Bara namnen, i ordning (C, A, sedan flest matcher) */
  players: Array<{ name: string }>;
  minMatches: number;
  trophy?: string;
  format?: PostFormat;
}

const ACCENT = "#e9c46a";
const MAX_ROWS = 10;

/** Text som krymps tills den ryms (aldrig mindre än minPx). */
function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, px: number, font: (px: number) => string, minPx = 14) {
  let p = px;
  ctx.font = font(p);
  while (p > minPx && ctx.measureText(text).width > max) {
    p -= 1;
    ctx.font = font(p);
  }
  return p;
}

/** Tabell eller topplista (högst 10 rader). Kolumnerna får den bredd innehållet behöver. */
export async function renderStatsTable(d: ShareTableData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const rows = d.rows.slice(0, MAX_ROWS);
  const bgc = d.background ?? DEFAULT_BG;
  const [bg, ...logos] = await Promise.all([tryLoad(bgc.url), ...rows.map((r) => tryLoad(r.logo ?? null))]);
  const [c, ctx] = canvas(frameHeight(d.format));
  backdrop(ctx, bg, bgc.dim);
  contentArea(ctx);
  header(ctx, fit(ctx, d.title.toUpperCase(), IG_W - 120), d.subtitle);

  const px = 50, pw = IG_W - 2 * px;
  const top = 290, bottom = IG_H - (d.note ? 90 : 60);
  const headH = 64;
  // Få rader (t.ex. tabellen med två lag) blir större och hamnar högre upp
  const rowH = Math.min(rows.length <= 3 ? 124 : 96, Math.floor((bottom - top - headH - 20) / Math.max(1, rows.length)));
  const s = Math.max(0.72, Math.min(1.2, rowH / 96));
  const panelH = headH + rows.length * rowH + 20;
  const py = top + Math.min(80, Math.max(0, (bottom - top - panelH) / 2));

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "rgba(8,12,14,0.72)";
  roundRect(ctx, px, py, pw, panelH, 30);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, panelH, 30);
  ctx.stroke();

  // Kolumnbredd efter längsta värdet/rubriken; krymp allt om det inte ryms bredvid namnet
  const n = d.columns.length;
  const hasRank = rows.some((r) => r.rank !== "");
  const nameX = px + (hasRank ? 108 : 36);
  const valFont = (ci: number, k: number) => `${ci === d.highlight ? 700 : 500} ${Math.round((ci === d.highlight ? 38 : 32) * s * k)}px ${HEAD}`;
  const headFont = (k: number) => `700 ${Math.round(22 * Math.min(1, s + 0.1) * k)}px ${HEAD}`;
  const measure = (k: number) => d.columns.map((col, ci) => {
    ctx.font = headFont(k);
    let w = ctx.measureText(col.label.toUpperCase()).width + 8;
    ctx.font = valFont(ci, k);
    for (const r of rows) w = Math.max(w, ctx.measureText(r.cells[ci] ?? "").width);
    return Math.max(56 * k, w + 26 * k);
  });
  const maxCols = pw - 28 - (nameX - px) - 240;
  let k = 1;
  let widths = measure(1);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > maxCols) {
    k = Math.max(0.6, maxCols / total);
    widths = measure(k).map((w) => w * Math.min(1, maxCols / measure(k).reduce((a, b) => a + b, 0)));
  }
  const right = px + pw - 28;
  const colX = (i: number) => right - widths.slice(i + 1).reduce((a, b) => a + b, 0) - widths[i] / 2;
  const colsLeft = right - widths.reduce((a, b) => a + b, 0);

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.letterSpacing = "2px";
  d.columns.forEach((col, i) => {
    ctx.fillStyle = i === d.highlight ? ACCENT : "rgba(255,255,255,0.55)";
    fitFont(ctx, col.label.toUpperCase(), widths[i] - 6, Math.round(22 * Math.min(1, s + 0.1) * k), (p) => `700 ${p}px ${HEAD}`, 12);
    ctx.fillText(col.label.toUpperCase(), colX(i), py + headH / 2 + 4);
  });
  ctx.letterSpacing = "0px";

  rows.forEach((r, i) => {
    const y = py + headH + i * rowH;
    const mid = y + rowH / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      roundRect(ctx, px + 12, y + 3, pw - 24, rowH - 6, 12);
      ctx.fill();
    }
    if (hasRank) {
      const medal = i === 0 ? ACCENT : i === 1 ? "#cbd5e1" : i === 2 ? "#d4915a" : "rgba(255,255,255,0.45)";
      ctx.textAlign = "center";
      ctx.fillStyle = medal;
      ctx.font = `700 ${Math.round(34 * s)}px ${HEAD}`;
      ctx.fillText(r.rank ?? String(i + 1), px + 60, mid + 1);
    }
    let tx = nameX;
    const lg = logos[i];
    if (r.logo !== undefined) {
      const lr = Math.round(rowH * 0.32);
      logo(ctx, lg, tx + lr, mid, lr, r.color ?? "#ffffff");
      tx += lr * 2 + 22;
    }
    // Värdena
    r.cells.forEach((v, ci) => {
      ctx.textAlign = "center";
      ctx.fillStyle = ci === d.highlight ? "#ffffff" : "rgba(255,255,255,0.82)";
      const base = Math.round((ci === d.highlight ? 38 : 32) * s * k);
      fitFont(ctx, v, widths[ci] - 10, base, (p) => `${ci === d.highlight ? 700 : 500} ${p}px ${HEAD}`, 14);
      ctx.fillText(v, colX(ci), mid + 1);
    });
    // Namn (och underrad)
    const maxName = colsLeft - tx - 16;
    const hasSub = !!r.sub && rowH >= 70;
    ctx.textAlign = "left";
    ctx.fillStyle = r.color ?? "#ffffff";
    ctx.font = `600 ${Math.round(32 * s)}px ${BODY}`;
    ctx.fillText(fit(ctx, r.name, maxName), tx, hasSub ? mid - 13 * s : mid + 1);
    if (hasSub) {
      ctx.font = `400 ${Math.round(21 * s)}px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(fit(ctx, r.sub!, maxName), tx, mid + 18 * s);
    }
  });
  if (!rows.length) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 32px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Ingen statistik för perioden", IG_W / 2, py + panelH / 2);
  }
  if (d.note) {
    ctx.textAlign = "center";
    ctx.font = `400 22px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(fit(ctx, d.note, IG_W - 120), IG_W / 2, IG_H - 50);
  }
  ctx.textBaseline = "alphabetic";
  return c;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** Pokalen: bildens mörka bakgrund försvinner mot en mörk bakgrund ("lighten"). */
function drawTrophy(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, y: number, h: number) {
  if (!img) return 0;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.globalCompositeOperation = "lighten";
  ctx.drawImage(img, cx - w / 2, y, w, h);
  ctx.restore();
  return w;
}

/** Finalen: ettan i serien till vänster, tvåan till höger och pokalen mellan dem. */
export async function renderFinal(d: ShareFinalData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const bgc = d.background ?? { ...DEFAULT_BG, dim: 0.74 };
  const [bg, ll, lr, trophy] = await Promise.all([tryLoad(bgc.url), tryLoad(d.left.logo), tryLoad(d.right.logo), tryLoad(d.trophy ?? TROPHY)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  backdrop(ctx, bg, bgc.dim);
  contentArea(ctx);

  // Rubrik
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(d.winner ? "AVGJORD" : d.matches.length ? "SLUTSPEL" : "SLUTSPEL · INTE STARTAT", IG_W / 2, 110);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 96px ${HEAD}`;
  ctx.letterSpacing = "8px";
  ctx.fillText(d.title.toUpperCase(), IG_W / 2, 210);
  ctx.letterSpacing = "0px";

  // Slutspelsträd: linjer från lagen in mot pokalen
  const th = 560, ty = 250;
  const cy = ty + th / 2 - 40, r = 120, lx = 190;
  ctx.strokeStyle = "rgba(233,196,106,0.35)";
  ctx.lineWidth = 4;
  for (const x of [lx + r + 14, IG_W - lx - r - 14]) {
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x < IG_W / 2 ? IG_W / 2 - 110 : IG_W / 2 + 110, cy);
    ctx.stroke();
  }
  drawTrophy(ctx, trophy, IG_W / 2, ty, th);

  const side = (t: ShareFinalTeam, img: HTMLImageElement | null, x: number, key: "left" | "right") => {
    const lost = !!d.winner && d.winner !== key;
    const won = d.winner === key;
    logo(ctx, img, x, cy, r, lost ? t.color + "59" : won ? ACCENT : t.color);
    ctx.textAlign = "center";
    ctx.fillStyle = lost ? "rgba(255,255,255,0.45)" : t.color;
    ctx.font = `700 42px ${HEAD}`;
    ctx.letterSpacing = "5px";
    ctx.fillText(fit(ctx, t.name.toUpperCase(), 2 * lx - 40), x, cy + r + 66);
    ctx.letterSpacing = "0px";
    if (t.seed) {
      ctx.font = `500 22px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(t.seed, x, cy + r + 100);
    }
    ctx.fillStyle = lost ? "rgba(255,255,255,0.45)" : "#ffffff";
    ctx.font = `700 150px ${HEAD}`;
    ctx.fillText(String(t.wins), x, cy + r + 250);
    if (won) {
      ctx.fillStyle = ACCENT;
      ctx.font = `700 30px ${HEAD}`;
      ctx.letterSpacing = "6px";
      ctx.fillText("MÄSTARE", x, cy - r - 30);
      ctx.letterSpacing = "0px";
    }
  };
  side(d.left, ll, lx, "left");
  side(d.right, lr, IG_W - lx, "right");

  ctx.textAlign = "center";
  ctx.font = `500 26px ${BODY}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(!d.matches.length ? "finalserien har inte börjat" : d.ties ? `vunna matcher · ${d.ties} oavgjord${d.ties === 1 ? "" : "a"}` : "vunna matcher", IG_W / 2, ty + th + 60);

  // Matcherna
  const list = d.matches.slice(-7);
  if (list.length) {
    const rowH = 54, pw = Math.min(IG_W - 120, 760), px = (IG_W - pw) / 2;
    const py = Math.min(ty + th + 100, IG_H - 60 - list.length * rowH - 20);
    ctx.fillStyle = "rgba(8,12,14,0.7)";
    roundRect(ctx, px, py, pw, list.length * rowH + 20, 22);
    ctx.fill();
    ctx.textBaseline = "middle";
    list.forEach((m, i) => {
      const mid = py + 10 + i * rowH + rowH / 2;
      ctx.textAlign = "left";
      ctx.font = `600 26px ${HEAD}`;
      ctx.letterSpacing = "3px";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(`MATCH ${d.matches.length - list.length + i + 1}`, px + 30, mid);
      ctx.letterSpacing = "0px";
      ctx.font = `400 24px ${BODY}`;
      ctx.fillText(fmtDate(m.date), px + 220, mid);
      ctx.font = `700 34px ${HEAD}`;
      ctx.textAlign = "right";
      ctx.fillStyle = m.left > m.right ? d.left.color : "rgba(255,255,255,0.75)";
      ctx.fillText(String(m.left), px + pw - 110, mid);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("–", px + pw - 85, mid);
      ctx.textAlign = "left";
      ctx.fillStyle = m.right > m.left ? d.right.color : "rgba(255,255,255,0.75)";
      ctx.fillText(String(m.right), px + pw - 60, mid);
    });
    ctx.textBaseline = "alphabetic";
  }
  return c;
}

/** Liten deterministisk slump (samma bild varje gång). */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const GOLD = { light: "#fff3cf", mid: "#e9cf86", dark: "#a8832f", deep: "#5c4515" };

function goldGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD.light);
  g.addColorStop(0.35, GOLD.mid);
  g.addColorStop(0.6, GOLD.dark);
  g.addColorStop(0.8, GOLD.mid);
  g.addColorStop(1, GOLD.light);
  return g;
}

/** Guldbakgrund i lager: mörk grund, strålar, folieglans, guldstoft och dubbel ram med hörnornament. */
function goldBackdrop(ctx: CanvasRenderingContext2D, rayY: number) {
  const W = ctx.canvas?.width ?? IG_W, H = ctx.canvas?.height ?? IG_H;
  const off = H > IG_H ? (H - IG_H) / 2 : 0;
  // 1. Grund
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1d160a");
  g.addColorStop(0.5, "#2c2212");
  g.addColorStop(1, "#0f0b04");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 2. Strålar bakom pokalen
  const cx = W / 2, cy = rayY + off;
  ctx.save();
  for (let i = 0; i < 36; i++) {
    const a0 = (Math.PI * 2 * i) / 36, a1 = a0 + Math.PI / 36;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.max(W, H), a0, a1);
    ctx.closePath();
    ctx.fillStyle = "rgba(246,231,191,0.045)";
    ctx.fill();
  }
  ctx.restore();
  const r = ctx.createRadialGradient(cx, cy, 30, cx, cy, W * 0.6);
  r.addColorStop(0, "rgba(255,236,180,0.34)");
  r.addColorStop(0.5, "rgba(233,207,134,0.10)");
  r.addColorStop(1, "rgba(233,207,134,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
  // 3. Folieglans: mjuka diagonala ljusband
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const [x, w, a] of [[-200, 260, 0.07], [380, 120, 0.05], [760, 200, 0.06]] as const) {
    const sg = ctx.createLinearGradient(x, 0, x + w, w);
    sg.addColorStop(0, "rgba(255,240,200,0)");
    sg.addColorStop(0.5, `rgba(255,240,200,${a})`);
    sg.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w + H * 0.8, H);
    ctx.lineTo(x + H * 0.8, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // 4. Guldstoft
  const rnd = seeded(7);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W, y = rnd() * H, s = rnd() * 2.6 + 0.6;
    ctx.fillStyle = `rgba(246,231,191,${0.15 + rnd() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // 5. Dubbel ram med hörnornament
  ctx.lineWidth = 10;
  ctx.strokeStyle = goldGradient(ctx, 0, 0, W, H);
  roundRect(ctx, 18, 18, W - 36, H - 36, 28);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(233,207,134,0.6)";
  roundRect(ctx, 38, 38, W - 76, H - 76, 20);
  ctx.stroke();
  ctx.fillStyle = goldGradient(ctx, 0, 0, W, H);
  for (const [x, y] of [[38, 38], [W - 38, 38], [38, H - 38], [W - 38, H - 38]]) diamond(ctx, x, y, 16);
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.7, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.7, cy);
  ctx.closePath();
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Lagerkvist: spetsiga blad längs en båge (spegelvänd på höger sida). */
function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, side: -1 | 1) {
  ctx.save();
  ctx.strokeStyle = "rgba(168,131,47,0.9)";
  ctx.lineWidth = 3;
  const start = Math.PI / 2 + side * 0.3, end = Math.PI / 2 + side * 1.75;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.min(start, end), Math.max(start, end));
  ctx.stroke();
  const leaf = (len: number, w: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, -len / 2, 0, -len);
    ctx.quadraticCurveTo(-w, -len / 2, 0, 0);
    ctx.closePath();
  };
  for (let i = 0; i < 10; i++) {
    const t = start + (end - start) * (i / 9);
    const x = cx + Math.cos(t) * radius, y = cy + Math.sin(t) * radius;
    const size = 30 - i * 1.2;
    for (const out of [1, -1]) {
      ctx.save();
      ctx.translate(x, y);
      // Bladen pekar längs bågen mot toppen, ett utåt och ett inåt
      ctx.rotate(t + (side === 1 ? Math.PI : 0) + out * 0.6);
      leaf(size, size * 0.38);
      const lg = ctx.createLinearGradient(0, 0, 0, -size);
      lg.addColorStop(0, GOLD.dark);
      lg.addColorStop(1, GOLD.mid);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = "rgba(60,44,12,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Text i guld med prägling (mörk skugga under, ljus kant upptill). */
function embossed(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  ctx.font = `700 ${px}px ${HEAD}`;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(text, x + 3, y + 5);
  ctx.fillStyle = goldGradient(ctx, x - px * 2, y - px, x + px * 2, y);
  ctx.fillText(text, x, y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,248,225,0.55)";
  ctx.strokeText(text, x, y);
}

/** Banderoll med lagets namn. */
function ribbon(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, text: string, color: string) {
  const tail = 46;
  ctx.fillStyle = GOLD.deep;
  for (const s of [-1, 1]) {
    const x = cx + s * (w / 2 - 10);
    ctx.beginPath();
    ctx.moveTo(x, cy - h / 2 + 12);
    ctx.lineTo(x + s * tail, cy - h / 2 + 12);
    ctx.lineTo(x + s * (tail - 22), cy + 12);
    ctx.lineTo(x + s * tail, cy + h / 2 + 12);
    ctx.lineTo(x, cy + h / 2 + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = goldGradient(ctx, cx - w / 2, cy, cx + w / 2, cy);
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = "#1a1408";
  ctx.fillRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "10px";
  fitFont(ctx, text, w - 60, Math.round(h * 0.56), (p) => `700 ${p}px ${HEAD}`, 20);
  ctx.fillStyle = color;
  ctx.fillText(text, cx + 5, cy + 2);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";
}

/** Mästarbilden: guld i lager, pokalen med lagerkrans, loggan, banderoll och hela mästarlaget. */
export async function renderChampions(d: ShareChampionsData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [lg, trophy] = await Promise.all([tryLoad(d.team.logo), tryLoad(d.trophy ?? TROPHY)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  const th = 400, ty = 250;
  goldBackdrop(ctx, ty + th * 0.45);
  contentArea(ctx);

  // Rubrik
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // Pokalen heter Städet (som Stanley Cup)
  ctx.letterSpacing = "14px";
  embossed(ctx, "STÄDET", IG_W / 2 + 7, 200, 132);
  ctx.letterSpacing = "0px";
  // Ornamentlinje
  ctx.strokeStyle = "rgba(233,207,134,0.7)";
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(IG_W / 2 + s * 40, 238);
    ctx.lineTo(IG_W / 2 + s * 300, 238);
    ctx.stroke();
  }
  ctx.fillStyle = GOLD.mid;
  star(ctx, IG_W / 2, 238, 13);
  diamond(ctx, IG_W / 2 - 310, 238, 7);
  diamond(ctx, IG_W / 2 + 310, 238, 7);

  // Lagerkrans och pokal
  laurel(ctx, IG_W / 2, ty + th * 0.52, 190, -1);
  laurel(ctx, IG_W / 2, ty + th * 0.52, 190, 1);
  drawTrophy(ctx, trophy, IG_W / 2, ty, th);

  // Loggan till vänster, säsongsplattan till höger
  const midY = ty + th * 0.48;
  logo(ctx, lg, 175, midY, 96, GOLD.mid);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(233,207,134,0.5)";
  ctx.beginPath();
  ctx.arc(175, midY, 112, 0, Math.PI * 2);
  ctx.stroke();
  const plW = 220, plH = 150, plX = IG_W - 175 - plW / 2, plY = midY - plH / 2;
  ctx.fillStyle = goldGradient(ctx, plX, plY, plX + plW, plY + plH);
  roundRect(ctx, plX, plY, plW, plH, 14);
  ctx.fill();
  ctx.fillStyle = "#1a1408";
  roundRect(ctx, plX + 7, plY + 7, plW - 14, plH - 14, 10);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(246,231,191,0.7)";
  ctx.font = `600 20px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText("SÄSONG", IG_W - 175, plY + 44);
  ctx.letterSpacing = "2px";
  embossed(ctx, d.season, IG_W - 175, plY + 98, 50);
  ctx.letterSpacing = "0px";
  d.lines.slice(0, 3).forEach((t, i) => {
    ctx.font = i === 0 ? `700 30px ${HEAD}` : `600 25px ${BODY}`;
    ctx.fillStyle = i === 0 ? GOLD.mid : "rgba(246,231,191,0.85)";
    ctx.letterSpacing = i === 0 ? "3px" : "0px";
    ctx.fillText(fit(ctx, i === 0 ? t.toUpperCase() : t, 260), IG_W - 175, plY + plH + 40 + i * 34);
  });
  ctx.letterSpacing = "0px";

  // Banderoll med lagets namn
  ribbon(ctx, IG_W / 2, ty + th + 34, 520, 76, d.team.name.toUpperCase(), d.team.color && d.team.color !== "#ffffff" ? d.team.color : "#ffffff");

  rosterPanel(ctx, d.players, ty + th + 94, IG_H - 92, GOLD_PANEL, "MÄSTARLAGET", `Ingen har spelat ${d.minMatches} matcher för laget än`);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.font = `400 19px ${BODY}`;
  ctx.fillStyle = "rgba(246,231,191,0.65)";
  ctx.fillText(`Kaptenerna och alla som spelat minst ${d.minMatches} matcher för laget under säsongen och slutspelet`, IG_W / 2, IG_H - 58);
  return c;
}

interface PanelStyle { bg: string; border: (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => CanvasGradient | string; inner: string; title: string; name: string; muted: string; ornament: "star" | "diamond" }
const GOLD_PANEL: PanelStyle = { bg: "rgba(14,10,4,0.78)", border: goldGradient, inner: "rgba(233,207,134,0.3)", title: GOLD.mid, name: "#fff8e6", muted: "rgba(246,231,191,0.7)", ornament: "star" };

/** Laget: bara namnen i 1–3 kolumner beroende på antal (ryms upp till 36). */
function rosterPanel(ctx: CanvasRenderingContext2D, all: Array<{ name: string }>, panelTop: number, panelBottom: number, st: PanelStyle, title: string, empty: string) {
  const players = all.slice(0, 36);
  const cols = players.length > 14 ? 3 : players.length > 6 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(players.length / cols));
  const rowH = Math.min(46, Math.floor((panelBottom - panelTop - 64) / perCol));
  const pw = IG_W - 140, px = 70;
  const panelH = 64 + perCol * rowH + 14;
  ctx.fillStyle = st.bg;
  roundRect(ctx, px, panelTop, pw, panelH, 20);
  ctx.fill();
  ctx.strokeStyle = st.border(ctx, px, panelTop, px + pw, panelTop + panelH);
  ctx.lineWidth = 3;
  roundRect(ctx, px, panelTop, pw, panelH, 20);
  ctx.stroke();
  ctx.strokeStyle = st.inner;
  ctx.lineWidth = 1;
  roundRect(ctx, px + 8, panelTop + 8, pw - 16, panelH - 16, 14);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = st.title;
  ctx.font = `700 24px ${HEAD}`;
  ctx.letterSpacing = "8px";
  ctx.fillText(title, IG_W / 2 + 4, panelTop + 44);
  const ow = ctx.measureText(title).width / 2 + 38;
  ctx.letterSpacing = "0px";
  for (const sd of [-1, 1]) (st.ornament === "star" ? star : diamond)(ctx, IG_W / 2 + sd * ow, panelTop + 36, 8);
  const colW = (pw - 30) / cols;
  const fontPx = Math.round(Math.min(cols === 3 ? 25 : 30, rowH * 0.6));
  ctx.textBaseline = "middle";
  players.forEach((p, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = px + 15 + col * colW + colW / 2, y = panelTop + 64 + row * rowH + rowH / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = st.name;
    // Bara namnet; långa namn krymps hellre än klipps
    fitFont(ctx, p.name, colW - 24, fontPx, (px) => `600 ${px}px ${BODY}`, Math.round(fontPx * 0.78));
    ctx.fillText(fit(ctx, p.name, colW - 24), x, y);
  });
  if (!players.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = st.muted;
    ctx.font = `500 26px ${BODY}`;
    ctx.fillText(empty, IG_W / 2, panelTop + 100);
  }
  ctx.textBaseline = "alphabetic";
}

// ─── Stålserien: vinnarbilden (mindre dramatisk än Städet, i stål/silver) ────

const STEEL = { light: "#f4f7fb", mid: "#c3ccd6", dark: "#7d8896" };
function steelGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, STEEL.light);
  g.addColorStop(0.45, STEEL.mid);
  g.addColorStop(0.7, STEEL.dark);
  g.addColorStop(1, STEEL.light);
  return g;
}
const STEEL_PANEL: PanelStyle = { bg: "rgba(6,10,14,0.72)", border: steelGradient, inner: "rgba(195,204,214,0.25)", title: STEEL.mid, name: "#f4f7fb", muted: "rgba(220,228,236,0.7)", ornament: "diamond" };

export interface ShareSeriesWinnerData {
  season: string;
  /** Avslutad grundserie = Seriesegrare, annars Serieledare */
  finished: boolean;
  team: { name: string; logo: string | null; color: string };
  /** T.ex. ["15 poäng", "7-4-1", "+9"] */
  stats: string[];
  players: Array<{ name: string }>;
  minMatches: number;
  format?: PostFormat;
  background?: ShareBackground;
}

export async function renderSeriesWinner(d: ShareSeriesWinnerData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const bgc = d.background ?? { url: STATS_BACKGROUND, dim: 0.8 };
  const [bg, lg] = await Promise.all([tryLoad(bgc.url), tryLoad(d.team.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  const W = ctx.canvas?.width ?? IG_W, H = ctx.canvas?.height ?? IG_H;
  backdrop(ctx, bg, Math.max(0.72, bgc.dim));
  // Kall stålton och ett mjukt ljus bakom loggan
  ctx.fillStyle = "rgba(10,22,34,0.35)";
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 3;
  ctx.strokeStyle = steelGradient(ctx, 0, 0, W, H);
  roundRect(ctx, 24, 24, W - 48, H - 48, 24);
  ctx.stroke();
  contentArea(ctx);
  const glow = ctx.createRadialGradient(IG_W / 2, 420, 20, IG_W / 2, 420, 360);
  glow.addColorStop(0, "rgba(220,230,240,0.20)");
  glow.addColorStop(1, "rgba(220,230,240,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 100, IG_W, 640);

  // Rubrik
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "12px";
  ctx.font = `700 104px ${HEAD}`;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("STÅLSERIEN", IG_W / 2 + 8, 184);
  ctx.fillStyle = steelGradient(ctx, 0, 90, 0, 185);
  ctx.fillText("STÅLSERIEN", IG_W / 2 + 6, 180);
  ctx.letterSpacing = "8px";
  ctx.font = `600 30px ${HEAD}`;
  ctx.fillStyle = "rgba(220,228,236,0.85)";
  ctx.fillText(`${d.finished ? "SERIESEGRARE" : "SERIELEDARE"} ${d.season}`, IG_W / 2 + 4, 232);
  ctx.letterSpacing = "0px";

  // Loggan och lagets namn
  const cy = 420;
  logo(ctx, lg, IG_W / 2, cy, 140, STEEL.mid);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(195,204,214,0.45)";
  ctx.beginPath();
  ctx.arc(IG_W / 2, cy, 160, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = d.team.color && d.team.color !== "#ffffff" ? d.team.color : "#ffffff";
  ctx.font = `700 64px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(d.team.name.toUpperCase(), IG_W / 2 + 5, cy + 230);
  ctx.letterSpacing = "0px";
  // Siffrorna som en rad med avdelare
  ctx.font = `600 28px ${BODY}`;
  ctx.fillStyle = "rgba(235,240,245,0.9)";
  ctx.fillText(d.stats.join("   ·   "), IG_W / 2, cy + 282);

  rosterPanel(ctx, d.players, cy + 320, IG_H - 92, STEEL_PANEL, "LAGET", `Ingen har spelat ${d.minMatches} matcher för laget än`);
  ctx.textAlign = "center";
  ctx.font = `400 19px ${BODY}`;
  ctx.fillStyle = "rgba(220,228,236,0.6)";
  ctx.fillText(`Kaptenerna och alla som spelat minst ${d.minMatches} matcher för laget i grundserien`, IG_W / 2, IG_H - 58);
  return c;
}
