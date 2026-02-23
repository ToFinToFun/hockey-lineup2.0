// Hockey Lineup App – Huvudsida med fasta slots
// Design: Industrial Ice Arena
// - Fasta namngivna platser per lag (MV, Res-MV, Backpar 1-4, Kedjor 1-4 LW/C/RW)
// - Drag spelare från listan till en specifik plats
// - Klicka X på en plats för att returnera spelaren till listan

import { useState, useCallback } from "react";
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

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

// Alla slots för respektive lag (skapas en gång, ändras ej)
const TEAM_A_SLOTS = createTeamSlots("team-a");
const TEAM_B_SLOTS = createTeamSlots("team-b");

// Alla giltiga slot-IDs
const ALL_SLOT_IDS = new Set([
  ...TEAM_A_SLOTS.map((s) => s.id),
  ...TEAM_B_SLOTS.map((s) => s.id),
]);

export default function Home() {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(initialPlayers);
  const [teamAName, setTeamAName] = useState("GRÖNA");
  const [teamBName, setTeamBName] = useState("VITA");

  // lineup: slotId -> Player
  const [lineup, setLineup] = useState<Record<string, Player>>({});

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Hitta vilket slot en spelare sitter i (null = i listan)
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

    // Målet måste vara ett slot
    if (!ALL_SLOT_IDS.has(targetId) && targetId !== "player-list") return;

    const sourceSlot = findPlayerSlot(playerId);

    // Hämta spelaren
    const player =
      sourceSlot
        ? lineup[sourceSlot]
        : availablePlayers.find((p) => p.id === playerId);
    if (!player) return;

    // Dra tillbaka till listan
    if (targetId === "player-list") {
      if (!sourceSlot) return; // redan i listan
      setLineup((prev) => {
        const next = { ...prev };
        delete next[sourceSlot];
        return next;
      });
      setAvailablePlayers((prev) => [player, ...prev]);
      return;
    }

    // Dra till ett slot
    const existingInTarget = lineup[targetId];

    setLineup((prev) => {
      const next = { ...prev };

      // Ta bort från källan
      if (sourceSlot) {
        delete next[sourceSlot];
      } else {
        // Ta bort från tillgängliga spelare
        setAvailablePlayers((prev) => prev.filter((p) => p.id !== playerId));
      }

      // Om målet redan har en spelare – byt plats eller returnera till listan
      if (existingInTarget) {
        if (sourceSlot) {
          // Byt plats: lägg den befintliga i källsloten
          next[sourceSlot] = existingInTarget;
        } else {
          // Spelaren kom från listan – returnera befintlig till listan
          setAvailablePlayers((prev) => [existingInTarget, ...prev]);
        }
      }

      next[targetId] = player;
      return next;
    });
  };

  // Ta bort spelare från slot → tillbaka till listan
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

  // Ändra lag-tillhörighet för en spelare oavsett var den befinner sig
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

  // Ändra position för en spelare oavsett var den befinner sig
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

  // Filtrera lineup per lag
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
        {/* Mörkt overlay */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />

        {/* Innehåll */}
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
            </div>
          </header>

          {/* Tre-kolumns layout */}
          <main className="flex-1 px-2 md:px-4 pb-4 min-h-0">
            <div className="max-w-7xl mx-auto h-full">
              <div
                className="grid gap-2 md:gap-3 h-full"
                style={{
                  gridTemplateColumns: "1fr minmax(190px, 230px) 1fr",
                  height: "calc(100vh - 90px)",
                }}
              >
                {/* Lag A */}
                <TeamPanel
                  teamId="team-a"
                  teamName={teamAName}
                  slots={TEAM_A_SLOTS}
                  lineup={teamALineup}
                  onRemovePlayer={handleRemoveFromSlot}
                  onChangePosition={handleChangePosition}
                  onRenameTeam={setTeamAName}
                />

                {/* Spelarlista (mitten) */}
                <PlayerList
                  players={availablePlayers}
                  onAddPlayer={handleAddPlayer}
                  onChangePosition={handleChangePosition}
                  onChangeTeamColor={handleChangeTeamColor}
                />

                {/* Lag B */}
                <TeamPanel
                  teamId="team-b"
                  teamName={teamBName}
                  slots={TEAM_B_SLOTS}
                  lineup={teamBLineup}
                  onRemovePlayer={handleRemoveFromSlot}
                  onChangePosition={handleChangePosition}
                  onRenameTeam={setTeamBName}
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
    </DndContext>
  );
}
