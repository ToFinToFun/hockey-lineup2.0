/**
 * Netlify Function: laget-attendance
 * 
 * Loggar in på laget.se och hämtar anmälningslistan för nästa/dagens event.
 * 
 * Miljövariabler som krävs i Netlify:
 *   LAGET_SE_USERNAME - E-postadress för laget.se
 *   LAGET_SE_PASSWORD - Lösenord för laget.se
 */

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";

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
 * Gör en fetch med cookie-hantering och manuell redirect-följning
 */
async function fetchWithCookies(url, jar, options = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  if (jar.cookies.length > 0) {
    headers.Cookie = jar.toString();
  }

  const resp = await fetch(url.startsWith("http") ? url : `${BASE_URL}${url}`, {
    ...options,
    headers,
    redirect: "manual",
  });

  jar.addFromHeaders(resp.headers);
  return resp;
}

/**
 * Följ redirects manuellt
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
    const url = location.startsWith("http")
      ? new URL(location).pathname + new URL(location).search
      : location;
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
 * Hitta nästa event-ID från startsidan
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

  // Alternativ regex för länkar med annan ordning
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

  // Prioritera dagens event
  const todayEvent = eventLinks.find((e) => e.isToday);
  if (todayEvent) return todayEvent;

  // Annars ta närmaste framtida event
  const futureEvents = eventLinks
    .filter((e) => e.eventDate >= todayStr)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  if (futureEvents.length > 0) return futureEvents[0];

  return null;
}

/**
 * Extrahera anmälda namn från RSVP modal HTML.
 * 
 * Strukturen i laget.se RSVP modal:
 *   <div class="attendingsList__row">
 *     <div class="attendingsList__cell float--left">Spelarnamn</div>
 *     <div class="attendingsList__cell--gray float--left">
 *       <span class="attendingsList__is-attending">Kommer</span>
 *     </div>
 *   </div>
 *
 * Strategi: Dela HTML i block per attendingsList__row, sedan kolla status och namn.
 */
function extractAttendeesFromModal(html) {
  const registered = [];
  const declined = [];

  // Dela HTML vid varje attendingsList__row för att isolera varje rad
  const parts = html.split(/attendingsList__row/);
  
  // Hoppa över första delen (före första raden)
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    
    // Kolla om blocket innehåller "Kommer" som status
    // Notera: laget.se kan ha \r\n och whitespace runt texten
    const hasKommerInte = /Kommer\s+inte/i.test(block);
    const hasKommer = /attendingsList__is-attending[\s\S]*?Kommer/i.test(block);
    
    // Hämta namn från attendingsList__cell float--left
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
  // CORS headers
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

    // Steg 2: Hämta startsidan
    let resp = await fetchWithCookies(`/${TEAM_SLUG}`, jar);
    resp = await followRedirects(resp, jar);
    const homeHtml = await resp.text();

    const eventInfo = findNextEventId(homeHtml);
    if (!eventInfo) {
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

    // Steg 3: Hämta RSVP modal
    const rsvpUrl = `/Common/Rsvp/ModalContent?pk=${eventInfo.eventId}&site=${TEAM_SLUG}`;
    resp = await fetchWithCookies(rsvpUrl, jar);
    resp = await followRedirects(resp, jar);

    if (resp.status !== 200) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          eventTitle: eventInfo.eventTitle || "Träning",
          eventDate: eventInfo.eventDate,
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
        eventTitle: eventInfo.eventTitle || "Tr\u00e4ning",
        eventDate: eventInfo.eventDate,
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
