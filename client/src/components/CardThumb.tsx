/**
 * Spelarens hockeykort – alla spelare har ett: det sparade kortet, annars
 * standardkortet (lagets färg, utan foto). Med statistik i rutan när
 * withStats (styrelsen). Hittas inte spelaren visas `fallback`.
 */
import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { renderPlayerCard } from "@/lib/savedCardImage";

const cache = new Map<string, string>();
const bare = (n: string) => n.replace(/\s*#\d*\s*$/, "").trim().toLowerCase();

export function CardThumb({ playerName, playerId, height = 56, fallback = null, withStats = true, className = "" }: {
  playerName?: string; playerId?: string; height?: number; fallback?: ReactNode; withStats?: boolean; className?: string;
}) {
  const players = trpc.players.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const cards = trpc.cards.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const player = players.data?.find((p) => (playerId ? p.id === playerId : bare(p.name) === bare(playerName ?? "")));
  const card = player ? cards.data?.find((c) => c.playerId === player.id) : undefined;
  const stats = trpc.cards.stats.useQuery({ playerId: player?.id ?? "" }, { enabled: !!player && withStats, staleTime: 5 * 60_000, retry: false });
  const ready = !!player && !!cards.data && (!withStats || !stats.isLoading);
  const key = player ? `${player.id}:${card ? new Date(card.updatedAt).getTime() : "std"}:${player.name}:${player.number}:${player.teamColor}:${player.position}:${stats.data ? JSON.stringify(stats.data.season) : ""}:${height}` : "";
  const [url, setUrl] = useState<string | null>(key ? cache.get(key) ?? null : null);
  useEffect(() => {
    if (!ready) return;
    if (cache.has(key)) { setUrl(cache.get(key)!); return; }
    let cancelled = false;
    renderPlayerCard(player!, card, { scale: Math.min(0.9, (height * 1.6) / 1050), stats: stats.data ?? undefined }).then((c) => {
      const u = c.toDataURL("image/png");
      cache.set(key, u);
      if (!cancelled) setUrl(u);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [key, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!player) return <>{fallback}</>;
  if (!url) return <div style={{ height, width: (height * 5) / 7 }} className={`rounded-[4px] bg-white/5 animate-pulse ${className}`} />;
  return <img src={url} alt={player.name} style={{ height, width: (height * 5) / 7 }} className={`rounded-[4px] shadow-md object-cover ${className}`} />;
}
