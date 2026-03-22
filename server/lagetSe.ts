/**
 * laget.se scraper – loggar in på admin-sidan och hämtar anmälningslistan
 * för nästa/dagens event via kalender-redigeringssidan.
 *
 * Flöde:
 * 1. GET /Login – hämta CSRF-token och cookies
 * 2. POST /Login – skicka inloggningsformulär
 * 3. Följ redirect-kedjan (/Common/Auth/SetCookie → returnUrl)
 * 4. GET /Stalstadens/Calendar – hitta nästa events Edit-länk (eventId)
 * 5. GET /Stalstadens/Calendar/Edit/{eventId} – hämta deltagarlistan
 * 6. Parsa .rsvp-cell med .attendanceIcon.attending / .notAttending
 */

import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { ENV } from "./_core/env";
import { getLagetSeCredentials } from "./secretsDb";

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";
const ADMIN_BASE_URL = "https://admin.laget.se";

export interface AttendanceResult {
  eventTitle: string;
  eventDate: string;
  registeredNames: string[];
  declinedNames: string[];
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
      // Handle both absolute and relative URLs, and cross-domain redirects
      let url: string;
      if (location.startsWith("http")) {
        url = location; // Use full URL for cross-domain redirects
      } else {
        url = location;
      }
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
  // Try DB credentials first, then fall back to ENV vars
  const dbCreds = await getLagetSeCredentials();
  const username = dbCreds?.username || ENV.lagetSeUsername;
  const password = dbCreds?.password || ENV.lagetSePassword;

  if (!username || !password) {
    throw new Error("NO_CREDENTIALS: Inga inloggningsuppgifter konfigurerade. Klicka på kugghjulet (⚙) och ange ditt laget.se-konto.");
  }

  // Steg 1: GET /Login – hämta CSRF-token
  let resp = await client.get(`${BASE_URL}/Login`);
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

  resp = await client.post(`${BASE_URL}/Login`, formData.toString(), {
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
 * Hitta nästa events Edit-URL från admin-kalendersidan.
 * Returnerar eventId, eventDate och eventTitle.
 */
function findNextEventFromCalendar(html: string): {
  eventId: string;
  eventDate: string;
  eventTitle: string;
} | null {
  const $ = cheerio.load(html);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  interface CalendarEvent {
    eventId: string;
    eventDate: string;
    eventTitle: string;
  }

  const events: CalendarEvent[] = [];

  // Hitta alla Edit-länkar i kalendern
  $('a[href*="Calendar/Edit/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const idMatch = href.match(/Calendar\/Edit\/(\d+)/);
    if (!idMatch) return;

    const eventId = idMatch[1];
    const text = $(el).text().trim();

    // Hoppa över "Redigera"-knappar, vi vill ha event-titlar
    // Men vi behöver hitta datum från raden
    if (text === "Redigera" || text === "Redigera denna och kommande") return;

    // Texten innehåller datum + typ, t.ex. "2026-02-05 22:00 Träning"
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+(.*)/);
    if (dateMatch) {
      events.push({
        eventId,
        eventDate: dateMatch[1],
        eventTitle: dateMatch[2].trim(),
      });
    }
  });

  // Hitta även event via "Redigera"-knappar och extrahera datum från tabellraden
  {
    const monthMap: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", maj: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
    };

    // Fallback: Hämta alla Edit-länkar med deras rader
    $('a[href*="Calendar/Edit/"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const idMatch = href.match(/Calendar\/Edit\/(\d+)/);
      if (!idMatch) return;
      
      const text = $(el).text().trim();
      if (text !== "Redigera") return;

      const eventId = idMatch[1];
      
      // Hoppa över om vi redan har detta event
      if (events.find(e => e.eventId === eventId)) return;
      
      // Hitta parent-rad och extrahera datum
      const row = $(el).closest("tr");
      if (!row.length) return;

      const rowText = row.text().trim();
      // Matcha "3 mar 22:05 - 23:00  Träning"
      const dateMatch = rowText.match(/(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\s+(\d{2}:\d{2})/i);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, "0");
        const monthStr = dateMatch[2].toLowerCase();
        const month = monthMap[monthStr] || "01";
        const year = today.getFullYear();
        const eventDate = `${year}-${month}-${day}`;

        // Hitta eventtyp (Träning/Match)
        const typeMatch = rowText.match(/(?:Träning|Match|Möte|Cup)/i);
        const eventTitle = typeMatch ? typeMatch[0] : "Träning";

        events.push({ eventId, eventDate, eventTitle });
      }
    });
  }

  if (events.length === 0) return null;

  // Prioritera dagens event
  const todayEvent = events.find((e) => e.eventDate === todayStr);
  if (todayEvent) return todayEvent;

  // Annars ta närmaste framtida event
  const futureEvents = events
    .filter((e) => e.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (futureEvents.length > 0) return futureEvents[0];

  return null;
}

