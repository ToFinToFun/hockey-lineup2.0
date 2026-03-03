/**
 * Script to inspect laget.se admin edit page for attendance update form fields.
 * This will log in, navigate to the calendar edit page, and dump the HTML
 * around the attendance/RSVP section so we can find the form endpoints.
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
      let url = location;
      resp = await client.get(url);
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

  if (!username || !password) {
    console.error("Missing LAGET_SE_USERNAME or LAGET_SE_PASSWORD in .env");
    process.exit(1);
  }

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

  // Step 2: Get calendar
  console.log("\nStep 2: Get admin calendar...");
  const calResp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar`);
  const calPage = await followRedirects(calResp);
  console.log("Calendar status:", calPage.status);

  // Find today's event
  const $cal = cheerio.load(calPage.data);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const events = [];
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", maj: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
  };

  $cal('a[href*="Calendar/Edit/"]').each((_, el) => {
    const href = $cal(el).attr("href") || "";
    const idMatch = href.match(/Calendar\/Edit\/(\d+)/);
    if (!idMatch) return;
    const eventId = idMatch[1];
    const text = $cal(el).text().trim();
    
    if (text === "Redigera" || text === "Redigera denna och kommande") {
      const row = $cal(el).closest("tr");
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
      return;
    }

    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+(.*)/);
    if (dateMatch) {
      events.push({ eventId, eventDate: dateMatch[1], eventTitle: dateMatch[2].trim() });
    }
  });

  console.log("Found events:", events.length);
  
  // Find today's or next event
  let targetEvent = events.find(e => e.eventDate === todayStr);
  if (!targetEvent) {
    const future = events.filter(e => e.eventDate >= todayStr).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    targetEvent = future[0];
  }

  if (!targetEvent) {
    console.log("No event found!");
    // Dump all events for debugging
    console.log("All events:", JSON.stringify(events, null, 2));
    process.exit(1);
  }

  console.log("Target event:", targetEvent);

  // Step 3: Get the edit page
  console.log("\nStep 3: Get edit page for event", targetEvent.eventId);
  const editResp = await client.get(
    `${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/Edit/${targetEvent.eventId}`
  );
  const editPage = await followRedirects(editResp);
  console.log("Edit page status:", editPage.status);

  // Save the full HTML for inspection
  fs.writeFileSync("/home/ubuntu/laget-edit-page.html", editPage.data);
  console.log("Saved full HTML to /home/ubuntu/laget-edit-page.html");

  // Parse and look for attendance-related forms, buttons, links
  const $ = cheerio.load(editPage.data);

  // Look for any forms
  console.log("\n=== FORMS ===");
  $("form").each((i, form) => {
    const action = $(form).attr("action") || "";
    const method = $(form).attr("method") || "";
    const id = $(form).attr("id") || "";
    console.log(`Form ${i}: action="${action}" method="${method}" id="${id}"`);
  });

  // Look for attendance-related elements
  console.log("\n=== RSVP/ATTENDANCE ELEMENTS ===");
  $("[class*='rsvp'], [class*='attend'], [class*='Rsvp'], [class*='Attend']").each((i, el) => {
    const tag = el.tagName;
    const cls = $(el).attr("class") || "";
    const id = $(el).attr("id") || "";
    const href = $(el).attr("href") || "";
    const onclick = $(el).attr("onclick") || "";
    const dataAttrs = {};
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith("data-")) {
        dataAttrs[attr.name] = attr.value;
      }
    }
    console.log(`  ${tag}.${cls} id="${id}" href="${href}" onclick="${onclick}" data=${JSON.stringify(dataAttrs)}`);
    // Show inner HTML for small elements
    const inner = $(el).html();
    if (inner && inner.length < 300) {
      console.log(`    inner: ${inner.trim()}`);
    }
  });

  // Look for any dropdown/select for attendance
  console.log("\n=== SELECT ELEMENTS ===");
  $("select").each((i, sel) => {
    const name = $(sel).attr("name") || "";
    const id = $(sel).attr("id") || "";
    const cls = $(sel).attr("class") || "";
    console.log(`Select: name="${name}" id="${id}" class="${cls}"`);
    $(sel).find("option").each((j, opt) => {
      console.log(`  option: value="${$(opt).val()}" text="${$(opt).text().trim()}"`);
    });
  });

  // Look for buttons related to attendance
  console.log("\n=== BUTTONS/LINKS with attendance keywords ===");
  $("button, a, input[type='button'], input[type='submit']").each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = $(el).attr("href") || "";
    const onclick = $(el).attr("onclick") || "";
    if (text.includes("deltar") || text.includes("attend") || text.includes("rsvp") || 
        text.includes("kommer") || text.includes("anmäl") ||
        href.includes("attend") || href.includes("rsvp") ||
        onclick.includes("attend") || onclick.includes("rsvp")) {
      console.log(`  ${el.tagName}: text="${$(el).text().trim()}" href="${href}" onclick="${onclick}"`);
    }
  });

  // Look for any AJAX/API endpoints in scripts
  console.log("\n=== SCRIPT URLS (attendance/rsvp related) ===");
  $("script").each((i, script) => {
    const content = $(script).html() || "";
    const matches = content.match(/['"](\/[^'"]*(?:rsvp|attend|calendar)[^'"]*)['"]/gi);
    if (matches) {
      for (const m of matches) {
        console.log(`  Found URL: ${m}`);
      }
    }
  });

  // Look for data attributes on rsvp-cell elements
  console.log("\n=== RSVP-CELL DETAILS (first 3) ===");
  $(".rsvp-cell").slice(0, 3).each((i, cell) => {
    console.log(`\nRSVP Cell ${i}:`);
    console.log("  HTML:", $(cell).html()?.substring(0, 500));
    // Check all data attributes
    for (const attr of cell.attributes || []) {
      if (attr.name.startsWith("data-")) {
        console.log(`  ${attr.name}="${attr.value}"`);
      }
    }
    // Check child elements for data attributes
    $(cell).find("[data-member-id], [data-id], [data-pk], [data-url]").each((j, child) => {
      console.log(`  Child ${child.tagName}:`, Object.fromEntries(
        (child.attributes || []).filter(a => a.name.startsWith("data-")).map(a => [a.name, a.value])
      ));
    });
  });

  // Check for any hidden inputs in the attendance section
  console.log("\n=== HIDDEN INPUTS near attendance ===");
  $(".rsvp-cell input[type='hidden'], .rsvp-section input[type='hidden'], #rsvp input[type='hidden']").each((i, input) => {
    console.log(`  name="${$(input).attr("name")}" value="${$(input).val()}"`);
  });

  // Look for the attendanceIcon click handlers
  console.log("\n=== ATTENDANCE ICON DETAILS ===");
  $(".attendanceIcon").slice(0, 5).each((i, icon) => {
    const cls = $(icon).attr("class") || "";
    const parent = $(icon).parent();
    const parentTag = parent.length ? parent[0].tagName : "?";
    const parentCls = parent.attr("class") || "";
    const parentHref = parent.attr("href") || "";
    const parentOnclick = parent.attr("onclick") || "";
    console.log(`  Icon ${i}: class="${cls}" parent=${parentTag}.${parentCls} href="${parentHref}" onclick="${parentOnclick}"`);
    // Check all attributes
    for (const attr of icon.attributes || []) {
      console.log(`    ${attr.name}="${attr.value}"`);
    }
  });
}

main().catch(console.error);
