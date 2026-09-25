// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { EventSource as NodeEventSource } from "eventsource";
import { trpc } from "@/lib/trpc";

const PORT = 3072, ORIGIN = `http://127.0.0.1:${PORT}`;
const canRun = !!process.env.DATABASE_URL && existsSync("dist/index.js");
let server: ChildProcess; let cookie = "";
const realFetch = globalThis.fetch;
const abs = (u: string) => (u.startsWith("http") ? u : ORIGIN + u);
const authedFetch = (i: any, init?: any) => realFetch(abs(String(i)), { ...init, headers: { ...(init?.headers ?? {}), cookie } });

beforeAll(async () => {
  if (!canRun) return;
  server = spawn("node", ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ADMIN_PASSWORD: "t", JWT_SECRET: "x".repeat(40) }, stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { await realFetch(`${ORIGIN}/api/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const l = await realFetch(`${ORIGIN}/api/trpc/auth.login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { password: "t" } }) });
  cookie = (l.headers.get("set-cookie") ?? "").split(";")[0];
  (globalThis as any).fetch = authedFetch;
  (globalThis as any).EventSource = class extends NodeEventSource { constructor(u: string) { super(abs(u), { fetch: (x, i) => realFetch(x, { ...i, headers: { ...(i?.headers as any), cookie } }) }); } };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as any));
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (window as any).scrollTo = () => {};
}, 20000);
afterAll(() => { cleanup(); server?.kill(); (globalThis as any).fetch = realFetch; });

it.skipIf(!canRun)("Lineup-sidan renderar, hämtar läget och flyttar utan fel", async () => {
  const errors: unknown[] = [];
  const origErr = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  const { default: Home } = await import("./Home");
  const qc = new QueryClient();
  const client = trpc.createClient({ links: [httpBatchLink({ url: `${ORIGIN}/api/trpc`, transformer: superjson, fetch: authedFetch })] });
  const r = render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><Home /></QueryClientProvider></trpc.Provider>);
  await act(async () => { await new Promise(res => setTimeout(res, 3000)); });
  const ver = async () => {
    const j = await (await authedFetch("/api/trpc/lineup.getState")).json();
    if (!j.result) throw new Error("getState: " + JSON.stringify(j).slice(0, 300));
    return j.result.data.json.version;
  };
  const v1 = await ver();
  await act(async () => { await new Promise(res => setTimeout(res, 2000)); });
  const v2 = await ver();
  expect(v2 - v1).toBe(0); // ingen återkopplingsloop: inaktiv sida skickar inget

  // Ändring från en annan enhet syns live i sidan.
  await authedFetch("/api/trpc/lineup.patch", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { id: `smoke-${Date.now()}`, ops: [{ t: "field", key: "teamBName", value: "LIVETEST" }] } }) });
  await act(async () => { await new Promise(res => setTimeout(res, 800)); });
  // Lagnamnet står i ett inmatningsfält, så kolla fältens värden.
  const values = () => Array.from(r.container.querySelectorAll("input")).map(i => (i as HTMLInputElement).value);
  expect(values()).toContain("LIVETEST");
  const v3 = await ver();
  await act(async () => { await new Promise(res => setTimeout(res, 1500)); });
  expect(await ver()).toBe(v3); // sidan skickar inte tillbaka ändringen
  await authedFetch("/api/trpc/lineup.patch", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { id: `smoke2-${Date.now()}`, ops: [{ t: "field", key: "teamBName", value: "GRÖNA" }] } }) });

  console.error = origErr;
  const text = r.container.textContent ?? "";
  expect(text.length).toBeGreaterThan(100);
  const serious = errors.filter(e => !String(e).includes("act(") && !String(e).includes("laget"));
  if (serious.length) console.log("FEL:", serious.map(e => String(e).slice(0, 300)));
  expect(serious.length).toBe(0);
}, 30000);
