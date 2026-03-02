/**
 * Netlify Function: laget-attendance
 * 
 * Loggar in på laget.se och hämtar anmälningslistan för nästa/dagens event.
 * Primärt via admin-redigeringssidan (som har Deltar ej),
 * med fallback till RSVP-modalen.
 * 
 * Miljövariabler som krävs i Netlify:
 *   LAGET_SE_USERNAME - E-postadress för laget.se
 *   LAGET_SE_PASSWORD - Lösenord för laget.se
 */

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";
const ADMIN_BASE_URL = "https://admin.laget.se";

/**
 * Enkel cookie-jar för att hantera cookies manuellt
 */
class CookieJar {
  constructor() {
    this.cookies = [];
  }

  addFromHeaders(headers) {
    const setCookies = headers.getSetCookie?.() || [];
    for (const raw of setCookies) {
      const name = raw.split("=")[0];
      const cookieValue = raw.split(";")[0];
      const idx = this.cookies.findIndex((c) => c.startsWith(name + "="));
      if (idx >= 0) this.cookies[idx] = cookieValue;
      else this.cookies.push(cookieValue);
    }
  }

  toString() {
    return this.cookies.join("; ");
  }
}

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

/**
 * Gör en fetch med cookie-hantering och manuell redirect-följning.
 * Stödjer både relativa och absoluta URL:er.
 */
async function fetchWithCookies(url, jar, options = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  if (jar.cookies.length > 0) {
    headers.Cookie = jar.toString();
  }

  // Hantera absoluta och relativa URL:er
  let fullUrl;
  if (url.startsWith("http")) {
    fullUrl = url;
  } else {
    fullUrl = `${BASE_URL}${url}`;
  }

  const resp = await fetch(fullUrl, {
    ...options,
    headers,
    redirect: "manual",
  });

  jar.addFromHeaders(resp.headers);
  return resp;
}

/**
 * Följ redirects manuellt – stödjer cross-domain redirects
 */
async function followRedirects(resp, jar, maxRedirects = 10) {
  let current = resp;
  let count = 0;
  while (
    (current.status === 301 || current.status === 302) &&
    current.headers.get("location") &&
    count < maxRedirects
  ) {
    const location = current.headers.get("location");
    // Använd full URL för cross-domain redirects
    const url = location.startsWith("http") ? location : location;
    current = await fetchWithCookies(url, jar);
    count++;
  }
  return current;
}

/**
 * Logga in på laget.se
 */
