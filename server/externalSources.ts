/**
 * Externa källor – SHL-tabellen och SHL-matcher från Highlightly hockey-API.
 *
 * Nyckeln läggs in under Inställningar → Externa källor (sparas i app_config,
 * visas aldrig i klartext igen). Servern hämtar själv i bakgrunden och sparar
 * resultatet; appen läser alltid det sparade. Anropen räknas per dygn och
 * hämtningen stannar vid taket (standard 90 av gratisnivåns 100) – då visas det
 * senast hämtade med tidpunkt. Utan nyckel eller svar: samma sak.
 *
 * Dokumentation: https://highlightly.net/hockey-api/documentation/
 */
import { getConfigValue, setConfigValue } from "./scoreDb";
import { canCall, matchRow, refreshAfter, shlSeason, standingRow, type ShlCache, type ShlMatch, type UsageState } from "@shared/shl";

const CONFIG_KEY = "external_sources";
const USAGE_KEY = "external_usage";
const CACHE_KEY = "external_shl";
const LAST_ROUND_KEY = "external_shl_last_round";

export const SOURCE_NAME = "Highlightly";
const BASE = "https://hockey.highlightly.net";
const RAPID_BASE = "https://hockey-highlights-api.p.rapidapi.com";
const RAPID_HOST = "hockey-highlights-api.p.rapidapi.com";

