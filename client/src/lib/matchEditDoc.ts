/**
 * Redigera uppställningen för en sparad match i Lineup (/lineup?match=ID).
 *
 * Matchens lag A är alltid Vita (server/scoreDb.ts). Spelarna hämtas ur dagens
 * trupp så att de ser ut som vanligt; den som inte finns där längre byggs av
 * matchens sparade uppgifter. Motståndarens spelare sparas aldrig.
 */
import { defaultTeamNames } from "@shared/teams";
import { INTERNAL_SETUP, isOpponentPlayerId } from "@shared/matchSetup";
import type { LineupDoc } from "@shared/lineupDoc";
import { MAX_TEAM_CONFIG, type TeamConfig } from "./lineup";
import type { Player, Position } from "./players";

type SavedSlot = { id: string; name: string; number: string; position: string };
export interface EditableMatch {
  opponentId?: number | null;
  lineup: { lineup: Record<string, SavedSlot> } | null;
  goalHistory: Array<{ team: "white" | "green"; scorer?: string; scorerId?: string; assist?: string; assistId?: string }> | null;
}

const clamp = (n: number, max: number) => Math.min(max, Math.max(1, n));

/** Formationen som rymmer matchens platser (minst 1 av varje) */
export function configFromSlots(slots: string[], team: "a" | "b"): TeamConfig {
  let gk = 0, def = 0, fwd = 0;
  for (const s of slots) {
    const m = s.match(new RegExp(`^team-${team}-(gk|def|fwd)-(\\d+)`));
    if (!m) continue;
    const n = Number(m[2]);
    if (m[1] === "gk") gk = Math.max(gk, n);
    else if (m[1] === "def") def = Math.max(def, n);
    else fwd = Math.max(fwd, n);
  }
  return {
    goalkeepers: clamp(gk, MAX_TEAM_CONFIG.goalkeepers),
    defensePairs: clamp(def, MAX_TEAM_CONFIG.defensePairs),
    forwardLines: clamp(fwd, MAX_TEAM_CONFIG.forwardLines),
  };
}

/** Dokumentet som Lineup visar: matchens uppställning, resten av truppen bredvid */
export function buildMatchEditDoc(match: EditableMatch, roster: Player[], opponentName: string | null): LineupDoc {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const lineup: Record<string, Player> = {};
  for (const [slot, s] of Object.entries(match.lineup?.lineup ?? {})) {
    if (!s?.id || isOpponentPlayerId(s.id)) continue;
    const p = byId.get(s.id) ?? { id: s.id, name: s.name, number: s.number, position: (s.position || "F") as Position };
    lineup[slot] = { ...p, isRegistered: undefined };
  }
  const placed = new Set(Object.values(lineup).map((p) => p.id));
  const names = defaultTeamNames();
  const slots = Object.keys(lineup);
  return {
    players: roster.filter((p) => !placed.has(p.id)).map((p) => ({ ...p, isRegistered: undefined })),
    lineup,
    teamAName: names.teamAName,
    teamBName: match.opponentId != null ? opponentName ?? "Motståndare" : names.teamBName,
    teamAConfig: configFromSlots(slots, "a"),
    teamBConfig: configFromSlots(slots, "b"),
    deletedPlayerIds: [],
    setup: INTERNAL_SETUP,
  };
}

/** Plats → spelar-ID att spara (mot andra lag bara vårt lag, lag A) */
export function slotsToSave(lineup: Record<string, Player>, external: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, p] of Object.entries(lineup)) {
    if (!p?.id || isOpponentPlayerId(p.id)) continue;
    if (!/^team-[ab]-/.test(slot) || (external && !slot.startsWith("team-a-"))) continue;
    out[slot] = p.id;
  }
  return out;
}

/**
 * Spelare med mål eller assist i matchen som inte är med i uppställningen längre.
 * Sparas det blir målen kvar (resultatet ändras aldrig) men utan dem som målskytt/assist.
 * Byter en spelare lag gör det inget: poängen följer spelaren.
 */
export function removedScorers(match: EditableMatch, slots: Record<string, string>, names: Map<string, string>): string[] {
  const inLineup = new Set(Object.values(slots));
  const out = new Map<string, { name: string; goals: number; assists: number }>();
  for (const g of match.goalHistory ?? []) {
    for (const [id, label, kind] of [[g.scorerId, g.scorer, "goals"], [g.assistId, g.assist, "assists"]] as const) {
      if (!id || isOpponentPlayerId(id) || inLineup.has(id)) continue;
      const r = out.get(id) ?? { name: names.get(id) ?? label ?? id, goals: 0, assists: 0 };
      r[kind]++;
      out.set(id, r);
    }
  }
  return [...out.values()].map((r) =>
    `${r.name}: ${[r.goals && `${r.goals} mål`, r.assists && `${r.assists} assist`].filter(Boolean).join(", ")}`);
}
