/**
 * Media – egna Instagram-bilder i samma grafiska profil som matchrapporten
 * (4:5, 1080×1350, mörk arena, Oswald-rubriker, clubHeading() överst).
 *
 * Mallar:
 *  - lineup: ett lags uppställning (Vita eller Gröna) med positioner och nummer
 *  - text:   rubrik, text och valfri info-rad, med arenan eller egen bild bakom
 * Teman (standard, jul, nyår, påsk) byter accentfärg och lägger till dekor.
 */
import { clubHeading, club, teamLogo } from "@shared/club";
import { IG_W, IG_H, HEAD, BODY, tryLoad, ensureFonts, fit, canvas, backdrop, presentedBy, photoBackdrop, contentArea, frameHeight, type PostFormat } from "@/lib/matchReportImages";
export type { PostFormat };
import { roundRect } from "@/lib/canvas";
import { teamColor, teamInitials } from "@shared/teams";
import { POSITION_COLORS } from "@/lib/positionColors";

/** Överlägg: diskret dekor ovanpå bilden (inga färgbyten). */
export type MediaOverlay = "none" | "snow" | "eggs" | "fireworks" | "leaves" | "sun";
export const MEDIA_OVERLAYS: Array<{ id: MediaOverlay; name: string }> = [
  { id: "none", name: "Inget" },
  { id: "snow", name: "Snöflingor" },
  { id: "eggs", name: "Ägg" },
  { id: "fireworks", name: "Fyrverkerier" },
  { id: "leaves", name: "Löv" },
  { id: "sun", name: "Sol" },
];
/** Äldre sparade inlägg hade "theme" – översätts till överlägg */
export function overlayFromTheme(theme: string | undefined): MediaOverlay {
  return theme === "jul" ? "snow" : theme === "nyar" ? "fireworks" : theme === "pask" ? "eggs" : "none";
}
/** Accentfärg: grönt lag (klubbens färg) */
const accentColor = () => teamColor("green");

/** Bakgrundsbilder (4:5, lätt mjukade så att innehållet syns) */
export type MediaBackground = "arena" | "ute" | "omklad" | "rink" | "klubb" | "gym" | "stig" | "vinterskog" | "sommar" | "slask" | "host" | "pucken" | "malburen";
export const MEDIA_BACKGROUNDS: Array<{ id: MediaBackground; name: string; url: string }> = [
  { id: "arena", name: "Isen", url: "/images/background.jpg" },
  { id: "pucken", name: "Pucken på isen", url: "/images/bg-pucken.jpg" },
  { id: "malburen", name: "Målburen", url: "/images/bg-malburen.jpg" },
  // Arenan ute – årstiderna bredvid varandra
  { id: "ute", name: "Arenan i snö", url: "/images/bg-arena-ute.jpg" },
  { id: "host", name: "Arenan på hösten", url: "/images/bg-arena-host.jpg" },
  { id: "slask", name: "Arenan på våren", url: "/images/bg-arena-slask.jpg" },
  { id: "sommar", name: "Arenan på sommaren", url: "/images/bg-arena-sommar.jpg" },
  { id: "rink", name: "Utomhusrinken", url: "/images/bg-utomhusrink.jpg" },
  { id: "omklad", name: "Omklädningsrummet", url: "/images/bg-omkladningsrum.jpg" },
  { id: "klubb", name: "Klubblokalen", url: "/images/bg-klubblokalen.jpg" },
  { id: "gym", name: "Gymmet", url: "/images/bg-gymmet.jpg" },
  { id: "stig", name: "Skogsstigen", url: "/images/bg-skogsstigen.jpg" },
  { id: "vinterskog", name: "Vinterskogen", url: "/images/bg-vinterskogen.jpg" },
];
const bgUrl = (id: MediaBackground | undefined) => (MEDIA_BACKGROUNDS.find((b) => b.id === id) ?? MEDIA_BACKGROUNDS[0]).url;
/** De nya bilderna är redan mörka – mörka dem mindre så att miljön syns */
const DIM: Partial<Record<MediaBackground, number>> = { ute: 0.45, omklad: 0.6, rink: 0.55, klubb: 0.5, gym: 0.55, stig: 0.6, vinterskog: 0.5, sommar: 0.7, slask: 0.5, host: 0.5, pucken: 0.6, malburen: 0.65 };
const dimFor = (id: MediaBackground | undefined, base: number) => base * (id ? DIM[id] ?? 1 : 1);

