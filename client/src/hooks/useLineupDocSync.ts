/**
 * Live-synk av uppställningen mellan enheter.
 *
 * Så fungerar det:
 * - `base` är serverns senast bekräftade dokument (med versionsnummer).
 * - Lokala ändringar blir små patchar som visas direkt (optimistiskt) och
 *   skickas till servern en i taget, i ordning.
 * - Servern skickar varje tillämpad patch till alla enheter via SSE, med
 *   löpnummer. Alla tillämpar dem i samma ordning på `base`.
 * - Det användaren ser = `base` + egna patchar som ännu inte bekräftats.
 * - Saknas ett löpnummer (t.ex. efter tappad anslutning) hämtas hela
 *   dokumentet på nytt och egna obekräftade ändringar läggs ovanpå.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  applyOps,
  diffDocs,
  docsEqual,
  normalizeDoc,
  type LineupDoc,
  type LineupOp,
} from "@shared/lineupDoc";

interface PendingPatch {
  id: string;
  ops: LineupOp[];
  sent: boolean;
}

interface Options {
  /** Läser uppställningen från komponentens state just nu. */
  readLocalDoc: () => LineupDoc;
  /** Skriver ett dokument till komponentens state (inkl. PIR-berikning). */
  writeLocalDoc: (doc: LineupDoc) => void;
  /** Anropas när någon annan ändrat något – kort beskrivning för en toast. */
  onRemoteChange?: (description: string) => void;
}

type Status = "connecting" | "live" | "offline";

