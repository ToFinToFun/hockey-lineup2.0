/**
 * Profilkort som uppdateras automatiskt.
 *
 * Spelare vars sparade hockeykort används som profilbild (liveProfile) får kortet
 * omritat på servern när statistiken ändrats – inte vid sidladdning. Det sker:
 *  - en kort stund efter att en match sparats, godkänts, ändrats eller tagits bort
 *    (flera ändringar i rad slås ihop till en körning),
 *  - när kortet sparas med "profilbild",
 *  - en gång var sjätte timme (fångar t.ex. nytt säsongsnamn 1 augusti).
 * Varje kort får ett fingeravtryck av det som syns (val + statistik); är det
 * oförändrat ritas inget. Korten ritas ett i taget i bakgrunden, och resultatet
 * blir en vanlig profilbild (liten JPEG) som visas precis som förut.
 */
import { createHash } from "crypto";
import { renderCard, DEFAULT_SETTINGS, type CardSettings } from "../shared/cardRender";
import { serverCanvas } from "./serverCanvas";
import { cellsFor } from "../shared/cardStats";
import { cardStats, getCardRow, listLiveProfileIds, setRenderedHash } from "./playerCards";
import { setPlayerPhoto } from "./playerPhotos";

type Napi = typeof import("@napi-rs/canvas");
let napi: Napi | null = null;

/** Kortets val med aktuell statistik (samma logik som i webbläsaren). */
export function settingsWithStats(saved: Partial<CardSettings>, stats: Awaited<ReturnType<typeof cardStats>>): CardSettings {
  const s: CardSettings = { ...DEFAULT_SETTINGS, ...saved };
  if (s.statsMode === "custom" || s.statsMode === "none") return { ...s, form: stats.form };
  const { title, cells } = cellsFor(s.statsMode, stats);
  const isDefault = !s.statsTitle || /^Säsong \d{4}\/\d{2}$/.test(s.statsTitle) || s.statsTitle === "Karriär" || s.statsTitle === "Form";
  return { ...s, cells, statsTitle: isDefault ? title : s.statsTitle, form: stats.form };
}

export function fingerprint(s: CardSettings): string {
  return createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 32);
}

/** Rita om en spelares profilkort om något som syns har ändrats. Returnerar true om det ritades. */
export async function refreshLiveProfile(playerId: string, force = false): Promise<boolean> {
  napi = await serverCanvas();
  if (!napi) return false;
  const row = await getCardRow(playerId);
  if (!row || !row.liveProfile) return false;
  const settings = settingsWithStats(row.settings as Partial<CardSettings>, await cardStats(playerId));
  const hash = fingerprint(settings);
  if (!force && row.renderedHash === hash) return false;

  const photo = (await napi.loadImage(Buffer.from(row.source, "base64"))) as unknown as HTMLImageElement;
  const mask = row.mask ? ((await napi.loadImage(Buffer.from(row.mask, "base64"))) as unknown as HTMLImageElement) : null;
  const canvas = (await renderCard({ settings, photo, mask, scale: 0.64 })) as unknown as import("@napi-rs/canvas").Canvas;
  let jpeg = await canvas.encode("jpeg", 84);
  if (jpeg.length > 140_000) jpeg = await canvas.encode("jpeg", 70);
  await setPlayerPhoto(playerId, jpeg.toString("base64"));
  await setRenderedHash(playerId, hash);
  return true;
}

let running = false;
let again = false;

/** Gå igenom alla profilkort ett i taget; bara de med ändrad statistik ritas. */
export async function refreshAllLiveProfiles(): Promise<number> {
  if (running) {
    again = true;
    return 0;
  }
  running = true;
  let rendered = 0;
  try {
    do {
      again = false;
      for (const id of await listLiveProfileIds()) {
        try {
          if (await refreshLiveProfile(id)) rendered++;
        } catch (err) {
          console.error(`[cardProfile] ${id}:`, err);
        }
        // Släpp fram andra anrop mellan korten
        await new Promise((r) => setImmediate(r));
      }
    } while (again);
  } finally {
    running = false;
  }
  if (rendered) console.log(`[cardProfile] ${rendered} profilkort uppdaterade`);
  return rendered;
}

let timer: NodeJS.Timeout | null = null;

/** Anropas när matcher ändrats. Väntar lite så att flera ändringar blir en körning. */
export function scheduleLiveProfileRefresh(delayMs = 20_000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshAllLiveProfiles();
  }, delayMs);
  timer.unref?.();
}

/** Start: en körning efter en minut och sedan var sjätte timme. */
export function startLiveProfileSchedule() {
  scheduleLiveProfileRefresh(60_000);
  setInterval(() => void refreshAllLiveProfiles(), 6 * 60 * 60 * 1000).unref();
}