export interface MediaCommon {
  /** Egen bild (ersätter bakgrunden i alla mallar) och hur mycket den mörkas (0–1) */
  photo?: HTMLImageElement | null;
  photoDim?: number;
  overlay: MediaOverlay;
  /** Bakgrundsbild (standard isen) */
  background?: MediaBackground;
  /** Liten rad under klubbnamnet, t.ex. "Tisdag 29/9 · Arenan 20:00" */
  dateLine: string;
  sponsor: { name: string; logo: string | null } | null;
  /** 4:5 (standard) eller 9:16 (Story/Reel) */
  format?: PostFormat;
}

export interface LineupPlayerRow { pos: string; name: string; number?: string; captain?: string }
export interface LineupGroup { label: string; players: LineupPlayerRow[] }

export interface LineupPostData extends MediaCommon {
  kind: "lineup";
  team: "white" | "green";
  teamName: string;
  title: string; // t.ex. "Dagens lag"
  groups: LineupGroup[];
  /** Mot motståndare: lagets egen logga (null = ingen) och färg */
  logo?: string | null;
  accent?: string;
}

export interface TextPostData extends MediaCommon {
  kind: "text";
  title: string;
  body: string;
  /** Kort info-rad i accentfärg, t.ex. "Torsdag 18/12 · 19:00" */
  info: string;
}

export interface CardsPostData extends MediaCommon {
  kind: "cards";
  title: string;
  subtitle: string;
  /** Färdigritade hockeykort (5:7), 1–4 st */
  cards: HTMLCanvasElement[];
}

export interface StatsRow { rank?: string; name: string; value: string; sub?: string }
export interface StatsPostData extends MediaCommon {
  kind: "stats";
  title: string;
  subtitle: string;
  /** Rubrik för värdekolumnen, t.ex. "PTS" */
  valueLabel: string;
  rows: StatsRow[];
}

/** Senaste resultat: matchrapportens resultatbild med Medias bakgrund och överlägg. */
export interface ResultPostData extends MediaCommon {
  kind: "result";
  /** Matchrapportens data (ReportData) – bakgrunden byts mot Medias */
  report: import("@/lib/matchReportImages").ReportData;
}

/** Utmärkelse: vinnarnas hockeykort med placering och värde */
export interface AwardPostData extends MediaCommon {
  kind: "award";
  /** T.ex. "Mr. Clutch" */
  title: string;
  emoji: string;
  /** Periodens namn, t.ex. "Oktober 2026" */
  subtitle: string;
  places: Array<{ place: 1 | 2 | 3; name: string; value: string; card: HTMLCanvasElement | null }>;
}

/** Bild: valfri uppladdad bild i ram (som hockeykorten), fria rubriker och valfri info-rad */
export interface ImagePostData extends MediaCommon {
  kind: "image";
  title: string;
  subtitle: string;
  info: string;
  image: HTMLImageElement | null;
}

export type { BillPostData, ArticlePostData } from "@/lib/pressImages";
export type MediaPostData = LineupPostData | TextPostData | CardsPostData | StatsPostData | ResultPostData | AwardPostData | ImagePostData
  | import("@/lib/pressImages").BillPostData | import("@/lib/pressImages").ArticlePostData;

/** Lagens loggor från klubbens inställningar */
const LOGO = { get white() { return teamLogo("white"); }, get green() { return teamLogo("green"); } };

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

/**
 * Överläggen: sparsamma och mest i kanterna så att texten inte täcks. Olika
 * storlek och skärpa ger djup (nära = större och mjukare). Slumpen är fast,
 * så samma inlägg ser likadant ut varje gång.
 */
