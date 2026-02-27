/**
 * laget.se scraper – loggar in och hämtar anmälningslistan för nästa/dagens event.
 *
 * Flöde:
 * 1. GET /Login – hämta CSRF-token och cookies
 * 2. POST /Login – skicka inloggningsformulär
 * 3. Följ redirect-kedjan (/Common/Auth/SetCookie → returnUrl) för att sätta session-cookies
 * 4. GET /Stalstadens – hitta dagens/nästa event via event-länkar (eventId)
 * 5. GET /Common/Rsvp/ModalContent?pk={eventId}&site=Stalstadens – hämta RSVP-popup
 * 6. Parsa .attendingsList__cell med status "Kommer" för att extrahera namn
 */

import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { ENV } from "./_core/env";

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";

export interface AttendanceResult {
  eventTitle: string;
  eventDate: string;
  registeredNames: string[];
  totalRegistered: number;
  error?: string;
  noEvent?: boolean;
}

/**
 * Skapa en axios-instans med manuell cookie-hantering.
 * maxRedirects=0 så vi kan följa redirects manuellt och fånga cookies.
 */
function createClient(): {
  client: AxiosInstance;
  followRedirects: (resp: AxiosResponse) => Promise<AxiosResponse>;
} {
  const cookieJar: string[] = [];

  const client = axios.create({
    baseURL: BASE_URL,
    maxRedirects: 0,
    timeout: 30000,
    validateStatus: () => true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
    },
  });

  client.interceptors.response.use((response) => {
    const setCookies = response.headers["set-cookie"];
    if (setCookies) {
      for (const raw of setCookies) {
        const name = raw.split("=")[0];
        const idx = cookieJar.findIndex((c) => c.startsWith(name + "="));
        const cookieValue = raw.split(";")[0];
        if (idx >= 0) cookieJar[idx] = cookieValue;
        else cookieJar.push(cookieValue);
      }
    }
    return response;
  });

  client.interceptors.request.use((config) => {
    if (cookieJar.length > 0) {
      config.headers.Cookie = cookieJar.join("; ");
    }
    return config;
  });

  async function followRedirects(response: AxiosResponse): Promise<AxiosResponse> {
    let resp = response;
    let count = 0;
    while (
      (resp.status === 301 || resp.status === 302) &&
      resp.headers.location &&
      count < 10
    ) {
      const location = resp.headers.location;
      const url = location.startsWith("http")
        ? new URL(location).pathname + new URL(location).search
        : location;
      resp = await client.get(url);
      count++;
    }
    return resp;
  }

  return { client, followRedirects };
}

/**
 * Logga in på laget.se
 */
