// SavedLineupsPanel – Sparade uppställningar (SQL/tRPC-version)
// Design: Industrial Ice Arena – mörk panel med gröna accenter

import { useState, useEffect } from "react";
import { BookmarkPlus, Trash2, Download, ChevronDown, ChevronUp, Clock, Share2, Check, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Player } from "@/lib/players";

interface SavedLineupData {
  id: number;
  shareId: string;
  name: string;
  teamAName: string;
  teamBName: string;
  lineup: Record<string, any>;
  favorite: boolean;
  savedAt: number;
}

interface SavedLineupsPanelProps {
  teamAName: string;
  teamBName: string;
  lineup: Record<string, Player>;
  onLoadLineup: (saved: { id: string; name: string; teamAName: string; teamBName: string; lineup: Record<string, Player>; savedAt: number }) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SavedLineupsPanel({
  teamAName,
  teamBName,
  lineup,
  onLoadLineup,
}: SavedLineupsPanelProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Fetch saved lineups from SQL
  const { data: savedLineups = [] } = trpc.savedLineups.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Listen for SSE savedLineupsChange events
  useEffect(() => {
    const es = new EventSource("/api/sse/lineup");
    es.addEventListener("savedLineupsChange", () => {
      utils.savedLineups.list.invalidate();
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [utils]);

  // Mutations
  const createMutation = trpc.savedLineups.create.useMutation({
    onSuccess: () => utils.savedLineups.list.invalidate(),
  });
  const deleteMutation = trpc.savedLineups.delete.useMutation({
    onSuccess: () => utils.savedLineups.list.invalidate(),
  });
  const toggleFavoriteMutation = trpc.savedLineups.toggleFavorite.useMutation({
    onSuccess: () => utils.savedLineups.list.invalidate(),
  });

  const handleShare = (shareId: string) => {
    const url = `${window.location.origin}/lineup/${shareId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(shareId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      window.open(`/lineup/${shareId}`, "_blank");
    });
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createMutation.mutateAsync({
        name: trimmed,
        teamAName,
        teamBName,
        lineup,
      });
      setName("");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    setConfirmDelete(null);
  };

  const placedCount = Object.keys(lineup).length;

  return (
    <div className="rounded-xl overflow-hidden bg-[#0d1424]/80 backdrop-blur-xl border border-white/[0.12] shadow-[0_0_40px_-8px] shadow-white/5">
      {/* Header – klickbar för att expandera/minimera */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookmarkPlus className="w-4 h-4 text-emerald-400 shrink-0" />
          <span
            className="text-xs font-black uppercase tracking-widest text-white/70"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            Sparade uppställningar
          </span>
          {savedLineups.length > 0 && (
            <span className="text-[10px] bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-1.5 py-0.5 rounded-full">
              {savedLineups.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-white/30" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-white/30" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Spara nuvarande uppställning */}
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder={`Namnge uppställning (${placedCount} placerade)…`}
              maxLength={40}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-emerald-400/50 transition-colors"
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/35 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase tracking-wider shrink-0"
            >
              {saving ? "…" : "Spara"}
            </button>
          </div>

          {/* Lista sparade uppställningar */}
          {savedLineups.length === 0 ? (
            <p className="text-white/25 text-xs text-center py-2">
              Inga sparade uppställningar ännu
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {(savedLineups as SavedLineupData[]).map((sl) => (
                <div
                  key={sl.id}
                  className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-3 py-2 group hover:border-white/15 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-xs font-bold truncate">{sl.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5 text-white/25 shrink-0" />
                      <span className="text-white/30 text-[10px]">{formatDate(sl.savedAt)}</span>
                      <span className="text-white/20 text-[10px]">·</span>
                      <span className="text-white/30 text-[10px]">
                        {sl.teamAName} / {sl.teamBName}
                      </span>
                      <span className="text-white/20 text-[10px]">·</span>
                      <span className="text-white/30 text-[10px]">
                        {Object.keys(sl.lineup ?? {}).length} placerade
                      </span>
                    </div>
                  </div>

                  {/* Favorit */}
                  <button
                    onClick={() => toggleFavoriteMutation.mutate({ id: sl.id })}
                    title={sl.favorite ? "Ta bort favorit" : "Markera som favorit"}
                    className={`p-1.5 rounded-md transition-all ${
                      sl.favorite
                        ? "text-yellow-400 bg-yellow-500/15"
                        : "text-white/20 hover:text-yellow-400 hover:bg-yellow-500/10"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${sl.favorite ? "fill-yellow-400" : ""}`} />
                  </button>

                  {/* Dela */}
                  <button
                    onClick={() => handleShare(sl.shareId)}
                    title="Kopiera dela-länk"
                    className={`p-1.5 rounded-md transition-all ${
                      copiedId === sl.shareId
                        ? "text-emerald-300 bg-emerald-500/20"
                        : "text-white/30 hover:text-blue-300 hover:bg-blue-500/15"
                    }`}
                  >
                    {copiedId === sl.shareId
                      ? <Check className="w-3.5 h-3.5" />
                      : <Share2 className="w-3.5 h-3.5" />}
                  </button>

                  {/* Ladda */}
                  <button
                    onClick={() => onLoadLineup({
                      id: sl.shareId,
                      name: sl.name,
                      teamAName: sl.teamAName,
                      teamBName: sl.teamBName,
                      lineup: sl.lineup as Record<string, Player>,
                      savedAt: sl.savedAt,
                    })}
                    title="Ladda uppställning"
                    className="p-1.5 rounded-md text-white/30 hover:text-emerald-300 hover:bg-emerald-500/15 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {/* Ta bort */}
                  {confirmDelete === sl.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(sl.id)}
                        className="px-2 py-1 rounded text-[10px] bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/35 transition-all font-bold"
                      >
                        Ta bort
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded text-[10px] text-white/30 hover:text-white/60 transition-all"
                      >
                        Avbryt
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(sl.id)}
                      title="Ta bort"
                      className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
