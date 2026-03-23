/*
 * IceTime Overview – Ported from IceTime app
 * DESIGN: Dark theme matching Hub landing page
 * Översiktssida: Visuell representation av optimala fördelningar
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { calculateDistributions, formatTime } from "@/hooks/useIceTimeCalculator";
import { Shield, Target, Swords, Users } from "lucide-react";

const PLAYER_RANGE = Array.from({ length: 8 }, (_, i) => i + 8); // 8–15

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

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
    <div className="icetime-dark min-h-screen flex flex-col bg-[#0a0a0a] text-white relative">
      {/* Background image with overlay */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-[0.05] z-0"
        style={{ backgroundImage: `url(${BG_URL})` }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-transparent to-[#0a0a0a] z-0" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="container py-6 sm:py-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight mb-2"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              Snabb<span className="text-sky-400">översikt</span>
            </h1>
            <p className="text-white/40 text-sm sm:text-base max-w-xl">
              Optimal fördelning och speltid per position för 8–15 utespelare
              med 60 minuters matchtid.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
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
            className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#2a2a2a]"
          >
            <div className="p-5 sm:p-6 border-b border-white/5">
              <h2
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                Sammanfattning
              </h2>
              <p className="text-sm text-white/40 mt-1">
                Alla optimala fördelningar i tabellform
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="py-3 px-4 text-left font-medium text-white/40">
                      Spelare
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Backar
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Centrar
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Forwards
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Tid/B
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Tid/C
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Tid/F
                    </th>
                    <th className="py-3 px-4 text-center font-medium text-white/40">
                      Max skillnad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr
                      key={s.players}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-white">
                        {s.players} st
                      </td>
                      <td className="py-3 px-4 text-center text-white/70">{s.backs}</td>
                      <td className="py-3 px-4 text-center text-white/70">{s.centers}</td>
                      <td className="py-3 px-4 text-center text-white/70">{s.forwards}</td>
                      <td className="py-3 px-4 text-center text-sky-400 font-medium">
                        {formatTime(s.timeBack)}
                      </td>
                      <td className="py-3 px-4 text-center text-[#0a7ea4] font-medium">
                        {formatTime(s.timeCenter)}
                      </td>
                      <td className="py-3 px-4 text-center text-orange-400 font-medium">
                        {formatTime(s.timeForward)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            s.maxDiff <= 4
                              ? "text-emerald-400"
                              : s.maxDiff <= 8
                              ? "text-amber-400"
                              : "text-red-400"
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
      <footer className="relative z-10 border-t border-white/5 py-6">
        <div className="container text-center text-xs text-white/15 tracking-wider uppercase">
          Stålstadens Sportförening &middot; A-lag Herrar
        </div>
      </footer>
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
      className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#2a2a2a] group hover:border-sky-400/30 transition-all"
    >
      {/* Header with player count */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>{s.players}</span>
            <span className="text-sm text-white/40 ml-1.5">spelare</span>
          </div>
        </div>
        <div
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
            s.maxDiff <= 4
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : s.maxDiff <= 8
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "bg-red-500/15 text-red-400 border border-red-500/30"
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
            colorClass="bg-sky-400/10 text-sky-400 border-sky-400/20"
          />
          <PositionPill
            icon={Target}
            count={s.centers}
            label="C"
            colorClass="bg-[#0a7ea4]/15 text-[#0a7ea4] border-[#0a7ea4]/25"
          />
          <PositionPill
            icon={Swords}
            count={s.forwards}
            label="F"
            colorClass="bg-orange-400/10 text-orange-400 border-orange-400/20"
          />
        </div>
      </div>

      {/* Time bars */}
      <div className="px-5 pb-5 space-y-2">
        <MiniTimeBar
          label="Backar"
          time={s.timeBack}
          maxTime={maxTime}
          color="bg-sky-400"
        />
        <MiniTimeBar
          label="Centrar"
          time={s.timeCenter}
          maxTime={maxTime}
          color="bg-[#0a7ea4]"
        />
        <MiniTimeBar
          label="Forwards"
          time={s.timeForward}
          maxTime={maxTime}
          color="bg-orange-400"
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
      <span className="text-xs text-white/30 w-16 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-5 bg-white/5 rounded-md overflow-hidden relative">
        <motion.div
          className={`h-full ${color} rounded-md`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ opacity: 0.7 }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
          {formatTime(time)}
        </span>
      </div>
    </div>
  );
}
