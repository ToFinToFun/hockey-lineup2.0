/**
 * Netlify Function: laget-attendance
 * Hämtar anmälningslistan från laget.se via admin-sidan.
 * Stödjer GET (hämta) och POST (uppdatera status).
 *
 * Env vars: LAGET_SE_USERNAME, LAGET_SE_PASSWORD
 */
import axios from "axios";
import * as cheerio from "cheerio";

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";
const ADMIN_BASE_URL = "https://admin.laget.se";

// ── Axios client med manuell cookie-hantering ──

function createClient() {
  const cookieJar = [];

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

  async function followRedirects(response) {
    let resp = response;
    let count = 0;
    while (
      (resp.status === 301 || resp.status === 302) &&
      resp.headers.location &&
      count < 10
    ) {
      const location = resp.headers.location;
      const url = location.startsWith("http") ? location : location;
      resp = await client.get(url);
      count++;
    }
    return resp;
  }

  return { client, followRedirects };
}

// ── Login ──

async function login(client, followRedirects) {
  const username = process.env.LAGET_SE_USERNAME;
  const password = process.env.LAGET_SE_PASSWORD;

  if (!username || !password) {
    throw new Error("Laget.se credentials not configured");
  }

  let resp = await client.get(`${BASE_URL}/Login`);
  resp = await followRedirects(resp);

  const $ = cheerio.load(resp.data);
  const token = $('input[name="__RequestVerificationToken"]').val();
  const referer = $('input[name="Referer"]').val();

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

  resp = await followRedirects(resp);

  if (resp.data && typeof resp.data === "string" && resp.data.includes("login-form")) {
    return false;
  }
  return true;
}

// ── Hitta event från admin-kalender ──

function findNextEventFromCalendar(html) {
  const $ = cheerio.load(html);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const events = [];

  $('a[href*="Calendar/Edit/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const idMatch = href.match(/Calendar\/Edit\/(\d+)/);
    if (!idMatch) return;

    const eventId = idMatch[1];
    const text = $(el).text().trim();

    if (text === "Redigera" || text === "Redigera denna och kommande") return;

    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+(.*)/);
    if (dateMatch) {
      events.push({
        eventId,
        eventDate: dateMatch[1],
        eventTitle: dateMatch[2].trim(),
      });
    }
  });

  // Fallback: Redigera-knappar med tabellrad
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", maj: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
  };

  $('a[href*="Calendar/Edit/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const idMatch = href.match(/Calendar\/Edit\/(\d+)/);
    if (!idMatch) return;

    const text = $(el).text().trim();
    if (text !== "Redigera") return;

    const eventId = idMatch[1];
    if (events.find((e) => e.eventId === eventId)) return;

    const row = $(el).closest("tr");
    if (!row.length) return;

    const rowText = row.text().trim();
    const dateMatch = rowText.match(/(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\s+(\d{2}:\d{2})/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const monthStr = dateMatch[2].toLowerCase();
      const month = monthMap[monthStr] || "01";
      const year = today.getFullYear();
      const eventDate = `${year}-${month}-${day}`;

      const typeMatch = rowText.match(/(?:Träning|Match|Möte|Cup)/i);
      const eventTitle = typeMatch ? typeMatch[0] : "Träning";

      events.push({ eventId, eventDate, eventTitle });
    }
  });

  if (events.length === 0) return null;

  const todayEvent = events.find((e) => e.eventDate === todayStr);
  if (todayEvent) return todayEvent;

  const futureEvents = events
    .filter((e) => e.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (futureEvents.length > 0) return futureEvents[0];

  return null;
}

// ── Hitta event från publik sida (fallback) ──

