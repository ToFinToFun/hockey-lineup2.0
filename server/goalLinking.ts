/**
 * Kopplar mål/assist som bara sparats med namn till rätt spelar-ID.
 *
 * Statistiken räknar på spelar-ID, så ett namn- eller nummerbyte slår igenom
 * överallt. Ett mål som bara har en text (t.ex. sparat när spelaren inte stod
 * i uppställningen, eller med en gammal felstavning) räknas inte på någon.
 * Den här modulen hittar rätt spelare – försiktigt, hellre okopplat än fel:
 *
 *  1. Namnbyte i appen: exakt det gamla namnet/etiketten → den spelaren.
 *  2. Exakt namn, etikett ("Namn #12") eller laget.se-namn på EN registrerad
 *     spelare (matchens deltagare går först om flera har samma namn).
 *  3. Liknande stavning bland matchens deltagare i samma lag: tydligt bäst
 *     (minst 80 % lika och klart bättre än tvåa), eller samma tröjnummer och
 *     minst 60 % lika.
 *
 * Gästspelare (finns inte i registret) och motståndarnas spelare blir kvar som text.
 * Originaltexten sparas kvar i raden (scorerName/assistName), så inget går förlorat.
 */
import { labelOf, normalizeName } from "./playersDb";

export interface LinkPlayer { id: string; name: string; number?: string | null; lagetName?: string | null }
export interface LinkGoal {
  id: number;
  matchId: number;
  team: string;
  goalType?: string | null;
  scorerId: string | null;
  scorerName: string | null;
  assistId: string | null;
  assistName: string | null;
}
export interface LinkParticipant { matchId: number; playerId: string; team: string }
export interface Rename { id: string; oldNames: string[] }
export interface GoalLink { goalId: number; matchId: number; field: "scorerId" | "assistId"; name: string; playerId: string; how: "namnbyte" | "exakt" | "stavning" | "nummer" }

/** Gemener, utan accenter och skiljetecken – för jämförelse av stavning. */
export function plain(s: string | null | undefined): string {
  return normalizeName(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** "Namn #12" → { name: "Namn", number: "12" } */
export function splitLabel(s: string): { name: string; number: string | null } {
  const m = s.trim().match(/^(.*?)\s*#\s*(\d{1,3})$/);
  return m ? { name: m[1], number: m[2] } : { name: s.trim(), number: null };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 0–1, hur lika två namn är (1 = samma). */
export function similarity(a: string, b: string): number {
  const x = plain(a), y = plain(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export function findGoalLinks(input: {
  goals: LinkGoal[];
  participants: LinkParticipant[];
  players: LinkPlayer[];
  renames?: Rename[];
  /** Matcher mot andra lag – där är motståndarens mål alltid "green" och kopplas aldrig. */
  externalMatchIds?: Set<number>;
}): GoalLink[] {
  const reg = new Map(input.players.map((p) => [p.id, p]));
  const byMatch = new Map<number, LinkParticipant[]>();
  for (const p of input.participants) {
    if (!reg.has(p.playerId)) continue;
    byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);
  }

  // Exakta namn → spelare (namn, etikett och laget.se-namn)
  const exact = new Map<string, Set<string>>();
  const addExact = (key: string | null | undefined, id: string) => {
    const k = normalizeName(key);
    if (!k) return;
    if (!exact.has(k)) exact.set(k, new Set());
    exact.get(k)!.add(id);
  };
  for (const p of input.players) {
    addExact(p.name, p.id);
    addExact(labelOf(p), p.id);
    addExact(p.lagetName, p.id);
  }
  const renamed = new Map<string, string>();
  for (const r of input.renames ?? []) for (const n of r.oldNames) if (normalizeName(n)) renamed.set(normalizeName(n), r.id);

  const links: GoalLink[] = [];
  for (const g of input.goals) {
    const parts = byMatch.get(g.matchId) ?? [];
    const ownGoal = g.goalType === "Självmål";
    const other = (t: string) => (t === "white" ? "green" : "white");
    // Målskytten (och assisten) hör till detta lag – vid självmål motståndarlaget
    const playerTeam = ownGoal ? other(g.team) : g.team;
    // Våra lag: där våra spelare står. Mot andra lag utan uppställning: Vita (motståndaren är alltid "green").
    const ourTeams = new Set(parts.map((p) => p.team));
    if (parts.length > 0 && !ourTeams.has(playerTeam)) continue;
    if (parts.length === 0 && input.externalMatchIds?.has(g.matchId) && playerTeam !== "white") continue;
    const sameTeam = parts.filter((p) => p.team === playerTeam);

    const taken = new Set([g.scorerId, g.assistId].filter(Boolean) as string[]);
    for (const [field, idKey, nameKey] of [["scorerId", "scorerId", "scorerName"], ["assistId", "assistId", "assistName"]] as const) {
      if (g[idKey] || !g[nameKey]?.trim()) continue;
      const text = g[nameKey]!.trim();
      const pick = (playerId: string, how: GoalLink["how"]) => {
        if (taken.has(playerId)) return; // samma spelare kan inte vara både målskytt och assist
        taken.add(playerId);
        links.push({ goalId: g.id, matchId: g.matchId, field, name: text, playerId, how });
      };

      // 1. Namnbyte
      const hits = [...(exact.get(normalizeName(text)) ?? exact.get(normalizeName(splitLabel(text).name)) ?? [])];
      const r = renamed.get(normalizeName(text));
      // (inte om någon annan spelare fortfarande heter så)
      if (r && reg.has(r) && hits.every((id) => id === r)) { pick(r, "namnbyte"); continue; }

      // 2. Exakt namn på en registrerad spelare
      if (hits.length === 1) { pick(hits[0], "exakt"); continue; }
      if (hits.length > 1) {
        const inMatch = hits.filter((id) => sameTeam.some((p) => p.playerId === id));
        if (inMatch.length === 1) pick(inMatch[0], "exakt");
        continue; // flera med samma namn och oklart vem – lämnas
      }

      // 3. Liknande stavning bland matchens deltagare i samma lag
      const { name, number } = splitLabel(text);
      const scored = sameTeam
        .map((p) => {
          const pl = reg.get(p.playerId)!;
          const sim = Math.max(similarity(name, pl.name), pl.lagetName ? similarity(name, pl.lagetName) : 0);
          return { id: pl.id, sim, sameNumber: !!number && !!pl.number && pl.number === number };
        })
        .sort((a, b) => b.sim - a.sim);
      const numberHits = scored.filter((s) => s.sameNumber && s.sim >= 0.6);
      if (numberHits.length === 1) { pick(numberHits[0].id, "nummer"); continue; }
      const [best, second] = scored;
      if (best && best.sim >= 0.8 && (!second || best.sim - second.sim >= 0.15)) pick(best.id, "stavning");
    }
  }
  return links;
}
