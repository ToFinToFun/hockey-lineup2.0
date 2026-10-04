/**
 * Matchrapport för Instagram: två bilder i 4:5 (1080×1350), som ett karusellinlägg.
 *  1. Resultatet: logotyper, stort resultat, vinnare, poängbäst, sponsorer.
 *  2. Målen: alla mål i tidsordning med ställning, målskytt och assist.
 *     Raderna anpassas efter antalet mål; många mål ger två kolumner.
 */
import { clubHeading, club, teamLogo } from "@shared/club";
import { roundRect } from "@/lib/canvas";
import { canvasEnv } from "@shared/canvasEnv";
import { teamColor, teamInitials } from "@shared/teams";

const loadImage = (src: string) => canvasEnv().loadImage(src);

export const IG_W = 1080;
export const IG_H = 1350;

export interface ReportGoal {
  team: "white" | "green";
  time?: string; // "HH:MM" eller "HH:MM:SS" (klockslag, sparas också)
  /** Minuter in i matchen, när starttiden är känd */
  minute?: number | null;
  scorer?: string;
  assist?: string;
  penalty?: boolean;
  /** Matchvinnande mål */
  gwg?: boolean;
}

export interface ReportData {
  /** Rubrik på resultatbilden, t.ex. "SLUTRESULTAT", "MATCH 1/5" eller "JULMATCHEN" */
  title?: string;
  whiteName: string;
  greenName: string;
  whiteScore: number;
  greenScore: number;
  dateLine: string; // "Tisdag 29/9"
  goals: ReportGoal[]; // i tidsordning, äldst först
  /** Stars of the Game, 1:a först: namn och statistik (tom = visas inte) */
  stars: Array<{ name: string; stat: string; gwg?: boolean }>;
  /** Matchens sponsor ("presenteras av") */
  sponsor: { name: string; logo: string | null } | null;
  /** Lagens loggor (null = färgad cirkel – t.ex. motståndare utan logga) */
  logoWhite: string | null;
  logoGreen: string | null;
  /** Lagens färger (standard klubbens; mot motståndare deras färg) */
  colorWhite?: string;
  colorGreen?: string;
  background: string;
  /** Egen bild (Media) – ersätter bakgrunden och mörkas enligt photoDim */
  photo?: HTMLImageElement | null;
  photoDim?: number;
}

/** Lagets färg i rapporten: rapportens egen (motståndare) eller klubbens. */
const teamColW = (d: ReportData) => d.colorWhite ?? teamColor("white");
const teamColG = (d: ReportData) => d.colorGreen ?? teamColor("green");

export const HEAD = "'Oswald', sans-serif";
export const BODY = "'Inter', sans-serif";
/** Lagens färger från klubbens inställningar */
export const WHITE_KEY = "white" as const;
export const GREEN_KEY = "green" as const;

export async function tryLoad(src: string | null | undefined) {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

export async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [`700 200px ${HEAD}`, `600 40px ${HEAD}`, `600 34px ${BODY}`, `400 26px ${BODY}`, `500 28px ${BODY}`].map((f) =>
      document.fonts.load(f).catch(() => undefined)
    )
  );
}

export function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = canvasEnv().createCanvas(IG_W, IG_H);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte");
  return [c, ctx];
}

export function backdrop(ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null, dim = 0.62) {
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

/** Egen bild som bakgrund: täcker allt, mörkas enligt reglaget (0–1) och mest nertill. */
export function photoBackdrop(ctx: CanvasRenderingContext2D, photo: HTMLImageElement, dim = 0.5) {
  const s = Math.max(IG_W / photo.width, IG_H / photo.height);
  ctx.drawImage(photo, (IG_W - photo.width * s) / 2, (IG_H - photo.height * s) / 2, photo.width * s, photo.height * s);
  ctx.fillStyle = `rgba(0,0,0,${0.15 + dim * 0.6})`;
  ctx.fillRect(0, 0, IG_W, IG_H);
  const g = ctx.createLinearGradient(0, IG_H * 0.5, 0, IG_H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.3 + dim * 0.4})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, IG_W, IG_H);
}

export function header(ctx: CanvasRenderingContext2D, title: string, dateLine: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 30px ${HEAD}`;
  ctx.letterSpacing = "10px";
  ctx.fillText(clubHeading(), IG_W / 2, 110);
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

function logo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number, ring: string, initials?: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = ring;
    ctx.fill();
    // Lag utan logga: initialerna i cirkeln
    if (initials) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(r * (initials.length > 3 ? 0.62 : 0.78))}px ${HEAD}`;
      ctx.fillText(initials, cx, cy + r * 0.04);
      ctx.textBaseline = "alphabetic";
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.stroke();
}

