/**
 * Statistik → Export: all statistik för vald period som en text att ge till en
 * AI (Claude, ChatGPT …) som hjälper till att skriva Stålbladet. Först ett
 * grundkoncept (vad klubben och Stålbladet är, ton, regler och exakt format som
 * "Klistra in hela texten" i Media fördelar rätt), sedan datan: tabell, spelare,
 * målvakter, utmärkelser, rekord, sviter, hallar, truppen och varje match.
 *
 * Bara namn och hockeysiffror – inga kontaktuppgifter eller anteckningar.
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { club } from "@shared/club";
import { teamName, normalizeTeamKey, type TeamKey } from "@shared/teams";
import { posLabel } from "@shared/positions";
import { PRESS_NAME } from "./pressImages";

type Out = inferRouterOutputs<AppRouter>["scoreStats"];
type RegistryPlayer = { id: string; name: string; number?: string | null; position?: string | null; teamColor?: string | null; captainRole?: string | null; active?: boolean | null };

export interface StatsExportData {
  period: { label: string; from?: string; to?: string; includeExternal: boolean };
  exportedAt: Date;
  season: Out["seasonStats"];
  awards: Out["seasonAwards"];
  teams: Out["teamComparison"];
  standings: Out["standings"];
  final: Out["final"] | null;
  ice: Out["iceTime"];
  goalieFun: Out["goalieFun"];
  fun: Out["funStats"];
  venues: Out["venueStats"];
  matches: Out["matchLog"];
  players: RegistryPlayer[];
  /** Säsongen hittills, när perioden är kortare (vecka, månad) */
  seasonContext?: { label: string; standings: Out["standings"]; season: Out["seasonStats"] } | null;
}

const num = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? "–" : String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ","));
const tn = (k: TeamKey) => teamName(k);
const bare = (n: string) => n.replace(/\s*#\d*\s*$/, "").trim();
const stockholm = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", ...opts });
const matchWhen = (iso: string) => `${stockholm(iso, { year: "numeric", month: "2-digit", day: "2-digit" })} ${stockholm(iso, { weekday: "short" })} kl ${stockholm(iso, { hour: "2-digit", minute: "2-digit" })}`;
const hm = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);

