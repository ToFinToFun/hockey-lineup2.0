/**
 * Delade länkar med moduler (Inställningar → Åtkomst): namn, moduler och
 * giltighet (datum eller tills vidare). Sparas i app_config "access_links".
 * Sessionen från en länk bär bara länkens id – modulerna och giltigheten läses
 * här vid varje anrop, så ändringar och återkallning gäller direkt.
 */
import { randomUUID } from "crypto";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { isAccessModule, type AccessModule } from "../shared/accessModules";

export interface AccessLink {
  id: string;
  name: string;
  modules: AccessModule[];
  /** null = tills vidare */
  expiresAt: string | null;
  createdAt: string;
  uses: number;
  lastUsedAt: string | null;
  revoked?: boolean;
}

const KEY = "access_links";
let cache: { at: number; list: AccessLink[] } | null = null;

async function readAll(): Promise<AccessLink[]> {
  if (cache && Date.now() - cache.at < 5_000) return cache.list;
  let list: AccessLink[] = [];
  try {
    const raw = await getConfigValue(KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch { /* tom */ }
  cache = { at: Date.now(), list };
  return list;
}
async function writeAll(list: AccessLink[]) {
  cache = { at: Date.now(), list };
  await setConfigValue(KEY, JSON.stringify(list));
}

export const isActive = (l: AccessLink, now = Date.now()) => !l.revoked && (!l.expiresAt || new Date(l.expiresAt).getTime() > now);

export async function getActiveAccessLink(id: unknown): Promise<AccessLink | null> {
  if (typeof id !== "string") return null;
  const l = (await readAll()).find((x) => x.id === id);
  return l && isActive(l) ? l : null;
}

export async function listAccessLinks(): Promise<AccessLink[]> {
  return (await readAll()).filter((l) => !l.revoked).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const cleanModules = (m: unknown[]) => [...new Set(m.filter(isAccessModule))];
/** "YYYY-MM-DD" → gäller till och med den dagen (midnatt efter) */
export const expiryFromDate = (d: string | null) => {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3] + 1).toISOString() : null;
};

export async function createAccessLink(input: { name: string; modules: string[]; validUntil: string | null }): Promise<AccessLink> {
  const link: AccessLink = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    name: input.name.trim().slice(0, 60) || "Länk",
    modules: cleanModules(input.modules),
    expiresAt: expiryFromDate(input.validUntil),
    createdAt: new Date().toISOString(),
    uses: 0,
    lastUsedAt: null,
  };
  await writeAll([...(await readAll()), link]);
  return link;
}

export async function updateAccessLink(id: string, change: { name?: string; modules?: string[]; validUntil?: string | null }): Promise<AccessLink> {
  const list = await readAll();
  const l = list.find((x) => x.id === id && !x.revoked);
  if (!l) throw new Error("Länken finns inte");
  if (change.name !== undefined) l.name = change.name.trim().slice(0, 60) || l.name;
  if (change.modules) l.modules = cleanModules(change.modules);
  if (change.validUntil !== undefined) l.expiresAt = expiryFromDate(change.validUntil);
  await writeAll(list);
  return l;
}

export async function revokeAccessLink(id: string) {
  const list = await readAll();
  await writeAll(list.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
}

export async function markUsed(id: string) {
  const list = await readAll();
  await writeAll(list.map((l) => (l.id === id ? { ...l, uses: l.uses + 1, lastUsedAt: new Date().toISOString() } : l)));
}
