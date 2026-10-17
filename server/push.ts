/**
 * Push-notiser (Web Push) till medlemmarnas telefoner.
 *
 * - Nycklarna (VAPID) skapas automatiskt första gången och sparas i app_config – ingen inställning.
 * - En prenumeration per enhet, kopplad till medlemmens inloggning på enheten. Loggas enheten ut
 *   försvinner prenumerationen; svarar push-tjänsten att den är borta (404/410) tas den bort.
 * - Regeln i appen: har medlemmen push på någon enhet får den push, annars mejl (server/notify.ts).
 * - iPhone: kräver att appen lagts på hemskärmen (iOS 16.4+).
 */
import webpush from "web-push";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { memberSessions, pushSubscriptions } from "../drizzle/schema";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { appUrl } from "./clubConfig";

const KEY = "push_vapid";
let keys: { publicKey: string; privateKey: string } | null = null;

async function vapid() {
  if (keys) return keys;
  const raw = await getConfigValue(KEY).catch(() => null);
  if (raw) keys = JSON.parse(raw);
  else {
    keys = webpush.generateVAPIDKeys();
    await setConfigValue(KEY, JSON.stringify(keys));
  }
  webpush.setVapidDetails(appUrl().startsWith("https://") ? appUrl() : "mailto:noreply@stalstadens.se", keys!.publicKey, keys!.privateKey);
  return keys!;
}

export async function publicKey() {
  return (await vapid()).publicKey;
}

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Databasen är inte tillgänglig");
  return d;
}

export async function subscribe(memberId: number, sessionId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const values = { memberId, sessionId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await (await db()).insert(pushSubscriptions).values(values).onDuplicateKeyUpdate({ set: values });
}

export async function unsubscribe(memberId: number, endpoint: string) {
  await (await db()).delete(pushSubscriptions).where(and(eq(pushSubscriptions.memberId, memberId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Tar bort prenumerationerna för utloggade enheter. */
export async function removeForSessions(sessionIds: string[]) {
  if (!sessionIds.length) return;
  await (await db()).delete(pushSubscriptions).where(inArray(pushSubscriptions.sessionId, sessionIds));
}

/** Aktiva prenumerationer (enheten är fortfarande inloggad). memberIds = null: alla. */
async function activeSubs(memberIds: number[] | null) {
  const d = await db();
  const rows = await d
    .select({ sub: pushSubscriptions })
    .from(pushSubscriptions)
    .innerJoin(memberSessions, eq(memberSessions.id, pushSubscriptions.sessionId))
    .where(memberIds ? and(isNull(memberSessions.revokedAt), inArray(pushSubscriptions.memberId, memberIds.length ? memberIds : [-1])) : isNull(memberSessions.revokedAt));
  return rows.map((r) => r.sub);
}

/** Medlemmar som har push på minst en enhet. */
export async function membersWithPush(memberIds: number[] | null): Promise<Set<number>> {
  return new Set((await activeSubs(memberIds)).map((s) => s.memberId));
}

export interface PushMessage {
  title: string;
  body: string;
  /** Sökväg i appen som öppnas vid tryck, t.ex. /mina/12 */
  url: string;
  /** Samma tag ersätter en tidigare notis (t.ex. en chatt) */
  tag?: string;
}

/** Skickar till medlemmarnas alla enheter. Svarar med de medlemmar som nåddes. */
export async function pushTo(memberIds: number[] | null, msg: PushMessage): Promise<Set<number>> {
  const subs = await activeSubs(memberIds);
  if (!subs.length) return new Set();
  await vapid();
  const payload = JSON.stringify({ ...msg, url: msg.url.startsWith("/") ? msg.url : "/" });
  const reached = new Set<number>();
  const gone: number[] = [];
  const ok: number[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: "normal" });
        reached.add(s.memberId);
        ok.push(s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
        else console.warn("[push] misslyckades:", code ?? (e as Error).message);
      }
    }),
  );
  const d = await db();
  if (gone.length) await d.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (ok.length) await d.update(pushSubscriptions).set({ lastOkAt: new Date() }).where(inArray(pushSubscriptions.id, ok));
  return reached;
}