async function login(jar) {
  const username = process.env.LAGET_SE_USERNAME;
  const password = process.env.LAGET_SE_PASSWORD;

  if (!username || !password) {
    throw new Error("Laget.se credentials not configured");
  }

  // GET /Login – hämta CSRF-token
  let resp = await fetchWithCookies("/Login", jar);
  resp = await followRedirects(resp, jar);
  const loginHtml = await resp.text();

  // Parsa CSRF-token och Referer
  const tokenMatch = loginHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const refererMatch = loginHtml.match(/name="Referer"[^>]*value="([^"]*)"/);

  const formData = new URLSearchParams();
  if (tokenMatch) formData.append("__RequestVerificationToken", tokenMatch[1]);
  if (refererMatch) formData.append("Referer", refererMatch[1]);
  formData.append("Email", username);
  formData.append("Password", password);
  formData.append("KeepAlive", "true");
  formData.append("KeepAlive", "false");

  // POST /Login
  resp = await fetchWithCookies("/Login", jar, {
    method: "POST",
    body: formData.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE_URL}/Login`,
      Origin: BASE_URL,
    },
  });

  resp = await followRedirects(resp, jar);
  const body = await resp.text();

  if (body.includes("login-form")) {
    return false;
  }

  return true;
}

/**
 * Hitta nästa event från admin-kalendersidan.
 * Returnerar eventId, eventDate och eventTitle.
 */
function findNextEventFromCalendar(html) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const events = [];
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", maj: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
  };

  // Hitta alla "Redigera"-knappar med Calendar/Edit/{id}
  // och extrahera datum från tabellraden
  const editRegex = /Calendar\/Edit\/(\d+)/g;
  const editIds = new Set();
  let match;
  while ((match = editRegex.exec(html)) !== null) {
    editIds.add(match[1]);
  }

  // Hitta rader med datum-format "3 mar 22:05 - 23:00" och kopplat Edit-ID
  // Varje rad i HTML:en har: datum + typ + plats + Edit-länk
  // Vi behöver matcha rader med deras Edit-ID
  
  // Strategi: Hitta alla <tr> som innehåller Calendar/Edit/{id} och ett datum
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    
    // Hitta Edit-ID i raden
    const idMatch = rowHtml.match(/Calendar\/Edit\/(\d+)/);
    if (!idMatch) continue;
    
    // Hoppa över "Redigera denna och kommande"-rader
    if (rowHtml.includes("Recurring")) continue;
    
    const eventId = idMatch[1];
    
    // Hitta datum: "3 mar 22:05 - 23:00"
    const dateMatch = rowHtml.match(/(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\s+(\d{2}:\d{2})/i);
    if (!dateMatch) continue;
    
    const day = dateMatch[1].padStart(2, "0");
    const monthStr = dateMatch[2].toLowerCase();
    const month = monthMap[monthStr] || "01";
    const year = today.getFullYear();
    const eventDate = `${year}-${month}-${day}`;
    
    // Hitta eventtyp
    const typeMatch = rowHtml.match(/(?:Träning|Match|Möte|Cup)/i);
    const eventTitle = typeMatch ? typeMatch[0] : "Träning";
    
    // Undvik dubbletter
    if (!events.find(e => e.eventId === eventId)) {
      events.push({ eventId, eventDate, eventTitle });
    }
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
 * Extrahera anmälda och avböjda namn från admin-redigeringssidan.
 * Strukturen:
 *   .rsvp-cell → varje spelarrad
 *     .listAttendeeDataName → spelarnamn
 *     .attendanceIcon.attending → "Deltar"
 *     .attendanceIcon.notAttending → "Deltar ej"
 */
function extractAttendeesFromEditPage(html) {
  const registered = [];
  const declined = [];

  // Dela HTML vid varje rsvp-cell
  const parts = html.split(/rsvp-cell/);
  
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    
    // Hämta namn från listAttendeeDataName
    const nameMatch = block.match(/listAttendeeDataName[^>]*>\s*\n?\s*([^<]+)/);
    if (!nameMatch) continue;
    
    const name = nameMatch[1]
      .replace(/"[^"]*"/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.length < 2 || name === "Namn") continue;
    
    // Kolla status via attendanceIcon-klasser
    const isAttending = /attendanceIcon\s+attending(?!\S)/i.test(block) || 
                        /attendanceIcon\s*\n\s*attending/i.test(block) ||
                        /icon-ok-sign\s+attendanceIcon\s+attending/i.test(block);
    const isNotAttending = /notAttending/i.test(block);
    
    if (isNotAttending && !declined.includes(name)) {
      declined.push(name);
    } else if (isAttending && !isNotAttending && !registered.includes(name)) {
      registered.push(name);
    }
  }

  return { registered, declined };
}

/**
 * Hitta nästa event-ID från publika startsidan (fallback)
 */
function findNextEventId(html) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const eventLinks = [];
  const regex = /href="[^"]*eventId=(\d+)[^"]*Event\/Month\/(\d+)\/(\d+)\/(\d+)[^"]*"[^>]*>([^<]*)</g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const eid = match[1];
    const y = parseInt(match[2]);
    const m = parseInt(match[3]);
    const d = parseInt(match[4]);
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = y === year && m === month && d === day;
    const eventTitle = match[5].trim();
    eventLinks.push({ eventId: eid, eventDate: dateStr, eventTitle, isToday });
  }

  const regex2 = /href="[^"]*Event\/Month\/(\d+)\/(\d+)\/(\d+)[^"]*eventId=(\d+)[^"]*"[^>]*>([^<]*)</g;
  while ((match = regex2.exec(html)) !== null) {
    const y = parseInt(match[1]);
    const m = parseInt(match[2]);
    const d = parseInt(match[3]);
    const eid = match[4];
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = y === year && m === month && d === day;
    const eventTitle = match[5].trim();
    if (!eventLinks.find(e => e.eventId === eid)) {
      eventLinks.push({ eventId: eid, eventDate: dateStr, eventTitle, isToday });
    }
  }

  const todayEvent = eventLinks.find((e) => e.isToday);
  if (todayEvent) return todayEvent;

  const futureEvents = eventLinks
    .filter((e) => e.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (futureEvents.length > 0) return futureEvents[0];

  return null;
}

/**
 * Extrahera anmälda namn från RSVP modal HTML (fallback).
 */
function extractAttendeesFromModal(html) {
  const registered = [];
  const declined = [];

  const parts = html.split(/attendingsList__row/);
  
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    
    const hasKommerInte = /Kommer\s+inte/i.test(block);
    const hasKommer = /attendingsList__is-attending[\s\S]*?Kommer/i.test(block);
    
    const nameMatch = block.match(/attendingsList__cell[\s"]*float--left[^>]*>([^<]+)/);
    if (nameMatch) {
      const name = nameMatch[1]
        .replace(/"[^"]*"/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (name && name.length > 1) {
        if (hasKommerInte && !declined.includes(name)) {
          declined.push(name);
        } else if (hasKommer && !hasKommerInte && !registered.includes(name)) {
          registered.push(name);
        }
      }
    }
  }

  return { registered, declined };
}

/**
 * Netlify Function handler
 */
export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const jar = new CookieJar();

  try {
    // Steg 1: Logga in
    const loggedIn = await login(jar);
    if (!loggedIn) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          eventTitle: "",
          eventDate: "",
          registeredNames: [],
          declinedNames: [],
          totalRegistered: 0,
          error: "Kunde inte logga in på laget.se. Kontrollera användarnamn och lösenord.",
        }),
      };
    }

    // Steg 2: Försök hämta via admin-kalendern (har Deltar ej)
    let eventInfo = null;
    try {
      let calResp = await fetchWithCookies(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`, jar);
      calResp = await followRedirects(calResp, jar);
      
      if (calResp.status === 200) {
        const calHtml = await calResp.text();
        eventInfo = findNextEventFromCalendar(calHtml);
        
        if (eventInfo) {
          // Hämta redigeringssidan
          let editResp = await fetchWithCookies(
            `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/Edit/${eventInfo.eventId}`, jar
          );
          editResp = await followRedirects(editResp, jar);
          
          if (editResp.status === 200) {
            const editHtml = await editResp.text();
            const { registered, declined } = extractAttendeesFromEditPage(editHtml);
            
            if (registered.length > 0 || declined.length > 0) {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  eventTitle: eventInfo.eventTitle || "Träning",
                  eventDate: eventInfo.eventDate,
                  registeredNames: registered,
                  declinedNames: declined,
                  totalRegistered: registered.length,
                }),
              };
            }
          }
        }
      }
    } catch (adminError) {
      // Admin-sidan misslyckades, fortsätt med fallback
      console.log("Admin calendar failed, falling back to RSVP modal:", adminError.message);
    }

    // Steg 3: Fallback – hämta via publika startsidan + RSVP modal
    let resp = await fetchWithCookies(`/${TEAM_SLUG}`, jar);
    resp = await followRedirects(resp, jar);
    const homeHtml = await resp.text();

    const fallbackEventInfo = findNextEventId(homeHtml);
    if (!fallbackEventInfo && !eventInfo) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          eventTitle: "",
          eventDate: new Date().toISOString().split("T")[0],
          registeredNames: [],
          declinedNames: [],
          totalRegistered: 0,
          noEvent: true,
        }),
      };
    }

    const eid = fallbackEventInfo || eventInfo;

    const rsvpUrl = `/Common/Rsvp/ModalContent?pk=${eid.eventId}&site=${TEAM_SLUG}`;
    resp = await fetchWithCookies(rsvpUrl, jar);
    resp = await followRedirects(resp, jar);

    if (resp.status !== 200) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          eventTitle: eid.eventTitle || "Träning",
          eventDate: eid.eventDate,
          registeredNames: [],
          declinedNames: [],
          totalRegistered: 0,
          error: `Kunde inte hämta anmälningslistan (HTTP ${resp.status})`,
        }),
      };
    }

    const rsvpHtml = await resp.text();
    const { registered, declined } = extractAttendeesFromModal(rsvpHtml);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        eventTitle: eid.eventTitle || "Träning",
        eventDate: eid.eventDate,
        registeredNames: registered,
        declinedNames: declined,
        totalRegistered: registered.length,
      }),
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        eventTitle: "",
        eventDate: "",
        registeredNames: [],
        declinedNames: [],
        totalRegistered: 0,
        error: `Fel vid hämtning: ${error.message || "Okänt fel"}`,
      }),
    };
  }
}
