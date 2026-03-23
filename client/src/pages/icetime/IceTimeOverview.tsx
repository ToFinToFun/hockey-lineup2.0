/*
 * IceTime Overview – Ported from IceTime app
 * DESIGN: "Ice Sheet" – Nordisk Minimalism
 * Översiktssida: Visuell representation av optimala fördelningar
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { calculateDistributions, formatTime } from "@/hooks/useIceTimeCalculator";
import { Shield, Target, Swords, Users } from "lucide-react";

const PLAYER_RANGE = Array.from({ length: 8 }, (_, i) => i + 8); // 8–15

const ICE_TEXTURE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/QKSTbYNZ5jtXjZohbMfik9/ice-texture-4DLD3bP9auFmXfmP9KFzus.webp";

interface ScenarioData {
  players: number;
  backs: number;
  centers: number;
  forwards: number;
  timeBack: number;
  timeCenter: number;
  timeForward: number;
  maxDiff: number;
}

export default function IceTimeOverview() {
  const scenarios: ScenarioData[] = useMemo(() => {
    return PLAYER_RANGE.map((n) => {
      const result = calculateDistributions(n, 60);
      const best = result.best!;
      return {
        players: n,
        backs: best.backs,
        centers: best.centers,
        forwards: best.forwards,
        timeBack: best.timePerBack,
        timeCenter: best.timePerCenter,
        timeForward: best.timePerForward,
        maxDiff: best.maxDifference,
      };
    });
  }, []);

  return (
    <div className="icetime min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-white/80 backdrop-blur-sm">
        <div className="container py-6 sm:py-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground mb-2">
              Snabb<span className="text-ice-deep">översikt</span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl">
              Optimal fördelning och speltid per position för 8–15 utespelare
              med 60 minuters matchtid.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="flex-1">
        <div className="container py-8 sm:py-12">
          {/* Visual Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-12">
            {scenarios.map((s, i) => (
              <ScenarioCard key={s.players} scenario={s} index={i} />
            ))}
          </div>

          {/* Summary Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card rounded-2xl overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-border/50">
              <h2 className="font-serif text-xl text-foreground">
                Sammanfattning
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Alla optimala fördelningar i tabellform
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">
                      Spelare
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Backar
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Centrar
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Forwards
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Tid/B
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Tid/C
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Tid/F
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">
                      Max skillnad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr
                      key={s.players}
                      className="border-b border-border/30 hover:bg-ice/20 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {s.players} st
                      </td>
                      <td className="py-3 px-4 text-center">{s.backs}</td>
                      <td className="py-3 px-4 text-center">{s.centers}</td>
                      <td className="py-3 px-4 text-center">{s.forwards}</td>
                      <td className="py-3 px-4 text-center text-ice-deep font-medium">
                        {formatTime(s.timeBack)}
                      </td>
                      <td className="py-3 px-4 text-center text-ice-medium font-medium">
                        {formatTime(s.timeCenter)}
                      </td>
                      <td className="py-3 px-4 text-center text-goal-red font-medium">
                        {formatTime(s.timeForward)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            s.maxDiff <= 4
                              ? "text-emerald-600"
                              : s.maxDiff <= 8
                              ? "text-amber-600"
                              : "text-goal-red"
                          }`}
                        >
                          {formatTime(s.maxDiff)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
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

function ScenarioCard({
  scenario: s,
  index,
}: {
  scenario: ScenarioData;
  index: number;
}) {
  const maxTime = 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      className="glass-card-strong rounded-2xl overflow-hidden group hover:shadow-lg transition-shadow"
    >
      {/* Header with player count */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ice/60 flex items-center justify-center">
            <Users className="w-5 h-5 text-ice-deep" />
          </div>
          <div>
            <span className="text-2xl font-serif text-foreground">{s.players}</span>
            <span className="text-sm text-muted-foreground ml-1.5">spelare</span>
          </div>
        </div>
        <div
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
            s.maxDiff <= 4
              ? "bg-emerald-50 text-emerald-700"
              : s.maxDiff <= 8
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {s.maxDiff === 0 ? "Perfekt" : `±${formatTime(s.maxDiff)}`}
        </div>
      </div>

      {/* Position distribution */}
      <div className="px-5 pb-2">
        <div className="flex gap-2 mb-3">
          <PositionPill
            icon={Shield}
            count={s.backs}
            label="B"
            colorClass="bg-ice-deep/10 text-ice-deep border-ice-deep/20"
          />
          <PositionPill
            icon={Target}
            count={s.centers}
            label="C"
            colorClass="bg-ice-medium/10 text-ice-medium border-ice-medium/20"
          />
          <PositionPill
            icon={Swords}
            count={s.forwards}
            label="F"
            colorClass="bg-goal-red/8 text-goal-red border-goal-red/15"
          />
        </div>
      </div>

      {/* Time bars */}
      <div className="px-5 pb-5 space-y-2">
        <MiniTimeBar
          label="Backar"
          time={s.timeBack}
          maxTime={maxTime}
          color="bg-ice-deep"
        />
        <MiniTimeBar
          label="Centrar"
          time={s.timeCenter}
          maxTime={maxTime}
          color="bg-ice-medium"
        />
        <MiniTimeBar
          label="Forwards"
          time={s.timeForward}
          maxTime={maxTime}
          color="bg-goal-red"
        />
      </div>
    </motion.div>
  );
}

function PositionPill({
  icon: Icon,
  count,
  label,
  colorClass,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  colorClass: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${colorClass}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>
        {count}
        {label}
      </span>
    </div>
  );
}

function MiniTimeBar({
  label,
  time,
  maxTime,
  color,
}: {
  label: string;
  time: number;
  maxTime: number;
  color: string;
}) {
  const percentage = Math.min((time / maxTime) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-16 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-5 bg-muted/30 rounded-md overflow-hidden relative">
        <motion.div
          className={`h-full ${color} rounded-md`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
          {formatTime(time)}
        </span>
      </div>
    </div>
  );
}
