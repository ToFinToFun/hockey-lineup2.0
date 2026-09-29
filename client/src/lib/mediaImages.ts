/**
 * Media – egna Instagram-bilder i samma grafiska profil som matchrapporten
 * (4:5, 1080×1350, mörk arena, Oswald-rubriker, "STÅLSTADENS SF" överst).
 *
 * Mallar:
 *  - lineup: ett lags uppställning (Vita eller Gröna) med positioner och nummer
 *  - text:   rubrik, text och valfri info-rad, med arenan eller egen bild bakom
 * Teman (standard, jul, nyår, påsk) byter accentfärg och lägger till dekor.
 */
import { IG_W, IG_H, HEAD, BODY, WHITE, GREEN, tryLoad, ensureFonts, fit, canvas, backdrop, presentedBy } from "@/lib/matchReportImages";
import { roundRect } from "@/lib/canvas";
import { POSITION_COLORS } from "@/lib/positionColors";

export type MediaTheme = "standard" | "jul" | "nyar" | "pask";
export const MEDIA_THEMES: Array<{ id: MediaTheme; name: string }> = [
  { id: "standard", name: "Standard" },
  { id: "jul", name: "Jul" },
  { id: "nyar", name: "Nyår" },
  { id: "pask", name: "Påsk" },
];

const THEME_ACCENT: Record<MediaTheme, string> = {
  standard: GREEN,
  jul: "#e0413b",
  nyar: "#e9c46a",
  pask: "#f2d64b",
};

export interface MediaCommon {
  theme: MediaTheme;
  /** Liten rad under klubbnamnet, t.ex. "Tisdag 29/9 · Arenan 20:00" */
  dateLine: string;
  sponsor: { name: string; logo: string | null } | null;
}

export interface LineupPlayerRow { pos: string; name: string; number?: string; captain?: string }
export interface LineupGroup { label: string; players: LineupPlayerRow[] }

export interface LineupPostData extends MediaCommon {
  kind: "lineup";
  team: "white" | "green";
  teamName: string;
  title: string; // t.ex. "Dagens lag"
  groups: LineupGroup[];
}

export interface TextPostData extends MediaCommon {
  kind: "text";
  title: string;
  body: string;
  /** Kort info-rad i accentfärg, t.ex. "Torsdag 18/12 · 19:00" */
  info: string;
  /** Egen bild (ersätter arenan) och hur mycket den mörkas (0–1) */
  photo: HTMLImageElement | null;
  photoDim: number;
}

export type MediaPostData = LineupPostData | TextPostData;

const LOGO = { white: "/images/logo-white.png", green: "/images/logo-green.png" };

