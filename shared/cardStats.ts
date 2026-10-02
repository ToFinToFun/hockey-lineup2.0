/**
 * Statistiken på hockeykorten – gemensam för webbläsaren och servern (som
 * ritar om kort som används som profilbild när nya matcher godkänts).
 */
import type { CardCell, CardSettings } from "./cardRender";

export interface CardStatLine {
  label: string;
  matches: number;
  goals: number;
  assists: number;
  points: number;
  wins: number;
  winPct: number;
  /** Målvakt: insläppta per match och hållna nollor (bara matcher i mål) */
  goalie: { matches: number; gaa: number; shutouts: number } | null;
}

export interface CardStats {
  season: CardStatLine;
  career: CardStatLine;
  /** Slutspel och försäsong i det pågående hockeyåret (enligt Inställningar → Perioder) */
  playoff?: CardStatLine;
  preseason?: CardStatLine;
  form: string;
  isGoalie: boolean;
}

type Stats = CardStats;

/** Innevarande säsong som "2026/27" (säsongen börjar 1 augusti, som spelarhistoriken). */
export function currentSeasonLabel(now = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Standardrubrik för statistikrutan – sätts automatiskt när läget väljs (exporteras för test). */
export function defaultStatsTitle(mode: CardSettings["statsMode"], stats?: Stats): string {
  if (mode === "season") return `Säsong ${stats?.season.label ?? currentSeasonLabel()}`;
  if (mode === "career") return "Totalt";
  if (mode === "playoff") return `Slutspel ${stats?.season.label ?? currentSeasonLabel()}`;
  if (mode === "preseason") return `Försäsong ${stats?.season.label ?? currentSeasonLabel()}`;
  if (mode === "form") return "Form";
  return "";
}

/** Statistikrutans celler för ett läge (exporteras för test). */
export function cellsFor(mode: CardSettings["statsMode"], stats: Stats | undefined): { title: string; cells: CardCell[] } {
  if (!stats || mode === "none" || mode === "custom" || mode === "form") {
    return { title: mode === "form" ? "Form" : "", cells: [] };
  }
  const line = mode === "career" ? stats.career
    : mode === "playoff" ? (stats.playoff ?? { ...stats.season, matches: 0, goals: 0, assists: 0, points: 0, wins: 0, winPct: 0, goalie: null })
    : mode === "preseason" ? (stats.preseason ?? { ...stats.season, matches: 0, goals: 0, assists: 0, points: 0, wins: 0, winPct: 0, goalie: null })
    : stats.season;
  const title = defaultStatsTitle(mode, stats);
  if (stats.isGoalie && line.goalie) {
    return {
      title,
      cells: [
        { label: "GP", value: String(line.goalie.matches) },
        { label: "GAA", value: line.goalie.gaa.toFixed(1).replace(".", ",") },
        { label: "SO", value: String(line.goalie.shutouts) },
        { label: "W%", value: `${line.winPct}%` },
      ],
    };
  }
  return {
    title,
    cells: [
      { label: "GP", value: String(line.matches) },
      { label: "G", value: String(line.goals) },
      { label: "A", value: String(line.assists) },
      { label: "PTS", value: String(line.points) },
      { label: "W%", value: `${line.winPct}%` },
    ],
  };
}

