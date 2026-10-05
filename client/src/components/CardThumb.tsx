/**
 * Spelarens sparade hockeykort i miniatyr (t.ex. i utmärkelserna). Har spelaren
 * inget sparat kort visas `fallback` (en ikon).
 */
import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { renderSavedCard } from "@/lib/savedCardImage";

const cache = new Map<string, string>();
const bare = (n: string) => n.replace(/\s*#\d*\s*$/, "").trim().toLowerCase();

export function CardThumb({ playerName, height = 56, fallback }: { playerName: string; height?: number; fallback: ReactNode }) {
  const players = trpc.players.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const cards = trpc.cards.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const id = players.data?.find((p) => bare(p.name) === bare(playerName))?.id;
  const card = id ? cards.data?.find((c) => c.playerId === id) : undefined;
  const key = card ? `${card.playerId}:${new Date(card.updatedAt).getTime()}` : "";
  const [url, setUrl] = useState<string | null>(key ? cache.get(key) ?? null : null);
  useEffect(() => {
    if (!card) { setUrl(null); return; }
    if (cache.has(key)) { setUrl(cache.get(key)!); return; }
    let cancelled = false;
    renderSavedCard(card, { scale: 0.35 }).then((c) => {
      const u = c.toDataURL("image/png");
      cache.set(key, u);
      if (!cancelled) setUrl(u);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!url) return <>{fallback}</>;
  return <img src={url} alt={playerName} style={{ height, width: (height * 5) / 7 }} className="rounded-[4px] shadow-md object-cover" />;
}
