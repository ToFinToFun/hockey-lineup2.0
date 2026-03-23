/**
 * Hub – Landing page for app.stalstadens.se
 * Hockey-themed dark design with team logos and app cards
 * Links to Score Tracker (/score) and Lineup (/lineup)
 */

import { Link } from "wouter";
import { BarChart3, Users, ChevronRight, Trophy, ClipboardList } from "lucide-react";

const LOGO_GREEN =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/team-green-logo_0c27fdbe.png";
const LOGO_WHITE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/team-white-logo_4796bd85.png";
const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

export default function Hub() {
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Background image with overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.07]"
        style={{ backgroundImage: `url(${BG_URL})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-transparent to-[#0a0a0a]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center min-h-[100dvh] px-4 py-8 sm:py-12">
        {/* Header with logos */}
        <div className="flex items-center gap-4 sm:gap-6 mb-2">
          <img
            src={LOGO_WHITE}
            alt="Vita"
            className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-lg"
          />
          <div className="text-center">
            <h1
              className="text-2xl sm:text-4xl font-bold tracking-tight"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              STÅLSTADENS
            </h1>
            <p
              className="text-xs sm:text-sm tracking-[0.3em] text-white/50 uppercase"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              Sportförening
            </p>
          </div>
          <img
            src={LOGO_GREEN}
            alt="Gröna"
            className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-lg"
          />
        </div>

        {/* Divider */}
        <div className="w-24 h-[2px] bg-gradient-to-r from-transparent via-[#0a7ea4] to-transparent my-6 sm:my-8" />

        {/* App cards */}
        <div className="w-full max-w-md space-y-4">
          {/* Score Tracker Card */}
          <Link href="/score">
            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#2a2a2a] hover:border-[#0a7ea4]/60 transition-all duration-300 cursor-pointer">
              {/* Accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#0a7ea4] to-[#0a7ea4]/30 opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="p-5 sm:p-6 flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#0a7ea4]/10 border border-[#0a7ea4]/20 flex items-center justify-center">
                  <Trophy size={24} className="text-[#0a7ea4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight">Score Tracker</h2>
                  <p className="text-white/40 text-xs sm:text-sm mt-0.5">
                    Poängräkning, matchhistorik och statistik
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                      <BarChart3 size={10} /> Statistik
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                      <Trophy size={10} /> Utmärkelser
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className="text-white/20 group-hover:text-[#0a7ea4] transition-colors flex-shrink-0"
                />
              </div>
            </div>
          </Link>

          {/* Lineup Card */}
          <Link href="/lineup">
            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#2a2a2a] hover:border-emerald-500/60 transition-all duration-300 cursor-pointer">
              {/* Accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-emerald-500/30 opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="p-5 sm:p-6 flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ClipboardList size={24} className="text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight">Lineup</h2>
                  <p className="text-white/40 text-xs sm:text-sm mt-0.5">
                    Laguppställning och spelarhantering
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                      <Users size={10} /> Drag &amp; drop
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                      <ClipboardList size={10} /> Laget.se
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className="text-white/20 group-hover:text-emerald-500 transition-colors flex-shrink-0"
                />
              </div>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-8 text-center">
          <p className="text-white/15 text-[10px] tracking-wider uppercase">
            Stålstadens Sportförening &middot; A-lag Herrar
          </p>
        </div>
      </div>
    </div>
  );
}
