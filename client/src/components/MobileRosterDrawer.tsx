// Hockey Lineup App – MobileRosterDrawer
// Trupp-overlay som glider in från höger på mobil
// Visar spelarlistan med sök, filter och stöd för drag-and-drop + tap-to-assign

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Users, ChevronRight, ClipboardCheck } from "lucide-react";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
// Position badge colors handled by CSS pos-badge classes
import { useForwardColor } from "@/hooks/useForwardColor";

interface MobileRosterDrawerProps {
  open: boolean;
  onClose: () => void;
  players: Player[];
  onAddPlayer?: (name: string, position: Position) => void;
  onDeletePlayer?: (id: string) => void;
  onChangePosition?: (id: string, pos: Position) => void;
  onChangeTeamColor?: (id: string, color: TeamColor) => void;
  onChangeNumber?: (id: string, num: string) => void;
  onChangeName?: (id: string, name: string) => void;
  onChangeCaptainRole?: (id: string, role: CaptainRole) => void;
  onChangeRegistered?: (id: string, registered: boolean, declined: boolean) => void;
  onBulkRegister?: (forceRefresh?: boolean) => Promise<{ matched: number; unmatched: string[]; eventTitle?: string; eventDate?: string; error?: string; noEvent?: boolean }>;
  onEventInfoUpdate?: (info: { title: string; date: string } | null) => void;
  totalRegistered?: number;
  totalDeclined?: number;
  totalPlayers?: number;
  // Tap-to-assign
  onTapAssign?: (player: Player, team: "team-a" | "team-b") => void;
  teamAName?: string;
  teamBName?: string;
}

export function MobileRosterDrawer({
  open,
  onClose,
  players,
  onBulkRegister,
  onEventInfoUpdate,
  totalRegistered = 0,
  totalDeclined = 0,
  totalPlayers = 0,
  onTapAssign,
  teamAName = "Vita",
  teamBName = "Gröna",
}: MobileRosterDrawerProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("Alla");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ matched: number; unmatched: string[]; error?: string; noEvent?: boolean } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { colors: fc } = useForwardColor();

  // Stäng med Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset selection when closing
  useEffect(() => {
    if (!open) {
      setSelectedPlayer(null);
      setSearch("");
    }
  }, [open]);

  const filteredPlayers = players.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.number && p.number.includes(search));
    const matchesPos = posFilter === "Alla" || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  const handlePlayerTap = useCallback((player: Player) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(player);
    }
  }, [selectedPlayer]);

  const handleAssign = useCallback((team: "team-a" | "team-b") => {
    if (selectedPlayer && onTapAssign) {
      onTapAssign(selectedPlayer, team);
      setSelectedPlayer(null);
    }
  }, [selectedPlayer, onTapAssign]);

  const handleFetchAttendance = useCallback(async () => {
    if (!onBulkRegister || isLoadingAttendance) return;
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
  }, [onBulkRegister, isLoadingAttendance, onEventInfoUpdate]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`
          fixed top-0 right-0 bottom-0 z-50
          w-[85vw] max-w-[360px]
          glass-panel
          transform transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white tracking-wider uppercase" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Trupp
            </span>
            <span className="text-[10px] text-white/40">
              {totalRegistered}/{totalPlayers} anmälda
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg glass-button text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sök + filter */}
        <div className="px-3 py-2 space-y-2 border-b border-white/8">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök spelare..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/20"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["Alla", "MV", "B", "F", "C"].map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                  posFilter === pos
                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40"
                    : "bg-white/5 text-white/40 border border-white/8 hover:bg-white/10"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Hämta anmälningar */}
        {onBulkRegister && (
          <div className="px-3 py-1.5 border-b border-white/8">
            <button
              onClick={handleFetchAttendance}
              disabled={isLoadingAttendance}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
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
                  <span>
                    {registerResult.error.includes("NO_CREDENTIALS:") ? (
                      <>Inga inloggningsuppgifter. Öppna inställningarna och ange ditt laget.se-konto.</>
                    ) : registerResult.error.includes("LOGIN_FAILED:") ? (
                      <>Kunde inte logga in på laget.se. Kontrollera uppgifterna i inställningarna.</>
                    ) : registerResult.error.includes("AUTH_ERROR:") ? (
                      <>Åtkomst nekad av laget.se. Kontrollera uppgifterna i inställningarna.</>
                    ) : registerResult.error.includes("RATE_LIMITED:") ? (
                      <>Laget.se blockerar tillfälligt. Vänta och försök igen.</>
                    ) : (
                      <>{registerResult.error}</>
                    )}
                  </span>
                ) : registerResult.noEvent ? (
                  <span>Inget event hittades idag eller imorgon.</span>
                ) : (
                  <span>
                    ✓ {registerResult.matched} matchade
                    {registerResult.unmatched.length > 0 && (
                      <> · {registerResult.unmatched.length} ej matchade: {registerResult.unmatched.join(", ")}</>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Spelarlista */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          <div className="space-y-0.5">
            {filteredPlayers.map((player) => {
              const isSelected = selectedPlayer?.id === player.id;
              return (
                <div key={player.id}>
                  <button
                    onClick={() => handlePlayerTap(player)}
                    data-draggable="true"
                    className={`
                      w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all
                      ${isSelected
                        ? "bg-emerald-500/20 border border-emerald-400/40 ring-1 ring-emerald-400/20"
                        : "bg-white/3 border border-transparent hover:bg-white/5"
                      }
                    `}
                  >
                    {/* Anmäld-indikator */}
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      player.isRegistered ? "bg-emerald-400" : player.isDeclined ? "bg-red-400" : "bg-white/15"
                    }`} />

                    {/* Position badge */}
                    <span className={`pos-badge pos-badge-sm pos-badge-${player.position.toLowerCase()}`}>
                      {player.position}
                    </span>

                    {/* Namn */}
                    <span className="text-[11px] text-white/80 font-medium truncate flex-1">
                      {player.name}
                    </span>

                    {/* Nummer */}
                    {player.number && (
                      <span className="text-[9px] text-white/30 font-mono">#{player.number}</span>
                    )}

                    {/* Pil om vald */}
                    {isSelected && <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />}
                  </button>

                  {/* Tap-to-assign knappar */}
                  {isSelected && onTapAssign && (
                    <div className="flex gap-1.5 px-2 py-1.5 ml-4">
                      <button
                        onClick={() => handleAssign("team-a")}
                        className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-300/10 border border-slate-300/30 text-slate-200 hover:bg-slate-300/20 transition-all"
                      >
                        → {teamAName}
                      </button>
                      <button
                        onClick={() => handleAssign("team-b")}
                        className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25 transition-all"
                      >
                        → {teamBName}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer med antal */}
        <div className="px-3 py-2 border-t border-white/10 text-[10px] text-white/30 text-center">
          {filteredPlayers.length} spelare visas
        </div>
      </div>
    </>
  );
}
