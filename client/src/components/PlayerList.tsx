// Mittenpanel med spelarlista – Glassmorphism v2
// Visible glass border, frosted background, clean layout

import { RosterSummary, type RosterCounts } from "./RosterSummary";
import { AddPlayerModal } from "./AddPlayerModal";
import { useState, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard, TeamColorIndicator } from "./PlayerCard";
import { sortRoster, positionsForSlot, slotTeamColor } from "@/lib/rosterSort";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import { ALL_POSITIONS, POSITION_LABELS, getPositionBadgeColor, positionName } from "@/lib/players";
import { Search, UserPlus, X, ArrowUpDown, ClipboardCheck, CheckSquare, Square, Loader2 } from "lucide-react";
import { useForwardColor } from "@/hooks/useForwardColor";

interface PlayerListProps {
  players: Player[];
  onAddPlayer: (player: Player) => void;
  onDeletePlayer: (playerId: string) => void;
  onChangePosition: (playerId: string, pos: Position) => void;
  onChangeTeamColor: (playerId: string, color: TeamColor) => void;
  onChangeNumber: (playerId: string, number: string) => void;
  onChangeName: (playerId: string, name: string) => void;
  onChangeCaptainRole: (playerId: string, role: CaptainRole) => void;
  onChangeRegistered: (playerId: string, isRegistered: boolean) => void;
  onSyncToLaget?: (playerId: string, playerName: string, status: "Attending" | "NotAttending" | "NotAnswered") => Promise<void>;
  syncingPlayerIds?: Set<string>;
  onBulkSyncToLaget?: (playerIds: string[], status: "Attending" | "NotAttending" | "NotAnswered") => Promise<void>;
  onChangeGamesPlayed: (playerId: string, gamesPlayed: number) => void;
  onBulkRegister?: (forceRefresh?: boolean) => Promise<{ matched: number; unmatched: string[]; eventTitle?: string; eventDate?: string; error?: string; noEvent?: boolean }>;
  onEventInfoUpdate?: (info: { title: string; date: string } | null) => void;
  totalRegistered?: number;
  totalDeclined?: number;
  totalPlayers?: number;
  /** Truppens siffror (samma som på mobilen) */
  rosterCounts?: RosterCounts;
  /** Vald tom plats (desktop): listan sorteras för platsen och ett klick placerar spelaren där. */
  targetSlot?: { slotType: string; slotLabel: string; teamName: string; teamId: string } | null;
  onPickForTarget?: (player: Player) => void;
  onCancelTarget?: () => void;
}

type PosFilter = Position | "Alla";
type TeamFilter = TeamColor | "Alla";
type SortKey = "registered" | "declined" | "name" | "number" | "position";
type SortDir = "asc" | "desc";

const positionFilters: { label: string; value: PosFilter }[] = [
  { label: "Alla", value: "Alla" },
  { label: "MV", value: "MV" },
  { label: "B", value: "B" },
  { label: "F", value: "F" },
  { label: "C", value: "C" },
  { label: "IB", value: "IB" },
];

const teamFilters: { label: string; value: TeamFilter; color: TeamColor }[] = [
  { label: "Alla", value: "Alla", color: null },
  { label: "Vita", value: "white", color: "white" },
  { label: "Gröna", value: "green", color: "green" },
  { label: "Waivers", value: null, color: null },
];

const POSITION_ORDER: Record<string, number> = { MV: 0, B: 1, C: 2, F: 3, IB: 4 };

