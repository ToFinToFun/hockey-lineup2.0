/**
 * Auto-lag och avvikelsemejl (Lineup → Auto-lag).
 *
 * En bestämd tid före evenemanget (standard 90 min) jämförs uppställningen med
 * anmälningarna på laget.se:
 *  - Avvikelse = anmälda som saknas i uppställningen, eller spelare i
 *    uppställningen som inte är anmälda (återbud eller inte svarat).
 *  - Är Auto-lag på, ingen nyhet publicerad/tidsinställd för dagen och det finns
 *    en avvikelse → laget görs om helt: anmälningarna synkas och alla anmälda
 *    fördelas med Auto (position, lagfärg, PIR) – precis som Auto-knappen i Lineup.
 *  - Annars, vid avvikelse → mejl om vad som inte stämmer.
 * Gäller internmatcher (Vita–Gröna). Mot andra lag görs ingen automatik.
 */
import crypto from "crypto";
import { getConfigValue, setConfigValue, getAllMatchResults } from "./scoreDb";
import { fetchAttendance } from "./lagetSe";
import { eventStart, nextEvent } from "./autoNews";
import { readLastPublished } from "./newsState";
import { getActiveLock } from "./lineupLock";
import { getLineupSnapshot, applyLineupPatch } from "./lineupSync";
import { getRegistryMap } from "./playersDb";
import { calculatePIR } from "./pir";
import { loadPirConfig } from "./pirConfig";
import { positionAndTeamHistory } from "./positionHistory";
import { notify, mailLayout } from "./notifications";
import { appUrl } from "./clubConfig";
import { isOpponentPlayerId } from "../shared/matchSetup";
import { teamName } from "../shared/teams";
import { matchRegisteredPlayers, matchDeclinedPlayers } from "../client/src/lib/laget";
import { autoDistribute } from "../client/src/lib/autoDistribute";
import type { LineupOp } from "../shared/lineupDoc";
import type { Player } from "../client/src/lib/players";

export interface AutoLineupConfig {
  /** Gör om laget automatiskt (annars bara avvikelsemejl) */
  enabled: boolean;
  /** Minuter före evenemangets start */
  minutesBefore: number;
}
export const DEFAULT_AUTO_LINEUP: AutoLineupConfig = { enabled: false, minutesBefore: 90 };

const CONFIG_KEY = "auto_lineup";
const STATE_KEY = "auto_lineup_state";

export async function getAutoLineupConfig(): Promise<AutoLineupConfig> {
  try {
    const raw = await getConfigValue(CONFIG_KEY);
    return raw ? { ...DEFAULT_AUTO_LINEUP, ...JSON.parse(raw) } : DEFAULT_AUTO_LINEUP;
  } catch {
    return DEFAULT_AUTO_LINEUP;
  }
}
export async function setAutoLineupConfig(c: AutoLineupConfig) {
  await setConfigValue(CONFIG_KEY, JSON.stringify({ enabled: !!c.enabled, minutesBefore: Math.min(240, Math.max(60, Math.round(c.minutesBefore))) }));
}

