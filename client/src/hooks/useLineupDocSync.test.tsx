// @vitest-environment jsdom
/**
 * Startar den byggda servern och kopplar upp två "enheter" (React-komponenter
 * med den riktiga synk-hooken) mot den. Kräver DATABASE_URL och `pnpm build`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { useEffect, useRef, useState } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { EventSource as NodeEventSource } from "eventsource";
import { trpc } from "@/lib/trpc";
import { isolatedDatabaseUrl } from "@/test/isolatedDatabase";
import { useLineupDocSync } from "./useLineupDocSync";
import { normalizeDoc, type LineupDoc, type Player } from "@shared/lineupDoc";

const PORT = 3071;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const canRun = !!process.env.DATABASE_URL && existsSync("dist/index.js");

let server: ChildProcess;
let cookie = "";
const realFetch = globalThis.fetch;
const abs = (u: string) => (u.startsWith("http") ? u : ORIGIN + u);
const authedFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(abs(String(input)), { ...init, headers: { ...(init?.headers as Record<string, string>), cookie } });

async function waitFor(check: () => boolean | Promise<boolean>, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
  throw new Error("timeout");
}

const P = (id: string): Player => ({ id, name: `Spelare ${id}`, number: id, position: "F" }) as Player;
const CONFIG = { goalkeepers: 1, defensePairs: 2, forwardLines: 2 };

type Device = {
  doc: () => LineupDoc;
  set: (fn: (d: LineupDoc) => LineupDoc) => void;
  ready: () => boolean;
};

function Client({ expose }: { expose: (d: Device) => void }) {
  const [doc, setDoc] = useState<LineupDoc>(normalizeDoc({}));
  const ref = useRef(doc);
  ref.current = doc;
  const sync = useLineupDocSync({
    readLocalDoc: () => ref.current,
    writeLocalDoc: (d) => { ref.current = d; setDoc(d); },
  });
  useEffect(() => { sync.notifyLocalChange(); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const readyRef = useRef(false);
  readyRef.current = sync.ready;
  useEffect(() => {
    expose({ doc: () => ref.current, set: (fn) => act(() => setDoc((d) => fn(d))), ready: () => readyRef.current });
  });
  return null;
}

function mountDevice(): Device {
  const qc = new QueryClient();
  const client = trpc.createClient({ links: [httpBatchLink({ url: `${ORIGIN}/api/trpc`, transformer: superjson, fetch: authedFetch })] });
  let device!: Device;
  render(
    <trpc.Provider client={client} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <Client expose={(d) => (device = d)} />
      </QueryClientProvider>
    </trpc.Provider>
  );
  return new Proxy({} as Device, { get: (_t, k) => (device as any)[k] });
}

/** Flytta en spelare (från trupp eller plats) till en plats – som drag & drop gör. */
function move(d: LineupDoc, id: string, slot: string): LineupDoc {
  const player = [...d.players, ...Object.values(d.lineup)].find((p) => p.id === id)!;
  const lineup = Object.fromEntries(Object.entries(d.lineup).filter(([, p]) => p.id !== id));
  const displaced = lineup[slot];
  lineup[slot] = player;
  const players = d.players.filter((p) => p.id !== id);
  return { ...d, lineup, players: displaced ? [displaced, ...players] : players };
}

/** Jämförbar nyckel: samma innehåll ger samma sträng oavsett nyckelordning. */
const key = (d: LineupDoc) => {
  const n = normalizeDoc(d);
  return JSON.stringify({ ...n, lineup: Object.entries(n.lineup).sort(([a], [b]) => a.localeCompare(b)).map(([s, p]) => [s, p.id]) });
};
async function serverDoc() {
  const json = await (await authedFetch("/api/trpc/lineup.getState")).json();
  return normalizeDoc(json.result.data.json);
}

let dbUrl = "";
function startServer() {
  return spawn("node", ["dist/index.js"], {
    env: { ...process.env, DATABASE_URL: dbUrl, NODE_ENV: "production", PORT: String(PORT), ADMIN_PASSWORD: "test", JWT_SECRET: "x".repeat(40) },
    stdio: "ignore",
  });
}

