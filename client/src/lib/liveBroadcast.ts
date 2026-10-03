/**
 * Score Tracker → live (server/liveMatch.ts). En inloggad enhet sänder;
 * enhetens id sparas lokalt så att samma telefon känns igen efter omladdning.
 */
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import type { GoalEvent } from "@/lib/scoreConstants";

export function liveDeviceId(): string {
  try {
    let id = localStorage.getItem("live_device");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, "").slice(0, 40);
      localStorage.setItem("live_device", id);
    }
    return id;
  } catch {
    return "device-unknown";
  }
}

/** Läget för sändningen (delas mellan matchvyn och footern – samma fråga) */
export function useLiveStatus() {
  const { canEditLineup } = useAuth();
  const deviceId = liveDeviceId();
  const status = trpc.live.status.useQuery({ deviceId }, { enabled: canEditLineup, refetchInterval: 5_000, retry: false });
  return { canBroadcast: canEditLineup, deviceId, status };
}

/** Skickar ställning, mål och sluttid när de ändras (bara när den här enheten sänder) */
export function useLivePush(mine: boolean, data: { whiteScore: number; greenScore: number; goals: GoalEvent[]; matchStartTime?: string; endTime: string | null }) {
  const push = trpc.live.push.useMutation();
  const deviceId = liveDeviceId();
  const key = JSON.stringify(data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!mine) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      push.mutate({
        deviceId,
        whiteScore: data.whiteScore, greenScore: data.greenScore,
        goals: data.goals.map((g) => ({ team: g.team, timestamp: g.timestamp, scorer: g.scorer, scorerId: g.scorerId, assist: g.assist, assistId: g.assistId, other: g.other, sponsor: g.sponsor })),
        matchStartTime: data.matchStartTime ?? null, endTime: data.endTime,
      });
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [mine, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
