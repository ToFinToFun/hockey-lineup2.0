/**
 * Live: en inloggad Score Tracker sänder matchen (ställning, mål, sluttid) och
 * alla kan följa den på /live. Läktaren: hjärtan per lag och korta kommentarer
 * (av/på under Inställningar → Live). Unika tittare räknas utan att något
 * sparas på besökarens enhet: en anonym kod av IP + webbläsare + matchens salt,
 * som raderas när matchen är slut (bara antalet sparas).
 *
 * Sparas i app_config: "live_session" (pågående/senaste sändningen),
 * "live_comments" (kommentarer, rensas efter 24 h), "live_config".
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { getConfigValue, setConfigValue } from "./scoreDb";

export interface LiveGoal { team: "white" | "green"; timestamp: string; scorer?: string; scorerId?: string; assist?: string; assistId?: string; other?: string; sponsor?: string }

export interface LiveSession {
  id: string;
  deviceId: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  whiteScore: number;
  greenScore: number;
  goals: LiveGoal[];
  matchStartTime: string | null;
  /** Sluttid "HH:MM" från Score Tracker */
  endTime: string | null;
  hearts: { white: number; green: number };
  /** Antal unika tittare (sparas med matchen) */
  uniqueViewers: number;
  /** Bara under sändningen: matchens salt och anonyma koder (raderas vid slut) */
  salt?: string;
  viewerHashes?: string[];
}

export interface LiveComment { id: string; sessionId: string; name: string; text: string; at: string; hidden: boolean; viewer: string }
export interface LiveConfig { laktaren: boolean }

export const LIVE_LIMITS = {
  /** Efter slut visas resultatet så här länge */
  afterMinutes: 30,
  commentGapMs: 10_000,
  commentsPerViewer: 50,
  commentMaxLength: 140,
  nameMaxLength: 30,
  keepCommentsMs: 24 * 60 * 60 * 1000,
  /** En sändning utan uppdatering så här länge räknas som avbruten */
  staleMs: 4 * 60 * 60 * 1000,
  /** "Tittar nu": hörts av inom */
  activeMs: 45_000,
};

const KEY = "live_session";
const COMMENTS = "live_comments";
const CONFIG = "live_config";

let session: LiveSession | null | undefined;
let comments: LiveComment[] | undefined;
const active = new Map<string, number>(); // viewer → senast sedd
const lastComment = new Map<string, number>();
const heartAt = new Map<string, number>();
let saveTimer: NodeJS.Timeout | null = null;

async function load(): Promise<LiveSession | null> {
  if (session !== undefined) return session;
  try {
    const raw = await getConfigValue(KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch {
    session = null;
  }
  return session!;
}
async function persist(now = false) {
  if (now) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await setConfigValue(KEY, JSON.stringify(session ?? null));
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void setConfigValue(KEY, JSON.stringify(session ?? null)).catch(() => undefined);
  }, 5_000);
  saveTimer.unref?.();
}
async function loadComments(): Promise<LiveComment[]> {
  if (comments) return comments;
  try {
    const raw = await getConfigValue(COMMENTS);
    comments = raw ? JSON.parse(raw) : [];
  } catch {
    comments = [];
  }
  return comments!;
}
async function saveComments() {
  const cutoff = Date.now() - LIVE_LIMITS.keepCommentsMs;
  comments = (comments ?? []).filter((c) => new Date(c.at).getTime() > cutoff);
  await setConfigValue(COMMENTS, JSON.stringify(comments));
}