/**
 * Hitta event-ID från den publika startsidan (fallback)
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

  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayEvent = eventLinks.find((e) => e.isToday);
  if (todayEvent) return todayEvent;

  const futureEvents = eventLinks
    .filter((e) => e.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (futureEvents.length > 0) return futureEvents[0];

  return null;
}

/**
 * Extrahera anmälda och avböjda namn från admin-redigeringssidan.
 * Strukturen är:
 *   .rsvp-cell → varje spelarrad
 *     .listAttendeeDataName → spelarnamn
 *     .attendanceIcon.attending → "Deltar"
 *     .attendanceIcon.notAttending → "Deltar ej"
 */
function extractAttendeesFromEditPage(html: string): { registered: string[]; declined: string[] } {
  const $ = cheerio.load(html);
  const registered: string[] = [];
  const declined: string[] = [];

  $(".rsvp-cell").each((_, cell) => {
    const nameEl = $(cell).find(".listAttendeeDataName");
    const name = nameEl.text().trim();
    if (!name || name.length < 2 || name === "Namn") return;

    // Rensa smeknamn inom citattecken
    const cleaned = name.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    const statusEl = $(cell).find(".attendanceIcon");
    const isAttending = statusEl.hasClass("attending");
    const isNotAttending = statusEl.hasClass("notAttending");

    if (isAttending && !registered.includes(cleaned)) {
      registered.push(cleaned);
    } else if (isNotAttending && !declined.includes(cleaned)) {
      declined.push(cleaned);
    }
  });

  return { registered, declined };
}

/**
 * Extrahera anmälda och avböjda namn från RSVP modal HTML (fallback).
 */
function extractAttendeesFromModal(html: string): { registered: string[]; declined: string[] } {
  const $ = cheerio.load(html);
  const registered: string[] = [];
  const declined: string[] = [];

  $(".attendingsList__row").each((_, row) => {
    const status = $(row).find(".attendingsList__is-attending").text().trim();
    if (status === "Kommer" || status === "Kommer inte") {
      const name = $(row)
        .find(".attendingsList__cell.float--left")
        .first()
        .text()
        .trim();
      if (name && name.length > 1) {
        const cleaned = name.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim();
        if (cleaned) {
          if (status === "Kommer" && !registered.includes(cleaned)) {
            registered.push(cleaned);
          } else if (status === "Kommer inte" && !declined.includes(cleaned)) {
            declined.push(cleaned);
          }
        }
      }
    }
  });

  return { registered, declined };
}

/**
 * Hämta anmälningslistan för dagens/nästa event.
 * Primärt via admin-redigeringssidan (som har Deltar ej),
 * med fallback till RSVP-modalen.
 */
/**
 * Extrahera userId-mappning från admin-redigeringssidan.
 * Varje deltagare har en CSS-klass userid-{id} och ett namn i .listAttendeeDataName.
 */
function extractUserIdMap(html: string): Map<string, number> {
  const $ = cheerio.load(html);
  const map = new Map<string, number>();

  $(".rsvp-cell").each((_, cell) => {
    const nameEl = $(cell).find(".listAttendeeDataName");
    const name = nameEl.text().trim();
    if (!name || name.length < 2 || name === "Namn") return;

    const cleaned = name.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    // Hitta userId från CSS-klass userid-{id}
    const classes = $(cell).attr("class") || "";
    const userIdMatch = classes.match(/userid-(\d+)/);
    if (userIdMatch) {
      map.set(cleaned, parseInt(userIdMatch[1]));
    }
  });

  return map;
}

export type AttendingStatus = "Attending" | "NotAttending" | "NotAnswered";

