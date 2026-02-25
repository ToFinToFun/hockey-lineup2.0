// Hockey Lineup App – Home
// Design: Industrial Ice Arena
// - Firebase Realtime Database synkronisering (alla användare ser samma data)
// - localStorage som fallback om Firebase är offline
// - Ångra-funktion (Ctrl+Z + knapp i header)
// - In-app bekräftelsedialog för Rensa

import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { initialPlayers, type Player, type Position, type TeamColor } from "@/lib/players";
import { createTeamSlots } from "@/lib/lineup";
import { PlayerList } from "@/components/PlayerList";
import { TeamPanel } from "@/components/TeamPanel";
import { PlayerCardOverlay } from "@/components/PlayerCard";
import { ExportModal } from "@/components/ExportModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { saveStateToFirebase, subscribeToFirebase, type AppState } from "@/lib/firebase";
import { Download, Wifi, WifiOff, Undo2 } from "lucide-react";

type MobileTab = "vita" | "trupp" | "grona";

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

const STORAGE_KEY = "stalstadens-lineup-v2";
const MAX_UNDO = 30; // max antal steg i ångra-historiken

// Alla slots för respektive lag (skapas en gång, ändras ej)
const TEAM_A_SLOTS = createTeamSlots("team-a");
const TEAM_B_SLOTS = createTeamSlots("team-b");

// Alla giltiga slot-IDs
const ALL_SLOT_IDS = new Set([
  ...TEAM_A_SLOTS.map((s) => s.id),
  ...TEAM_B_SLOTS.map((s) => s.id),
]);

interface SavedState {
  availablePlayers: Player[];
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
}

// En snapshot av det relevanta state som kan ångras
interface UndoSnapshot {
  availablePlayers: Player[];
  lineup: Record<string, Player>;
}

function loadLocalState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedState;
  } catch {
    return null;
  }
}

function saveLocalState(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignorera storage-fel
  }
}