export async function getLiveConfig(): Promise<LiveConfig> {
  try {
    const raw = await getConfigValue(CONFIG);
    return { laktaren: true, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { laktaren: true };
  }
}
export async function setLiveConfig(c: LiveConfig) {
  await setConfigValue(CONFIG, JSON.stringify({ laktaren: !!c.laktaren }));
}

/** Pågår sändningen? (inte avslutad och uppdaterad nyligen) */
export const isLive = (s: LiveSession | null | undefined, now = Date.now()) =>
  !!s && !s.endedAt && now - new Date(s.updatedAt).getTime() < LIVE_LIMITS.staleMs;
/** Avslutad nyss – resultatet visas en stund */
export const isAfter = (s: LiveSession | null | undefined, now = Date.now()) =>
  !!s && !!s.endedAt && now - new Date(s.endedAt).getTime() < LIVE_LIMITS.afterMinutes * 60_000;

export async function currentSession() {
  return load();
}

/** Starta sändningen från en enhet. Pågår en annan krävs takeover. */
export async function startLive(deviceId: string, takeover: boolean): Promise<{ ok: true; session: LiveSession } | { ok: false; reason: "busy" }> {
  const s = await load();
  if (isLive(s) && s!.deviceId !== deviceId) {
    if (!takeover) return { ok: false, reason: "busy" };
    s!.deviceId = deviceId; // samma match fortsätter från den nya enheten
    s!.updatedAt = new Date().toISOString();
    await persist(true);
    return { ok: true, session: s! };
  }
  if (isLive(s) && s!.deviceId === deviceId) return { ok: true, session: s! };
  const now = new Date().toISOString();
  session = {
    id: randomUUID(), deviceId, startedAt: now, updatedAt: now, endedAt: null,
    whiteScore: 0, greenScore: 0, goals: [], matchStartTime: null, endTime: null,
    hearts: { white: 0, green: 0 }, uniqueViewers: 0, salt: randomBytes(16).toString("hex"), viewerHashes: [],
  };
  active.clear();
  await persist(true);
  return { ok: true, session: session! };
}

/** Score Tracker skickar läget. Bara enheten som sänder. */
export async function pushLive(deviceId: string, data: { whiteScore: number; greenScore: number; goals: LiveGoal[]; matchStartTime: string | null; endTime: string | null }): Promise<boolean> {
  const s = await load();
  if (!isLive(s) || s!.deviceId !== deviceId) return false;
  Object.assign(s!, {
    whiteScore: Math.max(0, Math.min(99, data.whiteScore)),
    greenScore: Math.max(0, Math.min(99, data.greenScore)),
    goals: data.goals.slice(0, 60).map((g) => ({
      team: g.team === "green" ? "green" : "white", timestamp: String(g.timestamp ?? "").slice(0, 20),
      scorer: g.scorer?.slice(0, 60), scorerId: g.scorerId?.slice(0, 80), assist: g.assist?.slice(0, 60), assistId: g.assistId?.slice(0, 80),
      // Följer med vid övertagande (sparas med matchen), visas inte på livesidan
      other: g.other?.slice(0, 200), sponsor: g.sponsor?.slice(0, 80),
    })),
    matchStartTime: data.matchStartTime,
    endTime: data.endTime && /^\d{1,2}:\d{2}$/.test(data.endTime) ? data.endTime : null,
    updatedAt: new Date().toISOString(),
  });
  await persist(true);
  return true;
}

/** Avsluta: resultatet visas en stund till; salt och anonyma koder raderas. */
export async function endLive(deviceId: string | null): Promise<boolean> {
  const s = await load();
  if (!isLive(s) || (deviceId && s!.deviceId !== deviceId)) return false;
  s!.endedAt = new Date().toISOString();
  s!.uniqueViewers = s!.viewerHashes?.length ?? s!.uniqueViewers;
  delete s!.salt;
  delete s!.viewerHashes;
  active.clear();
  await persist(true);
  return true;
}

/** Anonym kod för en tittare (IP + webbläsare + matchens salt). Exporteras för test. */
export function viewerCode(ip: string, ua: string, salt: string): string {
  return createHash("sha256").update(`${ip}|${ua}|${salt}`).digest("hex").slice(0, 24);
}

/** Registrera en tittare; returnerar koden (för spärrar) */
export async function touchViewer(ip: string, ua: string): Promise<string | null> {
  const s = await load();
  if (!isLive(s) || !s!.salt) return null;
  const code = viewerCode(ip, ua, s!.salt);
  active.set(code, Date.now());
  if (!s!.viewerHashes!.includes(code)) {
    s!.viewerHashes!.push(code);
    s!.uniqueViewers = s!.viewerHashes!.length;
    void persist();
  }
  return code;
}

export function watchingNow(): number {
  const cutoff = Date.now() - LIVE_LIMITS.activeMs;
  let n = 0;
  for (const [k, t] of active) { if (t >= cutoff) n++; else active.delete(k); }
  return n;
}

export async function sendHeart(viewer: string, team: "white" | "green"): Promise<boolean> {
  const s = await load();
  if (!isLive(s)) return false;
  const last = heartAt.get(viewer) ?? 0;
  if (Date.now() - last < 250) return false;
  heartAt.set(viewer, Date.now());
  s!.hearts[team]++;
  void persist();
  return true;
}

export type CommentResult = { ok: true; comment: LiveComment } | { ok: false; reason: "closed" | "wait" | "limit" | "empty"; waitMs?: number };

export async function postComment(viewer: string, name: string, text: string): Promise<CommentResult> {
  const s = await load();
  const cfg = await getLiveConfig();
  if (!cfg.laktaren || !(isLive(s) || isAfter(s))) return { ok: false, reason: "closed" };
  const clean = text.replace(/\s+/g, " ").trim().slice(0, LIVE_LIMITS.commentMaxLength);
  if (!clean) return { ok: false, reason: "empty" };
  const last = lastComment.get(viewer) ?? 0;
  const wait = LIVE_LIMITS.commentGapMs - (Date.now() - last);
  if (wait > 0) return { ok: false, reason: "wait", waitMs: wait };
  const list = await loadComments();
  if (list.filter((c) => c.sessionId === s!.id && c.viewer === viewer).length >= LIVE_LIMITS.commentsPerViewer) return { ok: false, reason: "limit" };
  const c: LiveComment = {
    id: randomUUID().slice(0, 12), sessionId: s!.id,
    name: name.replace(/\s+/g, " ").trim().slice(0, LIVE_LIMITS.nameMaxLength) || "Anonym",
    text: clean, at: new Date().toISOString(), hidden: false, viewer,
  };
  list.push(c);
  lastComment.set(viewer, Date.now());
  await saveComments();
  return { ok: true, comment: c };
}

/** Kommentarer för en sändning (senaste 24 h), nyast först – utan tittarkoden */
export async function listComments(sessionId: string | null, includeHidden = false) {
  if (!sessionId) return [];
  const cutoff = Date.now() - LIVE_LIMITS.keepCommentsMs;
  return (await loadComments())
    .filter((c) => c.sessionId === sessionId && new Date(c.at).getTime() > cutoff && (includeHidden || !c.hidden))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 200)
    .map(({ viewer: _v, ...rest }) => rest);
}

export async function hideComment(id: string, hidden: boolean) {
  const list = await loadComments();
  const c = list.find((x) => x.id === id);
  if (!c) return false;
  c.hidden = hidden;
  await saveComments();
  return true;
}

/** Bara för test */
export function __resetLiveForTest() {
  session = undefined; comments = undefined; active.clear(); lastComment.clear(); heartAt.clear();
}
