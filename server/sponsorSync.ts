/**
 * Sponsorer från sajten (stalstadens.se) – steg 2 i integrationen.
 *
 * Sajten äger sponsorerna. Appen hämtar hela listan när sajten säger till och var 5:e minut, jämför mot
 * sin egen tabell och – bara när sajten säger "live" – gör om appens lista så att den stämmer.
 *
 * - off:    inget händer; appens egen sponsorhantering gäller.
 * - shadow: appen räknar ut vad som skulle ändras (planen) men ändrar inget.
 * - live:   planen genomförs, och appens sponsorsida blir skrivskyddad.
 *
 * Kopplingen sajt ↔ app sparas i sponsors.siteId och sätts från sajtens Synkstatus.
 * Sponsorer tas aldrig bort här – de pausas, så att räknare och historik finns kvar.
 */
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { sponsors, type SponsorRow } from "../drizzle/schema";
import { updateSponsor } from "./sponsorsDb";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { siteRequest, siteImage, integrationConfigured } from "./integration";

export type SyncMode = "off" | "shadow" | "live";

export interface SiteSponsor {
  id: number;
  name: string;
  fullName: string;
  active: boolean;
  sortOrder: number;
  logoVersion: string | null;
}

export interface PlanItem {
  kind: "create" | "rename" | "activate" | "pause" | "logo" | "logo-remove" | "order";
  appId?: number;
  siteId?: number;
  text: string;
}

export interface AppSponsorInfo {
  id: number;
  name: string;
  active: boolean;
  hasLogo: boolean;
  /** Loggan (PNG som data-URL) så att sajten kan visa före/efter */
  logo: string | null;
  siteId: number | null;
  /** Föreslagen sajtsponsor när den inte är ihopparad */
  suggestion: number | null;
}

const CONFIG_KEY = "integration.sponsors";
const INTERVAL_MS = 5 * 60_000;

let mode: SyncMode = "off";
let adminUrl = "";
let siteList: SiteSponsor[] = [];
let lastSync: string | null = null;
let lastError: string | null = null;
let lastApplied: string[] = [];
let running: Promise<void> | null = null;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Databasen är inte tillgänglig");
  return db;
}

// ─── Läge (sparas så att skrivskyddet gäller även om sajten inte svarar) ─────

export async function loadSponsorSyncMode() {
  try {
    const raw = await getConfigValue(CONFIG_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { mode?: SyncMode; adminUrl?: string };
      mode = v.mode ?? "off";
      adminUrl = v.adminUrl ?? "";
    }
  } catch (e) {
    console.warn("[integration] kunde inte läsa sponsorläget:", (e as Error).message);
  }
}

async function saveMode(next: SyncMode, url: string) {
  if (next === mode && url === adminUrl) return;
  mode = next;
  adminUrl = url;
  await setConfigValue(CONFIG_KEY, JSON.stringify({ mode, adminUrl }));
  console.log(`[integration] sponsorer: läge ${mode}`);
}

export function sponsorMode(): SyncMode {
  return mode;
}

/** Styrs sponsorerna från sajten? Då är appens sponsorsida skrivskyddad. */
export function sponsorsManagedBySite(): { adminUrl: string } | null {
  return integrationConfigured() && mode === "live" ? { adminUrl } : null;
}

// ─── Ihopparning ─────────────────────────────────────────────────────────────

/** "AB Kiruna Bilfrakt" → "kirunabilfrakt", "Lindströms Transport" → "lindstromstransport" */
export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ab|hb|kb|aktiebolag)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Hur lika två namn är (0–1). Lika = 1; det ena inuti det andra = kortare/längre. */
export function nameScore(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.includes(short)) return 0.5 + (0.5 * short.length) / long.length;
  return 0;
}