export interface ExternalConfig {
  apiKey: string | null;
  /** Nyckeln är från RapidAPI (annan adress och host-header) */
  rapidApi: boolean;
  enabled: boolean;
  /** Max anrop per dygn (gratisnivån: 100) */
  dailyCap: number;
  /** SHL:s id hos källan (slås upp automatiskt första gången) */
  shlLeagueId: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
}
const DEFAULTS: ExternalConfig = { apiKey: null, rapidApi: false, enabled: true, dailyCap: 90, shlLeagueId: null, lastError: null, lastErrorAt: null };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getConfigValue(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export const getExternalConfig = () => readJson<ExternalConfig>(CONFIG_KEY, DEFAULTS);
async function saveConfig(c: ExternalConfig) { await setConfigValue(CONFIG_KEY, JSON.stringify(c)); }

/** Dagens datum i Sverige (YYYY-MM-DD) och timme */
function stockholm(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export const maskKey = (k: string | null) => (k ? `${"•".repeat(Math.max(0, Math.min(12, k.length - 4)))}${k.slice(-4)}` : null);

/** För Inställningar: allt utom själva nyckeln */
export async function externalStatus() {
  const [c, u, cache] = await Promise.all([getExternalConfig(), readJson<UsageState>(USAGE_KEY, { day: "", calls: 0, remaining: null }), readJson<ShlCache>(CACHE_KEY, { table: null, matches: null })]);
  const today = stockholm().day;
  return {
    configured: !!c.apiKey, keyMasked: maskKey(c.apiKey), rapidApi: c.rapidApi, enabled: c.enabled, dailyCap: c.dailyCap,
    callsToday: u.day === today ? u.calls : 0, remaining: u.day === today ? u.remaining : null,
    lastError: c.lastError, lastErrorAt: c.lastErrorAt,
    tableFetchedAt: cache.table?.fetchedAt ?? null, tableRows: cache.table?.rows.length ?? 0,
    matchesFetchedAt: cache.matches?.fetchedAt ?? null, matchesToday: cache.matches?.rows.length ?? 0,
    source: SOURCE_NAME,
  };
}

export async function setExternalConfig(patch: { apiKey?: string | null; rapidApi?: boolean; enabled?: boolean; dailyCap?: number }) {
  const c = await getExternalConfig();
  const next: ExternalConfig = { ...c };
  if (patch.apiKey !== undefined) { next.apiKey = patch.apiKey?.trim() || null; next.shlLeagueId = null; next.lastError = null; next.lastErrorAt = null; }
  if (patch.rapidApi !== undefined) next.rapidApi = patch.rapidApi;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.dailyCap !== undefined) next.dailyCap = Math.max(5, Math.min(1000, Math.round(patch.dailyCap)));
  await saveConfig(next);
}

class LimitError extends Error {}

/** Ett anrop till källan – räknas, och stoppas vid dygnstaket */
async function call<T>(c: ExternalConfig, path: string, params: Record<string, string | number>): Promise<T> {
  const { day } = stockholm();
  const u = await readJson<UsageState>(USAGE_KEY, { day, calls: 0, remaining: null });
  const usage: UsageState = u.day === day ? u : { day, calls: 0, remaining: null };
  if (!canCall(usage, day, c.dailyCap)) throw new LimitError(`Dygnets tak nått (${usage.calls} anrop)`);
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const url = `${c.rapidApi ? RAPID_BASE : BASE}${path}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = { "x-rapidapi-key": c.apiKey ?? "", Accept: "application/json" };
  if (c.rapidApi) headers["x-rapidapi-host"] = RAPID_HOST;
  usage.calls++;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) }).catch((e: Error) => { throw new Error(`Kunde inte nå ${SOURCE_NAME} (${e.message})`); });
    const rem = res.headers.get("x-ratelimit-requests-remaining");
    if (rem != null && rem !== "" && !Number.isNaN(Number(rem))) usage.remaining = Number(rem);
    if (res.status === 429) { usage.remaining = 0; throw new LimitError("Källan säger att dygnets anrop är slut (429)"); }
    if (res.status === 401 || res.status === 403) throw new Error(`Nyckeln godtogs inte (${res.status})`);
    if (!res.ok) throw new Error(`Källan svarade ${res.status}`);
    return (await res.json()) as T;
  } finally {
    await setConfigValue(USAGE_KEY, JSON.stringify(usage)).catch(() => undefined);
  }
}

async function fail(c: ExternalConfig, e: unknown) {
  const msg = (e as Error).message || String(e);
  console.warn("[externa källor]", msg);
  await saveConfig({ ...(await getExternalConfig()), lastError: msg, lastErrorAt: new Date().toISOString() }).catch(() => undefined);
  void c;
}

/** SHL:s id hos källan (en gång, sparas) */
async function leagueId(c: ExternalConfig): Promise<number> {
  if (c.shlLeagueId) return c.shlLeagueId;
  const res = await call<{ data: Array<{ id: number; name: string; country?: { code?: string } }> }>(c, "/leagues", { countryCode: "SE", limit: 100 });
  const shl = res.data.find((l) => /^shl\b|swedish hockey league/i.test(l.name)) ?? res.data.find((l) => /shl/i.test(l.name) && !/hockeyallsvenskan|j20|women|sdhl/i.test(l.name));
  if (!shl) throw new Error("Hittade inte SHL hos källan");
  const fresh = await getExternalConfig();
  await saveConfig({ ...fresh, shlLeagueId: shl.id });
  c.shlLeagueId = shl.id;
  return shl.id;
}

let running = false;

/**
 * Hämta det som behöver uppdateras (eller allt med force). Returnerar vad som
 * hämtades. Fel sparas och visas i Inställningar; det sparade ligger kvar.
 */
export async function refreshShl(force = false): Promise<{ table: boolean; matches: boolean; error?: string }> {
  if (running) return { table: false, matches: false, error: "Hämtning pågår redan" };
  running = true;
  const done = { table: false, matches: false } as { table: boolean; matches: boolean; error?: string };
  try {
    const c = await getExternalConfig();
    if (!c.apiKey || (!c.enabled && !force)) return done;
    const cache = await readJson<ShlCache>(CACHE_KEY, { table: null, matches: null });
    const now = new Date();
    const { day, hour } = stockholm(now);
    const age = (iso: string | undefined) => (iso ? (now.getTime() - new Date(iso).getTime()) / 60_000 : Infinity);
    const todays = cache.matches && stockholm(new Date(cache.matches.fetchedAt)).day === day ? cache.matches.rows : [];
    const lid = await leagueId(c);
    // Matcherna i dag
    if (force || age(cache.matches?.fetchedAt) >= refreshAfter("matches", hour, todays, now)) {
      const res = await call<{ data: Parameters<typeof matchRow>[0][] }>(c, "/matches", { leagueId: lid, date: day, timezone: "Europe/Stockholm", limit: 100 });
      const rows = res.data.map(matchRow).sort((a, b) => a.date.localeCompare(b.date));
      cache.matches = { rows, fetchedAt: now.toISOString() };
      if (rows.some((m) => m.status === "finished")) await setConfigValue(LAST_ROUND_KEY, JSON.stringify({ day, rows })).catch(() => undefined);
      done.matches = true;
    }
    // Tabellen
    if (force || age(cache.table?.fetchedAt) >= refreshAfter("table", hour, cache.matches?.rows ?? [], now)) {
      const season = shlSeason(now);
      const res = await call<{ groups: Array<{ name: string; standings: Parameters<typeof standingRow>[0][] }> }>(c, "/standings", { leagueId: lid, season });
      const group = res.groups.find((g) => g.standings.length >= 10) ?? res.groups[0];
      if (group?.standings.length) {
        cache.table = { season, rows: group.standings.map(standingRow).sort((a, b) => a.pos - b.pos), fetchedAt: now.toISOString() };
        done.table = true;
      }
    }
    await setConfigValue(CACHE_KEY, JSON.stringify(cache));
    if (done.table || done.matches) await saveConfig({ ...(await getExternalConfig()), lastError: null, lastErrorAt: null });
  } catch (e) {
    if (!(e instanceof LimitError) || force) await fail(await getExternalConfig(), e);
    done.error = (e as Error).message;
  } finally {
    running = false;
  }
  return done;
}

/** Det sparade, för tidningen (och senare andra delar av appen) */
export async function getShl(): Promise<{ configured: boolean; source: string; table: ShlCache["table"]; today: ShlMatch[]; todayFetchedAt: string | null; lastRound: { day: string; rows: ShlMatch[] } | null }> {
  const [c, cache, last] = await Promise.all([getExternalConfig(), readJson<ShlCache>(CACHE_KEY, { table: null, matches: null }), readJson<{ day: string; rows: ShlMatch[] } | null>(LAST_ROUND_KEY, null)]);
  const day = stockholm().day;
  const fresh = cache.matches && stockholm(new Date(cache.matches.fetchedAt)).day === day;
  return { configured: !!c.apiKey, source: SOURCE_NAME, table: cache.table, today: fresh ? cache.matches!.rows : [], todayFetchedAt: fresh ? cache.matches!.fetchedAt : null, lastRound: last && last.rows?.length ? last : null };
}

export function startExternalSchedule() {
  // Var femte minut: hämta bara det som är för gammalt enligt schemat (refreshAfter)
  setInterval(() => void refreshShl(), 5 * 60_000).unref();
  setTimeout(() => void refreshShl(), 60_000).unref();
}