export interface UpdateAttendanceResult {
  success: boolean;
  error?: string;
  newStatus?: AttendingStatus;
}

/**
 * Ändra en spelares deltagarstatus på laget.se.
 * Flöde:
 * 1. Logga in
 * 2. Hämta admin-kalendern → hitta eventId
 * 3. Hämta redigeringssidan → hitta userId för spelaren
 * 4. GET EditAttendee → hämta record-ID och nuvarande data
 * 5. POST SaveAttendeeInfo → ändra status
 */
export async function updateAttendance(
  playerName: string,
  newStatus: AttendingStatus,
  eventIdOverride?: string
): Promise<UpdateAttendanceResult> {
  const { client, followRedirects } = createClient();

  try {
    // Steg 1: Logga in
    const loggedIn = await login(client, followRedirects);
    if (!loggedIn) {
      return { success: false, error: "Kunde inte logga in på laget.se" };
    }

    // Steg 2: Hitta eventId
    let eventId = eventIdOverride;
    if (!eventId) {
      const calResp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`);
      const calPage = await followRedirects(calResp);
      if (calPage.status !== 200) {
        return { success: false, error: "Kunde inte ladda kalendern" };
      }
      const eventInfo = findNextEventFromCalendar(calPage.data);
      if (!eventInfo) {
        return { success: false, error: "Inget event hittades" };
      }
      eventId = eventInfo.eventId;
    }

    // Steg 3: Hämta redigeringssidan → hitta userId
    const editResp = await client.get(
      `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/Edit/${eventId}`
    );
    const editPage = await followRedirects(editResp);
    if (editPage.status !== 200) {
      return { success: false, error: "Kunde inte ladda redigeringssidan" };
    }

    const userIdMap = extractUserIdMap(editPage.data);

    // Matcha spelarnamn (exakt eller delvis)
    let userId: number | undefined;
    const normalizedInput = playerName.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim().toLowerCase();

    // Exakt matchning först
    const entries = Array.from(userIdMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [name, id] = entries[i];
      if (name.toLowerCase() === normalizedInput) {
        userId = id;
        break;
      }
    }

    // Delvis matchning som fallback
    if (!userId) {
      for (let i = 0; i < entries.length; i++) {
        const [name, id] = entries[i];
        if (name.toLowerCase().includes(normalizedInput) || normalizedInput.includes(name.toLowerCase())) {
          userId = id;
          break;
        }
      }
    }

    if (!userId) {
      return { success: false, error: `Kunde inte hitta spelare "${playerName}" på laget.se` };
    }

    // Steg 4: GET EditAttendee → hämta record-ID
    const editAttendeeResp = await client.get(
      `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/EditAttendee?eventId=${eventId}&userId=${userId}`,
      { headers: { "X-Requested-With": "XMLHttpRequest" } }
    );
    const editAttendeePage = await followRedirects(editAttendeeResp);

    if (editAttendeePage.status !== 200) {
      return { success: false, error: `EditAttendee misslyckades (HTTP ${editAttendeePage.status})` };
    }

    // Parsa formuläret för att hitta record-ID och andra fält
    let attendeeData: any;
    const responseData = editAttendeePage.data;
    if (typeof responseData === "string") {
      // HTML-formulär – parsa fälten
      const $ea = cheerio.load(responseData);
      attendeeData = {
        Id: parseInt($ea("input[name='Id'], #Id").val() as string) || 0,
        UserId: userId,
        CarSeats: parseInt($ea("input[name='CarSeats'], #CarSeats, select[name='CarSeats']").val() as string) || -1,
        Comment: ($ea("input[name='Comment'], #Comment, textarea[name='Comment']").val() as string) || "",
        QuestionResponse: ($ea("input[name='QuestionResponse'], #QuestionResponse").val() as string) || "",
        EventId: parseInt(eventId),
        Attending: newStatus,
        Role: ($ea("input[name='Role'], #Role, select[name='Role']").val() as string) || "4",
        WillAttendAssembly: false,
        Attended: ($ea("input[name='Attended'], #Attended, select[name='Attended']").val() as string) || "Neutral",
      };
    } else if (typeof responseData === "object") {
      // JSON-svar
      attendeeData = {
        ...responseData,
        Attending: newStatus,
      };
    } else {
      return { success: false, error: "Oväntat svar från EditAttendee" };
    }

    if (!attendeeData.Id) {
      return { success: false, error: "Kunde inte hitta attendee record-ID" };
    }

    // Steg 5: POST SaveAttendeeInfo
    const saveResp = await client.post(
      `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/SaveAttendeeInfo`,
      JSON.stringify(attendeeData),
      {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    const savePage = await followRedirects(saveResp);

    if (savePage.status === 200) {
      return { success: true, newStatus };
    } else {
      return { success: false, error: `SaveAttendeeInfo misslyckades (HTTP ${savePage.status})` };
    }
  } catch (error: any) {
    return { success: false, error: `Fel: ${error.message || "Okänt fel"}` };
  }
}

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
        declinedNames: [],
        totalRegistered: 0,
        error: "LOGIN_FAILED: Kunde inte logga in på laget.se. Kontrollera användarnamn och lösenord i inställningarna (⚙).",
      };
    }

    // Steg 2: Försök hämta via admin-kalendern först
    let eventInfo: { eventId: string; eventDate: string; eventTitle: string } | null = null;

    try {
      const calendarResp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`);
      const calResp = await followRedirects(calendarResp);

      if (calResp.status === 200 && typeof calResp.data === "string") {
        eventInfo = findNextEventFromCalendar(calResp.data);

        if (eventInfo) {
          // Hämta redigeringssidan för att få Deltar/Deltar ej
          const editResp = await client.get(
            `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/Edit/${eventInfo.eventId}`
          );
          const editPage = await followRedirects(editResp);

          if (editPage.status === 200 && typeof editPage.data === "string") {
            const { registered, declined } = extractAttendeesFromEditPage(editPage.data);

            if (registered.length > 0 || declined.length > 0) {
              return {
                eventTitle: eventInfo.eventTitle || "Träning",
                eventDate: eventInfo.eventDate,
                registeredNames: registered,
                declinedNames: declined,
                totalRegistered: registered.length,
              };
            }
          }
        }
      }
    } catch (adminError: any) {
      // Admin-sidan misslyckades, fortsätt med fallback
    }

    // Steg 3: Fallback – hämta via publika startsidan + RSVP modal
    let resp = await client.get(`${BASE_URL}/${TEAM_SLUG}`);
    resp = await followRedirects(resp);

    const fallbackEventInfo = findNextEventId(resp.data);
    if (!fallbackEventInfo && !eventInfo) {
      return {
        eventTitle: "",
        eventDate: new Date().toISOString().split("T")[0],
        registeredNames: [],
        declinedNames: [],
        totalRegistered: 0,
        noEvent: true,
      };
    }

    const eid = fallbackEventInfo || eventInfo!;

    const rsvpUrl = `${BASE_URL}/Common/Rsvp/ModalContent?pk=${eid.eventId}&site=${TEAM_SLUG}`;
    resp = await client.get(rsvpUrl);
    resp = await followRedirects(resp);

    if (resp.status !== 200) {
      return {
        eventTitle: eid.eventTitle || "Träning",
        eventDate: eid.eventDate,
        registeredNames: [],
        declinedNames: [],
        totalRegistered: 0,
        error: resp.status === 429
          ? "RATE_LIMITED: Laget.se blockerar tillfälligt förfrågningar. Vänta en stund och försök igen."
          : resp.status === 401 || resp.status === 403
          ? "AUTH_ERROR: Åtkomst nekad. Kontrollera inloggningsuppgifterna i inställningarna (⚙)."
          : `Kunde inte hämta anmälningslistan (HTTP ${resp.status})`,
      };
    }

    const { registered, declined } = extractAttendeesFromModal(resp.data);

    return {
      eventTitle: eid.eventTitle || "Träning",
      eventDate: eid.eventDate,
      registeredNames: registered,
      declinedNames: declined,
      totalRegistered: registered.length,
    };
  } catch (error: any) {
    return {
      eventTitle: "",
      eventDate: "",
      registeredNames: [],
      declinedNames: [],
      totalRegistered: 0,
      error: error.message?.startsWith("NO_CREDENTIALS:")
        ? error.message
        : `Fel vid hämtning: ${error.message || "Okänt fel"}`,
    };
  }
}
