/**
 * Push-notiser på den här enheten. Läget avgör vad Mina sidor visar:
 * - "unsupported": webbläsaren kan inte (då blir det mejl)
 * - "ios-home": iPhone/iPad – appen måste läggas på hemskärmen först (Apples krav)
 * - "denied": blockerat i telefonens inställningar
 * - "off" / "on"
 */
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export type PushState = "loading" | "unsupported" | "ios-home" | "denied" | "off" | "on";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();
  const sub = trpc.member.pushSubscribe.useMutation();
  const unsub = trpc.member.pushUnsubscribe.useMutation();

  const check = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setState(isIos() && !standalone() ? "ios-home" : "unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    const existing = await (await registration()).pushManager.getSubscription();
    if (existing && Notification.permission === "granted") {
      // Kopplar prenumerationen till den här inloggningen (t.ex. efter ny inloggning)
      const j = existing.toJSON();
      if (j.endpoint && j.keys?.p256dh && j.keys.auth) sub.mutate({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
      return setState("on");
    }
    setState("off");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void check().catch(() => setState("unsupported"));
  }, [check]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const { publicKey } = await utils.member.pushKey.fetch();
      const reg = await registration();
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const j = s.toJSON();
      await sub.mutateAsync({ endpoint: j.endpoint!, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth } });
      setState("on");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const s = await (await registration()).pushManager.getSubscription();
      if (s) {
        await unsub.mutateAsync({ endpoint: s.endpoint }).catch(() => undefined);
        await s.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, enable, disable };
}
