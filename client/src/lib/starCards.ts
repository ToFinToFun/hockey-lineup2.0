/**
 * Stars of the Game-kort i matchrapporten: spelarens sparade hockeykort i
 * guldstil, med 1–3 guldstjärnor i toppen och matchens siffror i stället för
 * säsongens. Saknar spelaren sparat kort används klubbens märke i fotorutan.
 *
 * Kortet (5:7) läggs på en 4:5-bild (1080×1350) så att Instagram inte beskär
 * det i en karusell tillsammans med resultat- och målbilderna.
 */
import { renderCard, DEFAULT_SETTINGS, CARD_W, CARD_H, type CardSettings, type CardCell } from "@shared/cardRender";
import type { StarCandidate } from "@/lib/starsOfGame";

/** Matchens siffror för stjärnan (exporteras för test). */
export function starMatchCells(c: StarCandidate, won: boolean | null): CardCell[] {
  if (c.position === "MV" && c.goalsAgainst !== null) {
    return [
      { label: "GA", value: String(c.goalsAgainst) },
      { label: "SO", value: c.goalsAgainst === 0 ? "1" : "0" },
      { label: "RES", value: won === null ? "O" : won ? "W" : "L" },
    ];
  }
  const cells: CardCell[] = [
    { label: "G", value: String(c.goals) },
    { label: "A", value: String(c.assists) },
    { label: "PTS", value: String(c.goals + c.assists) },
  ];
  if (c.gwg) cells.push({ label: "GWG", value: "1" });
  return cells;
}

/** Inställningar för stjärnkortet utifrån spelarens sparade kort (om det finns). */
export function starCardSettings(
  saved: Partial<CardSettings> | null,
  c: StarCandidate,
  rank: 1 | 2 | 3,
  matchLine: string,
  won: boolean | null
): CardSettings {
  const base: CardSettings = {
    ...DEFAULT_SETTINGS,
    name: c.name,
    position: ({ MV: "G", B: "D", C: "C", LW: "LW", RW: "RW" } as Record<string, string>)[c.position] ?? "",
    ...(saved ?? {}),
  };
  // Nummer från det sparade kortet, annars från matchens uppställning (tomt = inget nummer)
  base.number = (saved?.number ?? "").trim() || c.number || "";
  return {
    ...base,
    skin: "retro-guld",
    // Märket för laget spelaren spelade för i matchen
    logo: c.team === "green" ? "green" : "white",
    starRank: rank,
    placeholderLogo: !saved,
    statsMode: "custom",
    statsTitle: matchLine,
    cells: starMatchCells(c, won),
  };
}

export const POST_W = 1080;
export const POST_H = 1350;

/** Lägg kortet på en 4:5-bild med mörk bakgrund och lätt skugga. */
export function cardToPost(card: HTMLCanvasElement, background: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = POST_W;
  c.height = POST_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0, 0, POST_W, POST_H);
  if (background) {
    const s = Math.max(POST_W / background.width, POST_H / background.height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(background, (POST_W - background.width * s) / 2, (POST_H - background.height * s) / 2, background.width * s, background.height * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, POST_W, POST_H);
  }
  const h = POST_H - 110;
  const w = (h * CARD_W) / CARD_H;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(card, (POST_W - w) / 2, (POST_H - h) / 2, w, h);
  ctx.restore();
  return c;
}

export async function renderStarPost(
  settings: CardSettings,
  photo: HTMLImageElement | null,
  mask: HTMLImageElement | null,
  background: HTMLImageElement | null
): Promise<HTMLCanvasElement> {
  const card = await renderCard({ settings, photo, mask, scale: 1.2 });
  return cardToPost(card, background);
}
