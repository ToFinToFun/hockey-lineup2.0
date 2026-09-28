/**
 * Håller skärmen tänd under matchen (Screen Wake Lock API).
 *
 * Stöd: Chrome/Edge (även installerad app på Android), Firefox 126+, Safari 16.4+
 * och som hemskärmsapp på iPhone från iOS 18.4. Systemet släpper låset när appen
 * lämnas; det tas tillbaka när appen visas igen. På iPhone kräver det en tryckning,
 * så låset tas också tillbaka vid nästa tryck på skärmen.
 * Valet (på/av) sparas på enheten.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "score_wake_lock_wanted";

export type WakeLockStatus = "unsupported" | "off" | "on" | "waiting";

export function useWakeLock() {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [wanted, setWanted] = useState(() => {
    try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
  });
  const [held, setHeld] = useState(false);
  const sentinel = useRef<WakeLockSentinel | null>(null);
  const busy = useRef(false);

  const acquire = useCallback(async () => {
    if (!supported || sentinel.current || busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      sentinel.current = lock;
      setHeld(true);
      lock.addEventListener("release", () => {
        // Släppt av systemet (appen lämnades, låg batterinivå …) – vill vi fortfarande ha det tas det tillbaka
        sentinel.current = null;
        setHeld(false);
      });
    } catch {
      // Nekat (t.ex. iPhone utan tryckning eller energisparläge) – försök igen vid nästa tryck
      setHeld(false);
    } finally {
      busy.current = false;
    }
  }, [supported]);

  const release = useCallback(async () => {
    const lock = sentinel.current;
    sentinel.current = null;
    setHeld(false);
    await lock?.release().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    const next = !wanted;
    setWanted(next);
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* bara den här sessionen */ }
    if (next) void acquire();
    else void release();
  }, [wanted, acquire, release]);

  useEffect(() => {
    if (!supported || !wanted) return;
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    const onTap = () => { if (!sentinel.current) void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onTap);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onTap);
    };
  }, [supported, wanted, acquire]);

  useEffect(() => () => { void sentinel.current?.release().catch(() => undefined); }, []);

  const status: WakeLockStatus = !supported ? "unsupported" : !wanted ? "off" : held ? "on" : "waiting";
  return { status, toggle };
}
