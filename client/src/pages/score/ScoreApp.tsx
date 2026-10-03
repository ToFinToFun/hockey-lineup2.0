/**
 * ScoreApp - Score Tracker sub-application wrapper
 * Provides tab navigation between Match and Lineup
 * History and Stats have been moved to dedicated Hub apps
 * Uses tRPC to fetch lineup data instead of Firebase
 */

import { teamName } from "@shared/teams";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import MatchPage from "./MatchPage";
import LineupPage, { type ScoreView } from "./LineupPage";
import PlayerProfileModal from "./PlayerProfileModal";
import { trpc } from "@/lib/trpc";
import { saveLineupSnapshot, loadLineupSnapshot, getPendingMatches, flushPendingMatches } from "@/lib/offlineScore";
import { toast } from "sonner";
import { AppVersion } from "@/components/AppVersion";
import { Home, Users, ArrowLeft, CloudOff, UploadCloud, HelpCircle, X } from "lucide-react";
import type { AppState } from "@/lib/lineup";
import { Link } from "wouter";

type TabType = "match" | "lineup";

export default function ScoreApp() {
  const [activeTab, setActiveTab] = useState<TabType>("match");
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 500);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Laget: det låsta efter publicerad nyhet, annars det aktuella i Lineup
  const { data: liveLineup, isLoading: liveLoading, refetch } = trpc.lineup.scoreState.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // fångar att spärren släppts
  });

  // Live: hämta om uppställningen när den ändras i Lineup.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource("/api/sse/lineup");
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refetch();
      }, 400);
    };
    es.addEventListener("patch", schedule);
    es.addEventListener("reset", schedule);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  // Offline: använd senast hämtade uppställning om servern inte nås.
  const [snapshot] = useState(() => loadLineupSnapshot<NonNullable<typeof liveLineup>>());
  useEffect(() => {
    // Spara inte "inget lag än" som offline-kopia – då försvinner det senast visade laget
    const mode = (liveLineup as { view?: { mode: string } } | undefined)?.view?.mode;
    if (liveLineup && mode !== "hidden" && mode !== "scheduled") saveLineupSnapshot(liveLineup);
  }, [liveLineup]);
  const lineupData = liveLineup ?? snapshot?.data ?? null;
  const loading = liveLoading && !snapshot;

  // Köade matcher (sparade utan nät) skickas när nätet är tillbaka.
  const utils = trpc.useUtils();
  const [pendingCount, setPendingCount] = useState(() => getPendingMatches().length);
  const [flushingNow, setFlushingNow] = useState(false);
  const flushRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    const update = () => setPendingCount(getPendingMatches().length);
    const flush = async (manual = false) => {
      if (!getPendingMatches().length) return;
      if (manual) setFlushingNow(true);
      try {
        let pendingReview = 0;
        const sent = await flushPendingMatches(async (p) => {
          const res = await utils.client.score.match.save.mutate(p as any);
          if ((res as { reviewStatus?: string })?.reviewStatus === "pending") pendingReview++;
          return res;
        });
        if (sent > 0) {
          toast.success(`☁️ ${sent === 1 ? "Lokalt sparad match uppladdad" : `${sent} lokalt sparade matcher uppladdade`}`, {
            description: pendingReview > 0 ? "Väntar på godkännande" : "Godkänd",
            duration: 6000,
          });
        } else if (manual && getPendingMatches().length) {
          toast.error("Kunde inte ladda upp – ingen anslutning", { description: "Försöker igen automatiskt." });
        }
      } finally {
        update();
        if (manual) setFlushingNow(false);
      }
    };
    flushRef.current = flush;
    void flush();
    // Försök regelbundet, när nätet kommer tillbaka och när appen öppnas igen
    const interval = setInterval(() => void flush(), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void flush(); };
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pending-matches-changed", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pending-matches-changed", update);
    };
  }, [utils]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Convert tRPC data to AppState format
  const lineupState = useMemo<AppState | null>(() => {
    if (!lineupData) return null;
    return {
      players: (lineupData.players ?? []) as AppState["players"],
      lineup: (lineupData.lineup ?? {}) as AppState["lineup"],
      teamAName: lineupData.teamAName ?? "Lag A",
      teamBName: lineupData.teamBName ?? "Lag B",
      teamAConfig: lineupData.teamAConfig as AppState["teamAConfig"],
      teamBConfig: lineupData.teamBConfig as AppState["teamBConfig"],
      deletedPlayerIds: lineupData.deletedPlayerIds as string[] | undefined,
      setup: (lineupData as { setup?: AppState["setup"] }).setup,
      opponent: (lineupData as { opponent?: AppState["opponent"] }).opponent ?? null,
    };
  }, [lineupData]);

  // Update lastSyncTime when data changes
  useEffect(() => {
    if (lineupData) {
      setLastSyncTime(new Date());
      setRefreshing(false);
    }
  }, [lineupData]);

  // Samma data ger inget nytt objekt från servern, så tiden och beskedet sätts här
  // – annars ser det ut som att inget hände.
  const refresh = useCallback(() => {
    setRefreshing(true);
    refetch()
      .then((res) => {
        if (res.error) throw res.error;
        setLastSyncTime(new Date());
        toast.success("Laguppställningen är uppdaterad", { duration: 2000 });
      })
      .catch(() => toast.error("Kunde inte uppdatera – ingen anslutning?", { duration: 3000 }))
      .finally(() => setRefreshing(false));
  }, [refetch]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 500);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#111111]">
      <div
        className="relative w-full flex flex-col overflow-hidden bg-[#1a1a1a]"
        style={{
          maxWidth: isDesktop ? "480px" : "100%",
          height: isDesktop ? "min(932px, 100dvh)" : "100dvh",
          borderRadius: isDesktop ? "24px" : "0",
          boxShadow: isDesktop ? "0 0 80px rgba(0,0,0,0.6)" : "none",
        }}
      >
        {pendingCount > 0 && (
          <div className="flex-shrink-0 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 px-3 py-1.5">
            <CloudOff size={14} className="shrink-0" />
            <span className="flex-1 min-w-0">
              {pendingCount === 1 ? "1 match" : `${pendingCount} matcher`} sparad{pendingCount === 1 ? "" : "e"} bara på telefonen – laddas upp automatiskt när du har nät
            </span>
            <button
              onClick={() => void flushRef.current(true)}
              disabled={flushingNow}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/25 border border-amber-400/40 font-semibold disabled:opacity-50"
            >
              <UploadCloud size={12} className={flushingNow ? "animate-pulse" : ""} />
              {flushingNow ? "Skickar…" : "Skicka nu"}
            </button>
          </div>
        )}

        {/* Låst lag efter publicering */}
        {liveLineup && "locked" in liveLineup && liveLineup.locked && (
          <div className="shrink-0 bg-sky-500/10 border-b border-sky-400/20 px-4 py-1.5 text-[11px] text-sky-200 text-center">
            🔒 Laget är låst sedan det publicerades{liveLineup.lockedAt ? ` ${new Date(liveLineup.lockedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : ""} – senare ändringar i Lineup används inte här.
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "match" && (
            <MatchPage lineupState={lineupState} />
          )}
          {activeTab === "lineup" && (
            <LineupPage
              lineupState={lineupState}
              view={(liveLineup as { view?: ScoreView } | undefined)?.view ?? null}
              loading={loading}
              lastSyncTime={lastSyncTime}
              refreshing={refreshing}
              onRefresh={refresh}
            />
          )}
        </div>

        {/* Player Profile Modal */}
        {selectedPlayer && (
          <PlayerProfileModal
            playerName={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
          />
        )}

        {showHelp && <ScoreHelp onClose={() => setShowHelp(false)} />}

        {/* Tab Bar */}
        <div
          className="flex-shrink-0 border-t border-[#3a3a3a] bg-[#1a1a1a]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex">
            <Link
              href="/"
              className="flex-1 flex flex-col items-center py-1.5 gap-0.5 text-[#9BA1A6] hover:text-[#0a7ea4] transition-colors"
            >
              <ArrowLeft size={18} />
              <span className="text-[10px] font-medium">Hub</span>
            </Link>
            <button
              onClick={() => setActiveTab("match")}
              className={`flex-1 flex flex-col items-center py-1.5 gap-0.5 transition-colors ${
                activeTab === "match" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <Home size={18} />
              <span className="text-[10px] font-medium">Match</span>
            </button>
            <button
              onClick={() => setActiveTab("lineup")}
              className={`flex-1 flex flex-col items-center py-1.5 gap-0.5 transition-colors ${
                activeTab === "lineup" ? "text-[#0a7ea4]" : "text-[#9BA1A6]"
              }`}
            >
              <Users size={18} />
              <span className="text-[10px] font-medium">Lineup</span>
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex-1 flex flex-col items-center py-1.5 gap-0.5 text-[#9BA1A6] hover:text-[#0a7ea4] transition-colors"
            >
              <HelpCircle size={18} />
              <span className="text-[10px] font-medium">Hjälp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kort hjälp för Score Tracker, med versionsnumret. */
function ScoreHelp({ onClose }: { onClose: () => void }) {
  const items: Array<[string, string]> = [
    ["Mål", `Tryck + under ${teamName("white")} eller ${teamName("green")} när det blir mål. Senaste målet hamnar överst med klockslag och sponsor.`],
    ["Målskytt och assist", "Tryck på målet i listan och välj spelare. Slå på Straff om det var en straff. Det går även att fylla i efteråt."],
    ["Ångra ett mål", "Tryck på minus under lagets siffra – då tas lagets senaste mål bort. Återställ börjar om hela matchen."],
    ["Sluttid", "Ställ in klockslaget – då hörs en slutsignal när tiden är slut."],
    ["Skärm på", "Håller skärmen tänd under matchen. Blir knappen gul: tryck var som helst på skärmen så aktiveras den igen."],
    ["Ljud", `Pling för ${teamName("white")}, tut för ${teamName("green")} och ett horn vid slutsignal. Hörs även i ljudlöst läge på iPhone.`],
    ["Avsluta", "Sparar matchen. Utan nät sparas den på telefonen och laddas upp automatiskt när nätet är tillbaka."],
    ["Lineup", "Visar dagens lag. Dra ned eller tryck Uppdatera för att hämta senaste versionen."],
  ];
  return (
    <div className="absolute inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <div className="w-full bg-[#1a1a1a] border-t border-white/10 rounded-t-2xl p-4 max-h-[85%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[#ECEDEE] font-bold">Så funkar Score Tracker</h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>
        <dl className="space-y-2.5">
          {items.map(([t, d]) => (
            <div key={t}>
              <dt className="text-sm font-semibold text-[#ECEDEE]">{t}</dt>
              <dd className="text-xs text-[#9BA1A6] leading-relaxed">{d}</dd>
            </div>
          ))}
        </dl>
        <AppVersion className="text-center mt-4 !text-white/35" />
      </div>
    </div>
  );
}
