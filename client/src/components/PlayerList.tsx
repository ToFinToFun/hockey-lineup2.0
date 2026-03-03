// Mittenpanel med spelarlista, sökfunktion, positions- och lag-filter, sortering

import { useState, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { DraggablePlayerCard, TeamColorIndicator } from "./PlayerCard";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import { ALL_POSITIONS, POSITION_LABELS, getPositionBadgeColor } from "@/lib/players";
import { Search, UserPlus, X, ArrowUpDown, ClipboardCheck, CheckSquare, Square, Loader2 } from "lucide-react";
import { nanoid } from "nanoid";

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
      const ra = a.isRegistered ? 1 : 0;
      const rb = b.isRegistered ? 1 : 0;
      cmp = rb - ra; // Anmälda först vid asc
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "sv");
    } else if (key === "declined") {
      const da = a.isDeclined ? 1 : 0;
      const db = b.isDeclined ? 1 : 0;
      cmp = db - da; // Avböjda först vid asc
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

export function PlayerList({ players, onAddPlayer, onDeletePlayer, onChangePosition, onChangeTeamColor, onChangeNumber, onChangeName, onChangeCaptainRole, onChangeRegistered, onSyncToLaget, syncingPlayerIds, onBulkSyncToLaget, onChangeGamesPlayed, onBulkRegister, onEventInfoUpdate, totalRegistered, totalDeclined, totalPlayers }: PlayerListProps) {
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

  const sorted = sortPlayers(filtered, sortKey, sortDir);

  const handleAddPlayer = () => {
    if (!newName.trim()) return;
    onAddPlayer({
      id: `custom-${nanoid(6)}`,
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
        flex flex-col rounded-xl border backdrop-blur-md
        bg-black/30 transition-all duration-200
        ${isOver
          ? "border-emerald-400/60 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
          : "border-white/10"
        }
      `}
    >
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Spelartrupp
            </h2>
            <span className="text-white/40 text-xs">
              {players.length}/{totalPlayers ?? players.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400/70 text-xs font-semibold">
              Anmälda {players.filter(p => p.isRegistered).length}/{totalRegistered ?? players.filter(p => p.isRegistered).length}
            </span>
            {onBulkSyncToLaget && (
              <button
                onClick={() => {
                  setBulkSelectMode((prev) => !prev);
                  setSelectedPlayerIds(new Set());
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-md border-2 transition-all shadow-sm ${
                  bulkSelectMode
                    ? "bg-violet-500/40 text-violet-100 border-violet-400/80 shadow-violet-500/20"
                    : "bg-violet-500/20 text-violet-200 border-violet-400/50 hover:bg-violet-500/30 hover:text-violet-100 hover:border-violet-400/70 hover:shadow-violet-500/15"
                }`}
              >
                {bulkSelectMode ? "✖ Avbryt" : "☐ Bulk"}
              </button>
            )}
          </div>
        </div>

        {/* Sökfält */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök spelare..."
            className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400/50 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Positionsfilter */}
        <div className="flex gap-1 mb-1.5">
          {positionFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setPosFilter(f.value)}
              className={`
                flex-1 text-[10px] font-bold py-1 rounded transition-all
                ${posFilter === f.value
                  ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lag-filter */}
        <div className="flex gap-1 mb-2">
          {teamFilters.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setTeamFilter(f.value)}
              className={`
                flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1 rounded transition-all
                ${teamFilter === f.value
                  ? f.value === "white"
                    ? "bg-slate-300/20 text-slate-200 border border-slate-300/50"
                    : f.value === "green"
                    ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                    : "bg-white/15 text-white border border-white/30"
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60"
                }
              `}
            >
              {f.color !== null && (
                <TeamColorIndicator teamColor={f.color} size={12} />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* Sortering */}
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-[9px] uppercase tracking-wider shrink-0">Sortera:</span>
          <div className="flex gap-1">
            <SortBtn k="registered" label="Anmäld" />
            <SortBtn k="declined" label="Avböjd" />
            <SortBtn k="name" label="Namn" />
            <SortBtn k="number" label="Nr" />
            <SortBtn k="position" label="Pos" />
          </div>
        </div>

      </div>

      {/* Bulk-åtgärder */}
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

      {/* Spelarlista – scrollbar med fast höjd */}
      <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: "560px", overscrollBehavior: "auto" }}>
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
              <div className="flex-1 relative">
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



      {/* Lägg till spelare */}
      <div className="p-2 border-t border-white/10">
        {!showAddForm ? (
          <button
            onClick={() => {
              setShowAddForm(true);
              setNewName("");
              setNewNumber("");
              setNewPosition("IB");
              setNewTeamColor(null);
              setNewCaptainRole(null);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-white/5 border border-white/10 text-white/50 hover:bg-emerald-500/10 hover:border-emerald-400/30 hover:text-emerald-300 transition-all text-xs font-medium"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Lägg till spelare
          </button>
        ) : (
          <div className="flex flex-col gap-2 bg-white/5 border border-emerald-400/30 rounded-lg p-3">
            {/* Rad 1: Namn + Spara */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Spelarens namn"
                className="flex-1 bg-white/10 border border-emerald-400/40 rounded px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-400"
                onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
                autoFocus
              />
              <button
                onClick={handleAddPlayer}
                disabled={!newName.trim()}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-white/10 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Lägg till
              </button>
            </div>
            {/* Rad 2: Lag */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
              <span className="text-white/40 text-[10px] w-6">Lag:</span>
              {([
                { value: "white" as TeamColor, label: "Vita" },
                { value: "green" as TeamColor, label: "Gröna" },
                { value: null, label: "Waivers" },
              ] as { value: TeamColor; label: string }[]).map(({ value, label }) => (
                <button
                  key={String(value)}
                  onClick={() => setNewTeamColor(value)}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border transition-all ${
                    (newTeamColor ?? null) === value
                      ? "bg-white/15 text-white/80 border-white/30 ring-1 ring-white/20"
                      : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                  }`}
                >
                  <TeamColorIndicator teamColor={value} size={10} />
                  {label}
                </button>
              ))}
            </div>
            {/* Rad 3: Position */}
            <div className="flex items-center gap-1 pt-1 border-t border-white/10 flex-wrap">
              <span className="text-white/40 text-[10px] w-6">Pos:</span>
              {ALL_POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setNewPosition(pos)}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                    newPosition === pos
                      ? `${getPositionBadgeColor(pos)} ring-1 ring-white/30`
                      : "bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 hover:text-white/50"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            {/* Rad 4: Nr + Roll */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/10">
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[10px]">Nr:</span>
                <span className="text-white/50 text-xs">#</span>
                <input
                  type="text"
                  value={newNumber}
                  maxLength={3}
                  placeholder="—"
                  onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
                  className="w-12 bg-white/10 border border-emerald-400/40 rounded px-2 py-1 text-xs text-white text-center outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-white/40 text-[10px]">Roll:</span>
                {([
                  { value: "C" as CaptainRole, label: "C" },
                  { value: "A" as CaptainRole, label: "A" },
                  { value: null, label: "—" },
                ] as { value: CaptainRole; label: string }[]).map(({ value, label }) => (
                  <button
                    key={String(value)}
                    onClick={() => setNewCaptainRole(value)}
                    className={`text-[9px] font-black px-2 py-1 rounded border transition-all ${
                      newCaptainRole === value
                        ? value === "C"
                          ? "bg-yellow-400/25 text-yellow-300 border-yellow-400/50 ring-1 ring-yellow-400/30"
                          : value === "A"
                          ? "bg-orange-400/25 text-orange-300 border-orange-400/50 ring-1 ring-orange-400/30"
                          : "bg-white/15 text-white/60 border-white/30 ring-1 ring-white/20"
                        : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Avbryt-knapp */}
            <button
              onClick={() => { setShowAddForm(false); setNewName(""); setNewNumber(""); setNewPosition("IB"); setNewTeamColor(null); setNewCaptainRole(null); }}
              className="w-full py-1 rounded bg-white/5 border border-white/10 text-white/40 text-xs hover:bg-white/10 transition-all"
            >
              Avbryt
            </button>
          </div>
        )}
      </div>

      {/* Hämta anmälningar från laget.se */}
      {onBulkRegister && (
        <div className="p-2 border-t border-white/10">
          <button
            onClick={async () => {
              if (isLoadingAttendance) return;
              setIsLoadingAttendance(true);
              setRegisterResult(null);
              try {
                const result = await onBulkRegister(true);
                setRegisterResult(result);
                if (onEventInfoUpdate) {
                  if (result.eventTitle) {
                    onEventInfoUpdate({ title: result.eventTitle, date: result.eventDate || "" });
                  } else if (result.noEvent) {
                    onEventInfoUpdate(null);
                  }
                }
                if (!result.error) {
                  setTimeout(() => setRegisterResult(null), result.noEvent ? 6000 : 8000);
                }
              } catch {
                setRegisterResult({ matched: 0, unmatched: [], error: "Kunde inte hämta data" });
              } finally {
                setIsLoadingAttendance(false);
              }
            }}
            disabled={isLoadingAttendance}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all uppercase tracking-wider ${
              isLoadingAttendance
                ? "bg-sky-500/10 border-sky-400/20 text-sky-300/50 cursor-wait"
                : "bg-sky-500/20 border-sky-400/40 text-sky-300 hover:bg-sky-500/30"
            }`}
          >
            {isLoadingAttendance ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Hämtar från laget.se...
              </>
            ) : (
              <>
                <ClipboardCheck className="w-3.5 h-3.5" />
                Hämta anmälningar (laget.se)
              </>
            )}
          </button>
          {registerResult && (
            <div className={`mt-1.5 text-[10px] px-2 py-1.5 rounded-lg border ${
              registerResult.error
                ? "bg-red-500/15 border-red-400/30 text-red-300"
                : registerResult.noEvent
                ? "bg-slate-500/15 border-slate-400/30 text-slate-300"
                : registerResult.unmatched.length === 0
                ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                : "bg-amber-500/15 border-amber-400/30 text-amber-300"
            }`}>
              {registerResult.error ? (
                <span>{registerResult.error}</span>
              ) : registerResult.noEvent ? (
                <span>Ingen träning idag eller imorgon — anmälningar nollställda</span>
              ) : (
                <>
                  <span className="font-bold">{registerResult.matched}</span> spelare markerade som anmälda
                  {registerResult.eventTitle && (
                    <span className="ml-1 opacity-70">({registerResult.eventTitle}{registerResult.eventDate ? ` · ${registerResult.eventDate}` : ""})</span>
                  )}
                  {registerResult.unmatched.length > 0 && (
                    <div className="mt-0.5 text-[9px] opacity-80">
                      Ej matchade: {registerResult.unmatched.join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