export function suggestPairs(app: { id: number; name: string; siteId: number | null }[], site: SiteSponsor[]): Map<number, number> {
  const taken = new Set(app.map((a) => a.siteId).filter((x): x is number => x !== null));
  const out = new Map<number, number>();
  const candidates: { appId: number; siteId: number; score: number }[] = [];
  for (const a of app) {
    if (a.siteId !== null) continue;
    for (const s of site) {
      if (taken.has(s.id)) continue;
      const score = Math.max(nameScore(a.name, s.name), nameScore(a.name, s.fullName));
      if (score > 0) candidates.push({ appId: a.id, siteId: s.id, score });
    }
  }
  candidates.sort((p, q) => q.score - p.score);
  const usedSite = new Set<number>();
  for (const c of candidates) {
    if (out.has(c.appId) || usedSite.has(c.siteId)) continue;
    out.set(c.appId, c.siteId);
    usedSite.add(c.siteId);
  }
  return out;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

type AppRow = Pick<SponsorRow, "id" | "name" | "active" | "sortOrder" | "siteId" | "logoVersion"> & { hasLogo: boolean };

export function computePlan(app: AppRow[], site: SiteSponsor[]): { plan: PlanItem[]; blockers: string[] } {
  const plan: PlanItem[] = [];
  const blockers: string[] = [];
  const bySite = new Map(app.filter((a) => a.siteId !== null).map((a) => [a.siteId!, a]));
  const siteIds = new Set(site.map((s) => s.id));

  const unpaired = app.filter((a) => a.siteId === null && a.active);
  if (unpaired.length) {
    blockers.push(`${unpaired.length} aktiva sponsorer i appen är inte ihopparade (${unpaired.map((a) => a.name).join(", ")}).`);
  }

  // Två sponsorer på sajten med samma namn i appen
  const seen = new Map<string, string>();
  for (const s of site) {
    const k = s.name.trim().toLowerCase();
    if (seen.has(k)) blockers.push(`Två sponsorer på sajten får namnet "${s.name}" i appen – ändra kort namn på en av dem.`);
    seen.set(k, s.name);
  }

  for (const s of site) {
    const a = bySite.get(s.id);
    if (!a) {
      const clash = app.find((x) => x.siteId === null && x.name.trim().toLowerCase() === s.name.trim().toLowerCase());
      if (clash) blockers.push(`"${s.name}" finns redan i appen utan koppling – para ihop den.`);
      plan.push({ kind: "create", siteId: s.id, text: `Ny sponsor: ${s.name}${s.logoVersion ? " (med logga)" : ""}${s.active ? "" : " (pausad)"}` });
      continue;
    }
    if (a.name !== s.name) {
      const clash = app.find((x) => x.id !== a.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase() && !(x.siteId !== null && siteIds.has(x.siteId)));
      if (clash) blockers.push(`Namnet "${s.name}" används redan av "${clash.name}" i appen.`);
      plan.push({ kind: "rename", appId: a.id, siteId: s.id, text: `Byter namn: ${a.name} → ${s.name}` });
    }
    if (a.active !== s.active) {
      plan.push({ kind: s.active ? "activate" : "pause", appId: a.id, siteId: s.id, text: `${s.active ? "Aktiveras" : "Pausas (inte aktiv på sajten)"}: ${s.name}` });
    }
    if (s.logoVersion && s.logoVersion !== a.logoVersion) {
      plan.push({ kind: "logo", appId: a.id, siteId: s.id, text: `${a.hasLogo ? "Ny logga" : "Får logga"} från sajten: ${s.name}` });
    } else if (!s.logoVersion && a.hasLogo) {
      plan.push({ kind: "logo-remove", appId: a.id, siteId: s.id, text: `Loggan tas bort (ingen logga på sajten): ${s.name}` });
    }
  }

  for (const a of app) {
    if (!a.active) continue;
    if (a.siteId !== null && !siteIds.has(a.siteId)) plan.push({ kind: "pause", appId: a.id, text: `Pausas (borttagen på sajten): ${a.name}` });
    else if (a.siteId === null) plan.push({ kind: "pause", appId: a.id, text: `Pausas (finns inte på sajten): ${a.name}` });
  }

  // Ordningen: sajtens ordning för ihopparade sponsorer
  const paired = site.map((s) => bySite.get(s.id)).filter((a): a is AppRow => !!a);
  const appOrder = [...paired].sort((p, q) => p.sortOrder - q.sortOrder || p.name.localeCompare(q.name)).map((a) => a.id);
  if (paired.some((a, i) => appOrder[i] !== a.id)) plan.push({ kind: "order", text: "Ordningen ändras till sajtens" });

  return { plan, blockers };
}

async function appRows(): Promise<AppRow[]> {
  const db = await requireDb();
  const rows = await db
    .select({
      id: sponsors.id,
      name: sponsors.name,
      active: sponsors.active,
      sortOrder: sponsors.sortOrder,
      siteId: sponsors.siteId,
      logoVersion: sponsors.logoVersion,
      hasLogo: sql<number>`${sponsors.logo} is not null`,
    })
    .from(sponsors)
    .orderBy(asc(sponsors.sortOrder), asc(sponsors.name));
  return rows.map((r) => ({ ...r, hasLogo: Boolean(Number(r.hasLogo)) }));
}

// ─── Genomför ────────────────────────────────────────────────────────────────

async function logoDataUrl(siteId: number): Promise<string | null> {
  const png = await siteImage(`/internal/v1/sponsors/${siteId}/logo`);
  return png ? `data:image/png;base64,${png.toString("base64")}` : null;
}

async function apply(site: SiteSponsor[]): Promise<string[]> {
  const db = await requireDb();
  const done: string[] = [];
  let rows = await appRows();
  const { plan, blockers } = computePlan(rows, site);
  if (blockers.length) throw new Error(`Synken stoppad: ${blockers.join(" ")}`);
  if (!plan.length) return done;

  const siteById = new Map(site.map((s) => [s.id, s]));

  // 1. Pausa det som inte finns på sajten
  for (const p of plan.filter((p) => p.kind === "pause" && !p.siteId)) {
    await updateSponsor({ id: p.appId!, active: false });
    done.push(p.text);
  }
  // 2. Namn, aktiv och logga för ihopparade (updateSponsor byter även namnet på registrerade mål)
  for (const p of plan) {
    if (!p.appId || !p.siteId) continue;
    const s = siteById.get(p.siteId)!;
    if (p.kind === "rename") await updateSponsor({ id: p.appId, name: s.name });
    else if (p.kind === "activate" || p.kind === "pause") await updateSponsor({ id: p.appId, active: s.active });
    else if (p.kind === "logo") {
      const logo = await logoDataUrl(s.id);
      await updateSponsor({ id: p.appId, logo });
      await db.update(sponsors).set({ logoVersion: logo ? s.logoVersion : null }).where(eq(sponsors.id, p.appId));
    } else if (p.kind === "logo-remove") {
      await updateSponsor({ id: p.appId, logo: null });
      await db.update(sponsors).set({ logoVersion: null }).where(eq(sponsors.id, p.appId));
    } else continue;
    done.push(p.text);
  }
  // 3. Nya
  for (const p of plan.filter((p) => p.kind === "create")) {
    const s = siteById.get(p.siteId!)!;
    const logo = s.logoVersion ? await logoDataUrl(s.id) : null;
    await db.insert(sponsors).values({
      name: s.name,
      logo,
      active: s.active,
      sortOrder: s.sortOrder,
      siteId: s.id,
      logoVersion: logo ? s.logoVersion : null,
    });
    done.push(p.text);
  }
  // 4. Ordning: sajtens ordning först, övriga (pausade utan koppling) efter
  rows = await appRows();
  const order = new Map(site.map((s, i) => [s.id, i + 1]));
  const sorted = [...rows].sort(
    (p, q) => (order.get(p.siteId ?? -1) ?? 1000 + p.sortOrder) - (order.get(q.siteId ?? -1) ?? 1000 + q.sortOrder),
  );
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sortOrder !== i + 1) await db.update(sponsors).set({ sortOrder: i + 1 }).where(eq(sponsors.id, sorted[i].id));
  }
  if (plan.some((p) => p.kind === "order")) done.push("Ordningen ändrad till sajtens");
  return done;
}