export default function Home() {
  const local = loadLocalState();

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(
    local?.availablePlayers ?? initialPlayers
  );
  const [teamAName, setTeamAName] = useState(local?.teamAName ?? "VITA");
  const [teamBName, setTeamBName] = useState(local?.teamBName ?? "GRÖNA");
  const [lineup, setLineup] = useState<Record<string, Player>>(local?.lineup ?? {});

  // Ref som alltid pekar på senaste lineup-värdet (undviker stale closure)
  const lineupRef = useRef<Record<string, Player>>(local?.lineup ?? {});
  useEffect(() => { lineupRef.current = lineup; }, [lineup]);

  // Ref för availablePlayers (undviker stale closure i undo)
  const availablePlayersRef = useRef<Player[]>(local?.availablePlayers ?? initialPlayers);
  useEffect(() => { availablePlayersRef.current = availablePlayers; }, [availablePlayers]);

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null);

  // Ångra-historik
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const skipNextUndoSnapshot = useRef(false); // hoppa över snapshot vid ångra-återställning

  // Bekräftelsedialog för Rensa
  const [confirmClear, setConfirmClear] = useState<{ teamPrefix: string; teamName: string } | null>(null);

  // Prevent writing back to Firebase when we just received an update from it
  const isReceivingFromFirebase = useRef(false);
  // Track if we've received the initial Firebase state
  const hasReceivedInitial = useRef(false);

  const exportRef = useRef<HTMLDivElement>(null);

  // Subscribe to Firebase on mount
  useEffect(() => {
    const unsubscribe = subscribeToFirebase((state: AppState | null) => {
      setFirebaseConnected(true);
      if (state) {
        isReceivingFromFirebase.current = true;
        skipNextUndoSnapshot.current = true; // Firebase-uppdateringar ska inte läggas i undo-stacken
        setAvailablePlayers(state.players ?? initialPlayers);
        setLineup(state.lineup ?? {});
        setTeamAName(state.teamAName ?? "VITA");
        setTeamBName(state.teamBName ?? "GRÖNA");
        // Allow re-renders to settle before re-enabling writes
        setTimeout(() => {
          isReceivingFromFirebase.current = false;
        }, 100);
      } else if (!hasReceivedInitial.current) {
        // No data in Firebase yet — push our local state up
        const localState = loadLocalState();
        if (localState) {
          saveStateToFirebase({
            players: localState.availablePlayers,
            lineup: localState.lineup,
            teamAName: localState.teamAName,
            teamBName: localState.teamBName,
          });
        }
      }
      hasReceivedInitial.current = true;
    });

    return unsubscribe;
  }, []);

  // Save to both Firebase and localStorage on every state change
  useEffect(() => {
    if (isReceivingFromFirebase.current) return;
    if (!hasReceivedInitial.current) return;

    const state: SavedState = { availablePlayers, lineup, teamAName, teamBName };
    saveLocalState(state);
    saveStateToFirebase({
      players: availablePlayers,
      lineup,
      teamAName,
      teamBName,
    });
  }, [availablePlayers, lineup, teamAName, teamBName]);

  // Spara en snapshot i undo-stacken
  const pushUndo = useCallback(() => {
    if (skipNextUndoSnapshot.current) {
      skipNextUndoSnapshot.current = false;
      return;
    }
    const snapshot: UndoSnapshot = {
      availablePlayers: availablePlayersRef.current,
      lineup: lineupRef.current,
    };
    setUndoStack((prev) => {
      const next = [...prev, snapshot];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
  }, []);

  // Återställ senaste snapshot
  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      isReceivingFromFirebase.current = true;
      skipNextUndoSnapshot.current = true;
      setAvailablePlayers(snapshot.availablePlayers);
      setLineup(snapshot.lineup);
      setTimeout(() => {
        isReceivingFromFirebase.current = false;
      }, 200);
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  // Ctrl+Z / Cmd+Z tangentbordsgenväg
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,      // 150ms long-press to start drag
        tolerance: 8,    // allow 8px movement before cancelling
      },
    })
  );

  const findPlayerSlot = useCallback(
    (playerId: string): string | null => {
      for (const [slotId, p] of Object.entries(lineup)) {
        if (p.id === playerId) return slotId;
      }
      return null;
    },
    [lineup]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const player = event.active.data.current?.player as Player;
    setActivePlayer(player || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePlayer(null);
    const { active, over } = event;
    if (!over) return;

    const playerId = active.id as string;
    const targetId = over.id as string;

    if (!ALL_SLOT_IDS.has(targetId) && targetId !== "player-list") return;

    const sourceSlot = findPlayerSlot(playerId);

    const player =
      sourceSlot
        ? lineup[sourceSlot]
        : availablePlayers.find((p) => p.id === playerId);
    if (!player) return;

    pushUndo(); // spara snapshot innan drag-ändringen

    if (targetId === "player-list") {
      if (!sourceSlot) return;
      setLineup((prev) => {
        const next = { ...prev };
        delete next[sourceSlot];
        return next;
      });
      setAvailablePlayers((prev) => [player, ...prev]);
      return;
    }

    const existingInTarget = lineup[targetId];

    setLineup((prev) => {
      const next = { ...prev };
      if (sourceSlot) {
        delete next[sourceSlot];
      } else {
        setAvailablePlayers((prev) => prev.filter((p) => p.id !== playerId));
      }
      if (existingInTarget) {
        if (sourceSlot) {
          next[sourceSlot] = existingInTarget;
        } else {
          setAvailablePlayers((prev) => [existingInTarget, ...prev]);
        }
      }
      next[targetId] = player;
      return next;
    });
  };

  const handleRemoveFromSlot = useCallback((slotId: string) => {
    const player = lineup[slotId];
    if (!player) return;
    pushUndo();
    setLineup((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setAvailablePlayers((prev) => [player, ...prev]);
  }, [lineup, pushUndo]);

  const handleAddPlayer = useCallback((player: Player) => {
    setAvailablePlayers((prev) => [...prev, player]);
  }, []);

  const handleDeletePlayer = useCallback((playerId: string) => {
    pushUndo();
    setAvailablePlayers((prev) => prev.filter((p) => p.id !== playerId));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) delete next[slotId];
      }
      return next;
    });
  }, [pushUndo]);

  const handleChangeTeamColor = useCallback((playerId: string, color: TeamColor) => {
    const update = (p: Player) => p.id === playerId ? { ...p, teamColor: color } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  const handleChangePosition = useCallback((playerId: string, pos: Position) => {
    const update = (p: Player) => p.id === playerId ? { ...p, position: pos } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  // Öppna bekräftelsedialog för Rensa
  const handleRequestClearTeam = useCallback((teamPrefix: string, teamName: string) => {
    setConfirmClear({ teamPrefix, teamName });
  }, []);

  // Utför Rensa efter bekräftelse
  const handleConfirmClearTeam = useCallback(() => {
    if (!confirmClear) return;
    setConfirmClear(null);

    const { teamPrefix } = confirmClear;

    // Blockera inkommande Firebase-uppdateringar under operationen
    isReceivingFromFirebase.current = true;

    const currentLineup = lineupRef.current;
    const removedPlayers: Player[] = [];
    const newLineup: Record<string, Player> = {};
    for (const [slotId, player] of Object.entries(currentLineup)) {
      if (slotId.startsWith(teamPrefix)) {
        removedPlayers.push(player);
      } else {
        newLineup[slotId] = player;
      }
    }

    if (removedPlayers.length > 0) {
      pushUndo(); // spara snapshot innan rensning
      setLineup(newLineup);
      setAvailablePlayers((prev) => [...removedPlayers, ...prev]);
    }

    // Återaktivera Firebase-synk efter att React hunnit rendera
    setTimeout(() => {
      isReceivingFromFirebase.current = false;
    }, 200);
  }, [confirmClear, pushUndo]);

  const handleChangeNumber = useCallback((playerId: string, number: string) => {
    const update = (p: Player) => p.id === playerId ? { ...p, number } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  const [mobileTab, setMobileTab] = useState<MobileTab>("trupp");

  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  for (const [slotId, player] of Object.entries(lineup)) {
    if (slotId.startsWith("team-a-")) teamALineup[slotId] = player;
    else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player;
  }

  const teamACount = Object.keys(teamALineup).length;
  const teamBCount = Object.keys(teamBLineup).length;
  const totalSlots = TEAM_A_SLOTS.length; // same for both teams

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Bakgrundsbild */}
      <div
        className="min-h-screen w-full relative"
        style={{
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />

        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Header */}
          <header className="px-4 pt-4 pb-2 shrink-0">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div>
                <h1
                  className="text-2xl md:text-3xl font-black text-white tracking-widest uppercase"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  Stålstadens
                  <span className="text-emerald-400 ml-2">Lineup</span>
                </h1>
                <p className="text-white/40 text-xs tracking-wider uppercase">
                  A-lag Herrar · Formations-verktyg
                </p>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                {/* Firebase sync status */}
                <div className="flex items-center gap-1.5">
                  {firebaseConnected === null ? (
                    <span className="text-white/30 text-[10px] uppercase tracking-wider">Ansluter...</span>
                  ) : firebaseConnected ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400/70 text-[10px] uppercase tracking-wider">Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-red-400" />
                      <span className="text-red-400/70 text-[10px] uppercase tracking-wider">Offline</span>
                    </>
                  )}
                </div>

                <div className="hidden md:flex items-center gap-3 text-xs text-white/40">
                  {[
                    { color: "bg-amber-400", label: "MV" },
                    { color: "bg-blue-400", label: "Back" },
                    { color: "bg-emerald-400", label: "LW / RW" },
                    { color: "bg-purple-400", label: "Center" },
                  ].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
                      {label}
                    </span>
                  ))}
                  <span className="text-white/20 ml-1 text-[10px] italic">
                    Dra spelare till en plats · Klicka badge för att ändra position
                  </span>
                </div>

                {/* Ångra-knapp */}
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  title="Ångra senaste åtgärd (Ctrl+Z)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white/50 text-xs font-bold hover:bg-white/10 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Ångra</span>
                  {undoStack.length > 0 && (
                    <span className="text-[9px] text-white/30">({undoStack.length})</span>
                  )}
                </button>

                {/* Export-knapp */}
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all uppercase tracking-wider"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Exportera</span>
                </button>
              </div>
            </div>
          </header>

          {/* Mobilflikar – syns bara på smala skärmar */}
          <div className="md:hidden flex gap-0 px-2 pb-2 shrink-0">
            {([
              { key: "vita" as MobileTab, label: `${teamAName} (${teamACount}/${totalSlots})`, color: "border-slate-300/60 text-slate-200" },
              { key: "trupp" as MobileTab, label: "Trupp", color: "border-emerald-400/60 text-emerald-300" },
              { key: "grona" as MobileTab, label: `${teamBName} (${teamBCount}/${totalSlots})`, color: "border-emerald-500/60 text-emerald-400" },
            ]).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                className={`
                  flex-1 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all
                  ${mobileTab === key
                    ? `${color} bg-white/5`
                    : "border-transparent text-white/30 hover:text-white/50"}
                `}
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                {label}
              </button>
            ))}
          </div>

          <main className="flex-1 px-2 md:px-4 pb-4 min-h-0" ref={exportRef}>
            {/* Desktop grid */}
            <div
              className="hidden md:grid gap-2 md:gap-3 h-full"
              style={{
                gridTemplateColumns: "minmax(520px, 1fr) 300px minmax(520px, 1fr)",
                height: "calc(100vh - 90px)",
              }}
            >
              {/* Lag A (VITA) – vänster */}
              <TeamPanel
                teamId="team-a"
                teamName={teamAName}
                slots={TEAM_A_SLOTS}
                lineup={teamALineup}
                onRemovePlayer={handleRemoveFromSlot}
                onChangePosition={handleChangePosition}
                onRenameTeam={setTeamAName}
                onClearTeam={() => handleRequestClearTeam("team-a-", teamAName)}
                isWhite
              />

              {/* Spelarlista (mitten) */}
              <PlayerList
                players={availablePlayers}
                onAddPlayer={handleAddPlayer}
                onDeletePlayer={handleDeletePlayer}
                onChangePosition={handleChangePosition}
                onChangeTeamColor={handleChangeTeamColor}
                onChangeNumber={handleChangeNumber}
              />

              {/* Lag B (GRÖNA) – höger */}
              <TeamPanel
                teamId="team-b"
                teamName={teamBName}
                slots={TEAM_B_SLOTS}
                lineup={teamBLineup}
                onRemovePlayer={handleRemoveFromSlot}
                onChangePosition={handleChangePosition}
                onRenameTeam={setTeamBName}
                onClearTeam={() => handleRequestClearTeam("team-b-", teamBName)}
                isWhite={false}
              />
            </div>

            {/* Mobilvy – en flik i taget */}
            <div
              className="md:hidden h-full"
              style={{ height: "calc(100vh - 130px)" }}
            >
              {mobileTab === "vita" && (
                <TeamPanel
                  teamId="team-a"
                  teamName={teamAName}
                  slots={TEAM_A_SLOTS}
                  lineup={teamALineup}
                  onRemovePlayer={handleRemoveFromSlot}
                  onChangePosition={handleChangePosition}
                  onRenameTeam={setTeamAName}
                  onClearTeam={() => handleRequestClearTeam("team-a-", teamAName)}
                  isWhite
                />
              )}
              {mobileTab === "trupp" && (
                <PlayerList
                  players={availablePlayers}
                  onAddPlayer={handleAddPlayer}
                  onDeletePlayer={handleDeletePlayer}
                  onChangePosition={handleChangePosition}
                  onChangeTeamColor={handleChangeTeamColor}
                  onChangeNumber={handleChangeNumber}
                />
              )}
              {mobileTab === "grona" && (
                <TeamPanel
                  teamId="team-b"
                  teamName={teamBName}
                  slots={TEAM_B_SLOTS}
                  lineup={teamBLineup}
                  onRemovePlayer={handleRemoveFromSlot}
                  onChangePosition={handleChangePosition}
                  onRenameTeam={setTeamBName}
                  onClearTeam={() => handleRequestClearTeam("team-b-", teamBName)}
                  isWhite={false}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activePlayer ? <PlayerCardOverlay player={activePlayer} /> : null}
      </DragOverlay>

      {/* Export-modal */}
      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          teamAName={teamAName}
          teamBName={teamBName}
          teamALineup={teamALineup}
          teamBLineup={teamBLineup}
          teamASlots={TEAM_A_SLOTS}
          teamBSlots={TEAM_B_SLOTS}
          logoGreen={LOGO_GREEN}
          logoWhite={LOGO_WHITE}
          bgUrl={BG_URL}
        />
      )}

      {/* Bekräftelsedialog för Rensa */}
      {confirmClear && (
        <ConfirmDialog
          title="Rensa lag"
          message={`Vill du flytta tillbaka alla spelare från ${confirmClear.teamName} till spelartruppen?`}
          confirmLabel="Rensa"
          cancelLabel="Avbryt"
          danger
          onConfirm={handleConfirmClearTeam}
          onCancel={() => setConfirmClear(null)}
        />
      )}
    </DndContext>
  );
}
