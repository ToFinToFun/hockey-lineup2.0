/**
 * Rättar matchens uppställning utifrån målen, för statistik och PIR.
 *
 * Ibland byter en spelare lag i sista stund och uppställningen stämmer inte.
 * Målen registreras ändå på rätt lag, så de avgör:
 *  - Mål/assist bara för ett lag som spelaren inte stod i → spelaren räknas
 *    till det laget (vinst/förlust, PIR, kemi, form).
 *  - Mål/assist för båda lagen (bytte mitt i matchen) → målen räknas som vanligt,
 *    men spelaren tas bort ur uppställningen för den matchen: ingen vinst/förlust
 *    och ingen PIR-påverkan.
 *  - Mål/assist av en registrerad spelare som saknas i uppställningen → spelaren
 *    läggs till i det lag målet gjordes för.
 * Självmål räknas inte som bevis (målet tillhör motståndarlaget).
 * Den sparade matchen ändras inte – bara det som statistiken räknar på.
 */
type Slotted = { id?: string; name?: string; [k: string]: unknown };
type LineupWrap = { teamAName?: string; lineup?: Record<string, Slotted>; [k: string]: unknown };
type Goal = { team?: string; scorerId?: string; assistId?: string; other?: string; scorer?: string; assist?: string };

export interface CorrectableMatch {
  lineup: unknown;
  goalHistory: unknown;
}

export interface LineupCorrection {
  moved: string[]; // spelare som flyttats till andra laget
  added: string[]; // spelare som lagts till (saknades i uppställningen)
  excluded: string[]; // spelare som gjort mål för båda lagen
}

/** Rättad kopia av matchen (samma objekt om inget behöver ändras). */
export function correctLineupFromGoals<T extends CorrectableMatch>(match: T): T & { lineupCorrection?: LineupCorrection } {
  const wrap = match.lineup as LineupWrap | null;
  const goals = (match.goalHistory as Goal[] | null) ?? [];
  if (!wrap?.lineup || goals.length === 0) return match;

  const teamAWhite = (wrap.teamAName ?? "VITA").toLowerCase().includes("vit");
  const prefixFor = (team: string | undefined): "team-a" | "team-b" | null =>
    team === "white" ? (teamAWhite ? "team-a" : "team-b") : team === "green" ? (teamAWhite ? "team-b" : "team-a") : null;

  // Vilka lag har spelaren gjort poäng för?
  const scoredFor = new Map<string, Set<"team-a" | "team-b">>();
  const names = new Map<string, string>();
  for (const g of goals) {
    if (g.other === "Självmål") continue;
    const side = prefixFor(g.team);
    if (!side) continue;
    for (const [id, name] of [[g.scorerId, g.scorer], [g.assistId, g.assist]] as const) {
      if (!id) continue;
      if (!scoredFor.has(id)) scoredFor.set(id, new Set());
      scoredFor.get(id)!.add(side);
      if (name) names.set(id, name);
    }
  }
  if (scoredFor.size === 0) return match;

  // Var står spelaren i uppställningen?
  const slotOf = new Map<string, string>();
  for (const [slot, p] of Object.entries(wrap.lineup)) if (p?.id && !slotOf.has(p.id)) slotOf.set(p.id, slot);

  const lineup: Record<string, Slotted> = { ...wrap.lineup };
  const correction: LineupCorrection = { moved: [], added: [], excluded: [] };

  for (const [id, sides] of scoredFor) {
    const slot = slotOf.get(id);
    if (sides.size > 1) {
      // Bytte lag under matchen: ingen vinst/förlust eller PIR för den här matchen
      if (slot) {
        delete lineup[slot];
        correction.excluded.push(id);
      }
      continue;
    }
    const [side] = [...sides];
    if (slot?.startsWith(side)) continue; // stämmer redan
    const player = slot ? lineup[slot] : { id, name: names.get(id) ?? id };
    // Ny plats i rätt lag med samma position (egen "kedja 0" så den inte blandas med lagets kedjor)
    const rest = slot ? slot.replace(/^team-[ab]-/, "") : "fwd-1-c";
    const posPart = rest.replace(/(^|-)(fwd|def)-\d+/, "$1$2-0").replace(/(^|-)gk-\d+/, "$1gk-0");
    if (slot) delete lineup[slot];
    lineup[`${side}-moved-${id}-${posPart}`] = player;
    (slot ? correction.moved : correction.added).push(id);
  }

  if (!correction.moved.length && !correction.added.length && !correction.excluded.length) return match;
  return { ...match, lineup: { ...wrap, lineup }, lineupCorrection: correction };
}
