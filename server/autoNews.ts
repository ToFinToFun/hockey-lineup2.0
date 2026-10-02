/**
 * Automatisk nyhet till laget.se (Inställningar → laget.se).
 *
 * En bestämd tid före evenemanget (standard 45 min) kontrolleras:
 *  1. Finns en tidsinställd nyhet för dagen som inte gått ut → den uppdateras
 *     med aktuell uppställning (bild och text), med samma publiceringstid.
 *  2. Finns ingen nyhet → en ny publiceras direkt, om minst N anmälda spelare
 *     (standard 10) står i uppställningen.
 *  3. Redan publicerad → rörs inte.
 * 15 minuter innan skickas en förhandsvisning (eller en varning om för få
 * spelare) till dem som valt de notiserna. Nyheten byggs på servern med samma
 * kod som rutan "Nyhet till laget.se" i Lineup.
 */
import { getOpponent } from "./opponents";
import { club } from "../shared/club";
import { teamAccent } from "../shared/teams";
import { appUrl } from "./clubConfig";
import { teamLogo } from "../shared/club";
import { getConfigValue, setConfigValue } from "./scoreDb";
import { fetchAttendance, publishNews, newsExists } from "./lagetSe";
import { getLineupSnapshot } from "./lineupSync";
import { listSponsors, recordSponsorNews } from "./sponsorsDb";
import { readLastPublished, writeLastPublished } from "./newsState";
import { lockLineup } from "./lineupLock";
import { notify, mailLayout } from "./notifications";
import { serverCanvas } from "./serverCanvas";
import { ENV } from "./_core/env";
import { pickLeastShown } from "../shared/sponsors";
import { renderNewsImage } from "../client/src/lib/newsImage";
import { buildNewsBody, defaultHomeForDate, formatNewsTitle, shortDate } from "../client/src/lib/lagetNews";
import { lineupStateToText } from "../client/src/lib/lineupText";
import { createTeamSlots, MAX_TEAM_CONFIG } from "../client/src/lib/lineup";
import type { Player } from "../client/src/lib/players";

export interface AutoNewsConfig {
  enabled: boolean;
  /** Minuter före evenemangets start */
  minutesBefore: number;
  /** Minst så många anmälda spelare i uppställningen */
  minPlayers: number;
}

export interface AutoNewsStatus {
  at: string;
  eventDate: string | null;
  message: string;
  ok: boolean;
}

const CONFIG_KEY = "auto_news";
const STATE_KEY = "auto_news_state";
const STATUS_KEY = "auto_news_status";
export const DEFAULT_AUTO_NEWS: AutoNewsConfig = { enabled: false, minutesBefore: 45, minPlayers: 10 };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getConfigValue(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export const getAutoNewsConfig = () => readJson<AutoNewsConfig>(CONFIG_KEY, DEFAULT_AUTO_NEWS);
export async function setAutoNewsConfig(c: AutoNewsConfig) {
  await setConfigValue(CONFIG_KEY, JSON.stringify(c));
}
export const getAutoNewsStatus = () => readJson<AutoNewsStatus | null>(STATUS_KEY, null);
async function setStatus(eventDate: string | null, message: string, ok: boolean) {
  await setConfigValue(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), eventDate, message, ok } satisfies AutoNewsStatus));
  console.log(`[autoNews] ${message}`);
}

/** Evenemangets start som Date (lokal tid), eller null. Exporteras för test. */
export function eventStart(date: string | undefined, time: string | undefined): Date | null {
  const d = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time?.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
}

/** Vad som ska hända nu: förhandsvisning, publicering eller inget. Exporteras för test. */
export function autoNewsPhase(now: Date, start: Date, minutesBefore: number): "wait" | "preview" | "publish" | "past" {
  const publishAt = start.getTime() - minutesBefore * 60_000;
  if (now.getTime() >= start.getTime()) return "past";
  if (now.getTime() >= publishAt) return "publish";
  if (now.getTime() >= publishAt - 15 * 60_000) return "preview";
  return "wait";
}

// Evenemanget hämtas från laget.se högst var 20:e minut
let eventCache: { at: number; date?: string; time?: string; location?: string } | null = null;
async function nextEvent() {
  if (!eventCache || Date.now() - eventCache.at > 20 * 60_000) {
    const r = await fetchAttendance();
    eventCache = { at: Date.now(), date: r.eventDate || undefined, time: r.eventTime, location: r.eventLocation };
  }
  return eventCache;
}