/** Markdown-tabell */
function table(head: string[], rows: Array<Array<string | number>>): string {
  if (!rows.length) return "_(inget under perioden)_";
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

/** Grundkonceptet till AI:n. Formatet följer "Klistra in hela texten" i Media → Stålbladet. */
export function exportInstructions(): string {
  const c = club();
  const W = tn("white"), G = tn("green");
  return `## Instruktioner till dig som skriver

Du hjälper redaktionen för **${PRESS_NAME}**, den påhittade lokaltidningen i ${c.name}. Tidningen publiceras som bilder i klubbens sociala medier och görs i appens Media → ${PRESS_NAME}. Underlaget nedan är exporterat ur klubbens statistik.

### Om klubben
- ${c.name} spelar rekreationsishockey i Luleå. Vi spelar internmatcher mellan två lag, **${W}** och **${G}**, oftast flera gånger i veckan. Spelarna delas in i lagen inför säsongen.
- **Stålserien** är serien mellan ${W} och ${G} under grundserien: 2 poäng för vinst och 1 för oavgjort. Ettan blir seriesegrare.
- **Slutspelet** är en finalserie mellan lagen. Vinnaren får **Städet**, klubbens mästartrofé.
- Eventuella matcher mot andra lag är markerade med motståndarens namn.
- Speltiden (TOI) är uppskattad utifrån uppställningen och matchens längd. Målvakternas insläppta mål (GA) delas efter tid i mål när två målvakter delat på matchen.

### Sidtyper i ${PRESS_NAME}
- **Löpsedel:** etikett, en kort och slagkraftig rubrik (helst under 40 tecken) och en underrubrik på högst 80 tecken.
- **Förstasida:** etikett, rubrik, ingress och en kort text (bara de första cirka 400 tecknen visas). Textrutan har en egen rubrik på högst 60 tecken. Upp till tre puffar till andra sidor, var och en med etikett (högst 20 tecken), rubrik (högst 70) och kort text (högst 70).
- **Artikel:** etikett, rubrik, valfri citatrubrik, ingress, brödtext, valfritt citat i marginalen, bildtext och byline.
- **Intervju:** som artikeln, men brödtexten är frågor och svar.

### Ton och regler
- Skriv som en lokaltidnings sportsida: engagerat och med glimten i ögat. Lite dramatik och sportklyschor är välkommet, men texten ska alltid vara varm. Den ska aldrig vara elak eller skämta på någons bekostnad.
- Skriv på svenska och skriv ut förkortningarna i texten (mål, assist, poäng, matcher, hållna nollor).
- Använd bara det som står i underlaget. Hitta inte på händelser, skador, citat eller känslor.
- Behövs ett citat, eller svar i en intervju, så skriv ett förslag inom hakparentes, t.ex. [Citat från lagkaptenen om vändningen]. Redaktören frågar sedan personen.
- Skriv inget om spelnivå eller ålder, t.ex. "alla nivåer välkomna" eller "gubbhockey". Lyft det som går bra; svaga siffror hos enskilda spelare ska inte hängas ut.
- Skriv hela namnet första gången en spelare nämns, sedan efternamnet.
- Siffror: decimalkomma och ställningar som 5–3.

### Arbetsgång
1. Läs underlaget och föreslå först **3–5 vinklar**: vad datan bär, vilken sidtyp som passar och en arbetsrubrik för var och en. Vänta sedan på att redaktören väljer. Skriv inte en hel text direkt.
2. Redaktören kan be om annan ton, längd eller sidtyp. Följ det.

### Format när du levererar en artikel, intervju eller förstasida
Lägg texten som ska klistras in i **ett eget kodblock** och ha inget annat i det. Appen fördelar texten så här:
- **Rad 1: rubriken.** Högst 140 tecken, gärna mycket kortare och utan punkt. Vill du ha en radbrytning i rubriken, skriv den hellre i förslagen nedanför.
- **Tom rad, sedan ingressen.** Ett stycke på högst 300 tecken.
- **Tom rad, sedan brödtexten.** Stycken skiljs åt med en tom rad. Högst 3 000 tecken totalt.
  - Brödtexten är ren text: inga mellanrubriker, inga punktlistor och ingen markdown (#, **, _).
  - Rader som slutar med ? blir fetstil. Undvik därför rader som slutar med frågetecken i en vanlig artikel.
- **Intervju:** varje fråga står på en egen rad och slutar med ?. Svaret står på nästa rad och börjar med "– ". Lägg en tom rad mellan varje fråga med svar.

**Under kodblocket** ger du förslag på de övriga fälten. De fylls i för hand, så ange längdgränserna:
- Etikett (högst 24 tecken, t.ex. "Stålserien" eller "Lokalsport")
- Citatrubrik (högst 80)
- Citat i marginalen (högst 160) med vem som sa det (högst 60)
- Bildtext (högst 90) och byline (högst 50)
- För förstasida dessutom textrutans rubrik och puffarna. För löpsedel bara etikett, rubrik och underrubrik, utan kodblock.
`;
}

export function buildStatsExport(d: StatsExportData): string {
  const W = tn("white"), G = tn("green");
  const P = d.period;
  const out: string[] = [];
  const range = P.from || P.to ? ` (${P.from ?? "…"} – ${P.to ?? "…"})` : "";
  out.push(`# ${PRESS_NAME} – underlag från statistiken`);
  out.push(`Period: **${P.label}**${range} · ${d.matches.length} matcher · exporterat ${stockholm(d.exportedAt.toISOString(), { dateStyle: "long", timeStyle: "short" })}${P.includeExternal ? " · inklusive matcher mot andra lag" : ""}`);
  out.push("", exportInstructions(), "", "## Underlag");

  out.push("", "### Förkortningar", "GP matcher · G mål · A assist · P poäng · P/GP poäng per match · GWG matchvinnande mål · TOI speltid · TOI/GP speltid per match · P/60 poäng per 60 min · W vinster · L förluster · T oavgjorda · GF gjorda mål · GA insläppta · +/- målskillnad · GAA insläppta per 60 min · SO hållna nollor · ★ matchens stjärnor (★★★ = 3, ★★ = 2, ★ = 1 poäng). Positioner: G målvakt, D back, C center, LW/RW ytter, F forward.");

  // Tabellen och lagen
  const st = d.standings;
  out.push("", `### Stålserien – tabell för perioden`, table(["#", "Lag", "GP", "W", "L", "T", "GF", "GA", "+/-", "P"],
    st.rows.map((r, i) => [i + 1, tn(r.team), r.gp, r.w, r.l, r.t, r.gf, r.ga, r.diff > 0 ? `+${r.diff}` : r.diff, r.pts])));
  if (st.series.matches.length) out.push("", `Matcherna i ordning (${W}–${G}): ${st.series.matches.map((m) => `${m.white}–${m.green}`).join(", ")}`);
  const t = d.teams;
  if (t.totalMatches) {
    out.push("", "### Lagen jämförda", table(["", W, G], [
      ["Vinster", t.white.wins, t.green.wins], ["Oavgjorda", t.draws, t.draws],
      ["Mål", t.white.goals, t.green.goals], ["Mål per match", num(t.white.goalsPerMatch, 1), num(t.green.goalsPerMatch, 1)],
      ["Hållna nollor", t.white.cleanSheets, t.green.cleanSheets], ["Matchvinnande mål", t.white.gwg, t.green.gwg],
      ["Antal spelare som spelat", t.white.uniquePlayers, t.green.uniquePlayers], ["Utvisningar", t.white.penalties, t.green.penalties],
    ]));
  }

  // Finalen och seriesegraren (innevarande säsong)
  const f = d.final;
  if (f) {
    const lines: string[] = [`### Finalen ${f.season} (Städet)`];
    lines.push(`Seedning efter grundserien: 1. ${tn(f.seeds[0])} (${f.seasonPoints[f.seeds[0]]} p), 2. ${tn(f.seeds[1])} (${f.seasonPoints[f.seeds[1]]} p). Slutspelsperiod ${f.playoffFrom} – ${f.playoffTo}.`);
    if (f.started) lines.push(`Finalserien: ${W} ${f.series.white} vinster, ${G} ${f.series.green} vinster, ${f.series.ties} oavgjorda. Matcher: ${f.series.matches.map((m) => `${m.date.slice(0, 10)} ${m.white}–${m.green}`).join(", ")}.`);
    else lines.push("Finalserien har inte börjat.");
    if (f.winner) lines.push(`**Mästare: ${tn(f.winner)}**. Mästarlaget: ${f.champions.map((p) => p.name).join(", ")}.`);
    if (f.seriesWinner) lines.push(`Stålserien ${f.season}: ${f.seriesWinner.finished ? "seriesegrare" : "serieledare just nu"} ${tn(f.seriesWinner.team)} med ${f.seriesWinner.row.pts} poäng (${f.seriesWinner.row.w}-${f.seriesWinner.row.l}-${f.seriesWinner.row.t}, målskillnad ${f.seriesWinner.row.diff > 0 ? "+" : ""}${f.seriesWinner.row.diff}).`);
    out.push("", lines.join("\n"));
  }

  // Spelarna: poäng + speltid + stjärnor
  const reg = new Map(d.players.map((p) => [p.id, p]));
  const regByName = new Map(d.players.map((p) => [p.name.toLowerCase(), p]));
  const ice = new Map(d.ice.map((r) => [r.id, r]));
  const iceByName = new Map(d.ice.map((r) => [r.name.toLowerCase(), r]));
  const stars = new Map<string, { s3: number; s2: number; s1: number; total: number }>();
  for (const s of d.season.starLeaders) stars.set(bare(s.name).toLowerCase(), { s3: s.stars3, s2: s.stars2, s1: s.stars1, total: s.total });
  const skaters = d.season.topScorers.map((p) => {
    const name = bare(p.name);
    const pid = (p as { id?: string }).id;
    const r = (pid && reg.get(pid)) || regByName.get(name.toLowerCase());
    const i = (pid && ice.get(pid)) || iceByName.get(name.toLowerCase());
    const team = normalizeTeamKey(r?.teamColor) ?? normalizeTeamKey(p.team);
    const s = stars.get(name.toLowerCase());
    return [name, team ? tn(team) : "–", posLabel(r?.position) || "–", r?.captainRole ?? "", p.matches, p.goals, p.assists, p.points,
      num(p.matches ? p.points / p.matches : null), p.gwg, i ? hm(i.minutes) : "–", i ? `${i.perMatch} min` : "–", num(i?.p60), s ? `${s.s3}/${s.s2}/${s.s1}` : "0/0/0"];
  });
  out.push("", "### Utespelare (sorterat på poäng)", table(["Spelare", "Lag", "Pos", "C/A", "GP", "G", "A", "P", "P/GP", "GWG", "TOI", "TOI/GP", "P/60", "★★★/★★/★"], skaters));

  const goalies = d.ice.filter((r) => r.byPos.MV > 0).sort((a, b) => b.gkMatches - a.gkMatches || b.gkWins - a.gkWins);
  const gf = new Map(d.goalieFun.map((g) => [g.id, g]));
  out.push("", "### Målvakter", table(["Målvakt", "GP", "W", "GA", "GAA", "SO", "TOI i mål", "Längsta vinstsvit", "Pågående vinstsvit", "Flest matcher i rad med högst 2 GA"],
    goalies.map((g) => { const x = gf.get(g.id); return [g.name, g.gkMatches, g.gkWins, num(g.ga, 1), num(g.ga60), g.shutouts, hm(g.byPos.MV), x?.winStreak ?? "–", x?.currentWins ?? "–", x?.max2 ?? "–"]; })));

  // Utmärkelser och rekord
  if (d.awards.awards.length) {
    out.push("", "### Utmärkelser för perioden", ...d.awards.awards.map((a) => `- **${a.title}** (${a.description}): ${a.winner} – ${a.value}${a.runnerUp ? `. Tvåa: ${a.runnerUp}${a.runnerUpValue ? ` (${a.runnerUpValue})` : ""}` : ""}${a.third ? `. Trea: ${a.third}${a.thirdValue ? ` (${a.thirdValue})` : ""}` : ""}`));
  }
  const s = d.season;
  const rec: string[] = [];
  if (s.highestScoringMatch) rec.push(`Målrikaste matchen: ${s.highestScoringMatch.name} (${s.highestScoringMatch.whiteScore}–${s.highestScoringMatch.greenScore}, ${W}–${G})`);
  if (s.biggestWinWhite) rec.push(`Största vinsten för ${W}: ${s.biggestWinWhite.whiteScore}–${s.biggestWinWhite.greenScore} (${s.biggestWinWhite.name})`);
  if (s.biggestWinGreen) rec.push(`Största vinsten för ${G}: ${s.biggestWinGreen.greenScore}–${s.biggestWinGreen.whiteScore} (${s.biggestWinGreen.name})`);
  if (s.playerRecordGoals) rec.push(`Flest mål i en match: ${s.playerRecordGoals.playerName}, ${s.playerRecordGoals.goals} (${s.playerRecordGoals.matchName})`);
  if (s.playerRecordAssists) rec.push(`Flest assist i en match: ${s.playerRecordAssists.playerName}, ${s.playerRecordAssists.assists} (${s.playerRecordAssists.matchName})`);
  if (s.playerRecordPoints) rec.push(`Flest poäng i en match: ${s.playerRecordPoints.playerName}, ${s.playerRecordPoints.points} (${s.playerRecordPoints.goals} G + ${s.playerRecordPoints.assists} A, ${s.playerRecordPoints.matchName})`);
  for (const r of s.extraRecords) rec.push(`${r.label}: ${r.who} – ${r.value}${r.detail ? ` (${r.detail})` : ""}`);
  if (s.goalTypes.length) rec.push(`Måltyper: ${s.goalTypes.map((g) => `${g.type} ${g.count}`).join(", ")}`);
  if (rec.length) out.push("", "### Rekord och höjdpunkter", ...rec.map((r) => `- ${r}`));
  if (s.monthlyMvp.length || s.monthlyGoalie.length) {
    out.push("", "### Månadens spelare och målvakt");
    for (const m of s.monthlyMvp) out.push(`- ${m.month} spelare: ${m.playerName} – ${m.points} P (${m.goals} G + ${m.assists} A) på ${m.matches} GP`);
    for (const m of s.monthlyGoalie) out.push(`- ${m.month} målvakt: ${m.playerName} – ${m.gkWins} W på ${m.gkMatches} GP, GAA ${num(m.ga60)}, ${m.shutouts} SO`);
  }

  // Sviter och kuriosa
  const fun = d.fun.filter((r) => r.matches > 0);
  const top = <K extends keyof (typeof fun)[number]>(k: K, label: string, unit: string, n = 3) => {
    const list = [...fun].filter((r) => (r[k] as number) > 0).sort((a, b) => (b[k] as number) - (a[k] as number)).slice(0, n);
    return list.length ? `- ${label}: ${list.map((r) => `${r.name} ${r[k]} ${unit}`).join(", ")}` : null;
  };
  const funLines = [
    top("firstGoals", "Flest första mål i matchen", "st"),
    top("lastGoals", "Flest sista mål i matchen", "st"),
    top("lateGoals", "Flest sena mål (sista 10 min)", "st"),
    top("longestDrought", "Längsta perioden utan mål", "matcher"),
    top("currentPointless", "Pågående matcher utan poäng (skriv varsamt)", "matcher"),
  ].filter(Boolean) as string[];
  if (funLines.length) out.push("", "### Sviter och kuriosa", ...funLines);

  if (d.venues.length) {
    out.push("", "### Hallar", table(["Hall", "GP", `W ${W}`, `W ${G}`, "T", "Mål per match", "Bäst i hallen"],
      d.venues.map((v) => [v.venue, v.matches, v.whiteWins, v.greenWins, v.draws, num(v.goalsPerMatch, 1), v.top[0] ? `${bare(v.top[0].name)} ${v.top[0].points} P` : "–"])));
  }

  // Säsongen hittills (vid vecka/månad)
  const ctx = d.seasonContext;
  if (ctx) {
    out.push("", `### Som jämförelse: ${ctx.label} hittills`, table(["#", "Lag", "GP", "W", "L", "T", "+/-", "P"],
      ctx.standings.rows.map((r, i) => [i + 1, tn(r.team), r.gp, r.w, r.l, r.t, r.diff > 0 ? `+${r.diff}` : r.diff, r.pts])));
    out.push("", "Poängligan (topp 10): " + ctx.season.topScorers.slice(0, 10).map((p, i) => `${i + 1}. ${bare(p.name)} ${p.points} P (${p.goals}+${p.assists}, ${p.matches} GP)`).join(" · "));
  }

  // Truppen
  const squad = d.players.filter((p) => p.active !== false).sort((a, b) => (a.teamColor ?? "").localeCompare(b.teamColor ?? "") || a.name.localeCompare(b.name, "sv"));
  out.push("", "### Truppen (aktiva spelare)", table(["Spelare", "Nr", "Pos", "Lag", "C/A"],
    squad.map((p) => { const k = normalizeTeamKey(p.teamColor); return [p.name, p.number ?? "", posLabel(p.position) || "–", k ? tn(k) : "–", p.captainRole ?? ""]; })));

  // Matcherna
  out.push("", `### Matcherna (${d.matches.length}, äldst först)`);
  for (const m of d.matches) {
    const home = m.opponent ? club().name : W, away = m.opponent ?? G;
    const res = m.white > m.green ? `vinst ${home}` : m.green > m.white ? `vinst ${away}` : "oavgjort";
    out.push("", `#### ${matchWhen(m.start)}${m.location ? ` · ${m.location}` : ""} · ${home} ${m.white}–${m.green} ${away} (${res})${m.title ? ` · rubrik i matchrapporten: "${m.title}"` : ""}`);
    if (m.goals.length) {
      out.push("Mål i tidsordning:");
      for (const g of m.goals) {
        const team = m.opponent ? (g.team === "white" ? home : away) : tn(g.team);
        out.push(`- ${g.minute != null ? `${g.minute}′` : "–"} ${g.score} ${team}: ${g.scorer || "okänd"}${g.assist ? ` (${g.assist})` : ""}${g.type ? ` [${g.type}]` : ""}${g.gwg ? " – matchvinnande" : ""}`);
      }
    } else out.push("Inga mål registrerade.");
    if (m.stars.length) out.push(`Matchens stjärnor: ${m.stars.map((n, i) => `${"★".repeat(3 - i)} ${n}`).join(", ")}`);
    for (const k of ["white", "green"] as const) {
      const lines = m.teams[k];
      if (!lines.length) continue;
      const label = m.opponent ? (k === "white" ? home : away) : tn(k);
      out.push(`${label}: ${lines.map((l) => `${l.label}: ${l.players.map((p) => `${p.pos} ${p.name} (${p.minutes} min)`).join(", ")}`).join(" | ")}`);
    }
  }
  return out.join("\n") + "\n";
}
