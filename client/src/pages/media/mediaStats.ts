/**
 * Data till Media-mallen Statistik: perioder (som i statistikmodulen) och
 * rader för topplistor, utmärkelser och rekord. PIR är medvetet inte med.
 */
import { teamName, teamSingular, teamGenitive, defaultTeamNames } from "@shared/teams";
import type { StatsRow } from "@/lib/mediaImages";

export type StatPeriod = "season" | "playoff" | "preseason" | "month" | "week" | "all";
export type StatCategory = "points" | "goals" | "assists" | "gwg" | "matches" | "awards" | "records";

export const STAT_PERIODS: Array<{ id: StatPeriod; name: string }> = [
  { id: "season", name: "Säsong" }, { id: "playoff", name: "Slutspel" }, { id: "preseason", name: "Försäsong" },
  { id: "month", name: "Månad" }, { id: "week", name: "Vecka" }, { id: "all", name: "Totalt" },
];
export const STAT_CATEGORIES: Array<{ id: StatCategory; name: string; title: string; valueLabel: string }> = [
  { id: "points", name: "Poäng", title: "Poängligan", valueLabel: "PTS" },
  { id: "goals", name: "Mål", title: "Skytteligan", valueLabel: "G" },
  { id: "assists", name: "Assist", title: "Assistligan", valueLabel: "A" },
  { id: "gwg", name: "GWG", title: "Matchvinnande mål", valueLabel: "GWG" },
  { id: "matches", name: "Matcher", title: "Flest matcher", valueLabel: "GP" },
  { id: "awards", name: "Utmärkelser", title: "Utmärkelser", valueLabel: "" },
  { id: "records", name: "Rekord", title: "Rekord", valueLabel: "" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Datumintervall och etikett för en period (exporteras för test). */
export function periodRange(
  p: StatPeriod,
  periods: { seasonFrom: string; seasonTo: string; playoffFrom: string; playoffTo: string; preseasonFrom: string; preseasonTo: string } | undefined,
  now = new Date()
): { from?: string; to?: string; label: string } {
  if (p === "week") {
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const jan4 = new Date(mon.getFullYear(), 0, 4);
    const week = 1 + Math.round(((mon.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return { from: iso(mon), to: iso(sun), label: `Vecka ${week}` };
  }
  if (p === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1), to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const m = now.toLocaleDateString("sv-SE", { month: "long" });
    return { from: iso(from), to: iso(to), label: `${m.charAt(0).toUpperCase()}${m.slice(1)} ${now.getFullYear()}` };
  }
  if (p === "all" || !periods) return { label: "Totalt" };
  const pair = p === "season" ? [periods.seasonFrom, periods.seasonTo] : p === "playoff" ? [periods.playoffFrom, periods.playoffTo] : [periods.preseasonFrom, periods.preseasonTo];
  const y1 = pair[0].slice(0, 4), y2 = pair[1].slice(2, 4);
  const name = p === "season" ? "Säsong" : p === "playoff" ? "Slutspel" : "Försäsong";
  return { from: pair[0], to: pair[1], label: y1.slice(2) === y2 ? `${name} ${y1}` : `${name} ${y1}/${y2}` };
}

interface Scorer { name: string; goals: number; assists: number; points: number; gwg: number; matches: number }
interface SeasonStatsLike {
  topScorers: Scorer[];
  playerRecordGoals: { playerName: string; goals: number; matchName: string } | null;
  playerRecordAssists: { playerName: string; assists: number; matchName: string } | null;
  playerRecordPoints: { playerName: string; points: number; goals: number; assists: number; matchName: string } | null;
  biggestWinWhite: { name: string; whiteScore: number; greenScore: number } | null;
  biggestWinGreen: { name: string; whiteScore: number; greenScore: number } | null;
  highestScoringMatch: { name: string; whiteScore: number; greenScore: number; totalGoals: number } | null;
}
interface AwardLike { title: string; emoji: string; winner: string; value: string }

/** Rader för vald kategori (exporteras för test). */
export function statRows(cat: StatCategory, stats: SeasonStatsLike | undefined, awards: AwardLike[] | undefined, limit: number): StatsRow[] {
  if (cat === "awards") return (awards ?? []).slice(0, limit).map((a) => ({ rank: a.emoji, name: a.winner, sub: a.title, value: a.value.replace(/ \(.*\)$/, "") }));
  if (!stats) return [];
  if (cat === "records") {
    const date = (n: string) => n.split(" ").slice(0, 3).join(" ");
    const rows: StatsRow[] = [];
    if (stats.playerRecordPoints) rows.push({ rank: "★", name: stats.playerRecordPoints.playerName, sub: `Flest poäng i en match · ${date(stats.playerRecordPoints.matchName)}`, value: `${stats.playerRecordPoints.points}p` });
    if (stats.playerRecordGoals) rows.push({ rank: "★", name: stats.playerRecordGoals.playerName, sub: `Flest mål i en match · ${date(stats.playerRecordGoals.matchName)}`, value: `${stats.playerRecordGoals.goals}G` });
    if (stats.playerRecordAssists) rows.push({ rank: "★", name: stats.playerRecordAssists.playerName, sub: `Flest assist i en match · ${date(stats.playerRecordAssists.matchName)}`, value: `${stats.playerRecordAssists.assists}A` });
    if (stats.highestScoringMatch) rows.push({ rank: "★", name: "Målrikaste matchen", sub: date(stats.highestScoringMatch.name), value: `${stats.highestScoringMatch.whiteScore}–${stats.highestScoringMatch.greenScore}` });
    if (stats.biggestWinWhite) rows.push({ rank: "★", name: `${teamGenitive("white")} största vinst`, sub: date(stats.biggestWinWhite.name), value: `${stats.biggestWinWhite.whiteScore}–${stats.biggestWinWhite.greenScore}` });
    if (stats.biggestWinGreen) rows.push({ rank: "★", name: `${teamGenitive("green")} största vinst`, sub: date(stats.biggestWinGreen.name), value: `${stats.biggestWinGreen.greenScore}–${stats.biggestWinGreen.whiteScore}` });
    return rows.slice(0, limit);
  }
  const key: Record<string, keyof Scorer> = { points: "points", goals: "goals", assists: "assists", gwg: "gwg", matches: "matches" };
  const k = key[cat];
  const sorted = [...stats.topScorers].filter((p) => (p[k] as number) > 0).sort((a, b) => (b[k] as number) - (a[k] as number) || b.points - a.points || b.goals - a.goals);
  let rank = 0, prev = NaN;
  return sorted.slice(0, limit).map((p, i) => {
    if (p[k] !== prev) { rank = i + 1; prev = p[k] as number; }
    return { rank: String(rank), name: p.name, sub: cat === "points" ? `${p.goals}+${p.assists} · ${p.matches} matcher` : `${p.matches} matcher`, value: String(p[k]) };
  });
}