// ─── Synk ────────────────────────────────────────────────────────────────────

async function runSync() {
  try {
    const res = await siteRequest<{ mode: SyncMode; adminUrl: string; sponsors: SiteSponsor[] }>("GET", "/internal/v1/sponsors");
    await saveMode(res.mode, res.adminUrl ?? "");
    siteList = res.sponsors ?? [];
    if (res.mode === "live") {
      const done = await apply(siteList);
      if (done.length) {
        lastApplied = done;
        console.log(`[integration] sponsorer: ${done.join(" · ")}`);
      }
    }
    lastError = null;
  } catch (e) {
    lastError = (e as Error).message;
    console.warn("[integration] sponsorsynk:", lastError);
  } finally {
    lastSync = new Date().toISOString();
  }
}

/** Kör en synk nu (eller väntar på den som redan pågår). */
export function syncSponsors(): Promise<void> {
  if (!integrationConfigured()) return Promise.resolve();
  running ??= runSync().finally(() => (running = null));
  return running;
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
/** Sajten har sagt till att något ändrats. Väntar en sekund så att flera ändringar blir en synk. */
export function scheduleSponsorSync() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    void syncSponsors();
  }, 1000);
}

export function startSponsorSync() {
  void loadSponsorSyncMode();
  if (!integrationConfigured()) return;
  setTimeout(() => void syncSponsors(), 15_000);
  setInterval(() => void syncSponsors(), INTERVAL_MS);
}

