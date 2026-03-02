import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";

const cookieJar = [];

const client = axios.create({
  baseURL: BASE_URL,
  maxRedirects: 0,
  timeout: 30000,
  validateStatus: () => true,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
  while ((resp.status === 301 || resp.status === 302) && resp.headers.location && count < 10) {
    const location = resp.headers.location;
    const url = location.startsWith("http") ? new URL(location).pathname + new URL(location).search : location;
    resp = await client.get(url);
    count++;
  }
  return resp;
}

async function main() {
  // Login
  let resp = await client.get("/Login");
  resp = await followRedirects(resp);
  const $ = cheerio.load(resp.data);
  const token = $('input[name="__RequestVerificationToken"]').val();
  const referer = $('input[name="Referer"]').val();

  const formData = new URLSearchParams();
  if (token) formData.append("__RequestVerificationToken", String(token));
  if (referer) formData.append("Referer", String(referer));
  formData.append("Email", process.env.LAGET_SE_USERNAME);
  formData.append("Password", process.env.LAGET_SE_PASSWORD);
  formData.append("KeepAlive", "true");
  formData.append("KeepAlive", "false");

  resp = await client.post("/Login", formData.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE_URL}/Login`, Origin: BASE_URL },
  });
  resp = await followRedirects(resp);
  console.log("Login done");

  // Get home page
  resp = await client.get(`/${TEAM_SLUG}`);
  resp = await followRedirects(resp);

  // Find event
  const $h = cheerio.load(resp.data);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  let eventId = null;
  $h('a[href*="eventId="]').each((_, el) => {
    const href = $h(el).attr("href") || "";
    const eidMatch = href.match(/eventId=(\d+)/);
    if (eidMatch && !eventId) {
      eventId = eidMatch[1];
    }
  });

  console.log("Event ID:", eventId);

  // Get RSVP modal
  const rsvpUrl = `/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}`;
  resp = await client.get(rsvpUrl);
  resp = await followRedirects(resp);

  const rsvpHtml = resp.data;
  
  // Parse and show ALL rows with their status
  const $r = cheerio.load(rsvpHtml);
  console.log("\n=== ALL RSVP ROWS ===");
  $r(".attendingsList__row").each((i, row) => {
    const status = $r(row).find(".attendingsList__is-attending").text().trim();
    const name = $r(row).find(".attendingsList__cell.float--left").first().text().trim();
    console.log(`Row ${i}: name="${name}" status="${status}"`);
  });

  // Also dump a snippet of the HTML around "Kommer inte" to see the structure
  console.log("\n=== HTML SNIPPETS WITH 'Kommer inte' ===");
  const kommerInteMatches = rsvpHtml.match(/.{0,200}Kommer inte.{0,200}/g);
  if (kommerInteMatches) {
    kommerInteMatches.forEach((m, i) => console.log(`Match ${i}:`, m));
  } else {
    console.log("No 'Kommer inte' found in HTML!");
  }

  // Also check for other status texts
  console.log("\n=== ALL UNIQUE STATUS TEXTS ===");
  const statusTexts = new Set();
  $r(".attendingsList__is-attending").each((_, el) => {
    statusTexts.add($r(el).text().trim());
  });
  console.log([...statusTexts]);

  // Check for Jerry specifically
  console.log("\n=== SEARCH FOR JERRY ===");
  const jerryMatches = rsvpHtml.match(/.{0,100}[Jj]erry.{0,100}/gi);
  if (jerryMatches) {
    jerryMatches.forEach((m, i) => console.log(`Jerry match ${i}:`, m));
  } else {
    console.log("Jerry not found in RSVP HTML!");
  }
}

main().catch(console.error);
