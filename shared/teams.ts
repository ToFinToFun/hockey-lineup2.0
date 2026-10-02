/**
 * De två interna lagen som begrepp (steg 2 i docs/PLAN-lag-och-motstandare.md).
 *
 * Lagringen är oförändrad: lagen heter "white" och "green" i databasen och
 * uppställningen har team-a/team-b. Allt som visas (namn, kortnamn, färg,
 * logga) och regeln för vilket uppställningslag som är vilket finns här, så
 * att klubbens inställningar slår igenom överallt.
 */
import { club } from "./club";

export type TeamKey = "white" | "green";
export const TEAM_KEYS: TeamKey[] = ["white", "green"];

/** Lagets namn: "Vita". upper: "VITA". */
export function teamName(key: TeamKey, opts: { upper?: boolean } = {}): string {
  const n = club().teams[key].name;
  return opts.upper ? n.toUpperCase() : n;
}

/** Kortnamn, t.ex. "VIT" */
export const teamShortName = (key: TeamKey) => club().teams[key].shortName;
/** Singular för en spelares lag, t.ex. "Vit"/"Grön" */
export const teamSingular = (key: TeamKey) => club().teams[key].singular;
/** Genitiv, t.ex. "Vitas"/"Grönas" */
export const teamGenitive = (key: TeamKey) => { const n = teamName(key); return /[sxz]$/i.test(n) ? n : `${n}s`; };
export const teamColor = (key: TeamKey) => club().teams[key].color;
export const teamAccent = (key: TeamKey) => club().teams[key].accent;

/** Standardnamnen i en ny uppställning (versaler, t.ex. "VITA" och "GRÖNA"). */
export const defaultTeamNames = () => ({ teamAName: teamName("white", { upper: true }), teamBName: teamName("green", { upper: true }) });

/**
 * Är uppställningens lag A det vita (white) laget? Avgörs av lag A:s namn:
 * klubbens namn för white-laget eller "vit" → ja; green-lagets namn eller
 * "grön" → nej. Okänt namn → nej (som tidigare: bara namn med "vit" räknades som vita).
 */
export function isTeamAWhite(teamAName: string | null | undefined): boolean {
  const n = (teamAName ?? defaultTeamNames().teamAName).toLowerCase();
  const white = club().teams.white.name.toLowerCase();
  const green = club().teams.green.name.toLowerCase();
  if (n.includes(white) || n.includes("vit")) return true;
  // Mot motståndare är vårt lag alltid lag A (och räknas som "white" i lagringen)
  if (n.includes(club().name.toLowerCase()) || (club().shortName && n === club().shortName.toLowerCase())) return true;
  if (n.includes(green) || n.includes("grön")) return false;
  return false;
}

/** Normalisera ett lag från mål/inmatning ("white", "vita", "vit", klubbens namn …) till white/green, annars null. */
export function normalizeTeamKey(raw: string | null | undefined): TeamKey | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "white" || t === "vita" || t === "vit" || t === club().teams.white.name.toLowerCase()) return "white";
  if (t === "green" || t === "gröna" || t === "grön" || t === club().teams.green.name.toLowerCase()) return "green";
  return null;
}

/** Initialer för ett lag utan logga, t.ex. "Kalix HC" → "KHC", "Testlaget" → "TES". */
export function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return (words[0] ?? "?").slice(0, 3).toUpperCase();
  return words.map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0])).join("").slice(0, 4).toUpperCase();
}
