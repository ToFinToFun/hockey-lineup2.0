// Hockey Lineup App – MobileRosterDrawer
// Trupp-overlay som glider in från höger på mobil
// Visar spelarlistan med sök, filter och stöd för tap-to-assign med slot-picker
// 3-cell grid layout: name+number | badges | edit icon

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Users, ChevronRight, ChevronLeft, ClipboardCheck, Plus, Pencil, Trash2 } from "lucide-react";
import type { Player, Position, TeamColor, CaptainRole } from "@/lib/players";
import { ALL_POSITIONS, getPositionBadgeColor } from "@/lib/players";
import type { Slot, TeamConfig } from "@/lib/lineup";
import { useForwardColor } from "@/hooks/useForwardColor";
import { usePirSettings, usePirEnabled } from "@/hooks/usePirEnabled";
import { TeamColorIndicator } from "@/components/PlayerCard";

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
  onChangeRegistered?: (id: string, registered: boolean) => void;
  onBulkRegister?: (forceRefresh?: boolean) => Promise<{ matched: number; unmatched: string[]; eventTitle?: string; eventDate?: string; error?: string; noEvent?: boolean }>;
  onEventInfoUpdate?: (info: { title: string; date: string } | null) => void;
  totalRegistered?: number;
  totalDeclined?: number;
  totalPlayers?: number;
  // Tap-to-assign with slot selection
  onTapAssignToSlot?: (player: Player, slotId: string) => void;
  onAddDefensePair?: (team: "team-a" | "team-b") => void;
  onAddForwardLine?: (team: "team-a" | "team-b") => void;
  teamAName?: string;
  teamBName?: string;
  teamASlots?: Slot[];
  teamBSlots?: Slot[];
  teamAConfig?: TeamConfig;
  teamBConfig?: TeamConfig;
  lineup?: Record<string, Player>;
}

type AssignStep = "select-player" | "select-team" | "select-slot";

interface AssignFeedback {
  type: "success" | "error";
  message: string;
}