// ─── Till sajtens Synkstatus ─────────────────────────────────────────────────

export async function sponsorSyncState() {
  const db = await requireDb();
  const rows = await appRows();
  const logos = new Map((await db.select({ id: sponsors.id, logo: sponsors.logo }).from(sponsors)).map((r) => [r.id, r.logo]));
  const suggestions = suggestPairs(rows, siteList);
  const { plan, blockers } = mode === "off" ? { plan: [], blockers: [] } : computePlan(rows, siteList);
  const app: AppSponsorInfo[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    hasLogo: r.hasLogo,
    logo: logos.get(r.id) ?? null,
    siteId: r.siteId,
    suggestion: r.siteId === null ? suggestions.get(r.id) ?? null : null,
  }));
  return { mode, lastSync, lastError, lastApplied, site: siteList, app, plan, blockers };
}

/** Sparar ihopparningen från sajten. siteId null = ingen koppling. */
export async function linkSponsors(links: { appId: number; siteId: number | null }[]) {
  const db = await requireDb();
  const rows = await appRows();
  const next = new Map(rows.map((r) => [r.id, r.siteId]));
  for (const l of links) {
    if (!next.has(l.appId)) throw new Error(`Sponsorn ${l.appId} finns inte i appen`);
    next.set(l.appId, l.siteId);
  }
  const used = new Set<number>();
  for (const [, siteId] of next) {
    if (siteId === null) continue;
    if (used.has(siteId)) throw new Error("En sajtsponsor kan bara kopplas till en sponsor i appen");
    used.add(siteId);
  }
  await db.transaction(async (tx) => {
    // Nollställ först, så att unika siteId kan flyttas mellan sponsorer
    for (const l of links) await tx.update(sponsors).set({ siteId: null }).where(eq(sponsors.id, l.appId));
    for (const l of links) {
      if (l.siteId !== null) await tx.update(sponsors).set({ siteId: l.siteId, logoVersion: null }).where(eq(sponsors.id, l.appId));
    }
  });
  console.log(`[integration] sponsorer ihopparade: ${links.map((l) => `${l.appId}→${l.siteId ?? "-"}`).join(", ")}`);
}