function findNextEventId(html) {
  const $ = cheerio.load(html);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const eventLinks = [];

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

// ── Extrahera deltagare från admin-redigeringssida ──

function extractAttendeesFromEditPage(html) {
  const $ = cheerio.load(html);
  const registered = [];
  const declined = [];

  $(".rsvp-cell").each((_, cell) => {
    const nameEl = $(cell).find(".listAttendeeDataName");
    const name = nameEl.text().trim();
    if (!name || name.length < 2 || name === "Namn") return;

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

// ── Extrahera deltagare från RSVP-modal (fallback) ──

function extractAttendeesFromModal(html) {
  const $ = cheerio.load(html);
  const registered = [];
  const declined = [];

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

// ── Extrahera userId-mappning ──

function extractUserIdMap(html) {
  const $ = cheerio.load(html);
  const map = new Map();

  $(".rsvp-cell").each((_, cell) => {
    const nameEl = $(cell).find(".listAttendeeDataName");
    const name = nameEl.text().trim();
    if (!name || name.length < 2 || name === "Namn") return;

    const cleaned = name.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    const classes = $(cell).attr("class") || "";
    const userIdMatch = classes.match(/userid-(\d+)/);
    if (userIdMatch) {
      map.set(cleaned, parseInt(userIdMatch[1]));
    }
  });

  return map;
}

// ── Hämta anmälningslista ──

async function fetchAttendance() {
  const { client, followRedirects } = createClient();

  try {
    const loggedIn = await login(client, followRedirects);
    if (!loggedIn) {
      return {
        eventTitle: "",
        eventDate: "",
        registeredNames: [],
        declinedNames: [],
        totalRegistered: 0,
        error: "Kunde inte logga in på laget.se. Kontrollera användarnamn och lösenord.",
      };
    }

    let eventInfo = null;

    try {
      const calendarResp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`);
      const calResp = await followRedirects(calendarResp);

      if (calResp.status === 200 && typeof calResp.data === "string") {
        eventInfo = findNextEventFromCalendar(calResp.data);

        if (eventInfo) {
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
    } catch (adminError) {
      // Admin-sidan misslyckades, fortsätt med fallback
    }

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

    const eid = fallbackEventInfo || eventInfo;

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
        error: `Kunde inte hämta anmälningslistan (HTTP ${resp.status})`,
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
  } catch (error) {
    return {
      eventTitle: "",
      eventDate: "",
      registeredNames: [],
      declinedNames: [],
      totalRegistered: 0,
      error: `Fel vid hämtning: ${error.message || "Okänt fel"}`,
    };
  }
}

// ── Uppdatera deltagarstatus ──

async function updateAttendance(playerName, newStatus) {
  const { client, followRedirects } = createClient();

  try {
    const loggedIn = await login(client, followRedirects);
    if (!loggedIn) {
      return { success: false, error: "Kunde inte logga in på laget.se" };
    }

    const calResp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`);
    const calPage = await followRedirects(calResp);
    if (calPage.status !== 200) {
      return { success: false, error: "Kunde inte ladda kalendern" };
    }
    const eventInfo = findNextEventFromCalendar(calPage.data);
    if (!eventInfo) {
      return { success: false, error: "Inget event hittades" };
    }
    const eventId = eventInfo.eventId;

    const editResp = await client.get(
      `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/Edit/${eventId}`
    );
    const editPage = await followRedirects(editResp);
    if (editPage.status !== 200) {
      return { success: false, error: "Kunde inte ladda redigeringssidan" };
    }

    const userIdMap = extractUserIdMap(editPage.data);

    let userId;
    const normalizedInput = playerName.replace(/"[^"]*"/g, "").replace(/\s+/g, " ").trim().toLowerCase();

    const entries = Array.from(userIdMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [name, id] = entries[i];
      if (name.toLowerCase() === normalizedInput) {
        userId = id;
        break;
      }
    }

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

    const editAttendeeResp = await client.get(
      `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/EditAttendee?eventId=${eventId}&userId=${userId}`,
      { headers: { "X-Requested-With": "XMLHttpRequest" } }
    );
    const editAttendeePage = await followRedirects(editAttendeeResp);

    if (editAttendeePage.status !== 200) {
      return { success: false, error: `EditAttendee misslyckades (HTTP ${editAttendeePage.status})` };
    }

    let attendeeData;
    const responseData = editAttendeePage.data;
    if (typeof responseData === "string") {
      const $ea = cheerio.load(responseData);
      attendeeData = {
        Id: parseInt($ea("input[name='Id'], #Id").val()) || 0,
        UserId: userId,
        CarSeats: parseInt($ea("input[name='CarSeats'], #CarSeats, select[name='CarSeats']").val()) || -1,
        Comment: $ea("input[name='Comment'], #Comment, textarea[name='Comment']").val() || "",
        QuestionResponse: $ea("input[name='QuestionResponse'], #QuestionResponse").val() || "",
        EventId: parseInt(eventId),
        Attending: newStatus,
        Role: $ea("input[name='Role'], #Role, select[name='Role']").val() || "4",
        WillAttendAssembly: false,
        Attended: $ea("input[name='Attended'], #Attended, select[name='Attended']").val() || "Neutral",
      };
    } else if (typeof responseData === "object") {
      attendeeData = { ...responseData, Attending: newStatus };
    } else {
      return { success: false, error: "Oväntat svar från EditAttendee" };
    }

    if (!attendeeData.Id) {
      return { success: false, error: "Kunde inte hitta attendee record-ID" };
    }

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
  } catch (error) {
    return { success: false, error: `Fel: ${error.message || "Okänt fel"}` };
  }
}

// ── Netlify Function handler ──

export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    // POST = uppdatera deltagarstatus
    if (req.method === "POST") {
      const body = await req.json();
      const { playerName, status } = body;

      if (!playerName || !status) {
        return new Response(
          JSON.stringify({ success: false, error: "playerName och status krävs" }),
          { status: 400, headers }
        );
      }

      const result = await updateAttendance(playerName, status);
      return new Response(JSON.stringify(result), { status: 200, headers });
    }

    // GET = hämta anmälningslista
    const data = await fetchAttendance();
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || "Serverfel",
        registeredNames: [],
        declinedNames: [],
        totalRegistered: 0,
      }),
      { status: 500, headers }
    );
  }
};
