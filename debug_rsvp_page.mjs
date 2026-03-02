import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const TEAM_SLUG = "Stalstadens";
const BASE_URL = "https://www.laget.se";
const cookieJar = [];

const client = axios.create({
  baseURL: BASE_URL, maxRedirects: 0, timeout: 30000, validateStatus: () => true,
  headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html", "Accept-Language": "sv-SE,sv;q=0.9" }
});
client.interceptors.response.use(r => { const sc = r.headers["set-cookie"]; if(sc) sc.forEach(raw => { const n=raw.split("=")[0]; const v=raw.split(";")[0]; const i=cookieJar.findIndex(c=>c.startsWith(n+"=")); if(i>=0)cookieJar[i]=v; else cookieJar.push(v); }); return r; });
client.interceptors.request.use(c => { if(cookieJar.length) c.headers.Cookie=cookieJar.join("; "); return c; });
async function follow(r) { let c=0; while((r.status===301||r.status===302)&&r.headers.location&&c<10) { const l=r.headers.location; const u=l.startsWith("http")?new URL(l).pathname+new URL(l).search:l; r=await client.get(u); c++; } return r; }

async function main() {
  let r = await client.get("/Login"); r = await follow(r);
  const $ = cheerio.load(r.data);
  const fd = new URLSearchParams();
  const t = $('input[name="__RequestVerificationToken"]').val();
  const ref = $('input[name="Referer"]').val();
  if(t) fd.append("__RequestVerificationToken", String(t));
  if(ref) fd.append("Referer", String(ref));
  fd.append("Email", process.env.LAGET_SE_USERNAME);
  fd.append("Password", process.env.LAGET_SE_PASSWORD);
  fd.append("KeepAlive", "true"); fd.append("KeepAlive", "false");
  r = await client.post("/Login", fd.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: BASE_URL+"/Login", Origin: BASE_URL } });
  r = await follow(r);
  console.log("Login done");

  // Try the RSVP page (full URL with team slug)
  r = await client.get(`/${TEAM_SLUG}/Rsvp/28529273`);
  r = await follow(r);
  fs.writeFileSync("/home/ubuntu/rsvp_page.html", r.data);
  console.log("Saved RSVP page, status:", r.status, "length:", r.data.length);
  
  const html = r.data;
  console.log("Jerry found:", html.includes("Jerry"));
  console.log("Kommer inte found:", html.includes("Kommer inte"));
  
  // Parse attendance
  const $r = cheerio.load(html);
  console.log("\n=== ALL RSVP ROWS ===");
  $r(".attendingsList__row").each((i, row) => {
    const status = $r(row).find(".attendingsList__is-attending").text().trim();
    const name = $r(row).find(".attendingsList__cell.float--left").first().text().trim();
    console.log(`Row ${i}: name="${name}" status="${status}"`);
  });

  // Look for other sections/tabs
  console.log("\n=== TABS/SECTIONS ===");
  $r("h2, h3, .tab, [data-tab], .section-title").each((_, el) => {
    console.log(`${$r(el).prop("tagName")} class="${$r(el).attr("class") || ""}" → "${$r(el).text().trim().substring(0, 80)}"`);
  });

  // Look for "Kommer inte" sections
  console.log("\n=== SEARCHING FOR DECLINED SECTIONS ===");
  const kommerInteMatches = html.match(/.{0,150}Kommer inte.{0,150}/g);
  if (kommerInteMatches) {
    kommerInteMatches.forEach((m, i) => console.log(`Match ${i}:`, m.replace(/\s+/g, " ").trim()));
  }

  // Look for any list that might contain declined players
  console.log("\n=== LOOKING FOR DIFFERENT ATTENDING LISTS ===");
  $r("[class*='attendingsList']").each((_, el) => {
    const cls = $r(el).attr("class");
    const childCount = $r(el).children().length;
    console.log(`Class: ${cls}, children: ${childCount}`);
  });
}
main().catch(console.error);