/** Bryt text i rader som ryms på bredden (exporteras för test). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
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

/** Temats dekor: snöflingor, guldstänk eller påskprickar i överkant och nederkant. */
function decorate(ctx: CanvasRenderingContext2D, theme: MediaTheme) {
  if (theme === "standard") return;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.save();
  for (let i = 0; i < 46; i++) {
    const top = i % 2 === 0;
    const x = rnd() * IG_W;
    const y = top ? rnd() * 250 : IG_H - rnd() * 170;
    const r = 3 + rnd() * (theme === "jul" ? 9 : 7);
    ctx.globalAlpha = 0.25 + rnd() * 0.45;
    if (theme === "jul") {
      // snöflinga: sex strålar
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.2, r / 4);
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
    } else if (theme === "nyar") {
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : "#e9c46a";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillRect(-r, -r / 3, r * 2, (r * 2) / 3);
      ctx.restore();
    } else {
      ctx.fillStyle = ["#f2d64b", "#c8a2ff", "#8ee6b0", "#ffb3c7"][i % 4];
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function clubHeader(ctx: CanvasRenderingContext2D, dateLine: string, accent: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText("STÅLSTADENS SF", IG_W / 2, 110);
  ctx.letterSpacing = "0px";
  if (dateLine) {
    ctx.font = `500 30px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(fit(ctx, dateLine, IG_W - 160), IG_W / 2, 158);
  }
  ctx.fillStyle = accent;
  ctx.fillRect(IG_W / 2 - 50, dateLine ? 180 : 132, 100, 4);
}

/** Positionsbricka i samma färger som i appen. */
function posBadge(ctx: CanvasRenderingContext2D, x: number, cy: number, pos: string, h: number) {
  const key = pos === "MV" ? "MV" : pos === "B" ? "B" : pos === "C" ? "C" : pos;
  const color = (POSITION_COLORS as Record<string, string>)[key] ?? "#64748b";
  ctx.font = `700 ${Math.round(h * 0.5)}px ${HEAD}`;
  const w = Math.max(h * 1.2, ctx.measureText(pos).width + h * 0.6);
  ctx.fillStyle = color;
  roundRect(ctx, x, cy - h / 2, w, h, h * 0.22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pos, x + w / 2, cy + 1);
  ctx.textAlign = "left";
  return w;
}

async function renderLineup(d: LineupPostData): Promise<HTMLCanvasElement> {
  const [bg, logo, sp] = await Promise.all([tryLoad("/images/background.jpg"), tryLoad(LOGO[d.team]), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas();
  backdrop(ctx, bg, 0.68);
  const accent = d.theme === "standard" ? (d.team === "green" ? GREEN : WHITE) : THEME_ACCENT[d.theme];
  decorate(ctx, d.theme);
  clubHeader(ctx, d.dateLine, accent);

  // Lagets logga och namn
  const headY = 300;
  if (logo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(190, headY, 78, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, 112, headY - 78, 156, 156);
    ctx.restore();
    ctx.beginPath(); ctx.arc(190, headY, 82, 0, Math.PI * 2);
    ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `600 32px ${HEAD}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(fit(ctx, (d.title || "Dagens lag").toUpperCase(), IG_W - 340), 300, headY - 18);
  ctx.fillStyle = d.team === "green" ? GREEN : WHITE;
  ctx.font = `700 92px ${HEAD}`;
  ctx.fillText(fit(ctx, d.teamName.toUpperCase(), IG_W - 340), 300, headY + 70);
  ctx.letterSpacing = "0px";

  // Grupperna: målvakter, backpar, kedjor – etikett överst i rutan, spelarna under
  const groups = d.groups.filter((g) => g.players.length > 0);
  const top = 430;
  const bottom = d.sponsor ? IG_H - 180 : IG_H - 70;
  const rowH = Math.min(132, Math.floor((bottom - top) / Math.max(1, groups.length)));
  const s = Math.max(0.62, Math.min(1, rowH / 132));
  const left = 56;
  const startY = top + Math.max(0, Math.floor((bottom - top - rowH * groups.length) / 2));
  groups.forEach((g, gi) => {
    const y = startY + gi * rowH;
    const h = rowH - 12;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, left, y, IG_W - left * 2, h, 14 * s);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(left, y, 6, h);
    // Etikett
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `600 ${Math.round(20 * s)}px ${HEAD}`;
    ctx.letterSpacing = "4px";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(g.label.toUpperCase(), left + 26, y + 30 * s);
    ctx.letterSpacing = "0px";
    // Spelare jämnt fördelade på raden
    const mid = y + 30 * s + (h - 30 * s) / 2;
    const areaX = left + 26;
    const cellW = (IG_W - left - 20 - areaX) / Math.max(1, g.players.length);
    g.players.forEach((p, i) => {
      const x = areaX + i * cellW;
      const bw = posBadge(ctx, x, mid, p.pos, 40 * s);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${Math.round(32 * s)}px ${BODY}`;
      ctx.textBaseline = "middle";
      const label = `${p.name}${p.number ? ` #${p.number}` : ""}`;
      const nameMax = cellW - bw - 26 - (p.captain ? 24 * s : 0);
      const name = fit(ctx, label, nameMax);
      ctx.fillText(name, x + bw + 12, mid);
      if (p.captain) {
        const nameW = ctx.measureText(name).width;
        ctx.font = `700 ${Math.round(20 * s)}px ${HEAD}`;
        ctx.fillStyle = p.captain === "C" ? "#facc15" : "#fdba74";
        ctx.fillText(p.captain, x + bw + 16 + nameW, mid - 12 * s); // upphöjt efter namnet
      }
    });
    ctx.textBaseline = "alphabetic";
  });
  if (groups.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 34px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Inga spelare i laget än", IG_W / 2, 700);
  }

  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

async function renderText(d: TextPostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([d.photo ? Promise.resolve(null) : tryLoad("/images/background.jpg"), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas();
  const accent = THEME_ACCENT[d.theme];
  if (d.photo) {
    // Egen bild täcker allt, mörkas mest nertill där texten står
    const p = d.photo;
    const sc = Math.max(IG_W / p.width, IG_H / p.height);
    ctx.drawImage(p, (IG_W - p.width * sc) / 2, (IG_H - p.height * sc) / 2, p.width * sc, p.height * sc);
    ctx.fillStyle = `rgba(0,0,0,${0.15 + d.photoDim * 0.35})`;
    ctx.fillRect(0, 0, IG_W, IG_H);
    const g = ctx.createLinearGradient(0, IG_H * 0.35, 0, IG_H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.5 + d.photoDim * 0.4})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, IG_W, IG_H);
  } else {
    backdrop(ctx, bg, 0.62);
  }
  decorate(ctx, d.theme);
  clubHeader(ctx, d.dateLine, accent);

  // Texten nedre halvan (med egen bild) eller centrerad (på arenan)
  ctx.font = `700 104px ${HEAD}`;
  ctx.letterSpacing = "3px";
  const titleLines = wrapLines(ctx, (d.title || "").toUpperCase(), IG_W - 140, 3);
  ctx.letterSpacing = "0px";
  ctx.font = `500 38px ${BODY}`;
  const bodyLines = d.body ? wrapLines(ctx, d.body, IG_W - 160, 7) : [];
  const titleH = titleLines.length * 108;
  const bodyH = bodyLines.length * 52;
  const infoH = d.info ? 90 : 0;
  const bottomLimit = d.sponsor ? IG_H - 190 : IG_H - 90;
  const total = titleH + (bodyLines.length ? 30 + bodyH : 0) + (infoH ? 36 + infoH : 0);
  let y = d.photo ? bottomLimit - total : Math.max(250, (250 + bottomLimit) / 2 - total / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 104px ${HEAD}`;
  ctx.letterSpacing = "3px";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 18;
  titleLines.forEach((l, i) => ctx.fillText(l, IG_W / 2, y + 92 + i * 108));
  ctx.restore();
  ctx.letterSpacing = "0px";
  y += titleH;
  if (bodyLines.length) {
    y += 30;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `500 38px ${BODY}`;
    bodyLines.forEach((l, i) => ctx.fillText(l, IG_W / 2, y + 40 + i * 52));
    y += bodyH;
  }
  if (d.info) {
    y += 36;
    ctx.font = `700 40px ${HEAD}`;
    ctx.letterSpacing = "4px";
    const text = fit(ctx, d.info.toUpperCase(), IG_W - 200);
    const w = ctx.measureText(text).width + 70;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, IG_W / 2 - w / 2, y, w, 76, 38);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundRect(ctx, IG_W / 2 - w / 2, y, w, 76, 38);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textBaseline = "middle";
    ctx.fillText(text, IG_W / 2 + 2, y + 39);
    ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = "0px";
  }

  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

export async function renderMediaPost(d: MediaPostData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  return d.kind === "lineup" ? renderLineup(d) : renderText(d);
}
