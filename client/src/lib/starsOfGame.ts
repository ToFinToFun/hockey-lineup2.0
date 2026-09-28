/**
 * Stars of the Game (NHL-stil): tre stjärnor per match.
 *
 * Automatiskt urval:
 *  - Utespelare: mål 3 p, assist 2 p, matchvinnande mål +1, vinnande lag +1.
 *  - Målvakt: vinst +2, och färre insläppta ger mer (0 insläppta = hållen nolla).
 *    En målvakt som hållit nollan får alltid en stjärna.
 *  - Räcker inte poängen till tre fylls det på med slumpade spelare – samma
 *    slump för samma match, så att valet inte hoppar runt.
 * Valet kan ändras för hand och sparas på matchen.
 */

export interface StarGoal {
  team: "white" | "green";
  scorer?: string;
  scorerId?: string;
  assist?: string;
  assistId?: string;
  other?: string;
}

export interface StarCandidate {
  key: string; // spelar-ID eller namn
  name: string;
  team: "white" | "green";
  position: "MV" | "B" | "C" | "LW" | "RW" | "";
  goals: number;
  assists: number;
  gwg: boolean;
  goalsAgainst: number | null; // bara målvakter
  score: number;
}

type LineupPlayer = { id?: string; name?: string; number?: string };
type LineupWrap = { teamAName?: string; lineup?: Record<string, LineupPlayer> } | null | undefined;

const posOf = (slot: string): StarCandidate["position"] =>
  slot.includes("-gk-") ? "MV" : slot.includes("-def-") ? "B" : slot.endsWith("-c") ? "C" : slot.endsWith("-rw") ? "RW" : "LW";

/** "Kalle Karlsson #12" → "Kalle Karlsson" */
const bare = (label: string) => label.replace(/\s+#\d+\s*$/, "").trim();

/** Förkortning i texten: M, B, C, VF, HF */
export function starPositionLabel(p: StarCandidate["position"]): string {
  return { MV: "M", B: "B", C: "C", LW: "VF", RW: "HF", "": "" }[p];
}

/** Liten deterministisk slump (samma match → samma ordning). */
function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function starCandidates(match: {
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory: StarGoal[]; // nyast först
  lineup: LineupWrap;
}): StarCandidate[] {
  const aWhite = (match.lineup?.teamAName ?? "VITA").toLowerCase().includes("vit");
  const winner = match.teamWhiteScore > match.teamGreenScore ? "white" : match.teamGreenScore > match.teamWhiteScore ? "green" : null;
  const byKey = new Map<string, StarCandidate>();
  const nameToKey = new Map<string, string>();

  for (const [slot, p] of Object.entries(match.lineup?.lineup ?? {})) {
    if (!p) continue;
    const key = p.id || p.name || slot;
    if (byKey.has(key)) continue;
    const team: "white" | "green" = slot.startsWith("team-a") === aWhite ? "white" : "green";
    const pos = posOf(slot);
    const name = (p.name ?? key).trim();
    byKey.set(key, {
      key, name, team, position: pos, goals: 0, assists: 0, gwg: false,
      goalsAgainst: pos === "MV" ? (team === "white" ? match.teamGreenScore : match.teamWhiteScore) : null, score: 0,
    });
    nameToKey.set(name.toLowerCase(), key);
    if (p.number) nameToKey.set(`${name} #${p.number}`.toLowerCase(), key);
  }

  const find = (id: string | undefined, label: string | undefined, team: "white" | "green") => {
    if (id && byKey.has(id)) return byKey.get(id)!;
    if (label) {
      const k = nameToKey.get(label.toLowerCase()) ?? nameToKey.get(bare(label).toLowerCase());
      if (k) return byKey.get(k)!;
      // Målskytt som inte står i uppställningen
      const key = id || bare(label);
      const c: StarCandidate = { key, name: bare(label), team, position: "", goals: 0, assists: 0, gwg: false, goalsAgainst: null, score: 0 };
      byKey.set(key, c);
      nameToKey.set(bare(label).toLowerCase(), key);
      return c;
    }
    return null;
  };

  const chrono = [...match.goalHistory].reverse();
  const loser = Math.min(match.teamWhiteScore, match.teamGreenScore);
  let winnerGoals = 0;
  for (const g of chrono) {
    if (g.other === "Självmål") continue;
    const s = find(g.scorerId, g.scorer, g.team);
    if (s) s.goals++;
    const a = find(g.assistId, g.assist, g.team);
    if (a) a.assists++;
    if (winner && g.team === winner) {
      if (winnerGoals === loser && s) s.gwg = true;
      winnerGoals++;
    }
  }

  for (const c of byKey.values()) {
    const won = winner === c.team;
    if (c.position === "MV" && c.goalsAgainst !== null) {
      c.score = (won ? 2 : 0) + (c.goalsAgainst === 0 ? 10 : Math.max(0, 4 - c.goalsAgainst)) + c.goals * 3 + c.assists * 2;
    } else {
      c.score = c.goals * 3 + c.assists * 2 + (c.gwg ? 1 : 0) + (won && (c.goals || c.assists) ? 1 : 0);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.score - a.score || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "sv")
  );
}

/** Automatiska tre stjärnor (nycklar), 1:a först. */
export function autoStars(candidates: StarCandidate[], seed: number): string[] {
  const picked: StarCandidate[] = [];
  // Hållen nolla ger alltid en stjärna
  for (const c of candidates) if (c.position === "MV" && c.goalsAgainst === 0 && picked.length < 3) picked.push(c);
  for (const c of candidates) if (picked.length < 3 && c.score > 0 && !picked.includes(c)) picked.push(c);
  picked.sort((a, b) => b.score - a.score);
  if (picked.length < 3) {
    const rest = candidates.filter((c) => !picked.includes(c));
    const rnd = seeded(seed);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    picked.push(...rest.slice(0, 3 - picked.length));
  }
  return picked.slice(0, 3).map((c) => c.key);
}

/** "Jerry Paasovaara (VF) 2M 3A 5P" eller "Linus Carbin (M) 0 insläppta" */
export function starLine(c: StarCandidate): string {
  const pos = starPositionLabel(c.position);
  const head = pos ? `${c.name} (${pos})` : c.name;
  if (c.position === "MV" && c.goalsAgainst !== null) return `${head} ${c.goalsAgainst} insläppta`;
  const pts = c.goals + c.assists;
  return pts ? `${head} ${c.goals}M ${c.assists}A ${pts}P` : head;
}