export function MobileRosterDrawer({
  open,
  onClose,
  players,
  onDeletePlayer,
  onChangePosition,
  onChangeTeamColor,
  onChangeNumber,
  onChangeName,
  onChangeCaptainRole,
  onChangeRegistered,
  onBulkRegister,
  onEventInfoUpdate,
  totalRegistered = 0,
  totalDeclined = 0,
  totalPlayers = 0,
  onTapAssignToSlot,
  onAddDefensePair,
  onAddForwardLine,
  teamAName = "Vita",
  teamBName = "Gröna",
  teamASlots = [],
  teamBSlots = [],
  teamAConfig,
  teamBConfig,
  lineup = {},
}: MobileRosterDrawerProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("Alla");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [assignStep, setAssignStep] = useState<AssignStep>("select-player");
  const [selectedTeam, setSelectedTeam] = useState<"team-a" | "team-b" | null>(null);
  const [feedback, setFeedback] = useState<AssignFeedback | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ matched: number; unmatched: string[]; error?: string; noEvent?: boolean } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { colors: fc } = useForwardColor();

  // Edit sheet state
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // PIR settings
  const pirEnabled = usePirEnabled();
  const pirSettings = usePirSettings();

  // Stäng med Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingPlayer) {
          setEditingPlayer(null);
          setConfirmDelete(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, editingPlayer]);

  // Reset selection when closing
  useEffect(() => {
    if (!open) {
      setSelectedPlayer(null);
      setAssignStep("select-player");
      setSelectedTeam(null);
      setSearch("");
      setFeedback(null);
      setEditingPlayer(null);
      setConfirmDelete(false);
    }
  }, [open]);

  // Auto-clear feedback
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const filteredPlayers = players.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.number && p.number.includes(search));
    const matchesPos = posFilter === "Alla" || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  const handlePlayerTap = useCallback((player: Player) => {
    if (selectedPlayer?.id === player.id) {
      // Deselect
      setSelectedPlayer(null);
      setAssignStep("select-player");
      setSelectedTeam(null);
    } else {
      setSelectedPlayer(player);
      setAssignStep("select-team");
      setFeedback(null);
    }
  }, [selectedPlayer]);

  const handleSelectTeam = useCallback((team: "team-a" | "team-b") => {
    setSelectedTeam(team);
    setAssignStep("select-slot");
  }, []);

  const handleBack = useCallback(() => {
    if (assignStep === "select-slot") {
      setAssignStep("select-team");
      setSelectedTeam(null);
    } else if (assignStep === "select-team") {
      setAssignStep("select-player");
      setSelectedPlayer(null);
      setSelectedTeam(null);
    }
  }, [assignStep]);

  const handleSelectSlot = useCallback((slotId: string, slotLabel: string) => {
    if (selectedPlayer && onTapAssignToSlot) {
      onTapAssignToSlot(selectedPlayer, slotId);
      setFeedback({
        type: "success",
        message: `${selectedPlayer.name} → ${slotLabel}`,
      });
      setSelectedPlayer(null);
      setAssignStep("select-player");
      setSelectedTeam(null);
    }
  }, [selectedPlayer, onTapAssignToSlot]);

  const handleAddPairAndAssign = useCallback((team: "team-a" | "team-b", type: "defense" | "forward") => {
    if (type === "defense" && onAddDefensePair) {
      onAddDefensePair(team);
    } else if (type === "forward" && onAddForwardLine) {
      onAddForwardLine(team);
    }
    // After adding, the new slots will appear on next render — user can then pick one
    setFeedback({
      type: "success",
      message: type === "defense" ? "Nytt backpar tillagt!" : "Ny kedja tillagd!",
    });
  }, [onAddDefensePair, onAddForwardLine]);

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

  // Open edit sheet for a player
  const handleOpenEdit = useCallback((player: Player, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPlayer(player);
    setEditName(player.name);
    setEditNumber(player.number ?? "");
    setConfirmDelete(false);
  }, []);

  // Close edit sheet
  const handleCloseEdit = useCallback(() => {
    setEditingPlayer(null);
    setConfirmDelete(false);
  }, []);

  // Get available slots for selected team
  const getAvailableSlots = () => {
    if (!selectedTeam) return { empty: [], occupied: [], canAddDefense: false, canAddForward: false };
    const slots = selectedTeam === "team-a" ? teamASlots : teamBSlots;
    const config = selectedTeam === "team-a" ? teamAConfig : teamBConfig;

    const empty = slots.filter(s => !lineup[s.id]);
    const occupied = slots.filter(s => !!lineup[s.id]);

    const canAddDefense = config ? config.defensePairs < 4 : false;
    const canAddForward = config ? config.forwardLines < 4 : false;

    return { empty, occupied, canAddDefense, canAddForward };
  };

  // Group slots by section
  const groupSlotsBySection = (slots: Slot[]) => {
    const groups: { label: string; type: string; slots: Slot[] }[] = [];
    const gkSlots = slots.filter(s => s.type === "goalkeeper");
    const defSlots = slots.filter(s => s.type === "defense");
    const fwdSlots = slots.filter(s => s.type === "forward");

    if (gkSlots.length > 0) groups.push({ label: "Målvakter", type: "goalkeeper", slots: gkSlots });

    // Group defense by groupLabel
    const defGroups = new Map<string, Slot[]>();
    for (const s of defSlots) {
      const key = s.groupLabel || "Backar";
      if (!defGroups.has(key)) defGroups.set(key, []);
      defGroups.get(key)!.push(s);
    }
    for (const [label, ss] of defGroups) {
      groups.push({ label, type: "defense", slots: ss });
    }

    // Group forwards by groupLabel
    const fwdGroups = new Map<string, Slot[]>();
    for (const s of fwdSlots) {
      const key = s.groupLabel || "Forwards";
      if (!fwdGroups.has(key)) fwdGroups.set(key, []);
      fwdGroups.get(key)!.push(s);
    }
    for (const [label, ss] of fwdGroups) {
      groups.push({ label, type: "forward", slots: ss });
    }

    return groups;
  };

  const teamName = selectedTeam === "team-a" ? teamAName : teamBName;
  const { empty: emptySlots, canAddDefense, canAddForward } = getAvailableSlots();

  // Determine if we have edit capabilities
  const hasEdit = !!(onChangeName || onChangeNumber || onChangePosition || onChangeTeamColor || onChangeCaptainRole || onChangeRegistered || onDeletePlayer);

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
            {assignStep !== "select-player" && (
              <button
                onClick={handleBack}
                className="p-1 rounded-lg glass-button text-white/60 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white tracking-wider uppercase" style={{ fontFamily: "'Oswald', sans-serif" }}>
              {assignStep === "select-player" ? "Trupp" : assignStep === "select-team" ? "Välj lag" : `${teamName}`}
            </span>
            {assignStep === "select-player" && (
              <span className="text-[10px] text-white/40">
                {totalRegistered}/{totalPlayers} anmälda
                {totalDeclined > 0 && <> · <span className="text-red-400/60">{totalDeclined} nej</span></>}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg glass-button text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div className={`mx-3 mt-2 text-[10px] px-2.5 py-1.5 rounded-lg border text-center font-semibold transition-all ${
            feedback.type === "success"
              ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
              : "bg-red-500/15 border-red-400/30 text-red-300"
          }`}>
            {feedback.message}
          </div>
        )}

        {/* ── STEP 1: Player list ── */}
        {assignStep === "select-player" && (
          <>
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

            {/* Spelarlista — 3-cell grid layout */}
            <div className="flex-1 overflow-y-auto px-2 py-1.5">
              <div className="space-y-0.5">
                {filteredPlayers.map((player) => {
                  const isSelected = selectedPlayer?.id === player.id;
                  const displayPosition = player.position;
                  const iceTimeMinutes = player.gamesPlayed != null && player.gamesPlayed > 0 ? player.gamesPlayed : null;
                  return (
                    <div
                      key={player.id}
                      className={`
                        grid items-center gap-1 px-2 py-1.5 rounded-lg transition-all
                        ${isSelected
                          ? "bg-emerald-500/20 border border-emerald-400/40 ring-1 ring-emerald-400/20"
                          : "bg-white/3 border border-transparent hover:bg-white/5"
                        }
                      `}
                      style={{ gridTemplateColumns: "1fr auto auto" }}
                    >
                      {/* Cell 1: Status dot + Name #number — clickable for tap-to-assign */}
                      <button
                        onClick={() => handlePlayerTap(player)}
                        className="flex items-center gap-1.5 min-w-0 text-left"
                      >
                        {/* Anmäld-indikator */}
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          player.isRegistered ? "bg-emerald-400" : player.isDeclined ? "bg-red-400" : "bg-white/15"
                        }`} />

                        {/* Namn + nummer */}
                        <span className="text-[11px] text-white/80 font-medium truncate">
                          {player.name}
                          {player.number && <span className="text-white/30 font-mono ml-1">#{player.number}</span>}
                        </span>

                        {/* Pil om vald */}
                        {isSelected && <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />}
                      </button>

                      {/* Cell 2: Badges — fixed width, vertically aligned across rows */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <TeamColorIndicator teamColor={player.teamColor ?? null} compact mostPlayedTeam={!player.teamColor ? player.mostPlayedTeam : undefined} />
                        <span className={`pos-badge pos-badge-sm pos-badge-${displayPosition.toLowerCase()} shrink-0`}>
                          {displayPosition}
                        </span>
                        {player.mostPlayedPosition && (
                          <span className={`pos-badge pos-badge-xs pos-badge-${player.mostPlayedPosition.toLowerCase()} shrink-0 ${
                            player.mostPlayedPosition === displayPosition ? 'opacity-30' : ''
                          }`}
                            title={`Vanligaste position: ${player.mostPlayedPosition}`}>
                            {player.mostPlayedPosition}
                          </span>
                        )}
                        {iceTimeMinutes != null && (
                          <span className="ice-time-badge ice-time-badge-compact shrink-0" title={`Matcher: ${iceTimeMinutes}`}>
                            {iceTimeMinutes}ʼ
                          </span>
                        )}
                        {player.captainRole && (
                          <span className={`text-[8px] font-black px-1 py-0.5 rounded shrink-0 ${
                            player.captainRole === "C"
                              ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/40"
                              : "bg-orange-400/20 text-orange-300 border border-orange-400/40"
                          }`}>{player.captainRole}</span>
                        )}
                        {pirEnabled && pirSettings.showRating && player.pir != null && (
                          <span
                            className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 border ${
                              player.pir >= 1050 ? 'bg-amber-400/15 text-amber-300 border-amber-400/30'
                              : player.pir >= 1000 ? 'bg-white/5 text-white/50 border-white/15'
                              : 'bg-sky-400/10 text-sky-300/60 border-sky-400/20'
                            }`}
                            title={`PIR: ${player.pir}`}
                          >
                            {player.pir}
                          </span>
                        )}
                        {pirEnabled && pirSettings.showTrend && player.pirTrendLabel && player.pirTrendLabel !== 'stable' && (
                          <span
                            className={`text-[9px] shrink-0 ${
                              player.pirTrendLabel === 'rising' ? 'text-emerald-400'
                              : player.pirTrendLabel === 'slightly_rising' ? 'text-emerald-400/60'
                              : player.pirTrendLabel === 'slightly_falling' ? 'text-red-400/60'
                              : 'text-red-400'
                            }`}
                            title={`Trend: ${player.pirTrend != null ? (player.pirTrend > 0 ? '+' : '') + player.pirTrend : '?'}`}
                          >
                            {player.pirTrendLabel === 'rising' ? '\u2191'
                              : player.pirTrendLabel === 'slightly_rising' ? '\u2197'
                              : player.pirTrendLabel === 'slightly_falling' ? '\u2198'
                              : '\u2193'}
                          </span>
                        )}
                      </div>

                      {/* Cell 3: Edit icon */}
                      {hasEdit && (
                        <button
                          onClick={(e) => handleOpenEdit(player, e)}
                          className="p-1 rounded text-white/25 hover:text-white/60 hover:bg-white/10 transition-all shrink-0"
                          title="Redigera spelare"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
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
          </>
        )}

        {/* ── STEP 2: Select team ── */}
        {assignStep === "select-team" && selectedPlayer && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            {/* Selected player info */}
            <div className="text-center mb-2">
              <span className={`pos-badge pos-badge-sm pos-badge-${selectedPlayer.position.toLowerCase()} inline-block mb-1`}>
                {selectedPlayer.position}
              </span>
              <div className="text-white font-bold text-base">
                {selectedPlayer.name}
                {selectedPlayer.number && <span className="text-white/40 font-normal ml-1.5">#{selectedPlayer.number}</span>}
              </div>
              <div className="text-[10px] text-white/40 mt-1">Välj lag att placera i</div>
            </div>

            {/* Team buttons */}
            <button
              onClick={() => handleSelectTeam("team-a")}
              className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-slate-300/10 border-2 border-slate-300/30 text-slate-200 hover:bg-slate-300/20 hover:border-slate-300/50 transition-all flex items-center justify-center gap-2"
            >
              <img src="/images/logo-white.png" className="w-5 h-5" alt="" />
              {teamAName}
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>
            <button
              onClick={() => handleSelectTeam("team-b")}
              className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-emerald-500/15 border-2 border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/50 transition-all flex items-center justify-center gap-2"
            >
              <img src="/images/logo-green.png" className="w-5 h-5" alt="" />
              {teamBName}
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>
          </div>
        )}

        {/* ── STEP 3: Select slot ── */}
        {assignStep === "select-slot" && selectedPlayer && selectedTeam && (
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* Selected player reminder */}
            <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-white/5 border border-white/8">
              <span className={`pos-badge pos-badge-sm pos-badge-${selectedPlayer.position.toLowerCase()}`}>
                {selectedPlayer.position}
              </span>
              <span className="text-[11px] text-white/70 font-medium truncate">
                {selectedPlayer.name}
              </span>
              <span className="text-[9px] text-white/30 ml-auto">→ {teamName}</span>
            </div>

            {emptySlots.length === 0 ? (
              /* No empty slots */
              <div className="text-center py-6">
                <div className="text-white/40 text-xs mb-3">Alla platser i {teamName} är fulla</div>
                <div className="space-y-2">
                  {canAddDefense && (
                    <button
                      onClick={() => handleAddPairAndAssign(selectedTeam, "defense")}
                      className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 border border-blue-400/30 text-blue-300 hover:bg-blue-500/25 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Lägg till backpar
                    </button>
                  )}
                  {canAddForward && (
                    <button
                      onClick={() => handleAddPairAndAssign(selectedTeam, "forward")}
                      className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 border border-purple-400/30 text-purple-300 hover:bg-purple-500/25 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Lägg till kedja
                    </button>
                  )}
                  {!canAddDefense && !canAddForward && (
                    <div className="text-[10px] text-white/30">Max antal backpar och kedjor nått.</div>
                  )}
                </div>
              </div>
            ) : (
              /* Show available slots grouped by section */
              <div className="space-y-3">
                {groupSlotsBySection(emptySlots).map((group) => (
                  <div key={group.label}>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/40 mb-1 px-1">
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {group.slots.map((slot) => {
                        // Highlight slots matching player's position
                        const isMatch =
                          (slot.type === "goalkeeper" && selectedPlayer.position === "MV") ||
                          (slot.type === "defense" && selectedPlayer.position === "B") ||
                          (slot.type === "forward" && (selectedPlayer.position === "F" || selectedPlayer.position === "C"));
                        return (
                          <button
                            key={slot.id}
                            onClick={() => handleSelectSlot(slot.id, `${group.label} — ${slot.shortLabel}`)}
                            className={`
                              w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all
                              ${isMatch
                                ? "bg-emerald-500/15 border border-emerald-400/30 hover:bg-emerald-500/25"
                                : "bg-white/3 border border-white/8 hover:bg-white/8"
                              }
                            `}
                          >
                            <span className={`text-[10px] font-bold w-6 text-center ${
                              isMatch ? "text-emerald-300" : "text-white/50"
                            }`}>
                              {slot.shortLabel}
                            </span>
                            <span className={`text-[10px] ${isMatch ? "text-emerald-200/70" : "text-white/30"}`}>
                              {slot.label}
                            </span>
                            {isMatch && (
                              <span className="ml-auto text-[8px] text-emerald-400/60 uppercase tracking-wider">
                                Passar
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Add more options at the bottom */}
                {(canAddDefense || canAddForward) && (
                  <div className="pt-2 border-t border-white/8 space-y-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 px-1">
                      Eller lägg till fler platser
                    </div>
                    {canAddDefense && (
                      <button
                        onClick={() => handleAddPairAndAssign(selectedTeam, "defense")}
                        className="w-full py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-400/20 text-blue-300/70 hover:bg-blue-500/20 transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Lägg till backpar
                      </button>
                    )}
                    {canAddForward && (
                      <button
                        onClick={() => handleAddPairAndAssign(selectedTeam, "forward")}
                        className="w-full py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 border border-purple-400/20 text-purple-300/70 hover:bg-purple-500/20 transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Lägg till kedja
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit Sheet (slides up from bottom) ── */}
      {editingPlayer && (
        <>
          {/* Edit sheet backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-[60] transition-opacity"
            onClick={handleCloseEdit}
          />
          {/* Edit sheet panel */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[61] glass-panel-strong rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Player header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <span className={`pos-badge pos-badge-sm pos-badge-${editingPlayer.position.toLowerCase()}`}>
                  {editingPlayer.position}
                </span>
                <span className="text-white font-bold text-sm">
                  {editingPlayer.name}
                  {editingPlayer.number && <span className="text-white/40 font-normal ml-1">#{editingPlayer.number}</span>}
                </span>
              </div>
              <button
                onClick={handleCloseEdit}
                className="p-1.5 rounded-lg glass-button text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Edit form */}
            <div className="px-4 pb-6 space-y-3">
              {/* Name field */}
              {onChangeName && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Namn:</span>
                  <input
                    type="text"
                    value={editName}
                    maxLength={40}
                    placeholder="Spelarens namn"
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editName.trim()) {
                        onChangeName(editingPlayer.id, editName.trim());
                        // Update local reference
                        setEditingPlayer({ ...editingPlayer, name: editName.trim() });
                      }
                    }}
                    onBlur={() => {
                      if (editName.trim() && editName.trim() !== editingPlayer.name) {
                        onChangeName(editingPlayer.id, editName.trim());
                        setEditingPlayer({ ...editingPlayer, name: editName.trim() });
                      }
                    }}
                    className="flex-1 bg-white/10 border border-emerald-400/40 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
                  />
                </div>
              )}

              {/* Number field */}
              {onChangeNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Nr:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white/50 text-xs">#</span>
                    <input
                      type="text"
                      value={editNumber}
                      maxLength={3}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        setEditNumber(v);
                        onChangeNumber(editingPlayer.id, v);
                      }}
                      className="w-14 bg-white/10 border border-emerald-400/40 rounded px-2 py-1.5 text-xs text-white text-center outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              )}

              {/* Team color */}
              {onChangeTeamColor && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Lag:</span>
                  <div className="flex items-center gap-1.5">
                    {([
                      { value: "white" as TeamColor, label: "Vita" },
                      { value: "green" as TeamColor, label: "Gröna" },
                      { value: null, label: "Waivers" },
                    ] as { value: TeamColor; label: string }[]).map(({ value, label }) => (
                      <button
                        key={String(value)}
                        onClick={() => {
                          onChangeTeamColor(editingPlayer.id, value);
                          setEditingPlayer({ ...editingPlayer, teamColor: value });
                        }}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded border transition-all ${
                          (editingPlayer.teamColor ?? null) === value
                            ? "bg-white/15 text-white/80 border-white/30 ring-1 ring-white/20"
                            : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                        }`}
                      >
                        <TeamColorIndicator teamColor={value} compact />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Position */}
              {onChangePosition && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Pos:</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {ALL_POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        onClick={() => {
                          onChangePosition(editingPlayer.id, pos);
                          setEditingPlayer({ ...editingPlayer, position: pos });
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${
                          editingPlayer.position === pos
                            ? `${getPositionBadgeColor(pos, fc.badgeBg)} ring-1 ring-white/30`
                            : "bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 hover:text-white/50"
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Captain role */}
              {onChangeCaptainRole && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Roll:</span>
                  <div className="flex items-center gap-1.5">
                    {([
                      { value: "C" as CaptainRole, label: "C" },
                      { value: "A" as CaptainRole, label: "A" },
                      { value: null, label: "—" },
                    ] as { value: CaptainRole; label: string }[]).map(({ value, label }) => (
                      <button
                        key={String(value)}
                        onClick={() => {
                          onChangeCaptainRole(editingPlayer.id, value);
                          setEditingPlayer({ ...editingPlayer, captainRole: value });
                        }}
                        className={`text-[10px] font-black px-2.5 py-1.5 rounded border transition-all ${
                          editingPlayer.captainRole === value
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
              )}

              {/* Registered toggle */}
              {onChangeRegistered && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px] w-8 shrink-0">Anm:</span>
                  <button
                    onClick={() => {
                      const newVal = !editingPlayer.isRegistered;
                      onChangeRegistered(editingPlayer.id, newVal);
                      setEditingPlayer({ ...editingPlayer, isRegistered: newVal });
                    }}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded border transition-all ${
                      editingPlayer.isRegistered
                        ? "bg-emerald-400/25 text-emerald-300 border-emerald-400/50 ring-1 ring-emerald-400/30"
                        : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                    }`}
                  >
                    {editingPlayer.isRegistered ? "✓ Anmäld" : "Ej anmäld"}
                  </button>
                </div>
              )}

              {/* Delete player */}
              {onDeletePlayer && (
                <div className="pt-2 border-t border-white/10">
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/15 border border-red-400/20 hover:border-red-400/40 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Ta bort spelare
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] text-red-300 text-center font-medium">
                        Är du säker på att ta bort {editingPlayer.name}?
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            onDeletePlayer(editingPlayer.id);
                            handleCloseEdit();
                          }}
                          className="flex-1 py-2 rounded-lg text-xs font-bold bg-red-500/25 text-red-300 border border-red-400/50 hover:bg-red-500/40 transition-all"
                        >
                          Ja, ta bort
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-all"
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