const weekdayLine = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString("sv-SE", { weekday: "long" });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${shortDate(iso)}`;
};

export interface BuiltNews {
  title: string;
  body: string;
  image: Buffer;
  registeredPlaced: number;
  sponsorId: number | null;
}

/** Bygg nyheten (rubrik, text och bild) av aktuell uppställning. */
export async function buildNews(ev: { date: string; time?: string; location?: string }): Promise<BuiltNews> {
  const napi = await serverCanvas();
  if (!napi) throw new Error("Kan inte rita bilden på servern");
  const { doc } = await getLineupSnapshot();
  const teamAConfig = doc.teamAConfig ?? MAX_TEAM_CONFIG;
  const teamBConfig = doc.teamBConfig ?? MAX_TEAM_CONFIG;
  const lineup = doc.lineup as Record<string, Player>;
  const pick = (prefix: string) => Object.fromEntries(Object.entries(lineup).filter(([k]) => k.startsWith(prefix)));
  const registeredPlaced = Object.values(lineup).filter((p) => p?.isRegistered).length;

  const sponsors = (await listSponsors()).sponsors;
  const sponsor = pickLeastShown(sponsors, (s) => s.counts.lineups);
  const text = lineupStateToText({ teamAName: doc.teamAName, teamBName: doc.teamBName, teamAConfig, teamBConfig, lineup }, { bold: true });
  const placeLine = [ev.location, ev.time].filter(Boolean).join(" ");

  // Mot motståndare: vårt lags och motståndarens logga och färg
  const ext = doc.setup?.mode === "external" && doc.setup.opponentId ? await getOpponent(doc.setup.opponentId).catch(() => null) : null;
  const c0 = club();
  const ourLogo = doc.setup?.ourLogo === "white" ? c0.teams.white.logo : doc.setup?.ourLogo === "green" ? c0.teams.green.logo : c0.logo;
  const logoA = ext ? ourLogo : teamLogo("white");
  const logoB = ext ? (ext.logoUrl ?? "") : teamLogo("green");
  const accentB = ext ? ext.color : teamAccent("green");

  const canvas = (await renderNewsImage({
    teamA: { name: doc.teamAName, slots: createTeamSlots("team-a", teamAConfig), lineup: pick("team-a-"), logoUrl: logoA, accent: teamAccent("white") },
    teamB: { name: doc.teamBName, slots: createTeamSlots("team-b", teamBConfig), lineup: pick("team-b-"), logoUrl: logoB, accent: accentB },
    home: defaultHomeForDate(ev.date),
    dateLine: weekdayLine(ev.date),
    placeLine,
    sponsor: sponsor?.name,
    sponsorLogoUrl: sponsor?.logo ?? undefined,
    backgroundUrl: "/images/background.jpg",
  })) as unknown as import("@napi-rs/canvas").Canvas;
  const image = await canvas.encode("jpeg", 90);

  return {
    title: formatNewsTitle({ date: ev.date, location: ev.location, time: ev.time }),
    body: buildNewsBody(sponsor?.name, text, true),
    image,
    registeredPlaced,
    sponsorId: sponsor && sponsor.id > 0 ? sponsor.id : null,
  };
}

let running = false;

/** Körs var femte minut. Gör bara något under förhandsvisnings- och publiceringsfönstret. */
export async function autoNewsTick(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cfg = await getAutoNewsConfig();
    if (!cfg.enabled) return;
    const ev = await nextEvent();
    const start = eventStart(ev.date, ev.time);
    if (!start || !ev.date) return;
    const phase = autoNewsPhase(now, start, cfg.minutesBefore);
    if (phase === "wait" || phase === "past") return;

    const state = await readJson<{ eventDate?: string; previewSent?: boolean; done?: boolean }>(STATE_KEY, {});
    const s = state.eventDate === ev.date ? state : { eventDate: ev.date };
    if (phase === "preview" && s.previewSent) return;
    if (phase === "publish" && s.done) return;

    let last = await readLastPublished();
    // Borttagen på laget.se sedan den skapades? Då räknas det som att ingen nyhet finns
    if (last && (await newsExists(last.id)) === false) {
      await writeLastPublished(null);
      last = null;
    }
    const sameDay = last?.eventDate === ev.date ? last : null;
    const scheduledLater = sameDay?.publishAt ? new Date(sameDay.publishAt.replace(" ", "T")).getTime() > now.getTime() : false;
    const publishedAlready = !!sameDay && !scheduledLater;

    const news = await buildNews({ date: ev.date, time: ev.time, location: ev.location });
    const enough = news.registeredPlaced >= cfg.minPlayers;
    const lineupUrl = `${appUrl()}/lineup`;

    if (phase === "preview") {
      if (publishedAlready) {
        // Inget att förvarna om – nyheten är redan ute
      } else if (!enough && !scheduledLater) {
        const m = mailLayout("Automatisk nyhet kan inte gå ut", [
          `Om 15 minuter ska dagens lag publiceras automatiskt, men bara <b>${news.registeredPlaced}</b> anmälda spelare står i uppställningen (minst ${cfg.minPlayers} krävs).`,
          "Fyll på uppställningen i Lineup, så går nyheten ut som vanligt.",
        ], { href: lineupUrl, label: "Öppna Lineup" });
        await notify("autoNewsSkipped", { subject: `Nyheten går inte ut – för få spelare (${news.registeredPlaced})`, ...m });
      } else {
        const m = mailLayout(`Förhandsvisning: ${news.title}`, [
          scheduledLater ? "Den tidsinställda nyheten uppdateras om 15 minuter med uppställningen nedan." : "Om 15 minuter publiceras dagens lag på laget.se med uppställningen nedan.",
          `${news.registeredPlaced} anmälda spelare i uppställningen. Ändra i Lineup före dess om något ska justeras.`,
          `<img src="cid:lag" style="max-width:100%;border-radius:8px" alt="Dagens lag">`,
        ], { href: lineupUrl, label: "Öppna Lineup" });
        await notify("autoNewsPreview", { subject: `Om 15 min: ${news.title}`, ...m, attachments: [{ filename: "dagens-lag.jpg", content: news.image, cid: "lag", contentType: "image/jpeg" }] });
      }
      await setConfigValue(STATE_KEY, JSON.stringify({ ...s, previewSent: true }));
      return;
    }

    // Publiceringsfönstret
    if (publishedAlready) {
      await setStatus(ev.date, `Hoppade över ${shortDate(ev.date)} – nyheten var redan publicerad.`, true);
    } else if (scheduledLater && sameDay) {
      const [d, t] = (sameDay.publishAt ?? "").split(" ");
      const res = await publishNews({
        id: sameDay.id, title: news.title, body: news.body, image: news.image, imageName: "dagens-lag.jpg", imageType: "image/jpeg",
        showPublisher: false, publishAt: d && t ? { date: d, hour: t.slice(0, 2), minute: t.slice(3, 5) } : undefined,
      });
      if (res.success) {
        await lockLineup(news.title).catch(() => undefined); // laget låses för Score Tracker
        await setStatus(ev.date, `Uppdaterade den tidsinställda nyheten ${shortDate(ev.date)} med aktuell uppställning.`, true);
        const m = mailLayout("Tidsinställd nyhet uppdaterad", [`"${news.title}" har fått aktuell uppställning och går ut ${sameDay.publishAt}.`], { href: res.url, label: "Visa nyheten" });
        await notify("autoNewsPublished", { subject: `Uppdaterad: ${news.title}`, ...m });
      } else {
        await setStatus(ev.date, `Kunde inte uppdatera nyheten: ${res.error}`, false);
      }
    } else if (!enough) {
      await setStatus(ev.date, `Hoppade över ${shortDate(ev.date)} – bara ${news.registeredPlaced} anmälda i uppställningen (minst ${cfg.minPlayers}).`, false);
      const m = mailLayout("Automatisk nyhet gick inte ut", [
        `Bara <b>${news.registeredPlaced}</b> anmälda spelare stod i uppställningen (minst ${cfg.minPlayers} krävs), så ingen nyhet publicerades.`,
        "Du kan publicera manuellt via Nyhet i Lineup.",
      ], { href: lineupUrl, label: "Öppna Lineup" });
      await notify("autoNewsSkipped", { subject: `Nyheten gick inte ut – för få spelare (${news.registeredPlaced})`, ...m });
    } else {
      const res = await publishNews({
        title: news.title, body: news.body, image: news.image, imageName: "dagens-lag.jpg", imageType: "image/jpeg", showPublisher: false,
      });
      if (res.success) {
        await lockLineup(news.title).catch(() => undefined); // laget låses för Score Tracker
        await writeLastPublished({ id: res.id, url: res.url, title: news.title, eventDate: ev.date, publishedAt: new Date().toISOString(), publishAt: null });
        if (news.sponsorId) await recordSponsorNews(news.sponsorId);
        await setStatus(ev.date, `Publicerade dagens lag ${shortDate(ev.date)} (${news.registeredPlaced} anmälda).`, true);
        const m = mailLayout("Dagens lag publicerat", [`"${news.title}" publicerades automatiskt på laget.se.`], { href: res.url, label: "Visa nyheten" });
        await notify("autoNewsPublished", { subject: `Publicerad: ${news.title}`, ...m });
      } else {
        await setStatus(ev.date, `Kunde inte publicera: ${res.error}`, false);
      }
    }
    await setConfigValue(STATE_KEY, JSON.stringify({ ...s, previewSent: true, done: true }));
  } catch (err) {
    console.error("[autoNews]", err);
  } finally {
    running = false;
  }
}

export function startAutoNewsSchedule() {
  setInterval(() => void autoNewsTick(), 5 * 60_000).unref();
  setTimeout(() => void autoNewsTick(), 90_000).unref();
}
