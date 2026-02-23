// Hockey Lineup App – Huvudsida
// Design: Industrial Ice Arena
// - Mörk ishockey-bakgrundsbild
// - Tre-kolumns layout: Lag A | Spelarlista | Lag B
// - Drag and drop med @dnd-kit
// - Glassmorfism-paneler

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
import { initialPlayers, type Player } from "@/lib/players";
import { PlayerList } from "@/components/PlayerList";
import { TeamPanel } from "@/components/TeamPanel";
import { PlayerCardOverlay } from "@/components/PlayerCard";

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

interface TeamLineup {
  goalkeepers: Player[];
  defense: Player[];
  forwards: Player[];
}

type ZoneKey =
  | "team-a-goalkeeper"
  | "team-a-defense"
  | "team-a-forward"
  | "team-b-goalkeeper"
  | "team-b-defense"
  | "team-b-forward"
  | "player-list";

const ZONE_LIMITS: Record<string, number> = {
  "team-a-goalkeeper": 2,
  "team-a-defense": 8,
  "team-a-forward": 12,
  "team-b-goalkeeper": 2,
  "team-b-defense": 8,
  "team-b-forward": 12,
};

export default function Home() {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(initialPlayers);
  const [teamAName, setTeamAName] = useState("Lag A");
  const [teamBName, setTeamBName] = useState("Lag B");
  const [teamALineup, setTeamALineup] = useState<TeamLineup>({
    goalkeepers: [],
    defense: [],
    forwards: [],
  });
  const [teamBLineup, setTeamBLineup] = useState<TeamLineup>({
    goalkeepers: [],
    defense: [],
    forwards: [],
  });
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Hitta var en spelare befinner sig
  const findPlayerLocation = useCallback(
    (playerId: string): ZoneKey | null => {
      if (availablePlayers.find((p) => p.id === playerId)) return "player-list";
      if (teamALineup.goalkeepers.find((p) => p.id === playerId)) return "team-a-goalkeeper";
      if (teamALineup.defense.find((p) => p.id === playerId)) return "team-a-defense";
      if (teamALineup.forwards.find((p) => p.id === playerId)) return "team-a-forward";
      if (teamBLineup.goalkeepers.find((p) => p.id === playerId)) return "team-b-goalkeeper";
      if (teamBLineup.defense.find((p) => p.id === playerId)) return "team-b-defense";
      if (teamBLineup.forwards.find((p) => p.id === playerId)) return "team-b-forward";
      return null;
    },
    [availablePlayers, teamALineup, teamBLineup]
  );

  const getZonePlayers = useCallback(
    (zone: ZoneKey): Player[] => {
      switch (zone) {
        case "player-list": return availablePlayers;
        case "team-a-goalkeeper": return teamALineup.goalkeepers;
        case "team-a-defense": return teamALineup.defense;
        case "team-a-forward": return teamALineup.forwards;
        case "team-b-goalkeeper": return teamBLineup.goalkeepers;
        case "team-b-defense": return teamBLineup.defense;
        case "team-b-forward": return teamBLineup.forwards;
      }
    },
    [availablePlayers, teamALineup, teamBLineup]
  );

  const setZonePlayers = useCallback(
    (zone: ZoneKey, players: Player[]) => {
      switch (zone) {
        case "player-list":
          setAvailablePlayers(players);
          break;
        case "team-a-goalkeeper":
          setTeamALineup((prev) => ({ ...prev, goalkeepers: players }));
          break;
        case "team-a-defense":
          setTeamALineup((prev) => ({ ...prev, defense: players }));
          break;
        case "team-a-forward":
          setTeamALineup((prev) => ({ ...prev, forwards: players }));
          break;
        case "team-b-goalkeeper":
          setTeamBLineup((prev) => ({ ...prev, goalkeepers: players }));
          break;
        case "team-b-defense":
          setTeamBLineup((prev) => ({ ...prev, defense: players }));
          break;
        case "team-b-forward":
          setTeamBLineup((prev) => ({ ...prev, forwards: players }));
          break;
      }
    },
    []
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
    const targetZone = over.id as ZoneKey;
    const sourceZone = findPlayerLocation(playerId);

    if (!sourceZone || sourceZone === targetZone) return;

    // Kontrollera kapacitet
    if (targetZone !== "player-list") {
      const limit = ZONE_LIMITS[targetZone];
      const currentCount = getZonePlayers(targetZone).length;
      if (currentCount >= limit) return;
    }

    // Hämta spelaren
    const sourcePlayers = getZonePlayers(sourceZone);
    const player = sourcePlayers.find((p) => p.id === playerId);
    if (!player) return;

    // Ta bort från källa
    setZonePlayers(
      sourceZone,
      sourcePlayers.filter((p) => p.id !== playerId)
    );

    // Lägg till i mål
    const targetPlayers = getZonePlayers(targetZone);
    setZonePlayers(targetZone, [...targetPlayers, player]);
  };

  const handleRemovePlayer = useCallback(
    (playerId: string, zone: string) => {
      const zoneKey = zone as ZoneKey;
      const zonePlayers = getZonePlayers(zoneKey);
      const player = zonePlayers.find((p) => p.id === playerId);
      if (!player) return;
      setZonePlayers(
        zoneKey,
        zonePlayers.filter((p) => p.id !== playerId)
      );
      setAvailablePlayers((prev) => [player, ...prev]);
    },
    [getZonePlayers, setZonePlayers]
  );

  const handleAddPlayer = useCallback((player: Player) => {
    setAvailablePlayers((prev) => [...prev, player]);
  }, []);

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
        {/* Mörkt overlay för läsbarhet */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />

        {/* Innehåll */}
        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Header */}
          <header className="px-4 pt-4 pb-2">
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
              <div className="hidden md:flex items-center gap-4 text-xs text-white/30">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Målvakt
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Back
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Forward
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                  Utespelare
                </span>
              </div>
            </div>
          </header>

          {/* Tre-kolumns layout */}
          <main className="flex-1 px-2 md:px-4 pb-4">
            <div className="max-w-7xl mx-auto h-full">
              <div
                className="grid gap-2 md:gap-3"
                style={{
                  gridTemplateColumns: "1fr minmax(190px, 230px) 1fr",
                  height: "calc(100vh - 96px)",
                }}
              >
                {/* Lag A */}
                <TeamPanel
                  teamId="team-a"
                  teamName={teamAName}
                  lineup={teamALineup}
                  onRemovePlayer={handleRemovePlayer}
                  onRenameTeam={setTeamAName}
                />

                {/* Spelarlista (mitten) */}
                <PlayerList
                  players={availablePlayers}
                  onAddPlayer={handleAddPlayer}
                />

                {/* Lag B */}
                <TeamPanel
                  teamId="team-b"
                  teamName={teamBName}
                  lineup={teamBLineup}
                  onRemovePlayer={handleRemovePlayer}
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