async function fetchSnapshot(): Promise<{ doc: LineupDoc; version: number; appliedPatchIds: string[] }> {
  const res = await fetch("/api/trpc/lineup.getState", { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`getState ${res.status}`);
  const json = await res.json();
  const data = json?.result?.data?.json ?? json?.result?.data;
  if (!data) throw new Error("tomt svar");
  return { doc: normalizeDoc(data), version: data.version ?? 0, appliedPatchIds: data.appliedPatchIds ?? [] };
}

function describeRemote(ops: LineupOp[]): string {
  const placed = ops.find((o) => o.t === "slot" && o.player) as Extract<LineupOp, { t: "slot" }> | undefined;
  if (placed?.player) return `${placed.player.name} flyttades`;
  const upsert = ops.find((o) => o.t === "rosterUpsert") as Extract<LineupOp, { t: "rosterUpsert" }> | undefined;
  if (upsert && ops.length <= 2) return `${upsert.player.name} uppdaterades`;
  if (ops.some((o) => o.t === "field")) return "Laginställningar ändrades";
  return "Uppställningen uppdaterades";
}

export function useLineupDocSync({ readLocalDoc, writeLocalDoc, onRemoteChange }: Options) {
  const utils = trpc.useUtils();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const clientId = useRef(crypto.randomUUID()).current;
  const base = useRef<{ doc: LineupDoc; version: number } | null>(null);
  const pending = useRef<PendingPatch[]>([]);
  /** Det dokument komponenten senast visade (från oss eller fångat från användaren). */
  const shown = useRef<LineupDoc | null>(null);
  /** Lokalt tillstånd innan första kontakten med servern (för ändringar gjorda offline vid start). */
  const bootDoc = useRef<LineupDoc | null>(null);
  const sending = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const resyncing = useRef<Promise<void> | null>(null);

  // Stabila referenser till callbacks som kan ändras mellan renderingar.
  const readRef = useRef(readLocalDoc);
  readRef.current = readLocalDoc;
  const writeRef = useRef(writeLocalDoc);
  writeRef.current = writeLocalDoc;
  const remoteRef = useRef(onRemoteChange);
  remoteRef.current = onRemoteChange;

  const updatePendingCount = () => setPendingCount(pending.current.length);

  /** Visa base + egna obekräftade ändringar. */
  const render = useCallback(() => {
    if (!base.current) return;
    const desired = pending.current.reduce((doc, p) => applyOps(doc, p.ops), base.current.doc);
    if (!shown.current || !docsEqual(desired, shown.current)) {
      shown.current = desired;
      writeRef.current(desired);
    }
  }, []);

  const flush = useCallback(async () => {
    if (sending.current || !base.current) return;
    sending.current = true;
    try {
      for (;;) {
        const next = pending.current.find((p) => !p.sent);
        if (!next) break;
        next.sent = true;
        try {
          await utils.client.lineup.patch.mutate({ id: next.id, clientId, ops: next.ops as never });
          retryDelay.current = 1000;
          setLastSyncAt(new Date());
          // Kvittot kommer via SSE. Kommer det inte (SSE nere) hämtar vi om.
          const id = next.id;
          setTimeout(() => {
            if (pending.current.some((p) => p.id === id)) void resync();
          }, 4000);
        } catch (err) {
          const code = (err as { data?: { code?: string } })?.data?.code;
          if (code === "BAD_REQUEST") {
            // Servern godtar inte ändringen – släng den och visa serverns läge.
            pending.current = pending.current.filter((p) => p.id !== next.id);
            updatePendingCount();
            void resync();
            continue;
          }
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
            // Behörigheten har gått ut (t.ex. tillfällig länk). Visa serverns läge.
            pending.current = [];
            updatePendingCount();
            setStatus("offline");
            void resync();
            break;
          }
          // Nätverksfel: försök igen senare, samma patch-ID (servern dubbeltillämpar aldrig).
          next.sent = false;
          setStatus("offline");
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => void flush(), retryDelay.current);
          retryDelay.current = Math.min(retryDelay.current * 2, 10_000);
          break;
        }
      }
    } finally {
      sending.current = false;
    }
  }, [clientId, utils]);

  /** Hämta hela dokumentet och lägg egna obekräftade ändringar ovanpå. */
  const resync = useCallback((): Promise<void> => {
    if (resyncing.current) return resyncing.current;
    resyncing.current = (async () => {
      try {
        const snap = await fetchSnapshot();
        const applied = new Set(snap.appliedPatchIds);
        pending.current = pending.current.filter((p) => !applied.has(p.id));
        pending.current.forEach((p) => (p.sent = false));

        if (!base.current) {
          // Första kontakten: behåll ändringar som gjordes innan servern svarade.
          const local = bootDoc.current;
          const current = normalizeDoc(readRef.current());
          const offlineOps = local ? diffDocs(local, current) : [];
          if (offlineOps.length) pending.current.push({ id: crypto.randomUUID(), ops: offlineOps, sent: false });
          shown.current = null;
        }
        base.current = { doc: snap.doc, version: snap.version };
        updatePendingCount();
        render();
        setReady(true);
        setLastSyncAt(new Date());
        void flush();
      } catch {
        setStatus("offline");
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void resync(), retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 10_000);
      } finally {
        resyncing.current = null;
      }
    })();
    return resyncing.current;
  }, [flush, render]);

  /** Anropas av komponenten när dess state ändrats (drag, knappar, ångra …). */
  const notifyLocalChange = useCallback(() => {
    if (!base.current || !shown.current) return;
    const current = normalizeDoc(readRef.current());
    const ops = diffDocs(shown.current, current);
    if (ops.length === 0) {
      shown.current = current; // t.ex. bara ny ordning eller PIR-berikning
      return;
    }
    shown.current = current;
    pending.current.push({ id: crypto.randomUUID(), ops, sent: false });
    updatePendingCount();
    void flush();
  }, [flush]);

  useEffect(() => {
    bootDoc.current = normalizeDoc(readRef.current());
    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      es = new EventSource(`/api/sse/lineup?clientId=${clientId}`);
      es.addEventListener("connected", () => {
        setStatus("live");
        retryDelay.current = 1000;
        // Vid (åter)anslutning: hämta läget – vi kan ha missat ändringar.
        void resync();
      });
      es.addEventListener("patch", (event) => {
        let data: { version: number; patchId: string; clientId: string | null; ops: LineupOp[] };
        try {
          data = JSON.parse((event as MessageEvent).data);
        } catch {
          return;
        }
        if (!base.current) return; // första hämtningen pågår och tar med ändringen
        if (data.version <= base.current.version) return;
        if (data.version !== base.current.version + 1) {
          void resync(); // glapp i löpnumren
          return;
        }
        base.current = { doc: applyOps(base.current.doc, data.ops), version: data.version };
        if (data.clientId === clientId) {
          pending.current = pending.current.filter((p) => p.id !== data.patchId);
          updatePendingCount();
        } else {
          remoteRef.current?.(describeRemote(data.ops));
        }
        setLastSyncAt(new Date());
        render();
      });
      es.onerror = () => {
        if (closed) return;
        setStatus("offline");
        // Webbläsaren återansluter själv (retry: 2 s från servern).
      };
    };
    connect();
    // Hämta läget direkt, även om SSE inte hunnit (eller inte kan) ansluta.
    void resync();

    // Mobil: SSE stängs ofta i bakgrunden. Synka direkt när appen visas igen.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (es && es.readyState === EventSource.CLOSED) {
        es.close();
        connect();
      } else {
        void resync();
      }
    };
    const onOnline = () => {
      void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      closed = true;
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [clientId, render, resync]);

  return { ready, status, pendingCount, lastSyncAt, notifyLocalChange, resync };
}
