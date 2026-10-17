/**
 * Behörigheter i appen per medlem. Medlemmen loggar in som vanligt (e-postkod via sajten);
 * har medlemmen en behörighet här blir sessionen Admin eller får valda delar.
 *
 * - Sätts av en Admin i appen (Inställningar → Åtkomst), eller från sajten av den som har
 *   rollen styrelse/webbadmin ("Ge Admin i appen") – vägen in om ingen Admin finns.
 * - Läses vid varje anrop (kort cache), så ändringar gäller direkt.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { memberGrants, type MemberGrantRow } from "../drizzle/schema";
import { isAccessModule, type AccessModule } from "../shared/accessModules";

export interface Grant {
  memberId: number;
  admin: boolean;
  modules: AccessModule[];
  grantedBy: string;
  grantedAt: Date;
  lastUsedAt: Date | null;
}

const toGrant = (r: MemberGrantRow): Grant => ({
  memberId: r.memberId,
  admin: r.admin,
  modules: (r.modules ?? []).filter(isAccessModule),
  grantedBy: r.grantedBy,
  grantedAt: r.grantedAt,
  lastUsedAt: r.lastUsedAt,
});

let cache: { at: number; list: Grant[] } | null = null;

export async function listGrants(): Promise<Grant[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.list;
  const d = await getDb();
  if (!d) return [];
  const list = (await d.select().from(memberGrants)).map(toGrant);
  cache = { at: Date.now(), list };
  return list;
}

export async function getGrant(memberId: number): Promise<Grant | null> {
  const g = (await listGrants()).find((x) => x.memberId === memberId);
  return g && (g.admin || g.modules.length) ? g : null;
}

export async function setGrant(memberId: number, grant: { admin: boolean; modules: string[] }, by: string) {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  const modules = [...new Set(grant.modules.filter(isAccessModule))];
  if (!grant.admin && !modules.length) return removeGrant(memberId);
  const values = { admin: grant.admin, modules, grantedBy: by.slice(0, 120), grantedAt: new Date() };
  await d.insert(memberGrants).values({ memberId, ...values }).onDuplicateKeyUpdate({ set: values });
  cache = null;
}

export async function removeGrant(memberId: number) {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  await d.delete(memberGrants).where(eq(memberGrants.memberId, memberId));
  cache = null;
}

/** Senast använd – sparas högst var tionde minut per medlem. */
const touched = new Map<number, number>();
export function touchGrant(memberId: number) {
  const last = touched.get(memberId) ?? 0;
  if (Date.now() - last < 10 * 60_000) return;
  touched.set(memberId, Date.now());
  void getDb().then((d) => d?.update(memberGrants).set({ lastUsedAt: new Date() }).where(eq(memberGrants.memberId, memberId))).catch(() => undefined);
}