/** Vad som gjordes för ett evenemang (läses av autoNews för att nämna det i mejlen) */
export interface AutoLineupState { eventDate?: string; done?: boolean; autoCreated?: boolean; summary?: string }
export async function getAutoLineupState(): Promise<AutoLineupState> {
  try {
    const raw = await getConfigValue(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export interface Mismatch { missing: Player[]; notComing: Array<{ player: Player; declined: boolean }> }

/** Avvikelser mellan uppställningen och anmälningarna (exporteras för test) */
export function findMismatch(lineup: Record<string, Player>, registeredIds: Set<string>, declinedIds: Set<string>, roster: Player[]): Mismatch {
  const placed = Object.values(lineup).filter((p) => !isOpponentPlayerId(p.id));
  const placedIds = new Set(placed.map((p) => p.id));
  const all = new Map([...roster, ...placed].map((p) => [p.id, p]));
  const missing = [...registeredIds].filter((id) => !placedIds.has(id)).map((id) => all.get(id)).filter(Boolean) as Player[];
  const notComing = placed.filter((p) => !registeredIds.has(p.id)).map((p) => ({ player: p, declined: declinedIds.has(p.id) }));
  return { missing, notComing };
}

const names = (ps: Player[]) => ps.map((p) => `${p.name}${p.number ? ` #${p.number}` : ""}`).join(", ");

/** Spelarna med positionshistorik och PIR – samma underlag som Auto i Lineup */
async function enrich(players: Player[]): Promise<Player[]> {
  const matches = await getAllMatchResults();
  const hist = positionAndTeamHistory(matches);
  const { weights, adjustments } = await loadPirConfig();
  const pir = new Map(calculatePIR(matches, { weights, adjustments }).map((r) => [r.playerKey, r]));
  const registry = await getRegistryMap();
  return players.map((p) => {
    const h = hist[p.id];
    const r = pir.get(p.id);
    const reg = registry.get(p.id);
    return {
      ...p,
      altPosition: (reg?.altPosition as Player["altPosition"]) ?? null,
      ...(h?.mostPlayed ? { mostPlayedPosition: h.mostPlayed } : {}),
      ...(h?.mostPlayedTeam === "white" || h?.mostPlayedTeam === "green" ? { mostPlayedTeam: h.mostPlayedTeam } : {}),
      ...(r
        ? {
            pir: r.rating, pirMatchesPlayed: r.matchesPlayed, pirAdjustment: r.adjustment ?? 0,
            pirGoalkeeper: r.goalkeeperRating, pirGoalkeeperMatchesPlayed: r.goalkeeperMatchesPlayed,
            pirOutfield: r.outfieldRating, pirOutfieldMatchesPlayed: r.outfieldMatchesPlayed,
          }
        : { pir: 1000, pirMatchesPlayed: 0, pirAdjustment: adjustments[p.id] ?? 0 }),
    } as Player;
  });
}

/**
 * Ändringarna som gör om laget (exporteras för test):
 * 1. alla egna spelare tillbaka till truppen med uppdaterad anmälan,
 * 2. formationen, 3. platserna. Spelarna sparas utan Auto-underlaget (PIR m.m.).
 */
export function buildAutoOps(flagged: Player[], result: { lineup: Record<string, Player>; teamAConfig: unknown; teamBConfig: unknown }): LineupOp[] {
  const base = new Map(flagged.map((p) => [p.id, p]));
  const ops: LineupOp[] = flagged.map((p, index) => ({ t: "rosterUpsert", player: p, index }));
  ops.push({ t: "field", key: "teamAConfig", value: result.teamAConfig }, { t: "field", key: "teamBConfig", value: result.teamBConfig });
  for (const [slot, p] of Object.entries(result.lineup)) ops.push({ t: "slot", slot, player: base.get(p.id) ?? p });
  return ops;
}

/** Gör om laget: synka anmälningar och fördela alla anmälda med Auto. */
async function rebuildLineup(registeredIds: Set<string>, declinedIds: Set<string>): Promise<{ placed: number; teamA: number; teamB: number }> {
  const { doc } = await getLineupSnapshot();
  const ours = new Map<string, Player>();
  for (const p of [...doc.players, ...Object.values(doc.lineup)]) if (!isOpponentPlayerId(p.id)) ours.set(p.id, p);
  const flagged = [...ours.values()].map((p) => ({ ...p, isRegistered: registeredIds.has(p.id), isDeclined: declinedIds.has(p.id) && !registeredIds.has(p.id) }));
  const useForBalance = (await getConfigValue("pir_use_for_balance")) !== "false";
  const result = autoDistribute(await enrich(flagged), {}, { useForBalance });
  const ops = buildAutoOps(flagged, result);
  await applyLineupPatch(`auto-lineup-${crypto.randomUUID()}`, ops, "auto-lineup");
  const placedIds = Object.entries(result.lineup);
  return {
    placed: placedIds.length,
    teamA: placedIds.filter(([s]) => s.startsWith("team-a-")).length,
    teamB: placedIds.filter(([s]) => s.startsWith("team-b-")).length,
  };
}

let running = false;

/** Körs var femte minut; gör något en gång per evenemang när tiden är inne. */
export async function autoLineupTick(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cfg = await getAutoLineupConfig();
    // Billig koll först (evenemanget cachas 20 min) – anmälningarna hämtas bara när tiden är inne
    const ev = await nextEvent();
    const start = eventStart(ev.date, ev.time);
    if (!start || !ev.date) return;
    const from = start.getTime() - cfg.minutesBefore * 60_000;
    if (now.getTime() < from || now.getTime() >= start.getTime()) return;
    const state = await getAutoLineupState();
    if (state.eventDate === ev.date && state.done) return;

    const att = await fetchAttendance();
    if (att.error || att.noEvent || att.eventDate !== ev.date) return;
    const save = (s: AutoLineupState) => setConfigValue(STATE_KEY, JSON.stringify({ eventDate: att.eventDate, done: true, ...s }));

    const { doc } = await getLineupSnapshot();
    if (doc.setup?.mode === "external") {
      await save({ summary: "Match mot annat lag – ingen automatik." });
      return;
    }
    const roster = doc.players.filter((p) => !isOpponentPlayerId(p.id));
    const reg = new Set(matchRegisteredPlayers(att.registeredNames, roster, doc.lineup).matchedIds);
    const dec = new Set(matchDeclinedPlayers(att.declinedNames ?? [], roster, doc.lineup).matchedIds);
    const mm = findMismatch(doc.lineup, reg, dec, roster);
    const hasMismatch = mm.missing.length > 0 || mm.notComing.length > 0;
    if (!hasMismatch) {
      await save({ summary: "Uppställningen stämde med anmälningarna." });
      return;
    }

    const last = await readLastPublished();
    const published = (last?.eventDate === att.eventDate) || !!(await getActiveLock(now));
    const lineupUrl = `${appUrl()}/lineup`;
    const when = att.eventTime ? ` ${att.eventTime}` : "";

    if (cfg.enabled && !published) {
      const r = await rebuildLineup(reg, dec);
      const summary = `Laget skapades automatiskt: ${r.placed} anmälda fördelade (${teamName("white")} ${r.teamA}, ${teamName("green")} ${r.teamB}).`;
      await save({ autoCreated: true, summary });
      const m = mailLayout("Laget skapades automatiskt", [
        `Uppställningen stämde inte med anmälningarna på laget.se${when ? ` inför${when}` : ""}, och ingen nyhet var publicerad. Auto-lag synkade anmälningarna och fördelade alla anmälda (position, lagfärg och PIR).`,
        `${r.placed} spelare placerade: ${teamName("white")} ${r.teamA}, ${teamName("green")} ${r.teamB}.`,
        mm.missing.length ? `Anmälda som saknades: ${names(mm.missing)}.` : "",
        mm.notComing.length ? `Togs bort (inte anmälda): ${names(mm.notComing.map((x) => x.player))}.` : "",
        "Ändra gärna i Lineup – det går att ångra med Ångra-knappen på varje enhet som var öppen.",
      ].filter(Boolean), { href: lineupUrl, label: "Öppna Lineup" });
      await notify("autoLineup", { subject: `Laget skapades automatiskt (${r.placed} spelare)`, ...m });
      console.log(`[autoLineup] ${summary}`);
      return;
    }

    const m = mailLayout("Uppställningen stämmer inte med anmälningarna", [
      mm.missing.length ? `<b>Anmälda som saknas i uppställningen:</b> ${names(mm.missing)}.` : "",
      mm.notComing.length ? `<b>I uppställningen men inte anmälda:</b> ${mm.notComing.map((x) => `${x.player.name}${x.declined ? " (återbud)" : " (inte svarat)"}`).join(", ")}.` : "",
      published ? "Laget är redan publicerat – ändra i Lineup och publicera om vid behov." : cfg.enabled ? "" : "Auto-lag är avstängt, så inget har ändrats.",
    ].filter(Boolean), { href: lineupUrl, label: "Öppna Lineup" });
    await notify("lineupMismatch", { subject: `Uppställningen stämmer inte (${mm.missing.length} saknas, ${mm.notComing.length} kommer inte)`, ...m });
    await save({ summary: "Avvikelse mejlad." });
  } catch (err) {
    console.error("[autoLineup]", err);
  } finally {
    running = false;
  }
}

export function startAutoLineupSchedule() {
  setInterval(() => void autoLineupTick(), 5 * 60_000).unref();
  setTimeout(() => void autoLineupTick(), 120_000).unref();
}