function decorate(ctx: CanvasRenderingContext2D, overlay: MediaOverlay) {
  if (overlay === "none") return;
  // Hela bilden (även 9:16), oavsett var innehållet ligger
  const W = ctx.canvas?.width ?? IG_W, H = ctx.canvas?.height ?? IG_H;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  // Kanterna: övre 28 % eller nedre 18 % (sällan mitt i bilden)
  const edgeY = () => (rnd() < 0.6 ? between(0, H * 0.28) : between(H * 0.82, H));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (overlay === "snow") {
    // Stora, oskarpa flingor nära kameran (djup)
    for (let i = 0; i < 12; i++) {
      const x = rnd() * W, y = edgeY(), r = between(18, 38);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = between(0.1, 0.2);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Mjuka flingor i flera lager
    for (let i = 0; i < 150; i++) {
      const depth = rnd(); // 0 = långt bort, 1 = nära
      const r = 2 + depth * depth * 10;
      const x = rnd() * W, y = edgeY();
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.35 + (1 - depth) * 0.45;
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${a * 0.6})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Några snöstjärnor
    for (let i = 0; i < 7; i++) {
      const x = rnd() * W, y = edgeY(), r = between(9, 16), rot = rnd() * Math.PI;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.shadowColor = "rgba(255,255,255,0.6)"; ctx.shadowBlur = 6;
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -r);
        ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.25, -r * 0.75);
        ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.75);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (overlay === "leaves") {
    const cols = [["#f59e0b", "#b45309"], ["#ea580c", "#9a3412"], ["#facc15", "#ca8a04"], ["#dc2626", "#7f1d1d"]];
    for (let i = 0; i < 20; i++) {
      const x = rnd() * W, y = edgeY(), r = between(14, 34), rot = rnd() * Math.PI * 2;
      const [c1, c2] = cols[i % cols.length];
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.globalAlpha = between(0.7, 0.95);
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      // Bladet: spetsig ellips med svagt vågig kant
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.75, -r * 0.55, r * 0.7, r * 0.45, 0, r);
      ctx.bezierCurveTo(-r * 0.7, r * 0.45, -r * 0.75, -r * 0.55, 0, -r);
      ctx.fill();
      ctx.shadowColor = "transparent";
      // Mittnerv och sidonerver
      ctx.strokeStyle = "rgba(60,20,0,0.45)"; ctx.lineWidth = Math.max(1, r / 18);
      ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 1.25); ctx.stroke();
      ctx.lineWidth = Math.max(0.8, r / 28);
      for (const t of [-0.4, 0, 0.4]) {
        ctx.beginPath(); ctx.moveTo(0, t * r); ctx.lineTo(r * 0.4, t * r - r * 0.25);
        ctx.moveTo(0, t * r); ctx.lineTo(-r * 0.4, t * r - r * 0.25); ctx.stroke();
      }
      ctx.restore();
    }
  } else if (overlay === "fireworks") {
    // Raketer: ljusa streck utåt som tunnas och bleknar, glöd i mitten, lösa gnistor
    const bursts = [[0.17, 0.11, "#facc15"], [0.82, 0.08, "#ffffff"], [0.55, 0.19, "#34d399"], [0.9, 0.27, "#fb923c"]] as const;
    ctx.globalCompositeOperation = "lighter";
    for (const [fx, fy, col] of bursts) {
      const cx = fx * W, cy = fy * H, R = between(130, 210), rays = 40;
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.lineCap = "round";
      for (let k = 0; k < rays; k++) {
        const ang = (k / rays) * Math.PI * 2 + between(-0.06, 0.06);
        const len = R * between(0.55, 1);
        const x0 = cx + Math.cos(ang) * len * 0.12, y0 = cy + Math.sin(ang) * len * 0.12;
        const x1 = cx + Math.cos(ang) * len, y1 = cy + Math.sin(ang) * len + len * 0.08; // lite fall
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.35, col);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.globalAlpha = between(0.55, 0.95);
        ctx.lineWidth = between(1.4, 2.8);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        // Gnista i spetsen
        if (rnd() < 0.6) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x1, y1, between(1.5, 3), 0, Math.PI * 2); ctx.fill();
        }
      }
      // Glöd i mitten
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
      core.addColorStop(0, "rgba(255,255,255,0.35)"); core.addColorStop(0.4, col + "33"); core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2); ctx.fill();
      // Lösa, fallande gnistor under raketen
      ctx.fillStyle = col;
      for (let k = 0; k < 18; k++) {
        ctx.globalAlpha = between(0.2, 0.6);
        ctx.beginPath(); ctx.arc(cx + between(-R, R) * 0.8, cy + between(0.2, 1.3) * R, between(0.8, 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  } else if (overlay === "eggs") {
    const cols = ["#f9a8d4", "#a5b4fc", "#86efac", "#fde68a", "#fdba74", "#c4b5fd"];
    for (let i = 0; i < 11; i++) {
      const x = rnd() * W, y = rnd() < 0.75 ? between(H * 0.85, H * 0.98) : between(H * 0.03, H * 0.15);
      const r = between(22, 38), rot = between(-0.5, 0.5), col = cols[i % cols.length];
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      const egg = () => { ctx.beginPath(); ctx.ellipse(0, 0, r * 0.74, r, 0, 0, Math.PI * 2); };
      const g = ctx.createRadialGradient(-r * 0.25, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, col);
      ctx.fillStyle = g; egg(); ctx.fill();
      ctx.shadowColor = "transparent";
      // Mönsterband (sicksack) inom ägget
      ctx.save(); egg(); ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = Math.max(1.5, r / 12);
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const px = -r + (k * r) / 4; const py = (k % 2 ? -1 : 1) * r * 0.1; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (const dx of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.arc(dx * r, r * 0.45, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.restore();
    }
  } else if (overlay === "sun") {
    // Varmt motljus uppe till höger, mjuk dis och svaga linsreflexer
    const sx = W * 0.9, sy = H * 0.05;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.9);
    g.addColorStop(0, "rgba(255,226,150,0.55)");
    g.addColorStop(0.25, "rgba(255,190,100,0.22)");
    g.addColorStop(0.6, "rgba(255,170,90,0.06)");
    g.addColorStop(1, "rgba(255,170,90,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, 70);
    core.addColorStop(0, "rgba(255,250,230,0.9)"); core.addColorStop(1, "rgba(255,250,230,0)");
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sx, sy, 70, 0, Math.PI * 2); ctx.fill();
    // Reflexer längs diagonalen mot nedre vänstra hörnet
    const flares = [[0.22, 34, 0.1], [0.38, 18, 0.14], [0.55, 52, 0.06], [0.72, 12, 0.16], [0.86, 80, 0.05]] as const;
    for (const [t, r, a] of flares) {
      const fx = sx + (W * 0.1 - sx) * t, fy = sy + (H * 0.9 - sy) * t;
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      fg.addColorStop(0, `rgba(255,220,160,${a})`); fg.addColorStop(0.7, `rgba(255,200,140,${a * 0.6})`); fg.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
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
  ctx.fillText(clubHeading(), IG_W / 2, 110);
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

/** Positionsfärger (samma som i appen) och rubrikfärger för lagbilden. */
const ROW_COLOR: Record<string, string> = { MV: "#f97316", B: "#3b82f6", LW: "#06b6d4", RW: "#06b6d4", C: "#8b5cf6" };
const SECTION_COLOR = { gk: "#facc15", def: "#60a5fa", fwd: "#34d399" };

/** Hur högt lagbildens innehåll blir med en viss skala (exporteras för test). */
export function lineupHeights(groups: LineupGroup[], k: number) {
  const row = 58 * k, gap = 9 * k, sub = 36 * k, head = 50 * k, sectionGap = 22 * k;
  const gk = groups.filter((g) => g.players.every((p) => p.pos === "MV"));
  const def = groups.filter((g) => g.players.every((p) => p.pos === "B"));
  const fwd = groups.filter((g) => !gk.includes(g) && !def.includes(g));
  const rows = (gs: LineupGroup[], withSub: boolean) => gs.reduce((h, g) => h + (withSub ? sub : 0) + g.players.length * (row + gap), 0);
  const left = (gk.length ? head + rows(gk, false) : 0) + (def.length ? (gk.length ? sectionGap : 0) + head + rows(def, true) : 0);
  const right = fwd.length ? head + rows(fwd, true) : 0;
  return { left, right, gk, def, fwd, row, gap, sub, head, sectionGap };
}

async function renderLineup(d: LineupPostData): Promise<HTMLCanvasElement> {
  const [bg, logo, sp] = await Promise.all([(d.photo ? Promise.resolve(null) : tryLoad(bgUrl(d.background))), tryLoad(d.logo !== undefined ? d.logo : LOGO[d.team]), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5); else backdrop(ctx, bg, dimFor(d.background, 0.6));
  decorate(ctx, d.overlay);
  contentArea(ctx);

  // Liten rad överst: rubrik och datum
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 28px ${HEAD}`;
  ctx.letterSpacing = "6px";
  const topLine = [d.title?.toUpperCase(), d.dateLine].filter(Boolean).join("  ·  ");
  if (topLine) ctx.fillText(fit(ctx, topLine, IG_W - 120), IG_W / 2, 110);
  ctx.letterSpacing = "0px";

  // Kortet (panelen) – anpassas i höjd efter antalet spelare
  const px = 52, pw = IG_W - 2 * px;
  const panelTop = 150;
  const panelBottomMax = d.sponsor ? IG_H - 175 : IG_H - 60;
  const headerH = 150;
  const avail = panelBottomMax - panelTop - headerH - 36;
  let k = 1;
  let H = lineupHeights(d.groups, k);
  const need = Math.max(H.left, H.right);
  if (need > avail) { k = Math.max(0.62, avail / need); H = lineupHeights(d.groups, k); }
  const contentH = Math.max(H.left, H.right);
  const panelH = headerH + contentH + 60;
  const py = panelTop + Math.max(0, Math.floor((panelBottomMax - panelTop - panelH) / 2));

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "rgba(8,12,14,0.72)";
  roundRect(ctx, px, py, pw, panelH, 34);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, panelH, 34);
  ctx.stroke();

  // Lagets logga och namn
  const lx = px + 30, ly = py + 38, lr = 42;
  if (logo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(lx + lr, ly + lr, lr, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, lx, ly, lr * 2, lr * 2);
    ctx.restore();
  } else if (d.logo === null && d.accent) {
    // Motståndare utan logga: färgad cirkel med initialer
    ctx.save();
    ctx.beginPath(); ctx.arc(lx + lr, ly + lr, lr, 0, Math.PI * 2);
    ctx.fillStyle = d.accent; ctx.fill();
    const ini = teamInitials(d.teamName);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(lr * (ini.length > 3 ? 0.62 : 0.78))}px ${HEAD}`;
    ctx.fillText(ini, lx + lr, ly + lr + lr * 0.04);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = d.accent ?? (d.team === "green" ? teamColor("green") : "#ffffff");
  ctx.font = `700 64px ${HEAD}`;
  ctx.letterSpacing = "4px";
  ctx.fillText(fit(ctx, d.teamName.toUpperCase(), pw - 180), lx + lr * 2 + 26, ly + lr + 2);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(px + 28, py + headerH - 22, pw - 56, 2);

  // Två kolumner: målvakter + backar till vänster, forwards till höger
  const colGap = 26;
  const colW = (pw - 56 - colGap) / 2;
  const leftX = px + 28, rightX = leftX + colW + colGap;
  const top = py + headerH;

  const heading = (x: number, y: number, text: string, color: string) => {
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(30 * k)}px ${HEAD}`;
    ctx.letterSpacing = "5px";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, x + 4, y + H.head / 2);
    ctx.letterSpacing = "0px";
    return y + H.head;
  };
  const subLabel = (x: number, y: number, text: string) => {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `600 ${Math.round(21 * k)}px ${BODY}`;
    ctx.letterSpacing = "3px";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), x + 4, y + H.sub / 2);
    ctx.letterSpacing = "0px";
    return y + H.sub;
  };
  const row = (x: number, y: number, p: LineupPlayerRow) => {
    const col = ROW_COLOR[p.pos] ?? "#64748b";
    const r = 10 * k;
    // tonad bakgrund + färgad kant
    ctx.fillStyle = col + "26";
    roundRect(ctx, x, y, colW, H.row, r);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 5, H.row);
    // positionsbricka
    const bw = 64 * k, bh = H.row - 16 * k;
    ctx.fillStyle = col;
    roundRect(ctx, x + 16 * k, y + (H.row - bh) / 2, bw, bh, 6 * k);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(24 * k)}px ${HEAD}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.pos, x + 16 * k + bw / 2, y + H.row / 2 + 1);
    // C/A före namnet, namn och nummer
    ctx.textAlign = "left";
    let tx = x + 16 * k + bw + 16 * k;
    if (p.captain) {
      ctx.font = `700 ${Math.round(28 * k)}px ${HEAD}`;
      ctx.fillStyle = p.captain === "C" ? "#facc15" : "#fb923c";
      ctx.fillText(p.captain, tx, y + H.row / 2 + 1);
      tx += ctx.measureText(p.captain).width + 12 * k;
    }
    const numText = p.number ? `#${p.number}` : "";
    ctx.font = `500 ${Math.round(22 * k)}px ${BODY}`;
    const numW = numText ? ctx.measureText(numText).width + 12 * k : 0;
    ctx.font = `600 ${Math.round(29 * k)}px ${BODY}`;
    ctx.fillStyle = "#ffffff";
    const name = fit(ctx, p.name, x + colW - 14 * k - numW - tx);
    ctx.fillText(name, tx, y + H.row / 2 + 1);
    if (numText) {
      const nx = tx + ctx.measureText(name).width + 12 * k;
      ctx.font = `500 ${Math.round(22 * k)}px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(numText, nx, y + H.row / 2 + 2);
    }
    return y + H.row + H.gap;
  };

  let yl = top;
  if (H.gk.length) {
    yl = heading(leftX, yl, H.gk.flatMap((g) => g.players).length > 1 ? "MÅLVAKTER" : "MÅLVAKT", SECTION_COLOR.gk);
    for (const g of H.gk) for (const p of g.players) yl = row(leftX, yl, p);
  }
  if (H.def.length) {
    if (H.gk.length) yl += H.sectionGap;
    yl = heading(leftX, yl, "BACKAR", SECTION_COLOR.def);
    for (const g of H.def) {
      yl = subLabel(leftX, yl, g.label);
      for (const p of g.players) yl = row(leftX, yl, p);
    }
  }
  let yr = top;
  if (H.fwd.length) {
    yr = heading(rightX, yr, "FORWARDS", SECTION_COLOR.fwd);
    for (const g of H.fwd) {
      yr = subLabel(rightX, yr, g.label);
      for (const p of g.players) yr = row(rightX, yr, p);
    }
  }
  if (!d.groups.length) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 34px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Inga spelare i laget än", IG_W / 2, top + 60);
  }
  ctx.textBaseline = "alphabetic";

  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

async function renderText(d: TextPostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([d.photo ? Promise.resolve(null) : (d.photo ? Promise.resolve(null) : tryLoad(bgUrl(d.background))), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  const accent = accentColor();
  if (d.photo) {
    // Egen bild täcker allt, mörkas mest nertill där texten står
    const p = d.photo;
    const W = c.width, H = c.height;
    const sc = Math.max(W / p.width, H / p.height);
    ctx.drawImage(p, (W - p.width * sc) / 2, (H - p.height * sc) / 2, p.width * sc, p.height * sc);
    const dim = d.photoDim ?? 0.5;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + dim * 0.35})`;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.5 + dim * 0.4})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    backdrop(ctx, bg, dimFor(d.background, 0.62));
  }
  decorate(ctx, d.overlay);
  contentArea(ctx);
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

  // Textruta: mörk, halvgenomskinlig panel med skugga och en tunn accentlinje överst
  {
    ctx.font = `700 104px ${HEAD}`;
    ctx.letterSpacing = "3px";
    const widest = Math.max(...titleLines.map((l) => ctx.measureText(l).width), 0);
    ctx.letterSpacing = "0px";
    ctx.font = `500 38px ${BODY}`;
    const bodyW = Math.max(0, ...bodyLines.map((l) => ctx.measureText(l).width));
    const bw = Math.min(IG_W - 80, Math.max(widest, bodyW, 420) + 110);
    const bx = IG_W / 2 - bw / 2, by = y - 36, bh = total + 72;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "rgba(8,12,14,0.62)";
    roundRect(ctx, bx, by, bw, bh, 30);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 30);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(IG_W / 2 - 60, by + 16, 120, 4);
  }

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

/** Rubrik och underrubrik överst på kort- och statistikbilderna. */
function titleBlock(ctx: CanvasRenderingContext2D, title: string, subtitle: string, dateLine: string): number {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 26px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(clubHeading(), IG_W / 2, 92);
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 76px ${HEAD}`;
  ctx.fillText(fit(ctx, (title || "").toUpperCase(), IG_W - 120), IG_W / 2, 176);
  ctx.letterSpacing = "0px";
  const sub = [subtitle, dateLine].filter(Boolean).join(" · ");
  if (sub) {
    ctx.font = `500 30px ${BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(fit(ctx, sub, IG_W - 140), IG_W / 2, 224);
  }
  ctx.fillStyle = accentColor();
  ctx.fillRect(IG_W / 2 - 50, sub ? 248 : 206, 100, 4);
  return sub ? 280 : 240;
}

/** Placering av 1–4 kort: 1 stort, 2 bredvid varandra, 3–4 i två rader (exporteras för test). */
export function cardSlots(n: number, top: number, bottom: number): Array<{ x: number; y: number; w: number; h: number }> {
  const ratio = 7 / 5;
  const areaW = IG_W - 100, areaH = bottom - top;
  const place = (cols: number, rows: number, count: number) => {
    const gap = 26;
    let w = (areaW - gap * (cols - 1)) / cols;
    let h = w * ratio;
    if (h * rows + gap * (rows - 1) > areaH) { h = (areaH - gap * (rows - 1)) / rows; w = h / ratio; }
    const out: Array<{ x: number; y: number; w: number; h: number }> = [];
    const totalH = h * rows + gap * (rows - 1);
    const y0 = top + (areaH - totalH) / 2;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, count - r * cols);
      const rowW = inRow * w + (inRow - 1) * gap;
      const x0 = IG_W / 2 - rowW / 2;
      out.push({ x: x0 + (i % cols) * (w + gap), y: y0 + r * (h + gap), w, h });
    }
    return out;
  };
  if (n <= 1) return place(1, 1, 1);
  if (n === 2) return place(2, 1, 2);
  return place(2, 2, Math.min(n, 4));
}

const PLACE_COLOR: Record<1 | 2 | 3, string> = { 1: "#f5c84c", 2: "#cbd5e1", 3: "#d4915a" };
const PLACE_LABEL: Record<1 | 2 | 3, string> = { 1: "1:a", 2: "2:a", 3: "3:e" };

async function renderAward(d: AwardPostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([(d.photo ? Promise.resolve(null) : tryLoad(bgUrl(d.background))), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5); else backdrop(ctx, bg, dimFor(d.background, 0.62));
  decorate(ctx, d.overlay);
  contentArea(ctx);
  const title = `${d.emoji ? d.emoji + " " : ""}${d.title}`;
  const top = titleBlock(ctx, title, d.subtitle, d.dateLine) + 30;
  const bottom = d.sponsor ? IG_H - 200 : IG_H - 90;
  const list = [...d.places].sort((a, b) => a.place - b.place);
  const slots = cardSlots(list.length, top, bottom);
  for (let i = 0; i < list.length; i++) {
    const p = list[i], slot = slots[i];
    if (!slot) continue;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    if (p.card) ctx.drawImage(p.card, slot.x, slot.y, slot.w, slot.h);
    ctx.restore();
    // Placering och värde i en skylt över kortets överkant
    const pillH = Math.max(46, slot.w * 0.15), label = `${PLACE_LABEL[p.place]} · ${p.value}`;
    ctx.font = `700 ${Math.round(pillH * 0.52)}px ${HEAD}`;
    const pillW = Math.min(slot.w * 0.92, ctx.measureText(label).width + pillH);
    const px = slot.x + slot.w / 2 - pillW / 2, py = slot.y - pillH * 0.55;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(10,10,10,0.88)";
    roundRect(ctx, px, py, pillW, pillH, pillH / 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PLACE_COLOR[p.place]; ctx.lineWidth = 3;
    roundRect(ctx, px, py, pillW, pillH, pillH / 2); ctx.stroke();
    ctx.fillStyle = PLACE_COLOR[p.place];
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, label, pillW - pillH * 0.6), slot.x + slot.w / 2, py + pillH / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }
  if (!list.length) {
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = `500 34px ${BODY}`; ctx.textAlign = "center";
    ctx.fillText("Ingen vinnare under perioden", IG_W / 2, IG_H / 2);
  }
  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

async function renderCards(d: CardsPostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([(d.photo ? Promise.resolve(null) : tryLoad(bgUrl(d.background))), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5); else backdrop(ctx, bg, dimFor(d.background, 0.62));
  decorate(ctx, d.overlay);
  contentArea(ctx);
  const top = titleBlock(ctx, d.title, d.subtitle, d.dateLine) + 10;
  const bottom = d.sponsor ? IG_H - 180 : IG_H - 60;
  cardSlots(d.cards.length, top, bottom).forEach((slot, i) => {
    const card = d.cards[i];
    if (!card) return;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(card, slot.x, slot.y, slot.w, slot.h);
    ctx.restore();
  });
  if (!d.cards.length) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 34px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Välj spelare med sparade hockeykort", IG_W / 2, IG_H / 2);
  }
  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

/** Var bilden ryms (exporteras för test): så stor som möjligt med bibehållna proportioner, centrerad. */
export function imageSlot(imgW: number, imgH: number, top: number, bottom: number, maxW = IG_W - 100): { x: number; y: number; w: number; h: number } {
  const areaH = Math.max(1, bottom - top);
  const s = Math.min(maxW / imgW, areaH / imgH);
  const w = imgW * s, h = imgH * s;
  return { x: (IG_W - w) / 2, y: top + (areaH - h) / 2, w, h };
}

async function renderImage(d: ImagePostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([tryLoad(bgUrl(d.background)), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  backdrop(ctx, bg, dimFor(d.background, 0.66));
  decorate(ctx, d.overlay);
  contentArea(ctx);
  const accent = accentColor();
  const top = titleBlock(ctx, d.title, d.subtitle, d.dateLine) + 24;
  const infoH = d.info ? 76 + 28 : 0;
  const bottom = (d.sponsor ? IG_H - 235 : IG_H - 80) - infoH;
  const img = d.image;
  const slot = img ? imageSlot(img.width, img.height, top, bottom) : imageSlot(4, 5, top, bottom);
  const r = 22, border = 8;
  if (img) {
    // Ram som hockeykorten: ljus kant, rundade hörn och skugga
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#f4f4f2";
    roundRect(ctx, slot.x - border, slot.y - border, slot.w + border * 2, slot.h + border * 2, r + border);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, slot.x, slot.y, slot.w, slot.h, r);
    ctx.clip();
    ctx.drawImage(img, slot.x, slot.y, slot.w, slot.h);
    ctx.restore();
    // Tunn accentlinje längst ned i ramen
    ctx.fillStyle = accent;
    ctx.fillRect(slot.x + slot.w / 2 - 60, slot.y + slot.h + border / 2 - 2, 120, 4);
  } else {
    ctx.save();
    ctx.setLineDash([16, 12]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 3;
    roundRect(ctx, slot.x, slot.y, slot.w, slot.h, r);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = `500 34px ${BODY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Ladda upp en bild", IG_W / 2, slot.y + slot.h / 2);
    ctx.textBaseline = "alphabetic";
  }
  if (d.info) {
    const y = slot.y + slot.h + border + 28;
    ctx.font = `700 40px ${HEAD}`;
    ctx.letterSpacing = "4px";
    const text = fit(ctx, d.info.toUpperCase(), IG_W - 200);
    const w = ctx.measureText(text).width + 70;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, IG_W / 2 - w / 2, y, w, 76, 38); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    roundRect(ctx, IG_W / 2 - w / 2, y, w, 76, 38); ctx.stroke();
    ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, IG_W / 2 + 2, y + 39);
    ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
  }
  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

async function renderStats(d: StatsPostData): Promise<HTMLCanvasElement> {
  const [bg, sp] = await Promise.all([(d.photo ? Promise.resolve(null) : tryLoad(bgUrl(d.background))), tryLoad(d.sponsor?.logo)]);
  const [c, ctx] = canvas(frameHeight(d.format));
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5); else backdrop(ctx, bg, dimFor(d.background, 0.66));
  decorate(ctx, d.overlay);
  contentArea(ctx);
  const top = titleBlock(ctx, d.title, d.subtitle, d.dateLine) + 10;
  const bottom = d.sponsor ? IG_H - 180 : IG_H - 60;
  const rows = d.rows.slice(0, 10);
  const px = 60, pw = IG_W - 2 * px;
  const rowH = Math.min(92, Math.floor((bottom - top - 60) / Math.max(1, rows.length)));
  const s = Math.max(0.7, rowH / 92);
  const panelH = rows.length * rowH + 60;
  const py = top + Math.max(0, (bottom - top - panelH) / 2);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "rgba(8,12,14,0.7)";
  roundRect(ctx, px, py, pw, panelH, 30);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, panelH, 30);
  ctx.stroke();
  // Kolumnrubrik
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(22 * s)}px ${HEAD}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = accentColor();
  ctx.textAlign = "right";
  if (d.valueLabel) ctx.fillText(d.valueLabel.toUpperCase(), px + pw - 36, py + 32);
  ctx.letterSpacing = "0px";
  rows.forEach((r, i) => {
    const y = py + 50 + i * rowH;
    const mid = y + rowH / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      roundRect(ctx, px + 14, y + 4, pw - 28, rowH - 8, 12);
      ctx.fill();
    }
    const medal = i === 0 ? "#e9c46a" : i === 1 ? "#cbd5e1" : i === 2 ? "#d4915a" : "rgba(255,255,255,0.45)";
    ctx.textAlign = "center";
    ctx.fillStyle = medal;
    ctx.font = `700 ${Math.round(36 * s)}px ${HEAD}`;
    ctx.fillText(r.rank ?? String(i + 1), px + 64, mid + 1);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(40 * s)}px ${HEAD}`;
    const vw = ctx.measureText(r.value).width;
    ctx.fillText(r.value, px + pw - 36, mid + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(34 * s)}px ${BODY}`;
    const maxName = pw - 36 - vw - 30 - 120;
    const hasSub = !!r.sub && rowH >= 70;
    ctx.fillText(fit(ctx, r.name, maxName), px + 120, hasSub ? mid - 13 * s : mid + 1);
    if (hasSub) {
      ctx.font = `400 ${Math.round(22 * s)}px ${BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(fit(ctx, r.sub!, maxName), px + 120, mid + 18 * s);
    }
  });
  if (!rows.length) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 32px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText("Ingen statistik för perioden", IG_W / 2, py + panelH / 2);
  }
  ctx.textBaseline = "alphabetic";
  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp } : null, IG_H - 150);
  return c;
}

export async function renderMediaPost(d: MediaPostData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  if (d.kind === "lineup") return renderLineup(d);
  if (d.kind === "cards") return renderCards(d);
  if (d.kind === "award") return renderAward(d);
  if (d.kind === "stats") return renderStats(d);
  if (d.kind === "image") return renderImage(d);
  if (d.kind === "bill" || d.kind === "article") {
    // Stålbladet (tidningsstil) – egna typsnitt
    const press = await import("@/lib/pressImages");
    await press.ensurePressFonts();
    return d.kind === "bill" ? press.renderBill(d) : press.renderArticle(d);
  }
  if (d.kind === "result") {
    const { renderResultImage } = await import("@/lib/matchReportImages");
    const c = await renderResultImage({ ...d.report, background: bgUrl(d.background), photo: d.photo ?? null, photoDim: d.photoDim, sponsor: d.sponsor ?? d.report.sponsor, format: d.format });
    decorate(c.getContext("2d")!, d.overlay);
    return c;
  }
  return renderText(d);
}
