/**
 * Delningsbilder för statistiken: tabeller/topplistor och finalen.
 * Samma stil och format som matchrapporten (4:5 för flödet, 9:16 för Story).
 */
import { IG_W, IG_H, HEAD, BODY, tryLoad, ensureFonts, fit, canvas, backdrop, contentArea, frameHeight, header, logo, type PostFormat } from "@/lib/matchReportImages";
import { roundRect } from "@/lib/canvas";

export const STATS_BACKGROUND = "/images/background.jpg";
export const TROPHY = "/images/pokal.jpg";

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
  /** Rad under rubriken, t.ex. "Säsong 2026/27" */
  subtitle: string;
  columns: ShareColumn[];
  rows: ShareRow[];
  /** Kolumnen som är sorterad/viktigast (fet och i accentfärg) */
  highlight?: number;
  /** Förklaring längst ner, t.ex. "2 p för vinst, 1 p för oavgjort" */
  note?: string;
  format?: PostFormat;
  background?: string;
}

export interface ShareFinalTeam { name: string; logo: string | null; color: string; wins: number }
export interface ShareFinalData {
  /** "FINAL 26/27" */
  title: string;
  white: ShareFinalTeam;
  green: ShareFinalTeam;
  ties: number;
  matches: Array<{ date: string; white: number; green: number }>;
  trophy?: string;
  format?: PostFormat;
  background?: string;
}

const ACCENT = "#e9c46a";
const MAX_ROWS = 10;

/** Tabell eller topplista (högst 10 rader). */
export async function renderStatsTable(d: ShareTableData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const rows = d.rows.slice(0, MAX_ROWS);
  const [bg, ...logos] = await Promise.all([tryLoad(d.background ?? STATS_BACKGROUND), ...rows.map((r) => tryLoad(r.logo ?? null))]);
  const [c, ctx] = canvas(frameHeight(d.format));
  backdrop(ctx, bg, 0.68);
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

  // Kolumnerna från höger; bredden efter antal (fler kolumner = smalare)
  const n = d.columns.length;
  const colW = n === 1 ? 320 : n <= 3 ? 130 : n <= 5 ? 104 : n <= 7 ? 86 : 74;
  const right = px + pw - 28;
  const colX = (i: number) => right - (n - 1 - i) * colW - colW / 2;
  const hasRank = rows.some((r) => r.rank !== "");
  const nameX = px + (hasRank ? 108 : 36);

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.letterSpacing = "2px";
  d.columns.forEach((col, i) => {
    ctx.font = `700 ${Math.round((col.label.length > 4 ? 20 : 24) * Math.min(1, s + 0.1))}px ${HEAD}`;
    ctx.fillStyle = i === d.highlight ? ACCENT : "rgba(255,255,255,0.55)";
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
      ctx.font = `${ci === d.highlight ? 700 : 500} ${Math.round((ci === d.highlight ? 38 : 32) * s)}px ${HEAD}`;
      ctx.fillText(fit(ctx, v, colW - 8), colX(ci), mid + 1);
    });
    // Namn (och underrad)
    const maxName = colX(0) - colW / 2 - tx - 16;
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

/** Finalen: pokalen i mitten, lagen med vunna matcher, matcherna nertill. */
export async function renderFinal(d: ShareFinalData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [bg, lw, lg, trophy] = await Promise.all([tryLoad(d.background ?? STATS_BACKGROUND), tryLoad(d.white.logo), tryLoad(d.green.logo), tryLoad(d.trophy ?? TROPHY)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  backdrop(ctx, bg, 0.74);
  contentArea(ctx);

  // Rubrik
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText("SLUTSPEL", IG_W / 2, 110);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 96px ${HEAD}`;
  ctx.letterSpacing = "8px";
  ctx.fillText(d.title.toUpperCase(), IG_W / 2, 210);
  ctx.letterSpacing = "0px";

  // Pokalen (mörk bakgrund i bilden försvinner med "lighten")
  const th = 560, tw = trophy ? (trophy.width / trophy.height) * th : 0;
  const ty = 250;
  if (trophy) {
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    ctx.drawImage(trophy, IG_W / 2 - tw / 2, ty, tw, th);
    ctx.restore();
  }

  // Lagen på var sida om pokalen
  const cy = ty + th / 2 - 40, r = 120, lx = 190;
  const leader = d.white.wins > d.green.wins ? "white" : d.green.wins > d.white.wins ? "green" : null;
  const side = (t: ShareFinalTeam, img: HTMLImageElement | null, x: number, key: "white" | "green") => {
    const lead = leader === key;
    logo(ctx, img, x, cy, r, lead || !leader ? t.color : t.color + "59");
    ctx.textAlign = "center";
    ctx.fillStyle = t.color;
    ctx.font = `700 42px ${HEAD}`;
    ctx.letterSpacing = "5px";
    ctx.fillText(fit(ctx, t.name.toUpperCase(), 2 * lx - 40), x, cy + r + 66);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = lead || !leader ? "#ffffff" : "rgba(255,255,255,0.55)";
    ctx.font = `700 150px ${HEAD}`;
    ctx.fillText(String(t.wins), x, cy + r + 220);
  };
  side(d.white, lw, lx, "white");
  side(d.green, lg, IG_W - lx, "green");

  ctx.textAlign = "center";
  ctx.font = `500 26px ${BODY}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(d.ties ? `vunna matcher · ${d.ties} oavgjord${d.ties === 1 ? "" : "a"}` : "vunna matcher", IG_W / 2, ty + th + 60);

  // Matcherna
  const list = d.matches.slice(-8);
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
      ctx.textAlign = "right";
      ctx.font = `700 34px ${HEAD}`;
      const w = m.white > m.green, g = m.green > m.white;
      ctx.fillStyle = w ? d.white.color : "rgba(255,255,255,0.75)";
      ctx.fillText(String(m.white), px + pw - 110, mid);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("–", px + pw - 85, mid);
      ctx.textAlign = "left";
      ctx.fillStyle = g ? d.green.color : "rgba(255,255,255,0.75)";
      ctx.fillText(String(m.green), px + pw - 60, mid);
    });
    ctx.textBaseline = "alphabetic";
  }
  return c;
}
