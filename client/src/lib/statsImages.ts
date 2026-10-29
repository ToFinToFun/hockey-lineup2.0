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
  /** T.ex. "Finalen 3–2 mot Gröna" */
  line: string;
  players: Array<{ name: string; number: string | null }>;
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

/** Guldbakgrund i hockeykortens guldstil: mörkt guld, diagonala band och glans. */
function goldBackdrop(ctx: CanvasRenderingContext2D) {
  const W = ctx.canvas?.width ?? IG_W, H = ctx.canvas?.height ?? IG_H;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1c160a");
  g.addColorStop(0.45, "#2b2111");
  g.addColorStop(1, "#120d05");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Diagonala guldband i hörnen (som guldkortets ram)
  ctx.save();
  for (const [x0, y0, dir] of [[0, 0, 1], [W, H, -1]] as const) {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const o = 60 + i * 46;
      ctx.moveTo(x0 + dir * o, y0);
      ctx.lineTo(x0 + dir * (o + 26), y0);
      ctx.lineTo(x0, y0 + dir * (o + 26));
      ctx.lineTo(x0, y0 + dir * o);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "rgba(168,131,47,0.55)" : "rgba(233,207,134,0.6)";
      ctx.fill();
    }
  }
  ctx.restore();
  // Glans bakom pokalen
  const r = ctx.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.36, W * 0.62);
  r.addColorStop(0, "rgba(246,231,191,0.28)");
  r.addColorStop(1, "rgba(246,231,191,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
  // Små stjärnor
  ctx.fillStyle = "rgba(246,231,191,0.55)";
  const stars = [[120, 360], [960, 300], [180, 760], [910, 820], [540, 120], [90, 1080], [990, 1150]];
  for (const [x, y] of stars) star(ctx, x, (y / IG_H) * H, 10);
  // Tunn guldram
  ctx.strokeStyle = "rgba(233,207,134,0.7)";
  ctx.lineWidth = 4;
  roundRect(ctx, 22, 22, W - 44, H - 44, 26);
  ctx.stroke();
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

const goldText = (ctx: CanvasRenderingContext2D, y0: number, y1: number) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#fff3cf");
  g.addColorStop(0.5, "#e9cf86");
  g.addColorStop(1, "#a8832f");
  return g;
};

/** Mästarbilden: guld, pokalen, lagets logga och alla som spelat minst N matcher för laget. */
export async function renderChampions(d: ShareChampionsData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [lg, trophy] = await Promise.all([tryLoad(d.team.logo), tryLoad(d.trophy ?? TROPHY)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  goldBackdrop(ctx);
  contentArea(ctx);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(246,231,191,0.75)";
  ctx.font = `600 28px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(`STÅLSTADENS SF · ${d.season}`, IG_W / 2, 84);
  ctx.letterSpacing = "10px";
  ctx.fillStyle = goldText(ctx, 120, 230);
  ctx.font = `700 124px ${HEAD}`;
  ctx.fillText("MÄSTARE", IG_W / 2, 232);
  ctx.letterSpacing = "0px";

  // Pokalen i mitten, lagets logga och namn på var sin sida om den
  const th = 460, ty = 262;
  drawTrophy(ctx, trophy, IG_W / 2, ty, th);
  const lr = 112, lcx = 220, lcy = ty + th / 2;
  logo(ctx, lg, lcx, lcy, lr, "#e9cf86");
  ctx.textAlign = "center";
  ctx.fillStyle = d.team.color === "#ffffff" || !d.team.color ? "#ffffff" : d.team.color;
  ctx.font = `700 54px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(fit(ctx, d.team.name.toUpperCase(), 300), IG_W - 220, lcy - 10);
  ctx.letterSpacing = "0px";
  ctx.font = `500 24px ${BODY}`;
  ctx.fillStyle = "rgba(246,231,191,0.8)";
  const lineParts = d.line.split(" · ");
  lineParts.forEach((t, i) => ctx.fillText(fit(ctx, t, 320), IG_W - 220, lcy + 34 + i * 32));

  // Spelarna i två eller tre kolumner
  const players = d.players.slice(0, 36);
  const panelTop = ty + th + 30, panelBottom = IG_H - 70;
  const cols = players.length > 24 ? 3 : players.length > 8 ? 2 : 1;
  const perCol = Math.ceil(players.length / cols) || 1;
  const rowH = Math.min(46, Math.floor((panelBottom - panelTop - 70) / perCol));
  const pw = IG_W - 120, px = 60;
  const panelH = 70 + perCol * rowH + 10;
  ctx.fillStyle = "rgba(18,13,5,0.72)";
  roundRect(ctx, px, panelTop, pw, panelH, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(233,207,134,0.45)";
  ctx.lineWidth = 2;
  roundRect(ctx, px, panelTop, pw, panelH, 22);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#e9cf86";
  ctx.font = `700 24px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText("MÄSTARLAGET", IG_W / 2, panelTop + 44);
  ctx.letterSpacing = "0px";
  const colW = pw / cols;
  ctx.textBaseline = "middle";
  players.forEach((p, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = px + col * colW + 30, y = panelTop + 70 + row * rowH + rowH / 2;
    const fontPx = Math.round(Math.min(30, rowH * 0.62));
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(233,207,134,0.85)";
    ctx.font = `700 ${fontPx}px ${HEAD}`;
    ctx.fillText(p.number ? `#${p.number}` : "", x + 54, y);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff8e6";
    ctx.font = `600 ${fontPx}px ${BODY}`;
    ctx.fillText(fit(ctx, p.name, colW - 96), x + 66, y);
  });
  if (!players.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(246,231,191,0.7)";
    ctx.font = `500 26px ${BODY}`;
    ctx.fillText(`Ingen har spelat ${d.minMatches} matcher för laget än`, IG_W / 2, panelTop + 100);
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.font = `400 20px ${BODY}`;
  ctx.fillStyle = "rgba(246,231,191,0.6)";
  ctx.fillText(`Alla som spelat minst ${d.minMatches} matcher för laget under säsongen och slutspelet`, IG_W / 2, IG_H - 40);
  return c;
}