function sortPlayers(players: Player[], key: SortKey, dir: SortDir): Player[] {
  return [...players].sort((a, b) => {
    let cmp = 0;
    if (key === "registered") {
      // Samma ordning som i mobilens meny: anmälda, ej svarat, kommer inte – sedan namn.
      const rank = (p: Player) => (p.isRegistered ? 0 : p.isDeclined ? 2 : 1);
      cmp = rank(a) - rank(b);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "sv");
    } else if (key === "declined") {
      const da = a.isDeclined ? 1 : 0;
      const db = b.isDeclined ? 1 : 0;
      cmp = db - da;
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "sv");
    } else if (key === "name") {
      cmp = a.name.localeCompare(b.name, "sv");
    } else if (key === "number") {
      const na = parseInt(a.number || "9999");
      const nb = parseInt(b.number || "9999");
      cmp = na - nb;
    } else if (key === "position") {
      cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "sv");
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export function PlayerList({ players, onAddPlayer, onDeletePlayer, onChangePosition, onChangeTeamColor, onChangeNumber, onChangeName, onChangeCaptainRole, onChangeRegistered, onSyncToLaget, syncingPlayerIds, onBulkSyncToLaget, onChangeGamesPlayed, onBulkRegister, onEventInfoUpdate, totalRegistered, totalDeclined, totalPlayers, rosterCounts, targetSlot, onPickForTarget, onCancelTarget }: PlayerListProps) {
  const { colors: fc } = useForwardColor();
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<PosFilter>("Alla");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("Alla");
  const [sortKey, setSortKey] = useState<SortKey>("registered");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ matched: number; unmatched: string[]; eventTitle?: string; eventDate?: string; error?: string; noEvent?: boolean } | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newPosition, setNewPosition] = useState<Position>("IB");
  const [newTeamColor, setNewTeamColor] = useState<TeamColor>(null);
  const [newCaptainRole, setNewCaptainRole] = useState<CaptainRole>(null);

  const { setNodeRef, isOver } = useDroppable({ id: "player-list" });

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = players.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.number.includes(search);
    const matchesPos = posFilter === "Alla" || p.position === posFilter;
    const matchesTeam =
      teamFilter === "Alla" ||
      (teamFilter === null ? (p.teamColor ?? null) === null : (p.teamColor ?? null) === teamFilter);
    return matchesSearch && matchesPos && matchesTeam;
  });

  // Vald plats: samma ordning som mobilen (närvaro, position som passar, lag, namn).
  // Annars listans vanliga sortering.
  const sorted = targetSlot
    ? sortRoster(filtered, positionsForSlot(targetSlot.slotType, targetSlot.slotLabel), slotTeamColor(targetSlot.teamName, targetSlot.teamId))
    : sortPlayers(filtered, sortKey, sortDir);
  const picking = !!targetSlot && !!onPickForTarget && !bulkSelectMode;

  const handleAddPlayer = () => {
    if (!newName.trim()) return;
    onAddPlayer({
      id: `custom-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`,
      name: newName.trim(),
      number: newNumber.trim(),
      position: newPosition,
      teamColor: newTeamColor,
      captainRole: newCaptainRole,
    });
    setNewName("");
    setNewNumber("");
    setNewPosition("IB");
    setNewTeamColor(null);
    setNewCaptainRole(null);
    setShowAddForm(false);
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSortClick(k)}
      className={`
        flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded transition-all
        ${sortKey === k
          ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40"
          : "bg-white/5 text-white/35 border border-white/10 hover:text-white/60 hover:bg-white/10"
        }
      `}
    >
      {label}
      <ArrowUpDown className={`w-2.5 h-2.5 ${sortKey === k ? "opacity-100" : "opacity-40"}`} />
      {sortKey === k && (
        <span className="text-[8px] opacity-70">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl overflow-hidden
        glass-panel
        transition-all duration-200 min-w-0
        ${isOver
          ? "!border-emerald-400/60 ring-1 ring-emerald-400/30"
          : ""
        }
      `}
    >
      {/* Header */}
      <div className="p-3 border-b border-white/[0.08] bg-white/[0.02] min-w-0">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest whitespace-nowrap" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Spelartrupp
            </h2>
            {rosterCounts && <RosterSummary counts={rosterCounts} />}
          </div>
          <div className="flex items-center gap-2">
            {onBulkSyncToLaget && (
              <button
                onClick={() => {
                  setBulkSelectMode((prev) => !prev);
                  setSelectedPlayerIds(new Set());
                }}
                className={`text-[10px] font-medium px-2 py-1 rounded border transition-all ${
                  bulkSelectMode
                    ? "bg-white/15 text-white/70 border-white/30"
                    : "bg-white/5 text-white/40 border-white/15 hover:bg-white/10 hover:text-white/60"
                }`}
              >
                {bulkSelectMode ? "✖ Avbryt" : "☐ Bulk"}
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök spelare..."
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400/50 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Position filter */}
        <div className="flex gap-1 mb-1.5 min-w-0">
          {positionFilters.map((f) => (
            <button
              key={f.value}
              title={f.value === "Alla" ? "Alla positioner" : positionName(f.value)}
              onClick={() => setPosFilter(f.value)}
              className={`
                flex-1 text-[10px] font-bold py-1 rounded-md transition-all
                ${posFilter === f.value
                  ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                  : "bg-white/[0.04] text-white/40 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/60"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Team filter */}
        <div className="flex gap-1 mb-2 min-w-0">
          {teamFilters.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setTeamFilter(f.value)}
              className={`
                flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1 rounded-md transition-all
                ${teamFilter === f.value
                  ? f.value === "white"
                    ? "bg-slate-300/20 text-slate-200 border border-slate-300/50"
                    : f.value === "green"
                    ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                    : "bg-white/15 text-white border border-white/30"
                  : "bg-white/[0.04] text-white/40 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/60"
                }
              `}
            >
              {f.color !== null && (
                <TeamColorIndicator teamColor={f.color} compact />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <SortBtn k="registered" label="Anmäld" />
            <SortBtn k="declined" label="Avböjd" />
            <SortBtn k="name" label="Namn" />
            <SortBtn k="number" label="Nr" />
            <SortBtn k="position" label="Pos" />
        </div>
      </div>

      {/* Bulk actions */}
      {bulkSelectMode && onBulkSyncToLaget && (
        <div className="px-3 py-2.5 border-b border-violet-400/20 bg-violet-500/10">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => {
                if (selectedPlayerIds.size === sorted.length) {
                  setSelectedPlayerIds(new Set());
                } else {
                  setSelectedPlayerIds(new Set(sorted.map(p => p.id)));
                }
              }}
              className="text-[11px] font-bold px-2.5 py-1 rounded border bg-white/5 text-white/60 border-white/15 hover:bg-white/10 hover:text-white/80 transition-all"
            >
              {selectedPlayerIds.size === sorted.length ? "Avmarkera alla" : "Markera alla"}
            </button>
            <span className="text-[11px] text-white/50 font-medium">
              {selectedPlayerIds.size} valda
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-white/50 font-medium">Laget.se:</span>
            <button
              disabled={selectedPlayerIds.size === 0 || isBulkSyncing}
              onClick={async () => {
                setIsBulkSyncing(true);
                try {
                  await onBulkSyncToLaget(Array.from(selectedPlayerIds), "Attending");
                } finally {
                  setIsBulkSyncing(false);
                  setSelectedPlayerIds(new Set());
                  setBulkSelectMode(false);
                }
              }}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-all bg-emerald-500/20 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBulkSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Alla Deltar"}
            </button>
            <button
              disabled={selectedPlayerIds.size === 0 || isBulkSyncing}
              onClick={async () => {
                setIsBulkSyncing(true);
                try {
                  await onBulkSyncToLaget(Array.from(selectedPlayerIds), "NotAttending");
                } finally {
                  setIsBulkSyncing(false);
                  setSelectedPlayerIds(new Set());
                  setBulkSelectMode(false);
                }
              }}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-all bg-red-500/20 text-red-300 border-red-400/50 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBulkSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Alla Deltar ej"}
            </button>
            <button
              disabled={selectedPlayerIds.size === 0 || isBulkSyncing}
              onClick={async () => {
                setIsBulkSyncing(true);
                try {
                  await onBulkSyncToLaget(Array.from(selectedPlayerIds), "NotAnswered");
                } finally {
                  setIsBulkSyncing(false);
                  setSelectedPlayerIds(new Set());
                  setBulkSelectMode(false);
                }
              }}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-all bg-white/10 text-white/50 border-white/20 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBulkSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Alla Ej svarat"}
            </button>
          </div>
        </div>
      )}

      {/* Förklaring: kanten till vänster visar anmälan, rutan visar lagtillhörighet */}
      <div className="flex items-center gap-3 px-3 pt-2 text-[10px] text-white/45">
        <span className="flex items-center gap-1"><span className="w-[3px] h-3 rounded-sm bg-emerald-400" />Anmäld</span>
        <span className="flex items-center gap-1"><span className="w-[3px] h-3 rounded-sm bg-red-500" />Kommer inte</span>
        <span className="flex items-center gap-1"><span className="w-[3px] h-3 rounded-sm bg-white/15" />Inte svarat</span>
        <span className="flex items-center gap-0.5 ml-auto"><span className="w-3 h-3 rounded-sm bg-white text-slate-900 text-[8px] font-black flex items-center justify-center">V</span><span className="w-3 h-3 rounded-sm bg-emerald-400 text-emerald-950 text-[8px] font-black flex items-center justify-center">G</span><span className="w-3 h-3 rounded-sm border border-white/20 text-white/45 text-[8px] font-black flex items-center justify-center">W</span></span>
      </div>

      {/* Vald plats: tala om vad ett klick gör */}
      {targetSlot && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] text-emerald-200">
          <span className="flex-1 min-w-0 truncate">
            Välj spelare till <b>{targetSlot.teamName} · {targetSlot.slotLabel}</b>
          </span>
          {onCancelTarget && (
            <button onClick={onCancelTarget} className="shrink-0 text-emerald-200/70 hover:text-white underline-offset-2 hover:underline">
              Avbryt
            </button>
          )}
        </div>
      )}

      {/* Player list */}
      <div className="overflow-y-auto p-2 space-y-0.5" style={{ maxHeight: "560px", overscrollBehavior: "auto" }}>
        {sorted.length === 0 ? (
          <div className="text-center text-white/30 text-xs italic py-8">
            Inga spelare hittades
          </div>
        ) : (
          sorted.map((player) => (
            <div key={player.id} className="flex items-center gap-1">
              {bulkSelectMode && (
                <button
                  onClick={() => {
                    setSelectedPlayerIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(player.id)) next.delete(player.id);
                      else next.add(player.id);
                      return next;
                    });
                  }}
                  className="shrink-0 p-0.5 text-white/40 hover:text-white/70 transition-colors"
                >
                  {selectedPlayerIds.has(player.id) ? (
                    <CheckSquare className="w-4 h-4 text-violet-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}
              <div
                className={`flex-1 relative ${picking ? "cursor-pointer rounded-md hover:ring-1 hover:ring-emerald-400/60" : ""}`}
                onClick={picking ? (e) => {
                  // Klick i spelarens redigeringspanel (portal) ska inte placera spelaren
                  if (!e.currentTarget.contains(e.target as Node)) return;
                  onPickForTarget!(player);
                } : undefined}
              >
                {syncingPlayerIds?.has(player.id) && (
                  <div className="absolute top-1 right-1 z-10">
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  </div>
                )}
                <DraggablePlayerCard
                  player={player}
                  onChangePosition={(pos) => onChangePosition(player.id, pos)}
                  onChangeTeamColor={(color) => onChangeTeamColor(player.id, color)}
                  onChangeNumber={(nr) => onChangeNumber(player.id, nr)}
                  onChangeName={(name) => onChangeName(player.id, name)}
                  onChangeCaptainRole={(role) => onChangeCaptainRole(player.id, role)}
                  onChangeRegistered={(val) => onChangeRegistered(player.id, val)}
                  onSyncToLaget={onSyncToLaget ? (status) => onSyncToLaget(player.id, player.name, status) : undefined}
                  onChangeGamesPlayed={(val) => onChangeGamesPlayed(player.id, val)}
                  onDelete={() => onDeletePlayer(player.id)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lägg till spelare – samma ruta som på mobilen */}
      <div className="p-2 border-t border-white/[0.08]">
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/50 hover:bg-emerald-500/10 hover:border-emerald-400/30 hover:text-emerald-300 transition-all text-xs font-medium"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Lägg till spelare
        </button>
        {showAddForm && <AddPlayerModal onAdd={onAddPlayer} onClose={() => setShowAddForm(false)} />}
      </div>
    </div>
  );
}