export function presentedBy(ctx: CanvasRenderingContext2D, sponsor: { name: string; img: HTMLImageElement | null } | null, y: number) {
  if (!sponsor) return;
  ctx.textAlign = "center";
  ctx.font = `600 22px ${BODY}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("PRESENTERAS AV", IG_W / 2, y);
  ctx.letterSpacing = "0px";
  const cy = y + 72;
  if (sponsor.img) {
    const scale = Math.min(96 / sponsor.img.height, 420 / sponsor.img.width);
    const w = sponsor.img.width * scale;
    const h = sponsor.img.height * scale;
    ctx.drawImage(sponsor.img, IG_W / 2 - w / 2, cy - h / 2, w, h);
  } else {
    ctx.font = `700 48px ${HEAD}`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, sponsor.name, IG_W - 200), IG_W / 2, cy);
    ctx.textBaseline = "alphabetic";
  }
}

/** Stjärna ritad som figur (inga emoji-typsnitt behövs) */
export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Bild 1: resultatet */
export async function renderResultImage(d: ReportData): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const [bg, lw, lg, ...sp] = await Promise.all([
    tryLoad(d.background), tryLoad(d.logoWhite), tryLoad(d.logoGreen), tryLoad(d.sponsor?.logo),
  ]);
  const [c, ctx] = canvas();
  if (d.photo) photoBackdrop(ctx, d.photo, d.photoDim ?? 0.5);
  else backdrop(ctx, bg);
  header(ctx, fit(ctx, (d.title?.trim() || "Slutresultat").toUpperCase(), IG_W - 120), d.dateLine);

  const whiteWon = d.whiteScore > d.greenScore;
  const greenWon = d.greenScore > d.whiteScore;
  // Logotyper ut mot kanterna, resultatet anpassas så att det aldrig krockar med dem
  const cy = 480;
  const logoR = 118;
  const logoX = 175;
  logo(ctx, lw, logoX, cy, logoR, whiteWon ? teamColW(d) : teamColW(d) + "59", teamInitials(d.whiteName));
  logo(ctx, lg, IG_W - logoX, cy, logoR, greenWon ? teamColG(d) : teamColG(d) + "59", teamInitials(d.greenName));

  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  // Långa namn (t.ex. "STÅLSTADENS SF") krymps så att de ryms under loggan
  const nameFont = (text: string) => {
    let px = 44;
    ctx.font = `700 ${px}px ${HEAD}`;
    while (px > 22 && ctx.measureText(text).width > 2 * logoX - 30) {
      px -= 2;
      ctx.font = `700 ${px}px ${HEAD}`;
    }
  };
  ctx.fillStyle = teamColW(d);
  nameFont(d.whiteName.toUpperCase());
  ctx.fillText(d.whiteName.toUpperCase(), logoX, cy + logoR + 70);
  ctx.fillStyle = teamColG(d);
  nameFont(d.greenName.toUpperCase());
  ctx.fillText(d.greenName.toUpperCase(), IG_W - logoX, cy + logoR + 70);
  ctx.letterSpacing = "0px";

  // Resultatet: så stort som ryms mellan loggorna (luft 28 px på var sida)
  const room = IG_W - 2 * (logoX + logoR + 12 + 28);
  const dashGap = 34;
  let size = 230;
  const widthAt = (px: number) => {
    ctx.font = `700 ${px}px ${HEAD}`;
    return ctx.measureText(String(d.whiteScore)).width + ctx.measureText(String(d.greenScore)).width + 2 * dashGap + px * 0.25;
  };
  while (size > 120 && widthAt(size) > room) size -= 6;
  ctx.font = `700 ${size}px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = whiteWon ? "#ffffff" : "rgba(255,255,255,0.55)";
  ctx.textAlign = "right";
  ctx.fillText(String(d.whiteScore), IG_W / 2 - dashGap, cy + 4);
  ctx.textAlign = "left";
  ctx.fillStyle = greenWon ? teamColG(d) : "rgba(255,255,255,0.55)";
  ctx.fillText(String(d.greenScore), IG_W / 2 + dashGap, cy + 4);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `700 ${Math.round(size * 0.48)}px ${HEAD}`;
  ctx.fillText("–", IG_W / 2, cy);
  ctx.textBaseline = "alphabetic";

  // Vinnare
  const verdict = whiteWon ? `${d.whiteName.toUpperCase()} VANN` : greenWon ? `${d.greenName.toUpperCase()} VANN` : "OAVGJORT";
  const verdictColor = whiteWon ? teamColW(d) : greenWon ? teamColG(d) : "rgba(255,255,255,0.8)";
  ctx.font = `700 40px ${HEAD}`;
  ctx.letterSpacing = "8px";
  const vw = ctx.measureText(verdict).width + 70;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, IG_W / 2 - vw / 2, 712, vw, 72, 36);
  ctx.fill();
  ctx.strokeStyle = verdictColor;
  ctx.lineWidth = 2;
  roundRect(ctx, IG_W / 2 - vw / 2, 712, vw, 72, 36);
  ctx.stroke();
  ctx.fillStyle = verdictColor;
  ctx.textBaseline = "middle";
  ctx.fillText(verdict, IG_W / 2 + 4, 749);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";

  // Stars of the Game – namnet centrerat; stjärnor till vänster och statistik till höger,
  // så att raderna står i linje oavsett om statistiken visas
  if (d.stars.length) {
    ctx.textAlign = "center";
    ctx.font = `600 24px ${BODY}`;
    ctx.letterSpacing = "5px";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("STARS OF THE GAME", IG_W / 2, 870);
    ctx.letterSpacing = "0px";
    const gold = "#fbbf24";
    const starW = 30;
    d.stars.slice(0, 3).forEach((st, i) => {
      const y = 925 + i * 62;
      const count = 3 - i;
      const nameFont = `600 ${i === 0 ? 38 : 34}px ${BODY}`;
      ctx.font = nameFont;
      const name = fit(ctx, st.name, IG_W - 2 * (3 * starW + 170));
      const nameW = ctx.measureText(name).width;
      const left = IG_W / 2 - nameW / 2;
      for (let k = 0; k < count; k++) star(ctx, left - 18 - (k + 0.5) * starW, y - 2, 13, gold);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(name, IG_W / 2, y);
      let sx = IG_W / 2 + nameW / 2 + 20;
      if (st.stat) {
        ctx.textAlign = "left";
        ctx.font = `400 26px ${BODY}`;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(st.stat, sx, y + 1);
        sx += ctx.measureText(st.stat).width + 12;
      }
      if (st.gwg) {
        // Matchvinnande mål i guld
        ctx.textAlign = "left";
        ctx.font = `700 24px ${BODY}`;
        ctx.fillStyle = gold;
        ctx.fillText("GWG", sx, y + 1);
      }
      ctx.textBaseline = "alphabetic";
    });
  }

  presentedBy(ctx, d.sponsor ? { name: d.sponsor.name, img: sp[0] ?? null } : null, 1135);
  return c;
}

