/**
 * Script to fetch the RSVP modal content from laget.se and inspect the form
 * for changing attendance status.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";
const ADMIN_BASE_URL = "https://admin.laget.se";

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
      resp = await client.get(location);
      count++;
    }
    return resp;
  }

  return { client, followRedirects };
}

async function main() {
  const { client, followRedirects } = createClient();

  const username = process.env.LAGET_SE_USERNAME;
  const password = process.env.LAGET_SE_PASSWORD;

  console.log("Step 1: Login...");
  let resp = await client.get(`${BASE_URL}/Login`);
  resp = await followRedirects(resp);

  const $login = cheerio.load(resp.data);
  const token = $login('input[name="__RequestVerificationToken"]').val();
  const referer = $login('input[name="Referer"]').val();

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
  console.log("Login done, status:", resp.status);

  // Step 2: Fetch the RSVP modal for today's Stålstadens event
  const eventId = "28529273"; // Today's training event
  console.log("\nStep 2: Fetch RSVP modal content...");
  const rsvpUrl = `${BASE_URL}/Common/Rsvp/ModalContent?pk=${eventId}&site=${TEAM_SLUG}`;
  resp = await client.get(rsvpUrl);
  resp = await followRedirects(resp);
  console.log("RSVP modal status:", resp.status);
  
  fs.writeFileSync("/home/ubuntu/laget-rsvp-modal.html", resp.data);
  console.log("Saved RSVP modal HTML to /home/ubuntu/laget-rsvp-modal.html");

  const $ = cheerio.load(resp.data);

  // Look for forms
  console.log("\n=== FORMS ===");
  $("form").each((i, form) => {
    const action = $(form).attr("action") || "";
    const method = $(form).attr("method") || "";
    console.log(`Form ${i}: action="${action}" method="${method}"`);
    $(form).find("input, select, textarea").each((j, field) => {
      const name = $(field).attr("name") || "";
      const type = $(field).attr("type") || field.tagName;
      const value = $(field).val() || "";
      console.log(`  ${type}: name="${name}" value="${value}"`);
    });
  });

  // Look for buttons
  console.log("\n=== BUTTONS ===");
  $("button, a.btn, a.button, input[type='submit'], input[type='button'], .rsvp-button, .answer-button").each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";
    const cls = $(el).attr("class") || "";
    const onclick = $(el).attr("onclick") || "";
    const dataAttrs = {};
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith("data-")) {
        dataAttrs[attr.name] = attr.value;
      }
    }
    console.log(`  ${el.tagName}: text="${text}" class="${cls}" href="${href}" onclick="${onclick}" data=${JSON.stringify(dataAttrs)}`);
  });

  // Look for any AJAX URLs in inline scripts
  console.log("\n=== INLINE SCRIPTS ===");
  $("script").each((i, script) => {
    const content = $(script).html() || "";
    if (content.length > 10) {
      console.log(`Script ${i} (${content.length} chars):`);
      // Find URLs
      const urls = content.match(/['"][^'"]*(?:rsvp|attend|answer|save|submit|change)[^'"]*['"]/gi);
      if (urls) {
        for (const u of urls) console.log(`  URL: ${u}`);
      }
      // Find AJAX calls
      const ajax = content.match(/\$\.ajax|fetch|XMLHttpRequest/g);
      if (ajax) console.log(`  AJAX calls: ${ajax.length}`);
      // Print first 500 chars
      console.log(`  Content: ${content.substring(0, 500)}`);
    }
  });

  // Look for attendance answer links/buttons
  console.log("\n=== ATTENDANCE ANSWER ELEMENTS ===");
  $("[class*='answer'], [class*='Answer'], [data-answer], [data-attending]").each((i, el) => {
    const tag = el.tagName;
    const cls = $(el).attr("class") || "";
    const text = $(el).text().trim().substring(0, 100);
    const dataAttrs = {};
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith("data-")) {
        dataAttrs[attr.name] = attr.value;
      }
    }
    console.log(`  ${tag}.${cls}: text="${text}" data=${JSON.stringify(dataAttrs)}`);
  });

  // Step 3: Try the EditAttendee endpoint
  console.log("\n\nStep 3: Try EditAttendee endpoint...");
  const editAttendeeUrl = `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/EditAttendee`;
  // Try with a known attendee ID
  const attendeeId = "2138957"; // First attendee from the edit page
  resp = await client.get(`${editAttendeeUrl}?attendeeId=${attendeeId}&eventId=${eventId}`);
  resp = await followRedirects(resp);
  console.log("EditAttendee GET status:", resp.status);
  if (resp.status === 200) {
    fs.writeFileSync("/home/ubuntu/laget-edit-attendee.html", typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data));
    console.log("Saved to /home/ubuntu/laget-edit-attendee.html");
    
    const $ea = cheerio.load(typeof resp.data === 'string' ? resp.data : '');
    console.log("\n=== EditAttendee FORMS ===");
    $ea("form").each((i, form) => {
      const action = $ea(form).attr("action") || "";
      const method = $ea(form).attr("method") || "";
      console.log(`Form ${i}: action="${action}" method="${method}"`);
      $ea(form).find("input, select, textarea").each((j, field) => {
        const name = $ea(field).attr("name") || "";
        const type = $ea(field).attr("type") || field.tagName;
        const value = $ea(field).val() || "";
        console.log(`  ${type}: name="${name}" value="${String(value).substring(0, 100)}"`);
      });
    });
    
    // Look for select/dropdown for attendance status
    console.log("\n=== EditAttendee SELECTS ===");
    $ea("select").each((i, sel) => {
      const name = $ea(sel).attr("name") || "";
      console.log(`Select: name="${name}"`);
      $ea(sel).find("option").each((j, opt) => {
        const selected = $ea(opt).attr("selected") ? " [SELECTED]" : "";
        console.log(`  option: value="${$ea(opt).val()}" text="${$ea(opt).text().trim()}"${selected}`);
      });
    });
  }

  // Step 4: Try POST to EditAttendee
  console.log("\n\nStep 4: Try POST to EditAttendee...");
  resp = await client.post(editAttendeeUrl, new URLSearchParams({
    attendeeId: attendeeId,
    eventId: eventId,
  }).toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  resp = await followRedirects(resp);
  console.log("EditAttendee POST status:", resp.status);
  if (resp.status === 200) {
    const data = typeof resp.data === 'string' ? resp.data.substring(0, 500) : JSON.stringify(resp.data).substring(0, 500);
    console.log("Response:", data);
  }

  // Step 5: Try SaveAttendeeInfo endpoint
  console.log("\n\nStep 5: Try SaveAttendeeInfo endpoint...");
  const saveUrl = `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/SaveAttendeeInfo`;
  resp = await client.post(saveUrl, new URLSearchParams({
    attendeeId: attendeeId,
    eventId: eventId,
    answer: "1", // 1 = attending?
  }).toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  resp = await followRedirects(resp);
  console.log("SaveAttendeeInfo POST status:", resp.status);
  if (resp.status === 200) {
    const data = typeof resp.data === 'string' ? resp.data.substring(0, 500) : JSON.stringify(resp.data).substring(0, 500);
    console.log("Response:", data);
  }
}

main().catch(console.error);
