/**
 * Stålbladet – texter i tidningsstil från en sparad match (Media → Löpsedel och
 * Artikel). Fasta mallar som fylls i med matchens fakta; allt går att skriva om
 * i Media. Slumpen är fast per match, så samma match ger samma förslag.
 */
import type { ReportData } from "@/lib/matchReportImages";

export interface PressFacts {
  draw: boolean;
  winner: string; // lagets namn
  loser: string;
  winnerScore: number;
  loserScore: number;
  score: string; // "3–2" (vinnarens först)
  diff: number;
  /** Största underläge som vinnaren hämtade in (0 = ingen vändning) */
  comebackFrom: number;
  /** Spelare med minst tre mål (och lagets namn) */
  hattricks: Array<{ name: string; goals: number; team: string }>;
  topScorer: { name: string; goals: number; assists: number } | null;
  /** Förloraren gjorde inga mål */
  shutout: boolean;
  gwg: { name: string; minute: number | null } | null;
  first: { name: string; minute: number | null; team: string } | null;
  /** Avgörandet kom i slutet (sista 5 minuterna) */
  lateWinner: boolean;
  stars: string[];
  dateLine: string;
  goals: number;
}

/** "Hampus Bergman #16" → "Hampus Bergman"; "(självmål)" tas bort */
export const cleanName = (n: string | undefined) => (n ?? "").replace(/\s*#\d*\s*$/, "").replace(/\s*\(självmål\)\s*$/i, "").trim();
const first = (n: string) => n.split(/\s+/)[0] ?? n;
const last = (n: string) => n.split(/\s+/).slice(-1)[0] ?? n;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Små tal i ord, som i tidningen: "två måls underläge" */
export const num = (n: number) => (["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"][n] ?? String(n));

export function pressFacts(r: ReportData, plannedMinutes?: number | null): PressFacts {
  const draw = r.whiteScore === r.greenScore;
  const whiteWon = r.whiteScore > r.greenScore;
  const winner = draw ? r.whiteName : whiteWon ? r.whiteName : r.greenName;
  const loser = draw ? r.greenName : whiteWon ? r.greenName : r.whiteName;
  const winTeam = whiteWon ? "white" : "green";
  const winnerScore = Math.max(r.whiteScore, r.greenScore), loserScore = Math.min(r.whiteScore, r.greenScore);
  // Vändning: största underläge för vinnaren (målen är i tidsordning i ReportData)
  let w = 0, l = 0, worst = 0;
  if (!draw) for (const g of r.goals) { if (g.team === winTeam) w++; else l++; worst = Math.min(worst, w - l); }
  const goalsBy = new Map<string, { goals: number; assists: number }>();
  const teamOf = new Map<string, string>();
  for (const g of r.goals) {
    const s = cleanName(g.scorer), a = cleanName(g.assist);
    if (s && !/självmål/i.test(g.scorer ?? "")) teamOf.set(s, g.team === "white" ? r.whiteName : r.greenName);
    if (s && !/självmål/i.test(g.scorer ?? "")) goalsBy.set(s, { goals: (goalsBy.get(s)?.goals ?? 0) + 1, assists: goalsBy.get(s)?.assists ?? 0 });
    if (a) goalsBy.set(a, { goals: goalsBy.get(a)?.goals ?? 0, assists: (goalsBy.get(a)?.assists ?? 0) + 1 });
  }
  const ranked = [...goalsBy.entries()].sort((a, b) => b[1].goals * 2 + b[1].assists - (a[1].goals * 2 + a[1].assists) || b[1].goals - a[1].goals);
  const gwgGoal = r.goals.find((g) => g.gwg);
  const len = plannedMinutes ?? 60;
  const [f] = r.goals; // ReportData: tidsordning, första målet först
  return {
    draw, winner, loser, winnerScore, loserScore, score: `${winnerScore}–${loserScore}`, diff: winnerScore - loserScore,
    comebackFrom: -worst,
    hattricks: ranked.filter(([, v]) => v.goals >= 3).map(([name, v]) => ({ name, goals: v.goals, team: teamOf.get(name) ?? "" })),
    topScorer: ranked[0] && (ranked[0][1].goals || ranked[0][1].assists) ? { name: ranked[0][0], ...ranked[0][1] } : null,
    shutout: !draw && loserScore === 0,
    gwg: gwgGoal && cleanName(gwgGoal.scorer) ? { name: cleanName(gwgGoal.scorer), minute: gwgGoal.minute ?? null } : null,
    first: f && cleanName(f.scorer) ? { name: cleanName(f.scorer), minute: f.minute ?? null, team: f.team === "white" ? r.whiteName : r.greenName } : null,
    lateWinner: !!gwgGoal?.minute && gwgGoal.minute >= len - 5,
    stars: r.stars.map((s) => cleanName(s.name)).filter(Boolean),
    dateLine: r.dateLine,
    goals: r.whiteScore + r.greenScore,
  };
}

/** Fast slump per match (samma förslag varje gång) */
function pick<T>(list: T[], seed: number, n: number): T {
  return list[Math.abs(seed + n) % list.length];
}

export interface Headline { kicker: string; headline: string; sub: string }

/** Rubrikförslag – de mest dramatiska först. */
export function headlineSuggestions(f: PressFacts, seed = 0): Headline[] {
  const out: Headline[] = [];
  const W = f.winner, L = f.loser;
  /** Resultatraden – vid oavgjort ingen "vann" */
  const result = f.draw ? `${W} och ${L} delade på poängen – ${f.score}` : `${W} vann med ${f.score}`;
  if (f.draw) {
    out.push({ kicker: "SPORT", headline: pick([`Ingen vinnare – ${f.score} i rysaren`, `Delad pott när ${W} mötte ${L}`, `${f.score} – och ingen fick jubla`], seed, 1), sub: f.first ? `${f.first.name} öppnade målskyttet` : "Jämnt hela vägen" });
  }
  if (!f.draw && f.comebackFrom >= 2) {
    out.push({ kicker: "VÄNDNINGEN", headline: pick([`${W} vände ${num(f.comebackFrom)} måls underläge`, `Comebacken! ${W} reste sig`, `Från ${num(f.comebackFrom)} måls underläge till seger`], seed, 2), sub: f.gwg ? `${f.gwg.name} blev matchhjälte` : `${W} vann med ${f.score}` });
  }
  for (const h of f.hattricks.slice(0, 1)) {
    // "Sköt sönder" bara när målskytten var i det vinnande laget
    const onWinner = !f.draw && h.team === W;
    const opp = h.team === W ? L : W;
    const heads = onWinner
      ? [`${first(h.name)} sköt sönder ${L}`, `${h.goals} mål – ${last(h.name)} ostoppbar`, `${h.name}s kväll`]
      : f.draw
        ? [`${h.goals} mål – ${last(h.name)} ostoppbar`, `${h.name}s kväll`, `${first(h.name)} höll ${h.team || "laget"} kvar i matchen`]
        : [`${h.goals} mål räckte inte för ${h.team || first(h.name)}`, `${h.name}s kväll – trots förlusten`, `${last(h.name)} ensam mot ${opp}`];
    out.push({ kicker: "HATTRICK", headline: pick(heads, seed, 3), sub: result });
  }
  if (!f.draw && f.lateWinner && f.gwg) {
    out.push({ kicker: "DRAMAT", headline: pick([`Avgörandet i slutminuterna`, `${first(f.gwg.name)} sänkte ${L} sent`, `Rysare – ${W} vann i slutet`], seed, 4), sub: `${f.gwg.name} avgjorde${f.gwg.minute != null ? ` i minut ${f.gwg.minute}` : ""}` });
  }
  if (!f.draw && f.diff >= 4) {
    out.push({ kicker: "KROSSEN", headline: pick([`${W} körde över ${L}`, `Uppvisning – ${f.score}`, `${L} utan chans`], seed, 5), sub: f.topScorer ? `${f.topScorer.name} ledde vägen med ${f.topScorer.goals + f.topScorer.assists} poäng` : `${W} vann med ${f.score}` });
  }
  if (f.shutout) {
    out.push({ kicker: "NOLLAN", headline: pick([`${W} höll nollan`, `Stängt – ${L} mållöst`, `Muren höll hela vägen`], seed, 6), sub: result });
  }
  if (!f.draw) {
    out.push({ kicker: "SPORT", headline: pick([`${W} vann mot ${L}`, `Seger för ${W} – ${f.score}`, `${W} tog hem kvällen`], seed, 7), sub: f.gwg ? `${f.gwg.name} gjorde det avgörande målet` : f.topScorer ? `${f.topScorer.name} bäst på isen` : "" });
  }
  if (f.topScorer && !f.hattricks.length) {
    out.push({ kicker: "MATCHENS SPELARE", headline: pick([`${first(f.topScorer.name)} i högform`, `${f.topScorer.name} – kvällens stora namn`, `Ingen kunde stoppa ${first(f.topScorer.name)}`], seed, 8), sub: `${f.topScorer.goals} mål och ${f.topScorer.assists} assist` });
  }
  return out.slice(0, 5);
}

/** Ingress och brödtext till artikeln (2–3 stycken). */
export function articleText(f: PressFacts, opts: { location?: string | null; sponsor?: string | null; seed?: number } = {}): { ingress: string; body: string } {
  const seed = opts.seed ?? 0;
  const W = f.winner, L = f.loser;
  const where = opts.location ? ` i ${opts.location}` : "";
  const ingress = f.draw
    ? `${W} och ${L} delade på poängen efter ${f.score}${where}. ${f.first ? `${f.first.name} gjorde matchens första mål.` : ""}`.trim()
    : f.comebackFrom >= 2
      ? `${W} låg under med ${num(f.comebackFrom)} mål men vände och vann med ${f.score}${where}.`
      : `${W} vann mot ${L} med ${f.score}${where}.${f.gwg ? ` ${f.gwg.name} gjorde det avgörande målet.` : ""}`;
  const p: string[] = [];
  // Förloppet
  if (f.first) {
    p.push(`${pick(["Matchen", "Kvällen", "Drabbningen"], seed, 1)} fick en ${f.first.minute != null && f.first.minute <= 5 ? "rivstart" : "öppning"} när ${f.first.name} gav ${f.first.team} ledningen${f.first.minute != null ? ` efter ${f.first.minute} minuter` : ""}. ${f.goals >= 8 ? "Det skulle bli en målrik tillställning." : f.goals <= 3 ? "Därefter var det tätt i båda zonerna." : "Därefter böljade spelet fram och tillbaka."}`);
  }
  if (!f.draw && f.comebackFrom >= 2) p.push(`${L} såg länge ut att gå mot seger, men ${W} vägrade ge upp och hämtade in ${num(f.comebackFrom)} måls underläge.`);
  if (!f.draw && f.gwg) p.push(`${f.lateWinner ? "Avgörandet kom sent" : "Det avgörande målet"}${f.gwg.minute != null ? ` – i minut ${f.gwg.minute} –` : ""} och det var ${f.gwg.name} som ${pick(["satte pucken bakom målvakten", "hittade rätt", "fick sista ordet"], seed, 2)}.`);
  if (f.shutout) p.push(`${L} lyckades aldrig hitta förbi försvaret och fick åka hem mållösa.`);
  // Spelarna
  if (f.hattricks.length) p.push(`Kvällens stora namn var ${f.hattricks[0].name} med ${f.hattricks[0].goals} mål – ett hattrick som det lär pratas om i omklädningsrummet.`);
  else if (f.topScorer) p.push(`${f.topScorer.name} var ${pick(["den mest framträdande spelaren", "kvällens poängkung", "en ständig fara framåt"], seed, 3)} med ${f.topScorer.goals} mål och ${f.topScorer.assists} assist.`);
  if (f.stars.length >= 3) p.push(`Matchens tre stjärnor: ${f.stars[0]}, ${f.stars[1]} och ${f.stars[2]}.`);
  if (opts.sponsor) p.push(`Matchen presenterades av ${opts.sponsor}.`);
  return { ingress: cap(ingress), body: p.join(" ").replace(/\s+/g, " ").trim() };
}

/**
 * Inklistrad text (t.ex. från ett mejl) fördelad i fälten: första raden blir
 * rubrik, första stycket efter den ingress och resten brödtext. Fungerar med och
 * utan tomma rader mellan styckena. Radbrytningar i brödtexten behålls.
 */
export function splitPasted(raw: string): { headline: string; ingress: string; body: string } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/^\s*\.{3,}\s*$/gm, "").trim();
  if (!text) return { headline: "", ingress: "", body: "" };
  const lines = text.split("\n");
  // Rubriken: första icke-tomma raden (om den är kort nog och inte en fråga)
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const first = lines[i]?.trim() ?? "";
  const isHead = first.length <= 140 && !/\?$/.test(first);
  if (!isHead) return { headline: "", ingress: "", body: text };
  const headline = first;
  i++;
  while (i < lines.length && !lines[i].trim()) i++;
  // Ingressen: nästa stycke (till tom rad), eller nästa rad om texten saknar tomma rader
  const hasBlank = lines.slice(i).some((l) => !l.trim());
  const ing: string[] = [];
  if (i < lines.length && !/\?$/.test(lines[i].trim())) {
    if (hasBlank) { while (i < lines.length && lines[i].trim()) ing.push(lines[i++].trim()); }
    else ing.push(lines[i++].trim());
  }
  while (i < lines.length && !lines[i].trim()) i++;
  return { headline, ingress: ing.join(" "), body: lines.slice(i).join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