/** Hur målraderna ska se ut för ett visst antal mål (exporteras för test). */
export function goalsLayout(n: number, top = 300, bottom = IG_H - 90) {
  const avail = bottom - top;
  // Två kolumner redan från 9 mål – annars blir raderna för låga och texten för liten
  const columns = n > 8 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(n / columns));
  const rowH = Math.min(118, Math.floor(avail / perCol));
  // I två kolumner styr även bredden textstorleken
  const scale = Math.max(0.62, Math.min(columns === 2 ? 0.8 : 1, rowH / 118));
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
    const color = goal.team === "white" ? teamColW(d) : teamColG(d);
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
    const scoreX = x + (L.columns === 2 ? 70 : 90) * s;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("–", scoreX, mid);
    ctx.textAlign = "right";
    ctx.fillStyle = goal.team === "white" ? "#ffffff" : "rgba(255,255,255,0.6)";
    ctx.fillText(String(w), scoreX - 12 * s, mid);
    ctx.textAlign = "left";
    ctx.fillStyle = goal.team === "green" ? teamColG(d) : "rgba(255,255,255,0.6)";
    ctx.fillText(String(g), scoreX + 12 * s, mid);

    // Målskytt och assist
    const textX = x + (L.columns === 2 ? 150 : 190) * s;
    const right = x + colW - 24 * s;
    // Minuter in i matchen ("12'") när starttiden är känd, annars klockslaget
    const timeText = goal.minute != null ? `${goal.minute}'` : goal.time && L.columns === 1 ? goal.time.slice(0, 5) : "";
    ctx.font = `400 ${Math.round(24 * s)}px ${BODY}`;
    const timeW = timeText ? ctx.measureText(timeText).width + 16 : 0;
    const maxText = right - textX - timeW;

    const hasAssist = !!goal.assist && h > 60;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(34 * s)}px ${BODY}`;
    ctx.font = `700 ${Math.round(20 * s)}px ${BODY}`;
    const gwgW = goal.gwg ? ctx.measureText("GWG").width + 12 : 0;
    ctx.font = `600 ${Math.round(34 * s)}px ${BODY}`;
    const scorerText = fit(ctx, `${goal.scorer || "Okänd målskytt"}${goal.penalty ? " (straff)" : ""}`, maxText - gwgW);
    ctx.fillText(scorerText, textX, hasAssist ? mid - 16 * s : mid);
    if (goal.gwg) {
      const gx = textX + ctx.measureText(scorerText).width + 12;
      ctx.font = `700 ${Math.round(20 * s)}px ${BODY}`;
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("GWG", gx, (hasAssist ? mid - 16 * s : mid) + 1);
    }
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
    ctx.textBaseline = "alphabetic";
  });

  return c;
}
