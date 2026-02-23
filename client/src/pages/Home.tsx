// Hockey Lineup App – Home
// Design: Industrial Ice Arena
// - localStorage-sparning av alla ändringar
// - Ta bort spelare från listan
// - Export av uppställning (bild för sociala medier + A4-format)

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
import { Download } from "lucide-react";

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

const STORAGE_KEY = "stalstadens-lineup-v2";

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

function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedState;
  } catch {
    return null;
  }
}

function saveState(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignorera storage-fel
  }
}

export default function Home() {
  const saved = loadState();

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(
    saved?.availablePlayers ?? initialPlayers
  );
  const [teamAName, setTeamAName] = useState(saved?.teamAName ?? "VITA");
  const [teamBName, setTeamBName] = useState(saved?.teamBName ?? "GRÖNA");
  const [lineup, setLineup] = useState<Record<string, Player>>(saved?.lineup ?? {});
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [showExport, setShowExport] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);

  // Spara till localStorage vid varje ändring
  useEffect(() => {
    saveState({ availablePlayers, lineup, teamAName, teamBName });
  }, [availablePlayers, lineup, teamAName, teamBName]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
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
    setLineup((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setAvailablePlayers((prev) => [player, ...prev]);
  }, [lineup]);

  const handleAddPlayer = useCallback((player: Player) => {
    setAvailablePlayers((prev) => [...prev, player]);
  }, []);

  // Ta bort spelare permanent
  const handleDeletePlayer = useCallback((playerId: string) => {
    setAvailablePlayers((prev) => prev.filter((p) => p.id !== playerId));
    // Om spelaren sitter i ett slot, ta bort den därifrån också
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) delete next[slotId];
      }
      return next;
    });
  }, []);

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

  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  for (const [slotId, player] of Object.entries(lineup)) {
    if (slotId.startsWith("team-a-")) teamALineup[slotId] = player;
    else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player;
  }

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
              <div className="flex items-center gap-3">
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
                {/* Export-knapp */}
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all uppercase tracking-wider"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportera
                </button>
              </div>
            </div>
          </header>

          {/* Tre-kolumns layout */}
          <main className="flex-1 px-2 md:px-4 pb-4 min-h-0" ref={exportRef}>
            <div className="max-w-7xl mx-auto h-full">
              <div
                className="grid gap-2 md:gap-3 h-full"
                style={{
                  gridTemplateColumns: "minmax(460px, 1fr) minmax(240px, 280px) minmax(460px, 1fr)",
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
                  isWhite
                />

                {/* Spelarlista (mitten) */}
                <PlayerList
                  players={availablePlayers}
                  onAddPlayer={handleAddPlayer}
                  onDeletePlayer={handleDeletePlayer}
                  onChangePosition={handleChangePosition}
                  onChangeTeamColor={handleChangeTeamColor}
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
                  isWhite={false}
                />
              </div>
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
    </DndContext>
  );
}
