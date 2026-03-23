/*
 * IceTime Calculator – Ported from IceTime app
 * DESIGN: "Ice Sheet" – Nordisk Minimalism
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  calculateDistributions,
  formatTime,
  POSITION_LIMITS,
  type Distribution,
} from "@/hooks/useIceTimeCalculator";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import PositionDropZone from "@/components/icetime/PositionDropZone";
import type { Player } from "@/components/icetime/DraggablePlayer";
import {
  Users,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sparkles,
} from "lucide-react";

const HERO_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/QKSTbYNZ5jtXjZohbMfik9/hero-ice-rink-g5CLVMBrUHoT5YVqthJUND.webp";
const ICE_TEXTURE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/QKSTbYNZ5jtXjZohbMfik9/ice-texture-4DLD3bP9auFmXfmP9KFzus.webp";

const ICE_SLOTS = { backs: 2, centers: 1, forwards: 2 } as const;

type PositionKey = "backs" | "centers" | "forwards";

function createPlayers(
  backs: number,
  centers: number,
  forwards: number
): Record<PositionKey, Player[]> {
  const result: Record<PositionKey, Player[]> = {
    backs: [],
    centers: [],
    forwards: [],
  };

  let id = 1;
  for (let i = 0; i < backs; i++) {
    result.backs.push({
      id: `player-${id}`,
      label: `B${i + 1}`,
      position: "backs",
    });
    id++;
  }
  for (let i = 0; i < centers; i++) {
    result.centers.push({
      id: `player-${id}`,
      label: `C${i + 1}`,
      position: "centers",
    });
    id++;
  }
  for (let i = 0; i < forwards; i++) {
    result.forwards.push({
      id: `player-${id}`,
      label: `F${i + 1}`,
      position: "forwards",
    });
    id++;
  }

  return result;
}

function DistributionRow({
  dist,
  isBest,
}: {
  dist: Distribution;
  isBest: boolean;
}) {
  return (
    <tr
      className={`border-b border-border/50 transition-colors hover:bg-ice/30 ${
        isBest ? "bg-ice/40 font-medium" : ""
      }`}
    >
      <td className="py-3 px-3 sm:px-4 text-center">
        {isBest && (
          <span className="inline-block w-2 h-2 rounded-full bg-goal-red mr-1.5 animate-pulse" />
        )}
        #{dist.rank}
      </td>
      <td className="py-3 px-3 sm:px-4 text-center">{dist.backs}B</td>
      <td className="py-3 px-3 sm:px-4 text-center">{dist.centers}C</td>
      <td className="py-3 px-3 sm:px-4 text-center">{dist.forwards}F</td>
      <td className="py-3 px-3 sm:px-4 text-center text-sm">
        {formatTime(dist.timePerBack)}
      </td>
      <td className="py-3 px-3 sm:px-4 text-center text-sm">
        {formatTime(dist.timePerCenter)}
      </td>
      <td className="py-3 px-3 sm:px-4 text-center text-sm">
        {formatTime(dist.timePerForward)}
      </td>
      <td className="py-3 px-3 sm:px-4 text-center">
        <span
          className={`text-sm font-semibold ${
            isBest ? "text-goal-red" : "text-muted-foreground"
          }`}
        >
          {formatTime(dist.maxDifference)}
        </span>
      </td>
    </tr>
  );
}

export default function IceTimeCalc() {
  const [playerCount, setPlayerCount] = useState(11);
  const [matchTime, setMatchTime] = useState(60);
  const [showAllDistributions, setShowAllDistributions] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  const calcResult = useMemo(
    () => calculateDistributions(playerCount, matchTime),
    [playerCount, matchTime]
  );

  const [positions, setPositions] = useState<Record<PositionKey, Player[]>>(
    () => {
      const best = calcResult.best;
      if (!best) return createPlayers(2, 1, 2);
      return createPlayers(best.backs, best.centers, best.forwards);
    }
  );

  useEffect(() => {
    const best = calcResult.best;
    if (!best) return;
    setPositions(createPlayers(best.backs, best.centers, best.forwards));
  }, [playerCount]);

  const currentTimes = useMemo(() => {
    const b = positions.backs.length;
    const c = positions.centers.length;
    const f = positions.forwards.length;
    return {
      backs: b > 0 ? (ICE_SLOTS.backs / b) * matchTime : 0,
      centers: c > 0 ? (ICE_SLOTS.centers / c) * matchTime : 0,
      forwards: f > 0 ? (ICE_SLOTS.forwards / f) * matchTime : 0,
    };
  }, [positions, matchTime]);

  const currentMaxDiff = useMemo(() => {
    const times = Object.values(currentTimes).filter((t) => t > 0);
    if (times.length === 0) return 0;
    return Math.max(...times) - Math.min(...times);
  }, [currentTimes]);

  const isOptimal = useMemo(() => {
    if (!calcResult.best) return false;
    return (
      positions.backs.length === calcResult.best.backs &&
      positions.centers.length === calcResult.best.centers &&
      positions.forwards.length === calcResult.best.forwards
    );
  }, [positions, calcResult.best]);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: any) => {
    const overId = event.over?.id;
    if (overId && ["backs", "centers", "forwards"].includes(overId)) {
      setOverZone(overId);
    } else {
      setOverZone(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverZone(null);

      const { active, over } = event;
      if (!over) return;

      const targetZone = over.id as PositionKey;
      if (!["backs", "centers", "forwards"].includes(targetZone)) return;

      const playerData = active.data.current as {
        player: Player;
        fromPosition: PositionKey;
      };
      if (!playerData) return;

      const fromZone = playerData.fromPosition;
      if (fromZone === targetZone) return;

      if (positions[fromZone].length <= POSITION_LIMITS[fromZone].min) return;
      if (positions[targetZone].length >= POSITION_LIMITS[targetZone].max) return;

      setPositions((prev) => {
        const player = playerData.player;
        const newFrom = prev[fromZone].filter((p) => p.id !== player.id);

        const prefix =
          targetZone === "backs" ? "B" : targetZone === "centers" ? "C" : "F";
        const newIndex = prev[targetZone].length + 1;
        const movedPlayer: Player = {
          ...player,
          label: `${prefix}${newIndex}`,
          position: targetZone,
        };

        const newTo = [...prev[targetZone], movedPlayer];

        const srcPrefix =
          fromZone === "backs" ? "B" : fromZone === "centers" ? "C" : "F";
        const relabeledFrom = newFrom.map((p, i) => ({
          ...p,
          label: `${srcPrefix}${i + 1}`,
        }));

        return {
          ...prev,
          [fromZone]: relabeledFrom,
          [targetZone]: newTo,
        };
      });
    },
    [positions]
  );

  const resetToOptimal = useCallback(() => {
    const best = calcResult.best;
    if (!best) return;
    setPositions(createPlayers(best.backs, best.centers, best.forwards));
  }, [calcResult.best]);

  const activePlayer = useMemo(() => {
    if (!activeId) return null;
    for (const zone of ["backs", "centers", "forwards"] as PositionKey[]) {
      const found = positions[zone].find((p) => p.id === activeId);
      if (found) return { player: found, zone };
    }
    return null;
  }, [activeId, positions]);

  return (
    <div className="icetime min-h-screen flex flex-col">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/60 to-[oklch(0.98_0.005_230)]" />
        <div className="relative container py-10 sm:py-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-foreground leading-tight mb-3">
              Speltids
              <br />
              <span className="text-ice-deep">kalkylator</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Beräkna optimal positionsfördelning för ditt ishockeylag.
              Dra spelare mellan positioner för att se speltiden uppdateras.
            </p>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 -mt-4">
        <div className="container pt-6 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[340px_1fr] gap-8 lg:gap-10 items-start">
            {/* Input Panel */}
            <motion.aside
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="glass-card-strong rounded-2xl p-6 sm:p-8 sticky top-6 z-10"
            >
              <h2 className="font-serif text-2xl text-foreground mb-6">
                Laguppställning
              </h2>

              {/* Player Count */}
              <div className="mb-8">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                  <Users className="w-4 h-4" />
                  Antal utespelare
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => setPlayerCount((p) => Math.max(5, p - 1))}
                    disabled={playerCount <= 5}
                  >
                    -
                  </Button>
                  <span className="text-5xl font-serif text-foreground text-center flex-1">
                    {playerCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => setPlayerCount((p) => Math.min(20, p + 1))}
                    disabled={playerCount >= 20}
                  >
                    +
                  </Button>
                </div>
                <Slider
                  value={[playerCount]}
                  onValueChange={([v]) => setPlayerCount(v)}
                  min={5}
                  max={20}
                  step={1}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>5</span>
                  <span>20</span>
                </div>
              </div>

              {/* Match Time */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                  <Clock className="w-4 h-4" />
                  Matchtid (minuter)
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => setMatchTime((t) => Math.max(50, t - 5))}
                    disabled={matchTime <= 50}
                  >
                    -
                  </Button>
                  <span className="text-4xl font-serif text-foreground text-center flex-1">
                    {matchTime}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => setMatchTime((t) => Math.min(120, t + 5))}
                    disabled={matchTime >= 120}
                  >
                    +
                  </Button>
                </div>
                <Slider
                  value={[matchTime]}
                  onValueChange={([v]) => setMatchTime(v)}
                  min={50}
                  max={120}
                  step={5}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>50 min</span>
                  <span>120 min</span>
                </div>
              </div>

              {/* Info box */}
              <div className="rounded-xl bg-ice/50 border border-ice-light p-4 flex gap-3 mb-4">
                <Info className="w-4 h-4 text-ice-medium shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Beräkningen utgår från att det alltid är{" "}
                  <strong className="text-foreground">5 utespelare</strong> på
                  isen: 2 backar, 1 center och 2 ytterforwards.
                </p>
              </div>

              {/* Reset button */}
              {!isOptimal && (
                <Button
                  variant="outline"
                  className="w-full gap-2 rounded-xl"
                  onClick={resetToOptimal}
                >
                  <Sparkles className="w-4 h-4" />
                  Återställ optimal fördelning
                </Button>
              )}
            </motion.aside>

            {/* Results Panel */}
            <div className="space-y-6">
              {/* Status bar */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <h2 className="font-serif text-2xl sm:text-3xl text-foreground mb-1">
                    Positionsfördelning
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Dra spelare mellan positionerna nedan
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      px-4 py-2 rounded-xl text-sm font-medium transition-colors
                      ${
                        isOptimal
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }
                    `}
                  >
                    {isOptimal ? (
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Optimal fördelning
                      </span>
                    ) : (
                      <span>
                        Skillnad:{" "}
                        <strong>{formatTime(currentMaxDiff)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Drag and Drop Zones */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                  <PositionDropZone
                    id="backs"
                    label="Backar"
                    players={positions.backs}
                    iceSlots={ICE_SLOTS.backs}
                    matchTime={matchTime}
                    isOver={overZone === "backs"}
                  />
                  <PositionDropZone
                    id="centers"
                    label="Centrar"
                    players={positions.centers}
                    iceSlots={ICE_SLOTS.centers}
                    matchTime={matchTime}
                    isOver={overZone === "centers"}
                  />
                  <PositionDropZone
                    id="forwards"
                    label="Forwards"
                    players={positions.forwards}
                    iceSlots={ICE_SLOTS.forwards}
                    matchTime={matchTime}
                    isOver={overZone === "forwards"}
                  />
                </div>

                {/* Drag Overlay */}
                <DragOverlay>
                  {activePlayer ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium bg-white shadow-xl border-border">
                      <GripVertical className="w-3.5 h-3.5 opacity-40" />
                      <span>{activePlayer.player.label}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              {/* Time comparison bar */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="glass-card rounded-2xl p-5"
              >
                <h3 className="font-serif text-lg text-foreground mb-4">
                  Speltid per position
                </h3>
                <div className="space-y-4">
                  <TimeBar
                    label="Backar"
                    time={currentTimes.backs}
                    maxTime={matchTime}
                    color="bg-ice-deep"
                    count={positions.backs.length}
                  />
                  <TimeBar
                    label="Centrar"
                    time={currentTimes.centers}
                    maxTime={matchTime}
                    color="bg-ice-medium"
                    count={positions.centers.length}
                  />
                  <TimeBar
                    label="Forwards"
                    time={currentTimes.forwards}
                    maxTime={matchTime}
                    color="bg-goal-red"
                    count={positions.forwards.length}
                  />
                </div>
              </motion.div>

              {/* All Distributions Table */}
              {calcResult.distributions.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="glass-card rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setShowAllDistributions(!showAllDistributions)
                    }
                    className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-ice/20 transition-colors"
                  >
                    <h3 className="font-serif text-xl text-foreground">
                      Alla fördelningar ({calcResult.distributions.length} st)
                    </h3>
                    {showAllDistributions ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showAllDistributions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{
                          height: "auto",
                          opacity: 1,
                        }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/30">
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  #
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Backar
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Centrar
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Forwards
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Tid/B
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Tid/C
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Tid/F
                                </th>
                                <th className="py-3 px-3 sm:px-4 text-center font-medium text-muted-foreground">
                                  Skillnad
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {calcResult.distributions.map((dist) => (
                                <DistributionRow
                                  key={`${dist.backs}-${dist.centers}-${dist.forwards}`}
                                  dist={dist}
                                  isBest={dist.rank === 1}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6">
        <div className="container text-center text-xs text-muted-foreground">
          Ishockey Speltidskalkylator
        </div>
      </footer>

      {/* Background texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015] z-[-1]"
        style={{
          backgroundImage: `url(${ICE_TEXTURE})`,
          backgroundSize: "cover",
        }}
      />
    </div>
  );
}

function TimeBar({
  label,
  time,
  maxTime,
  color,
  count,
}: {
  label: string;
  time: number;
  maxTime: number;
  color: string;
  count: number;
}) {
  const percentage = Math.min((time / maxTime) * 100, 100);

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 text-sm text-muted-foreground shrink-0">
        {label}
        <span className="text-xs ml-1">({count})</span>
      </div>
      <div className="flex-1 h-8 bg-muted/40 rounded-lg overflow-hidden relative">
        <motion.div
          className={`h-full ${color} rounded-lg`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-foreground">
          {time > 0 ? formatTime(time) : "—"}
        </span>
      </div>
    </div>
  );
}
