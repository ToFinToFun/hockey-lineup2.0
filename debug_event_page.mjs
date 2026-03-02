import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import fs from "fs";
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

  // Try the event page directly
  const eventId = "28529273";
  
  // Try different URLs to find the full attendance list
  const urls = [
    `/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}`,
    `/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}&showAll=true`,
    `/${TEAM_SLUG}/Event/Month/2026/3/3?eventId=${eventId}`,
    `/Common/Rsvp/Attending?pk=${eventId}&site=${TEAM_SLUG}`,
    `/Common/Rsvp/NotAttending?pk=${eventId}&site=${TEAM_SLUG}`,
  ];

  for (const url of urls) {
    console.log(`\n=== Trying: ${url} ===`);
    try {
      resp = await client.get(url);
      resp = await followRedirects(resp);
      console.log(`Status: ${resp.status}, Length: ${resp.data?.length || 0}`);
      
      // Search for Jerry or "Kommer inte" or "not attending"
      const html = resp.data;
      if (typeof html === "string") {
        const jerryFound = html.includes("Jerry") || html.includes("jerry");
        const kommerInteFound = html.includes("Kommer inte");
        const notAttendingFound = html.includes("not-attending") || html.includes("notAttending");
        console.log(`Jerry: ${jerryFound}, "Kommer inte": ${kommerInteFound}, not-attending: ${notAttendingFound}`);
        
        // Look for tabs or sections
        const $p = cheerio.load(html);
        const tabs = [];
        $p('[data-tab], [role="tab"], .tab, .tabs__item, .rsvp-tab, .nav-tab').each((_, el) => {
          tabs.push($p(el).text().trim());
        });
        if (tabs.length) console.log("Tabs found:", tabs);
        
        // Look for different attending sections
        $p('[class*="attending"], [class*="rsvp"]').each((_, el) => {
          const cls = $p(el).attr("class");
          const text = $p(el).text().trim().substring(0, 80);
          console.log(`  Class: ${cls} → "${text}"`);
        });
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  // Also try the RSVP modal with different parameters to get "Kommer inte" list
  console.log("\n=== Trying RSVP modal with attending=false ===");
  try {
    resp = await client.get(`/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}&attending=false`);
    resp = await followRedirects(resp);
    console.log(`Status: ${resp.status}, Length: ${resp.data?.length || 0}`);
    if (resp.data?.includes("Jerry")) console.log("JERRY FOUND!");
    // Save this HTML
    fs.writeFileSync("/home/ubuntu/rsvp_false.html", resp.data);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Save the full RSVP modal HTML for inspection
  resp = await client.get(`/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}`);
  resp = await followRedirects(resp);
  fs.writeFileSync("/home/ubuntu/rsvp_modal.html", resp.data);
  console.log("\nSaved RSVP modal HTML to /home/ubuntu/rsvp_modal.html");
  
  // Also try the event page
  resp = await client.get(`/${TEAM_SLUG}/Event/Month/2026/3/3?eventId=${eventId}`);
  resp = await followRedirects(resp);
  fs.writeFileSync("/home/ubuntu/event_page.html", resp.data);
  console.log("Saved event page HTML to /home/ubuntu/event_page.html");
}

main().catch(console.error);