async function login(
  client: AxiosInstance,
  followRedirects: (resp: AxiosResponse) => Promise<AxiosResponse>
): Promise<boolean> {
  const username = ENV.lagetSeUsername;
  const password = ENV.lagetSePassword;

  if (!username || !password) {
    throw new Error("Laget.se credentials not configured");
  }

  // Steg 1: GET /Login – hämta CSRF-token
  let resp = await client.get("/Login");
  resp = await followRedirects(resp);

  const $ = cheerio.load(resp.data);
  const token = $('input[name="__RequestVerificationToken"]').val();
  const referer = $('input[name="Referer"]').val();

  // Steg 2: POST /Login
  const formData = new URLSearchParams();
  if (token) formData.append("__RequestVerificationToken", String(token));
  if (referer) formData.append("Referer", String(referer));
  formData.append("Email", username);
  formData.append("Password", password);
  formData.append("KeepAlive", "true");
  formData.append("KeepAlive", "false");

  resp = await client.post("/Login", formData.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE_URL}/Login`,
      Origin: BASE_URL,
    },
  });

  // Steg 3: Följ redirect-kedjan (302 → /Common/Auth/SetCookie → returnUrl)
  resp = await followRedirects(resp);

  // Om POST returnerade 200 utan redirect → login misslyckades (felaktigt lösenord)
  if (resp.data && typeof resp.data === "string" && resp.data.includes("login-form")) {
    return false;
  }

  return true;
}

/**
 * Hitta dagens/nästa event-ID från startsidan
 */
function findNextEventId(html: string): {
  eventId: string;
  eventDate: string;
  eventTitle: string;
} | null {
  const $ = cheerio.load(html);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  interface EventLink {
    eventId: string;
    eventDate: string;
    eventTitle: string;
    isToday: boolean;
  }

  const eventLinks: EventLink[] = [];

  $('a[href*="eventId="]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const eventIdMatch = href.match(/eventId=(\d+)/);
    const dateMatch = href.match(/Event\/Month\/(\d+)\/(\d+)\/(\d+)/);
    if (eventIdMatch) {
      const eid = eventIdMatch[1];
      let isToday = false;
      let dateStr = "";
      if (dateMatch) {
        const y = parseInt(dateMatch[1]);
        const m = parseInt(dateMatch[2]);
        const d = parseInt(dateMatch[3]);
        isToday = y === year && m === month && d === day;
        dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
      const eventTitle = $(el).text().trim();
      eventLinks.push({ eventId: eid, eventDate: dateStr, eventTitle, isToday });
    }
  });

  // Beräkna dagens och morgondagens datum
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  // Filtrera: bara events idag eller imorgon
  const relevantEvents = eventLinks
    .filter((e) => e.eventDate === todayStr || e.eventDate === tomorrowStr)
    .sort((a, b) => {
      // Prioritera dagens events före morgondagens
      if (a.eventDate === todayStr && b.eventDate !== todayStr) return -1;
      if (b.eventDate === todayStr && a.eventDate !== todayStr) return 1;
      return 0;
    });

  if (relevantEvents.length > 0) return relevantEvents[0];

  // Inget event idag eller imorgon
  return null;
}

/**
 * Extrahera anmälda namn från RSVP modal HTML.
 * Strukturen är:
 *   .attendingsList__row
 *     .attendingsList__cell.float--left  → spelarnamn
 *     .attendingsList__cell--gray.float--left
 *       .attendingsList__is-attending → "Kommer"
 */
function extractAttendeesFromModal(html: string): string[] {
  const $ = cheerio.load(html);
  const names: string[] = [];

  // Varje rad i anmälningslistan har klassen attendingsList__row
  $(".attendingsList__row").each((_, row) => {
    // Kolla om denna rad har status "Kommer"
    const status = $(row).find(".attendingsList__is-attending").text().trim();
    if (status === "Kommer") {
      // Hämta namnet från den första cellen
      const name = $(row)
        .find(".attendingsList__cell.float--left")
        .first()
        .text()
        .trim();
      if (name && name.length > 1) {
        // Rensa smeknamn inom citattecken
        const cleaned = name.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim();
        if (cleaned && !names.includes(cleaned)) {
          names.push(cleaned);
        }
      }
    }
  });

  return names;
}

/**
 * Hämta anmälningslistan för dagens/nästa event
 */
export async function fetchAttendance(): Promise<AttendanceResult> {
  const { client, followRedirects } = createClient();

  try {
    // Steg 1: Logga in
    const loggedIn = await login(client, followRedirects);
    if (!loggedIn) {
      return {
        eventTitle: "",
        eventDate: "",
        registeredNames: [],
        totalRegistered: 0,
        error: "Kunde inte logga in på laget.se. Kontrollera användarnamn och lösenord.",
      };
    }

    // Steg 2: Hämta startsidan för att hitta event-ID
    let resp = await client.get(`/${TEAM_SLUG}`);
    resp = await followRedirects(resp);

    const eventInfo = findNextEventId(resp.data);
    if (!eventInfo) {
      return {
        eventTitle: "",
        eventDate: new Date().toISOString().split("T")[0],
        registeredNames: [],
        totalRegistered: 0,
        noEvent: true,
      };
    }

    // Steg 3: Hämta RSVP modal content (anmälningslistan)
    const rsvpUrl = `/Common/Rsvp/ModalContent?pk=${eventInfo.eventId}&site=${TEAM_SLUG}`;
    resp = await client.get(rsvpUrl);
    resp = await followRedirects(resp);

    if (resp.status !== 200) {
      return {
        eventTitle: eventInfo.eventTitle || "Träning",
        eventDate: eventInfo.eventDate,
        registeredNames: [],
        totalRegistered: 0,
        error: `Kunde inte hämta anmälningslistan (HTTP ${resp.status})`,
      };
    }

    // Steg 4: Extrahera anmälda namn
    const names = extractAttendeesFromModal(resp.data);

    return {
      eventTitle: eventInfo.eventTitle || "Träning",
      eventDate: eventInfo.eventDate,
      registeredNames: names,
      totalRegistered: names.length,
    };
  } catch (error: any) {
    return {
      eventTitle: "",
      eventDate: "",
      registeredNames: [],
      totalRegistered: 0,
      error: `Fel vid hämtning: ${error.message || "Okänt fel"}`,
    };
  }
}
