/**
 * MobileSlotPicker – Bottom sheet that shows available players when tapping an empty slot
 * Sorting: For goalkeeper slots → MV players first; registered players first; then alphabetical (sv)
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { X, Search, UserPlus } from "lucide-react";
import type { Player, Position } from "@/lib/players";
import { getPositionBadgeColor } from "@/lib/players";
import { TeamColorIndicator } from "@/components/PlayerCard";
import { usePirSettings } from "@/hooks/usePirEnabled";

interface MobileSlotPickerProps {
  open: boolean;
  onClose: () => void;
  players: Player[];
  slotType: string; // "goalkeeper" | "defense" | "forward"
  slotId: string;
  teamName: string;
  slotLabel: string;
  onSelectPlayer: (player: Player, slotId: string) => void;
}

const POSITION_ORDER: Record<string, number> = { MV: 0, B: 1, C: 2, F: 3, IB: 4 };

export function MobileSlotPicker({
  open, onClose, players, slotType, slotId, teamName, slotLabel, onSelectPlayer,
}: MobileSlotPickerProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pirSettings = usePirSettings();

  // Reset search when opening
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  // Sort players: registered first, then for GK slots MV first, then alphabetical
  const sortedPlayers = useMemo(() => {
    let filtered = [...players];

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.number && p.number.includes(q))
      );
    }

    filtered.sort((a, b) => {
      // 1. Registered first
      const aReg = a.isRegistered ? 1 : 0;
      const bReg = b.isRegistered ? 1 : 0;
      if (bReg !== aReg) return bReg - aReg;

      // 2. For goalkeeper slots: MV position first
      if (slotType === "goalkeeper") {
        const aMv = a.position === "MV" ? 1 : 0;
        const bMv = b.position === "MV" ? 1 : 0;
        if (bMv !== aMv) return bMv - aMv;
      }

      // 3. Alphabetical by name (Swedish locale)
      return a.name.localeCompare(b.name, "sv");
    });

    return filtered;
  }, [players, search, slotType]);

  if (!open) return null;

  const registeredCount = sortedPlayers.filter(p => p.isRegistered).length;
  const totalCount = sortedPlayers.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#111] border-t border-[#2a2a2a] rounded-t-2xl max-h-[75dvh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div>
            <h3 className="text-sm font-bold text-[#ECEDEE]">
              Välj spelare
            </h3>
            <p className="text-[10px] text-[#687076]">
              {teamName} — {slotLabel} • {registeredCount} anmälda av {totalCount}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#1a1a1a] text-[#687076] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#687076]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök spelare..."
              className="w-full pl-8 pr-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#ECEDEE] placeholder:text-[#687076] focus:outline-none focus:border-[#0a7ea4]/50"
            />
          </div>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-8 text-[#687076]">
              <UserPlus size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Inga spelare hittades</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {sortedPlayers.map((player) => {
                const posBadgeColor = getPositionBadgeColor(player.position);
                const isRegistered = player.isRegistered;
                const isDeclined = player.isDeclined;

                return (
                  <button
                    key={player.id}
                    onClick={() => {
                      onSelectPlayer(player, slotId);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all text-left
                      ${isRegistered
                        ? "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] border border-emerald-500/10"
                        : isDeclined
                          ? "bg-red-500/[0.04] hover:bg-red-500/[0.08] border border-red-500/10 opacity-50"
                          : "bg-[#1a1a1a]/50 hover:bg-[#2a2a2a] border border-transparent"
                      }`}
                  >
                    {/* Registration status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isRegistered ? "bg-emerald-400" : isDeclined ? "bg-red-400" : "bg-[#3a3a3a]"
                    }`} />

                    {/* Name + number */}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-[#ECEDEE] font-medium truncate block">
                        {player.name}
                        {player.number && (
                          <span className="text-[#687076] ml-1">#{player.number}</span>
                        )}
                      </span>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Team color */}
                      {player.teamColor && player.teamColor !== "none" && (
                        <TeamColorIndicator color={player.teamColor} size="sm" />
                      )}

                      {/* Position badge */}
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${posBadgeColor}20`,
                          color: posBadgeColor,
                        }}
                      >
                        {player.position}
                      </span>

                      {/* Most played position */}
                      {player.mostPlayedPosition && player.mostPlayedPosition !== player.position && (
                        <span className="text-[8px] text-[#687076] px-1 py-0.5 rounded bg-[#2a2a2a]">
                          {player.mostPlayedPosition}
                        </span>
                      )}

                      {/* PIR badge */}
                      {pirSettings.enabled && player.pir !== undefined && player.pir !== null && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          player.pir >= 1100 ? "bg-amber-500/20 text-amber-400" :
                          player.pir >= 1000 ? "bg-emerald-500/20 text-emerald-400" :
                          player.pir >= 900 ? "bg-blue-500/20 text-blue-400" :
                          "bg-[#2a2a2a] text-[#687076]"
                        }`}>
                          {player.pir}
                        </span>
                      )}

                      {/* Captain role */}
                      {player.captainRole && player.captainRole !== "none" && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-400/15 px-1 py-0.5 rounded">
                          {player.captainRole === "captain" ? "C" : "A"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