describe.skipIf(!canRun)("live-synk mellan två enheter", () => {
  let A: Device;
  let B: Device;

  beforeAll(async () => {
    dbUrl = await isolatedDatabaseUrl("sync");
    server = startServer();
    await new Promise<void>((resolve, reject) => {
      const until = Date.now() + 10000;
      const tick = () => realFetch(`${ORIGIN}/api/health`).then(() => resolve(), () => (Date.now() > until ? reject(new Error("server")) : setTimeout(tick, 100)));
      tick();
    });
    const login = await realFetch(`${ORIGIN}/api/trpc/auth.login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { password: "test" } }),
    });
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

    (globalThis as any).fetch = authedFetch;
    (globalThis as any).EventSource = class extends NodeEventSource {
      constructor(url: string) {
        super(abs(url), { fetch: (u, init) => realFetch(u, { ...init, headers: { ...(init?.headers as Record<string, string>), cookie } }) });
      }
    };

    A = mountDevice();
    B = mountDevice();
    await waitFor(() => A.ready() && B.ready());

    // Utgångsläge: 10 spelare i truppen, tom uppställning.
    A.set((d) => ({ ...d, teamAConfig: CONFIG, teamBConfig: CONFIG, lineup: {}, players: Array.from({ length: 10 }, (_, i) => P(`t${i}`)) }));
    await waitFor(() => B.doc().players.length === 10 && key(A.doc()) === key(B.doc()));
  }, 20000);

  afterAll(() => {
    cleanup();
    server?.kill();
    (globalThis as any).fetch = realFetch;
  });

  it("en flytt syns direkt på den andra enheten", async () => {
    const t0 = Date.now();
    A.set((d) => move(d, "t0", "team-a-fwd-1-lw"));
    await waitFor(() => B.doc().lineup["team-a-fwd-1-lw"]?.id === "t0", 2000);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("samtidiga flyttar av olika spelare – båda finns kvar på båda enheterna", async () => {
    A.set((d) => move(d, "t1", "team-a-fwd-1-c"));
    B.set((d) => move(d, "t2", "team-b-fwd-1-c"));
    await waitFor(async () => key(A.doc()) === key(B.doc()) && key(A.doc()) === key(await serverDoc()));
    expect(A.doc().lineup["team-a-fwd-1-c"]?.id).toBe("t1");
    expect(A.doc().lineup["team-b-fwd-1-c"]?.id).toBe("t2");
  });

  it("samtidiga flyttar till samma plats – ingen spelare försvinner eller dubbleras", async () => {
    A.set((d) => move(d, "t3", "team-a-def-1-1"));
    B.set((d) => move(d, "t4", "team-a-def-1-1"));
    await waitFor(async () => key(A.doc()) === key(B.doc()) && key(A.doc()) === key(await serverDoc()));
    const d = A.doc();
    const all = [...d.players, ...Object.values(d.lineup)].map((p) => p.id).sort();
    expect(all).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`).sort());
  });

  it("snabba serier från båda enheterna samtidigt konvergerar", async () => {
    const slotsA = ["team-a-fwd-2-lw", "team-a-fwd-2-c", "team-a-fwd-2-rw", "team-a-def-2-1", "team-a-def-2-2"];
    const slotsB = ["team-b-fwd-2-lw", "team-b-fwd-2-c", "team-b-fwd-2-rw", "team-b-def-2-1", "team-b-def-2-2"];
    for (let i = 0; i < 15; i++) {
      A.set((d) => move(d, `t${5 + (i % 5)}`, slotsA[i % 5]));
      B.set((d) => move(d, `t${(i * 3) % 10}`, slotsB[(i * 2) % 5]));
    }
    await waitFor(async () => key(A.doc()) === key(B.doc()) && key(A.doc()) === key(await serverDoc()), 8000);
    const d = A.doc();
    const all = [...d.players, ...Object.values(d.lineup)].map((p) => p.id);
    expect(new Set(all).size).toBe(10);
    expect(all.length).toBe(10);
  }, 15000);

  it("ändringar gjorda medan servern är nere skickas när den är tillbaka", { timeout: 25000 }, async () => {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    A.set((d) => move(d, "t9", "team-b-gk-1"));
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    server = startServer();
    await waitFor(async () => B.doc().lineup["team-b-gk-1"]?.id === "t9", 15000);
    await waitFor(async () => key(A.doc()) === key(B.doc()) && key(A.doc()) === key(await serverDoc()), 5000);
  });

  it("ändring direkt i databasen (utanför appen) når alla enheter", { timeout: 20000 }, async () => {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection(dbUrl);
    await conn.query("UPDATE lineup_state SET teamBName = 'EXTERNT' WHERE id = 1");
    await conn.end();
    await waitFor(() => A.doc().teamBName === "EXTERNT" && B.doc().teamBName === "EXTERNT", 12000);
    // Och appen fortsätter fungera efteråt.
    A.set((d) => ({ ...d, teamBName: "GRÖNA" }));
    await waitFor(async () => B.doc().teamBName === "GRÖNA" && (await serverDoc()).teamBName === "GRÖNA");
  });

  it("lagnamn och formation synkas", { timeout: 15000 }, async () => {
    B.set((d) => ({ ...d, teamAName: "VITA TEST", teamAConfig: { goalkeepers: 1, defensePairs: 2, forwardLines: 1 } }));
    await waitFor(() => A.doc().teamAName === "VITA TEST" && A.doc().teamAConfig.forwardLines === 1);
    // Spelare på den borttagna kedjan hamnar i truppen, ingen försvinner.
    await waitFor(async () => key(A.doc()) === key(B.doc()) && key(A.doc()) === key(await serverDoc()));
    expect(Object.keys(A.doc().lineup).some((s) => s.startsWith("team-a-fwd-2"))).toBe(false);
    const d = A.doc();
    expect([...d.players, ...Object.values(d.lineup)].length).toBe(10);
  });
});
