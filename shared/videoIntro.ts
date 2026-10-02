/**
 * Media → Video: intro 1 – en puck med lagens loggor på var sida som flippar
 * och landar på det valda laget. Ritas bildruta för bildruta (samma kod i
 * webbläsaren och på servern) och sätts ihop till ett kort klipp av servern.
 */

export type IntroSide = "green" | "white";

export const INTRO_SECONDS = 1.6;

export interface IntroAssets {
  background: HTMLImageElement | null;
  logos: Record<IntroSide, HTMLImageElement | null>;
  /** Lagens färger (glöd bakom pucken när den landar) */
  colors: Record<IntroSide, string>;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Rotation (radianer) vid tiden t: 1,5 varv, så att pucken startar på motsatt lag och landar på det valda */
export function introAngle(t: number): number {
  const p = easeInOutCubic(clamp((t - 0.1) / 1.15));
  return p * 3 * Math.PI;
}

/** Vilken sida syns vid vinkeln (cos > 0 = startsidan) */
export function visibleSide(angle: number, land: IntroSide): IntroSide {
  const other: IntroSide = land === "green" ? "white" : "green";
  return Math.cos(angle) >= 0 ? other : land;
}

function withAlpha(hex: string, a: number) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

/** Ritar en bildruta av intro 1 */
export function drawIntroFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, land: IntroSide, a: IntroAssets) {
  // Bakgrund: arenan, mörkad, med en spotlight i mitten
  ctx.fillStyle = "#0b1410";
  ctx.fillRect(0, 0, w, h);
  if (a.background) {
    const bg = a.background;
    const s = Math.max(w / bg.width, h / bg.height);
    ctx.drawImage(bg, (w - bg.width * s) / 2, (h - bg.height * s) / 2, bg.width * s, bg.height * s);
  }
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.47;
  const R0 = w * 0.3;

  // In: från långt bort (liten) till full storlek
  const inP = easeOutCubic(clamp(t / 0.45));
  const settle = clamp((t - 1.25) / 0.3);
  const R = R0 * (0.25 + 0.75 * inP) * (1 + 0.03 * Math.sin(settle * Math.PI));
  const alpha = clamp(t / 0.15);

  // Glöd i det valda lagets färg när pucken landar
  const glow = clamp((t - 1.0) / 0.4);
  if (glow > 0) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
    g.addColorStop(0, withAlpha(a.colors[land], 0.45 * glow));
    g.addColorStop(1, withAlpha(a.colors[land], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
  spot.addColorStop(0, `rgba(255,255,255,${0.1 * alpha})`);
  spot.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);

  const angle = introAngle(t);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = Math.max(1, R * Math.abs(c));
  const T = R * 0.66 * 0.5; // puckens tjocklek (1 tum mot 3 tum diameter), lite nedtonad
  const dx = T * s; // kantens synliga bredd (med tecken)

  ctx.save();
  ctx.globalAlpha = alpha;

  // Skugga på isen
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + R * 1.18, (rx + Math.abs(dx)) * 0.95, R * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Kanten: bakre ellips + rektangel mellan ytorna, i svart gummi med reflex
  const backX = cx - dx / 2;
  const frontX = cx + dx / 2;
  const edge = ctx.createLinearGradient(Math.min(backX, frontX) - rx, 0, Math.max(backX, frontX) + rx, 0);
  const shine = 0.18 + 0.25 * Math.abs(s);
  edge.addColorStop(0, "#050505");
  edge.addColorStop(0.5, `rgba(${Math.round(70 * shine + 20)},${Math.round(70 * shine + 20)},${Math.round(70 * shine + 22)},1)`);
  edge.addColorStop(1, "#050505");
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.ellipse(backX, cy, rx, R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(Math.min(backX, frontX), cy - R, Math.abs(dx), 2 * R);
  // Räfflor på kanten
  if (Math.abs(dx) > 4) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = Math.max(1, R * 0.008);
    for (let k = -0.9; k <= 0.9; k += 0.06) {
      ctx.beginPath();
      ctx.moveTo(Math.min(backX, frontX), cy + R * k);
      ctx.lineTo(Math.max(backX, frontX), cy + R * k);
      ctx.stroke();
    }
  }

  // Framsidan: svart gummi med lagets logga, smalnar av när pucken vänds
  ctx.beginPath();
  ctx.ellipse(frontX, cy, rx, R, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const side = visibleSide(angle, land);
  const logo = a.logos[side];
  if (logo) {
    const L = R * 1.7;
    const k = Math.min(L / logo.width, L / logo.height);
    ctx.translate(frontX, cy);
    ctx.scale(Math.abs(c), 1);
    ctx.drawImage(logo, (-logo.width * k) / 2, (-logo.height * k) / 2, logo.width * k, logo.height * k);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // Ljus som sveper över ytan när den vänds
  const sweep = ctx.createLinearGradient(frontX - rx, cy - R, frontX + rx, cy + R);
  sweep.addColorStop(0, `rgba(255,255,255,${0.16 * Math.abs(s)})`);
  sweep.addColorStop(0.5, "rgba(255,255,255,0)");
  sweep.addColorStop(1, `rgba(0,0,0,${0.35 * (1 - Math.abs(c))})`);
  ctx.fillStyle = sweep;
  ctx.fillRect(frontX - rx, cy - R, 2 * rx, 2 * R);
  ctx.restore();
  // Ytterkant
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(1, R * 0.012);
  ctx.beginPath();
  ctx.ellipse(frontX, cy, rx, R, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
