/**
 * Förkortningar i statistiken – samma överallt i appen, bilder, videor och nyheter (NHL-standard).
 * Förkortningen visas; den svenska förklaringen används som title/tooltip.
 */
export const STAT = {
  GP: "Spelade matcher",
  G: "Mål",
  A: "Assist",
  P: "Poäng (mål + assist)",
  "P/GP": "Poäng per match",
  "G/GP": "Mål per match",
  GWG: "Matchvinnande mål",
  "P/60": "Poäng per 60 minuter speltid",
  TOI: "Speltid (time on ice)",
  "TOI/GP": "Speltid per match",
  W: "Vinster",
  L: "Förluster",
  T: "Oavgjorda",
  "W-L-T": "Vinster–förluster–oavgjorda",
  "W%": "Andel vinster",
  GF: "Gjorda mål",
  GA: "Insläppta mål",
  "+/-": "Målskillnad",
  GAA: "Insläppta mål per 60 minuter i mål",
  "GA/GP": "Insläppta mål per match",
  SO: "Hållna nollor (shutouts)",
  PIR: "Spelarbetyg (Player Impact Rating)",
} as const;
export type StatKey = keyof typeof STAT;

/** Resultat i formrutor m.m.: V/O/F i datan → W/T/L som visas */
export const RESULT_ABBR: Record<string, string> = { V: "W", O: "T", F: "L" };
export const resultLabel = (r: string) => RESULT_ABBR[r] ?? r;

/** "3-1-2" i NHL-ordning W-L-T */
export const wlt = (w: number, l: number, t: number) => `${w}-${l}-${t}`;

/** Svensk förklaring till en förkortning (undefined om den inte finns i listan) */
export const statTitle = (abbr: string): string | undefined => (abbr in STAT ? STAT[abbr as StatKey] : undefined);
