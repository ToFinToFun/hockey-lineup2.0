/**
 * Script to try the EditAttendee endpoint on laget.se admin
 * to find the form for changing RSVP status.
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
    if (cookieJar.length > 0) config.headers.Cookie = cookieJar.join("; ");
    return config;
  });
  async function followRedirects(response) {
    let resp = response;
    let count = 0;
    while ((resp.status === 301 || resp.status === 302) && resp.headers.location && count < 10) {
      resp = await client.get(resp.headers.location);
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

  // Login
  console.log("Logging in...");
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE_URL}/Login`, Origin: BASE_URL },
  });
  resp = await followRedirects(resp);
  console.log("Login status:", resp.status);

  const eventId = "28529273";
  const attendeeId = "2138957"; // Jerry Paasovaara (first attendee)

  // Try 1: GET EditAttendee with query params
  console.log("\n--- Try 1: GET EditAttendee ---");
  resp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/EditAttendee?attendeeId=${attendeeId}&eventId=${eventId}`, {
    headers: { "X-Requested-With": "XMLHttpRequest" }
  });
  resp = await followRedirects(resp);
  console.log("Status:", resp.status, "Type:", typeof resp.data, "Length:", String(resp.data).length);
  if (resp.status === 200 && String(resp.data).length < 5000) {
    console.log("Response:", String(resp.data).substring(0, 1000));
  }
  fs.writeFileSync("/home/ubuntu/laget-edit-attendee-get.html", String(resp.data));

  // Try 2: POST EditAttendee
  console.log("\n--- Try 2: POST EditAttendee ---");
  resp = await client.post(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/EditAttendee`, 
    new URLSearchParams({ attendeeId, eventId }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" } }
  );
  resp = await followRedirects(resp);
  console.log("Status:", resp.status, "Type:", typeof resp.data, "Length:", String(resp.data).length);
  if (resp.status === 200 && String(resp.data).length < 5000) {
    console.log("Response:", String(resp.data).substring(0, 1000));
  }
  fs.writeFileSync("/home/ubuntu/laget-edit-attendee-post.html", String(resp.data));

  // Try 3: POST SaveAttendeeInfo with answer field
  console.log("\n--- Try 3: POST SaveAttendeeInfo ---");
  resp = await client.post(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/SaveAttendeeInfo`,
    JSON.stringify({ attendeeId: parseInt(attendeeId), eventId: parseInt(eventId), answer: 1 }),
    { headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } }
  );
  resp = await followRedirects(resp);
  console.log("Status:", resp.status, "Type:", typeof resp.data);
  console.log("Response:", JSON.stringify(resp.data).substring(0, 500));

  // Try 4: POST SaveAttendeeInfo with form data
  console.log("\n--- Try 4: POST SaveAttendeeInfo (form) ---");
  resp = await client.post(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/SaveAttendeeInfo`,
    new URLSearchParams({ attendeeId, eventId, Answer: "1" }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" } }
  );
  resp = await followRedirects(resp);
  console.log("Status:", resp.status);
  console.log("Response:", JSON.stringify(resp.data).substring(0, 500));

  // Try 5: Look at the ManageAttendees page
  console.log("\n--- Try 5: GET ManageAttendees ---");
  resp = await client.get(`${ADMIN_BASE_URL}/${TEAM_SLUG}/Calendar/ManageAttendees/${eventId}`, {
    headers: { "X-Requested-With": "XMLHttpRequest" }
  });
  resp = await followRedirects(resp);
  console.log("Status:", resp.status, "Length:", String(resp.data).length);
  fs.writeFileSync("/home/ubuntu/laget-manage-attendees.html", String(resp.data));
  
  if (resp.status === 200) {
    const $ = cheerio.load(String(resp.data));
    console.log("\nForms:");
    $("form").each((i, form) => {
      console.log(`  Form: action="${$(form).attr("action")}" method="${$(form).attr("method")}"`);
    });
    console.log("\nSelects:");
    $("select").each((i, sel) => {
      console.log(`  Select: name="${$(sel).attr("name")}" id="${$(sel).attr("id")}"`);
      $(sel).find("option").each((j, opt) => {
        console.log(`    option: value="${$(opt).val()}" text="${$(opt).text().trim()}" ${$(opt).attr("selected") ? "[SELECTED]" : ""}`);
      });
    });
    console.log("\nButtons/Links with attendance keywords:");
    $("button, a, input[type='submit']").each((i, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("deltar") || text.includes("anmäl") || text.includes("attend") || text.includes("svar") || text.includes("answer") || text.includes("lägg till") || text.includes("add")) {
        console.log(`  ${el.tagName}: text="${$(el).text().trim()}" href="${$(el).attr("href") || ""}" class="${$(el).attr("class") || ""}"`);
      }
    });
  }
}

main().catch(console.error);
