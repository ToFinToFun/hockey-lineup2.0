// Hockey Lineup App – Home
// Design: Industrial Ice Arena

// - SQL database + SSE real-time sync (alla användare ser samma data)
// - localStorage som fallback om servern är offline
// - Ångra-funktion (Ctrl+Z + knapp i header)
// - In-app bekräftelsedialog för Rensa
import { teamName, teamSingular, teamGenitive, defaultTeamNames } from "@shared/teams";
import { teamLogo, club, clubHeading } from "@shared/club";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  MeasuringStrategy,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { initialPlayers, type Player, type Position, type TeamColor, type CaptainRole, type PlayerRecord } from "@/lib/players";
import { useIsMobile } from "@/hooks/useMobile";
import { createTeamSlots, DEFAULT_TEAM_CONFIG, MAX_TEAM_CONFIG, type TeamConfig } from "@/lib/lineup";
import { PlayerList } from "@/components/PlayerList";
import { TeamPanel } from "@/components/TeamPanel";
import { PlayerCardOverlay } from "@/components/PlayerCard";
import { LagetNewsModal } from "@/components/LagetNewsModal";
import { ShareToolsModal } from "@/components/auth/ShareToolsModal";
import { RosterSummary } from "@/components/RosterSummary";
import { trainingMinutes } from "@shared/matchTiming";
import { contextKeyOf, INTERNAL_SETUP, isOpponentPlayerId, type MatchSetup } from "@shared/matchSetup";
import { useFeatures } from "@/contexts/ClubContext";
import { MatchSetupModal, setupLabel, ourLogoUrl } from "@/components/opponent/MatchSetupBar";
import { OpponentTeamPanel, toLineupPlayer } from "@/components/opponent/OpponentTeamPanel";
import { getAltThreshold, setAltThreshold, secondaryFromStats } from "@/lib/altPosition";
import { MatchResultsBar } from "@/components/MatchResultsBar";
import { SlotHighlightContext } from "@/components/PlayerSlot";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { diffLineups, isEmptyDiff, previewLines, doneMessage } from "@/lib/lineupDiff";
import { SavedLineupsPanel } from "@/components/SavedLineupsPanel";
import { MobileRosterDrawer } from "@/components/MobileRosterDrawer";
import { LongPressTooltip } from "@/components/LongPressTooltip";
import { trpc } from "@/lib/trpc";
import { generateLineupText, lineupStateToText, shareOrCopy } from "@/lib/lineupText";
import { useLineupDocSync } from "@/hooks/useLineupDocSync";
import { useAuth } from "@/hooks/useAuth";
import { MatchPredictionBar } from "@/components/MatchPredictionBar";
import type { Player as PlayerType } from "@/lib/players";
import { Newspaper, RefreshCw, TrendingUp, Link2, BookmarkPlus, X as XIconSmall, Wifi, WifiOff, Share2, FileText, Check, CalendarDays, Shuffle, PanelLeft, Columns3, Undo2, BarChart3, Settings, Sun, Moon, Home as HomeIcon, Users, FlaskConical, Wand2, Swords } from "lucide-react";
import { toast } from "sonner";
import { useLineupTheme } from "@/hooks/useLineupTheme";
import { useForwardColor } from "@/hooks/useForwardColor";
import { Link } from "wouter";
import { SettingsModal } from "@/components/SettingsModal";
import { AutoLineupModal } from "@/components/AutoLineupModal";
import { matchRegisteredPlayers, matchDeclinedPlayers, fetchAttendanceFromApi, updateAttendanceOnLaget } from "@/lib/laget";
import { createPortal } from "react-dom"; // används av PlayerList context-meny
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useSwipe } from "@/hooks/useSwipe";
import { autoDistribute } from "@/lib/autoDistribute";
import { RemoveDropZone } from "@/components/RemoveDropZone";
import { PirSettingsProvider, loadPirSettings, savePirSettings, type PirSettings } from "@/hooks/usePirEnabled";
import { listAsSlots } from "@/lib/opponentList";

type MobileTab = "vita" | "trupp" | "grona";

const BG_URL =
  "/images/background.jpg";

const DEMO_PLAYER_COUNT = 17;

const STORAGE_KEY = "stalstadens-lineup-v2";
const MAX_UNDO = 30; // max antal steg i ångra-historiken

// Generera alla giltiga slot-IDs för en given config (används för sanitering)
function getAllSlotIds(configA: TeamConfig, configB: TeamConfig): Set<string> {
  // Generera med MAX config för att acceptera alla möjliga slot-IDs
  const maxA = createTeamSlots("team-a", MAX_TEAM_CONFIG);
  const maxB = createTeamSlots("team-b", MAX_TEAM_CONFIG);
  return new Set([...maxA.map(s => s.id), ...maxB.map(s => s.id)]);
}

const ALL_SLOT_IDS = getAllSlotIds(MAX_TEAM_CONFIG, MAX_TEAM_CONFIG);

interface SavedState {
  availablePlayers: Player[];
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
  teamAConfig?: TeamConfig;
  teamBConfig?: TeamConfig;
  matchTime?: number;
}

// En snapshot av det relevanta state som kan ångras
interface UndoSnapshot {
  availablePlayers: Player[];
  lineup: Record<string, Player>;
  teamAConfig: TeamConfig;
  teamBConfig: TeamConfig;
  teamAName: string;
  teamBName: string;
}

function loadLocalState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    // Sanitera lineup: ta bort ogiltiga slot-IDs från äldre versioner
    if (parsed.lineup) {
      const sanitized: Record<string, Player> = {};
      for (const [slotId, player] of Object.entries(parsed.lineup)) {
        if (ALL_SLOT_IDS.has(slotId)) sanitized[slotId] = player;
      }
      parsed.lineup = sanitized;
    }
    return parsed;
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

/** "Träning · tors 1/10 20:00 · Coop Arena C-Hallen" (exporteras för test) */
export function eventLabel(e: { title: string; date: string; time?: string; location?: string }): string {
  const m = e.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = m ? (() => { const d = new Date(+m[1], +m[2] - 1, +m[3]); return `${d.toLocaleDateString("sv-SE", { weekday: "short" })} ${d.getDate()}/${d.getMonth() + 1}`; })() : e.date;
  return [e.title, [day, e.time].filter(Boolean).join(" "), e.location].filter(Boolean).join(" · ");
}

/** "idag 18:43", "igår 09:05", "torsdag 18:43" eller "12/9 18:43" – alltid 24-timmarsklocka. */
export function formatChanged(d: Date, now = new Date()): string {
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  if (diffDays === 0) return `idag ${time}`;
  if (diffDays === 1) return `igår ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${d.toLocaleDateString("sv-SE", { weekday: "long" })} ${time}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${time}`;
}

export default function Home() {
  const local = loadLocalState();
  const { theme: lineupTheme, toggle: toggleLineupTheme, isDark: isLineupDark } = useLineupTheme();
  const { colors: fc } = useForwardColor();

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>(
    local?.availablePlayers ?? initialPlayers
  );
  const [teamAName, setTeamAName] = useState(local?.teamAName ?? defaultTeamNames().teamAName);
  const [teamBName, setTeamBName] = useState(local?.teamBName ?? defaultTeamNames().teamBName);
  const [lineup, setLineup] = useState<Record<string, Player>>(local?.lineup ?? {});

  // Ref som alltid pekar på senaste lineup-värdet (undviker stale closure)
  const lineupRef = useRef<Record<string, Player>>(local?.lineup ?? {});
  useEffect(() => { lineupRef.current = lineup; }, [lineup]);

  // Ref för availablePlayers (undviker stale closure i undo)
  const availablePlayersRef = useRef<Player[]>(local?.availablePlayers ?? initialPlayers);
  useEffect(() => { availablePlayersRef.current = availablePlayers; }, [availablePlayers]);

  // Dynamisk lagkonfiguration
  const [teamAConfig, setTeamAConfig] = useState<TeamConfig>(
    local?.teamAConfig ?? { ...DEFAULT_TEAM_CONFIG }
  );
  // Matchtyp: intern (som alltid) eller mot motståndare (beta)
  const [setup, setSetup] = useState<MatchSetup>(INTERNAL_SETUP);
  const setupRef = useRef<MatchSetup>(INTERNAL_SETUP);
  const [teamBConfig, setTeamBConfig] = useState<TeamConfig>(
    local?.teamBConfig ?? { ...DEFAULT_TEAM_CONFIG }
  );

  // Match duration in minutes for ice time calculation
  const [matchTime, setMatchTime] = useState<number>(local?.matchTime ?? 60);
  // Matchtid från träningen på laget.se – om man inte själv ändrat den för samma träning
  const [matchTimeSource, setMatchTimeSource] = useState<"laget" | "manual" | null>(null);
  const matchTimeManualFor = useRef<string | null>(null);
  const applyTrainingTime = useCallback((r: { eventDate?: string; eventTime?: string; eventEndTime?: string }) => {
    const mins = trainingMinutes(r.eventTime, r.eventEndTime);
    if (!mins || matchTimeManualFor.current === (r.eventDate ?? "")) return;
    setMatchTime(mins);
    setMatchTimeSource("laget");
  }, []);

  // Refs for config so the sync always reads the latest values
  const teamAConfigRef = useRef(teamAConfig);
  useEffect(() => { teamAConfigRef.current = teamAConfig; }, [teamAConfig]);
  const teamBConfigRef = useRef(teamBConfig);
  useEffect(() => { teamBConfigRef.current = teamBConfig; }, [teamBConfig]);

  // Generera slots dynamiskt baserat på config
  const TEAM_A_SLOTS = useMemo(() => createTeamSlots("team-a", teamAConfig), [teamAConfig]);
  const TEAM_B_SLOTS = useMemo(() => createTeamSlots("team-b", teamBConfig), [teamBConfig]);

  // När config minskas: flytta spelare från borttagna slots tillbaka till truppen.
  // (Servern gör samma sak, så en ändring från en annan enhet ger inga dubbletter.)
  useEffect(() => {
    const validSlotIds = new Set([
      ...TEAM_A_SLOTS.map(s => s.id),
      ...TEAM_B_SLOTS.map(s => s.id),
    ]);
    const currentLineup = lineupRef.current;
    const orphanedPlayers: Player[] = [];
    const cleanedLineup: Record<string, Player> = {};
    for (const [slotId, player] of Object.entries(currentLineup)) {
      if (validSlotIds.has(slotId)) {
        cleanedLineup[slotId] = player;
      } else {
        orphanedPlayers.push(player);
      }
    }
    if (orphanedPlayers.length > 0) {
      setLineup(cleanedLineup);
      setAvailablePlayers(prev => [...orphanedPlayers, ...prev]);
    }
  }, [TEAM_A_SLOTS, TEAM_B_SLOTS]);

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [isDragOutside, setIsDragOutside] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showShareTools, setShowShareTools] = useState(false);
  const [showSavedLineups, setShowSavedLineups] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAutoLineup, setShowAutoLineup] = useState(false);
  const [showMatchSetup, setShowMatchSetup] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "saving" | "copied">("idle");

  // Event-info från senaste anmälningshämtning
  const [eventInfo, setEventInfo] = useState<{ title: string; date: string; time?: string; location?: string } | null>(null);

  // Tidstämpel för senaste synk
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const createSavedLineupMutation = trpc.savedLineups.create.useMutation();

  const handleShare = useCallback(async () => {
    setShareState("saving");
    try {
      const result = await createSavedLineupMutation.mutateAsync({
        name: `Delad ${new Date().toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
        teamAName,
        teamBName,
        lineup,
        share: true,
      });
      const url = `${window.location.origin}/lineup/${result.shareId}`;
      await shareOrCopy({ url, title: `${teamAName} – ${teamBName}` }).catch(() => {});
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("idle");
    }
  }, [teamAName, teamBName, lineup, createSavedLineupMutation]);

  // Dela uppställningen som text (samma format som "Kopiera" i Score Tracker).
  const handleShareText = useCallback(async () => {
    const text = lineupStateToText({ teamAName, teamBName, teamAConfig, teamBConfig, lineup });
    try {
      const how = await shareOrCopy({ text, title: "Laguppställning" });
      if (how === "copied") toast.success("Uppställningen kopierad", { description: "Klistra in i valfri chatt" });
    } catch {
      toast.error("Kunde inte dela texten");
    }
  }, [teamAName, teamBName, teamAConfig, teamBConfig, lineup]);
  const [showShareMenu, setShowShareMenu] = useState(false);

  // IDs för medvetet borttagna spelare – hindrar merge från att lägga tillbaka dem
  const [deletedPlayerIds, setDeletedPlayerIds] = useState<Set<string>>(new Set());
  const deletedPlayerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletedPlayerIdsRef.current = deletedPlayerIds; }, [deletedPlayerIds]);

  // Ångra-historik
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const skipNextUndoSnapshot = useRef(false); // hoppa över snapshot vid ångra-återställning

  // Bekräftelsedialog för Rensa

  // Bekräftelsedialog för Auto-fördela

  // Layout-toggle: sidoläge (trupp till vänster, lagen bredvid varandra)
  const [sideLayout, setSideLayout] = useState(() => {
    try {
      return localStorage.getItem("stalstadens-side-layout") === "true";
    } catch {
      return false;
    }
  });
  const toggleSideLayout = useCallback(() => {
    setSideLayout((prev) => {
      const next = !prev;
      try { localStorage.setItem("stalstadens-side-layout", String(next)); } catch {}
      return next;
    });
  }, []);

  // Fast bredd på spelartrupp-kolumnen i sidoläge (samma som standard-layout)
  const ROSTER_WIDTH = 280;

  // Statistik-panel toggle
  const [showStats, setShowStats] = useState(false);

  // PIR visibility (admin-controlled)
  // Sparas per enhet (webbläsaren); standard är allt på
  const [pirSettings, setPirSettings] = useState<PirSettings>(() => loadPirSettings());
  const [pirEnabled, setPirEnabled] = useState(() => loadPirSettings().enabled);
  const handlePirSettingsChange = useCallback((next: PirSettings) => {
    setPirSettings(next);
    setPirEnabled(next.enabled);
    savePirSettings(next);
  }, []);

  const { isAdmin } = useAuth();
  const autoLineupQ = trpc.laget.autoLineup.useQuery(undefined, { enabled: isAdmin, staleTime: 60_000, retry: false });
  // ─── Mot motståndare (beta) ───
  const features = useFeatures();
  const external = setup.mode === "external";
  const opponentQ = trpc.opponents.get.useQuery({ id: setup.opponentId ?? 0 }, { enabled: external && !!setup.opponentId && isAdmin, staleTime: 30_000 });
  const addOpponentPlayerM = trpc.opponents.addPlayer.useMutation();
  const opponentUtils = trpc.useUtils();
  // Tillfälliga länkar ser inte PIR – men Auto balanserar ändå efter det i bakgrunden
  const displayPirSettings = useMemo<PirSettings>(
    () => (isAdmin ? pirSettings : { ...pirSettings, enabled: false, showRating: false, showTrend: false, showTeamStrength: false, showPrediction: false, useForBalance: true }),
    [pirSettings, isAdmin]
  );

  // Toast när någon annan ändrat uppställningen
  const [remoteChangeToast, setRemoteChangeToast] = useState<string | null>(null);
  const remoteToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Refs for team names so pushUndo always reads the latest values
  const teamANameRef = useRef(teamAName);
  useEffect(() => { teamANameRef.current = teamAName; }, [teamAName]);
  const teamBNameRef = useRef(teamBName);
  useEffect(() => { teamBNameRef.current = teamBName; }, [teamBName]);

  // ─── Berikning: vanligaste position och PIR (räknas fram, synkas inte) ─────
  type PirEntry = {
    rating: number; recentRating: number; trend: number; trendLabel: string;
    confidence: number; matchesPlayed: number; adjustment?: number;
    goalkeeperRating: number | null; goalkeeperTrend: number | null; goalkeeperTrendLabel: string | null;
    goalkeeperMatchesPlayed: number; goalkeeperConfidence: number;
    outfieldRating: number | null; outfieldTrend: number | null; outfieldTrendLabel: string | null;
    outfieldMatchesPlayed: number; outfieldConfidence: number;
  };
  type PosEntry = {
    mostPlayed: string; stats: Record<string, number>; mostPlayedTeam?: string; teamStats?: Record<string, number>;
    record?: { season: PlayerRecord & { label: string }; total: PlayerRecord; form?: string };
  };
  const posHistoryRef = useRef<Record<string, PosEntry> | null>(null);
  // Alternativ position: manuell (hybridspelare) och tröskel för historiken
  const altPositionsQ = trpc.players.altPositions.useQuery(undefined, { staleTime: 60_000 });
  const altPosRef = useRef<Record<string, string>>({});
  const [altThreshold, setAltThresholdState] = useState(() => getAltThreshold());
  const altThresholdRef = useRef(altThreshold);
  const pirMapRef = useRef<Record<string, PirEntry> | null>(null);

  const enrichPlayer = useCallback((p: Player): Player => {
    if (!p?.name) return p;
    const enriched: any = { ...p };
    const posHistory = posHistoryRef.current;
    if (posHistory) {
      const hist = posHistory[p.id];
      if (hist?.stats) enriched.positionStats = hist.stats;
      if (hist?.record) {
        enriched.statsSeason = hist.record.season;
        enriched.statsTotal = hist.record.total;
        enriched.statsForm = hist.record.form ?? "";
      }
      // Andra positionen från historiken (om minst X % av matcherna)
      const sec = secondaryFromStats(p.position, hist?.stats, altThresholdRef.current);
      enriched.secondaryPosition = sec?.pos ?? null;
      enriched.secondaryShare = sec?.share;
      if (hist?.mostPlayed) {
        enriched.mostPlayedPosition = hist.mostPlayed;
        if (hist.mostPlayedTeam === "green" || hist.mostPlayedTeam === "white") {
          enriched.mostPlayedTeam = hist.mostPlayedTeam;
        }
      }
    }
    // Manuell alternativ position (går före historiken)
    enriched.altPosition = altPosRef.current[p.id] ?? null;
    const pirMap = pirMapRef.current;
    if (pirMap) {
      const pir = pirMap[p.id];
      if (pir) {
        Object.assign(enriched, {
          pir: pir.rating, pirConfidence: pir.confidence, pirRecent: pir.recentRating,
          pirTrend: pir.trend, pirTrendLabel: pir.trendLabel, pirMatchesPlayed: pir.matchesPlayed,
          pirAdjustment: pir.adjustment ?? 0,
          pirGoalkeeper: pir.goalkeeperRating, pirGoalkeeperTrend: pir.goalkeeperTrend,
          pirGoalkeeperTrendLabel: pir.goalkeeperTrendLabel ?? "stable",
          pirGoalkeeperMatchesPlayed: pir.goalkeeperMatchesPlayed, pirGoalkeeperConfidence: pir.goalkeeperConfidence,
          pirOutfield: pir.outfieldRating, pirOutfieldTrend: pir.outfieldTrend,
          pirOutfieldTrendLabel: pir.outfieldTrendLabel ?? "stable",
          pirOutfieldMatchesPlayed: pir.outfieldMatchesPlayed, pirOutfieldConfidence: pir.outfieldConfidence,
        });
      } else {
        Object.assign(enriched, { pir: 1000, pirConfidence: 0, pirMatchesPlayed: 0, pirTrendLabel: "stable" });
      }
    }
    return enriched as Player;
  }, []);

  const enrichLineup = useCallback((l: Record<string, Player>) => {
    const out: Record<string, Player> = {};
    for (const [slotId, p] of Object.entries(l)) out[slotId] = enrichPlayer(p);
    return out;
  }, [enrichPlayer]);

  // ─── Live-synk ─────────────────────────────────────────────────────────────
  const sync = useLineupDocSync({
    readLocalDoc: () => ({
      players: availablePlayersRef.current,
      lineup: lineupRef.current,
      teamAName: teamANameRef.current,
      teamBName: teamBNameRef.current,
      teamAConfig: teamAConfigRef.current,
      teamBConfig: teamBConfigRef.current,
      deletedPlayerIds: Array.from(deletedPlayerIdsRef.current),
      setup: setupRef.current,
    }),
    writeLocalDoc: (doc) => {
      const players = doc.players.map(enrichPlayer);
      const l = enrichLineup(doc.lineup);
      // Uppdatera refs direkt så att nästa jämförelse ser det nya läget.
      availablePlayersRef.current = players;
      lineupRef.current = l;
      teamANameRef.current = doc.teamAName;
      teamBNameRef.current = doc.teamBName;
      teamAConfigRef.current = doc.teamAConfig;
      teamBConfigRef.current = doc.teamBConfig;
      const deleted = new Set(doc.deletedPlayerIds);
      deletedPlayerIdsRef.current = deleted;
      setAvailablePlayers(players);
      setLineup(l);
      setTeamAName(doc.teamAName);
      setTeamBName(doc.teamBName);
      setTeamAConfig(doc.teamAConfig);
      setTeamBConfig(doc.teamBConfig);
      setDeletedPlayerIds(deleted);
      setupRef.current = doc.setup ?? INTERNAL_SETUP;
      setSetup(doc.setup ?? INTERNAL_SETUP);
    },
    onRemoteChange: (description) => {
      setRemoteChangeToast(description);
      if (remoteToastTimer.current) clearTimeout(remoteToastTimer.current);
      remoteToastTimer.current = setTimeout(() => setRemoteChangeToast(null), 2500);
    },
  });

  // Spärr efter publicering: kontrolleras när uppställningen synkats och varje minut
  const lockStatus = trpc.lineup.lockStatus.useQuery(undefined, { refetchInterval: 60_000, refetchOnWindowFocus: true });
  const unlockLineup = trpc.lineup.unlock.useMutation({ onSuccess: () => { void lockStatus.refetch(); toast.success("Laget är upplåst – Score Tracker använder nuvarande uppställning"); } });
  useEffect(() => {
    if (sync.lastSyncAt) void lockStatus.refetch();
  }, [sync.lastSyncAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Ändrad torsdag 18:43" – hämtas om när uppställningen synkats och varje minut
  const lastChanged = trpc.lineup.lastChanged.useQuery(undefined, { refetchInterval: 30_000, refetchOnWindowFocus: true });
  useEffect(() => {
    if (sync.lastSyncAt) void lastChanged.refetch();
  }, [sync.lastSyncAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bara serverns tid: den sätts när en spelare faktiskt placeras, flyttas, tas ur laget eller
  // läggs till i truppen – inte när sidan laddas eller synken hämtar laget på nytt.
  const changedAt = lastChanged.data?.changedAt ? new Date(lastChanged.data.changedAt) : null;
  // Etiketten räknas om varje minut ("idag 15:05" blir "igår 15:05" vid midnatt)
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const lastChangedLabel = changedAt ? formatChanged(changedAt) : null;
  const sseConnected: boolean | null = sync.status === "live" ? true : sync.status === "connecting" ? null : false;

  // Hämta PIR-inställningar, positionshistorik och PIR-värden (bara för visning).
  useEffect(() => {
    const get = (path: string) =>
      fetch(`/api/trpc/${path}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => json?.result?.data?.json ?? json?.result?.data ?? null)
        .catch(() => null);

    Promise.all([get("lineup.positionHistory"), get("pir.getRatings")]).then(([posHistory, pirArr]) => {
      posHistoryRef.current = posHistory;
      if (Array.isArray(pirArr)) {
        const map: Record<string, PirEntry> = {};
        for (const r of pirArr) map[r.playerKey] = r;
        pirMapRef.current = map;
      }
      // Berika det som redan visas (ändrar inget som synkas).
      setAvailablePlayers((prev) => prev.map(enrichPlayer));
      setLineup((prev) => enrichLineup(prev));
    });
  }, [enrichPlayer, enrichLineup]);

  // Alternativa positioner/tröskel ändrade: berika om det som visas (synkas inte)
  useEffect(() => {
    altPosRef.current = altPositionsQ.data ?? {};
    altThresholdRef.current = altThreshold;
    setAvailablePlayers((prev) => prev.map(enrichPlayer));
    setLineup((prev) => enrichLineup(prev));
  }, [altPositionsQ.data, altThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

  // Varje ändring: spara lokalt (för start utan nät) och skicka till servern.
  useEffect(() => {
    saveLocalState({ availablePlayers, lineup, teamAName, teamBName, teamAConfig, teamBConfig, matchTime });
    sync.notifyLocalChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePlayers, lineup, teamAName, teamBName, deletedPlayerIds, teamAConfig, teamBConfig, matchTime, setup]);

  // Spara en snapshot i undo-stacken
  const pushUndo = useCallback(() => {
    if (skipNextUndoSnapshot.current) {
      skipNextUndoSnapshot.current = false;
      return;
    }
    const snapshot: UndoSnapshot = {
      availablePlayers: availablePlayersRef.current,
      lineup: lineupRef.current,
      teamAConfig: teamAConfigRef.current,
      teamBConfig: teamBConfigRef.current,
      teamAName: teamANameRef.current,
      teamBName: teamBNameRef.current,
    };
    setUndoStack((prev) => {
      const next = [...prev, snapshot];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
  }, []);

  // Återställ senaste snapshot
  // Undo is a local change that SHOULD be saved to server.
  // We use a dedicated undoInProgressRef to prevent the save-effect from
  // firing multiple times as we set multiple state values. The save-effect
  // will fire once after all state updates are batched by React.
  const undoInProgressRef = useRef(false);
  const handleUndoRef = useRef<() => void>(() => {});
  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      skipNextUndoSnapshot.current = true;
      setAvailablePlayers(snapshot.availablePlayers);
      setLineup(snapshot.lineup);
      setTeamAConfig(snapshot.teamAConfig);
      setTeamBConfig(snapshot.teamBConfig);
      setTeamAName(snapshot.teamAName);
      setTeamBName(snapshot.teamBName);
      return prev.slice(0, prev.length - 1);
    });
  }, []);
  useEffect(() => { handleUndoRef.current = handleUndo; }, [handleUndo]);

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

  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500,      // 500ms hold to start drag – tydlig avsikt krävs
        tolerance: 8,    // 8px – fingret måste vara nästan stilla, annars är det scroll
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
    // Vibrera för att bekräfta att drag aktiverats
    if (navigator.vibrate) navigator.vibrate(50);
    // Lås scrollning under drag på mobil
    document.body.classList.add("dnd-scroll-lock");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePlayer(null);
    setIsDragOutside(false);
    document.body.classList.remove("dnd-scroll-lock");
    const { active, over } = event;
    const playerId = active.id as string;
    const sourceSlot = findPlayerSlot(playerId);

    // Dropped on remove-zone, outside any target, or on player-list → remove from slot
    if (!over || over.id === "player-list" || over.id === "remove-zone" || (over && !ALL_SLOT_IDS.has(over.id as string) && over.id !== "player-list")) {
      if (!sourceSlot) return; // was from trupp, nothing to do
      const player = lineup[sourceSlot];
      if (!player) return;
      pushUndo();
      setLineup((prev) => {
        const next = { ...prev };
        delete next[sourceSlot];
        return next;
      });
      setAvailablePlayers((prev) => [player, ...prev]);
      return;
    }

    const targetId = over.id as string;

    if (!ALL_SLOT_IDS.has(targetId)) return;

    const player =
      sourceSlot
        ? lineup[sourceSlot]
        : availablePlayers.find((p) => p.id === playerId);
    if (!player) return;

    pushUndo(); // spara snapshot innan drag-ändringen

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
    // Lägg till i borttagna-listan så merge inte återinför spelaren
    setDeletedPlayerIds((prev) => {
      const next = new Set(prev);
      next.add(playerId);
      deletedPlayerIdsRef.current = next;
      return next;
    });
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
  // Rensa ett lag direkt – går att ångra, därför ingen bekräftelsedialog
  /** Byt matchtyp/motståndare. Vårt lag är alltid lag A; lag B blir motståndaren. */
  const applySetup = useCallback((next: MatchSetup, opponentName?: string) => {
    const prev = setupRef.current;
    pushUndo();
    const current = lineupRef.current;
    const newLineup: Record<string, Player> = {};
    const back: Player[] = [];
    const switching = prev.mode !== next.mode || prev.opponentId !== next.opponentId;
    // Matchens uppställning sparas innan bytet (internmatch och varje motståndare har sin egen)
    if (switching) {
      const slots = Object.fromEntries(Object.entries(current).filter(([, p]) => !isOpponentPlayerId(p.id)).map(([k, p]) => [k, p.id]));
      void opponentUtils.client.lineup.saveContext.mutate({ key: contextKeyOf(prev), slots, teamAConfig: teamAConfigRef.current, teamBConfig: teamBConfigRef.current }).catch(() => undefined);
    }
    for (const [slotId, p] of Object.entries(current)) {
      if (switching && slotId.startsWith("team-b-")) {
        // Lag B töms vid byte: våra spelare tillbaka till truppen, motståndarens försvinner
        if (!isOpponentPlayerId(p.id)) back.push(p);
        continue;
      }
      if (next.mode === "internal" && isOpponentPlayerId(p.id)) continue;
      newLineup[slotId] = p;
    }
    if (switching) {
      setLineup(newLineup);
      if (back.length) setAvailablePlayers((ap) => [...back, ...ap]);
    }
    if (next.mode === "external") {
      setTeamAName((next.ourName || club().name).toUpperCase());
      setTeamBName((opponentName || "Motståndare").toUpperCase());
    } else if (prev.mode === "external") {
      setTeamAName(defaultTeamNames().teamAName);
      setTeamBName(defaultTeamNames().teamBName);
    }
    setupRef.current = next;
    setSetup(next);
    // Ny motståndare: fyll lag B med lagets sparade uppställning (t.ex. ifylld via deras länk)
    if (switching && next.mode === "external" && next.opponentId) {
      const oppId = next.opponentId;
      void Promise.all([
        opponentUtils.client.opponents.get.query({ id: oppId }),
        opponentUtils.client.opponents.storedLineup.query({ id: oppId }),
        opponentUtils.client.opponents.storedList.query({ id: oppId }).catch(() => null),
      ]).then(([o, stored, storedList]) => {
        if (setupRef.current.opponentId !== oppId) return;
        // Laget har en sparad lista (t.ex. ifylld via deras länk): visa som lista, inga platser
        if (Array.isArray(storedList)) {
          const active = new Set(o.players.filter((p) => p.active).map((p) => p.id));
          const next = { ...setupRef.current, oppList: storedList.filter((id) => active.has(id)) };
          setupRef.current = next;
          setSetup(next);
          return;
        }
        const byId = new Map(o.players.filter((p) => p.active).map((p) => [p.id, p]));
        setLineup((prevL) => {
          const out = { ...prevL };
          for (const [slot, pid] of Object.entries(stored)) {
            const p = byId.get(pid);
            if (p && slot.startsWith("team-b-") && !out[slot]) out[slot] = toLineupPlayer(p);
          }
          return out;
        });
      }).catch(() => undefined);
    }
    // ...och den nya matchens sparade uppställning tas fram (vårt lag; vid internmatch båda lagen)
    if (switching) {
      const key = contextKeyOf(next);
      void opponentUtils.client.lineup.context.query({ key }).then((ctx) => {
        if (!ctx || contextKeyOf(setupRef.current) !== key) return;
        restoreContext(ctx.slots, key === "internal" ? ["team-a-", "team-b-"] : ["team-a-"]);
        if (ctx.teamAConfig) setTeamAConfig(ctx.teamAConfig as TeamConfig);
        if (key === "internal" && ctx.teamBConfig) setTeamBConfig(ctx.teamBConfig as TeamConfig);
      }).catch(() => undefined);
    }
  }, [pushUndo]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Ställ upp en sparad matchuppställning: våra spelare på sina platser (för de
   * angivna lagen), övriga tillbaka till truppen. Spelare som inte finns längre hoppas över.
   */
  const restoreContext = useCallback((saved: Record<string, string>, prefixes: string[]) => {
    const inScope = (slot: string) => prefixes.some((pre) => slot.startsWith(pre));
    const cur = lineupRef.current;
    const pool = new Map<string, Player>();
    for (const p of availablePlayersRef.current) pool.set(p.id, p);
    for (const p of Object.values(cur)) if (!isOpponentPlayerId(p.id)) pool.set(p.id, p);
    const nextLineup: Record<string, Player> = {};
    for (const [slot, p] of Object.entries(cur)) if (!inScope(slot) || isOpponentPlayerId(p.id)) nextLineup[slot] = p;
    const placed = new Set(Object.values(nextLineup).map((p) => p.id));
    for (const [slot, id] of Object.entries(saved)) {
      const p = pool.get(id);
      if (!p || !inScope(slot) || placed.has(id) || nextLineup[slot]) continue;
      nextLineup[slot] = p;
      placed.add(id);
    }
    const roster = [...pool.values()].filter((p) => !placed.has(p.id));
    setLineup(nextLineup);
    setAvailablePlayers(roster);
  }, []);

  /** Placera/ta bort en motståndarspelare på lag B (påverkar aldrig vår trupp). */
  const placeOpponent = useCallback((slotId: string, player: Player | null) => {
    pushUndo();
    setLineup((prev) => {
      const next = { ...prev };
      if (player) {
        for (const [k, v] of Object.entries(next)) if (v.id === player.id) delete next[k];
        next[slotId] = player;
      } else delete next[slotId];
      return next;
    });
  }, [pushUndo]);

  /** Motståndaren som lista: spelarna som "platser" per position (nyhet och text) */
  const oppListTeam = useMemo(() => {
    if (!external || !Array.isArray(setup.oppList) || !opponentQ.data) return null;
    const ids = new Set(setup.oppList);
    return listAsSlots(opponentQ.data.players.filter((p) => ids.has(p.id)).map((p) => toLineupPlayer(p)));
  }, [external, setup.oppList, opponentQ.data]);

  /** Motståndaren som lista (utan platser) eller med platser. Till lista: platserna i lag B töms. */
  const setOppList = useCallback((ids: number[] | null) => {
    if (ids !== null && !Array.isArray(setupRef.current.oppList)) {
      pushUndo();
      setLineup((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith("team-b-"))));
    }
    applySetup({ ...setupRef.current, oppList: ids });
    // Sparas också på laget, så att listan finns kvar till nästa match och syns på deras länk
    const oppId = setupRef.current.opponentId;
    if (oppId) void opponentUtils.client.opponents.setStoredList.mutate({ id: oppId, ids }).catch(() => undefined);
  }, [pushUndo, applySetup, opponentUtils]);

  const renderOpponentPanel = (compact: boolean) => (
    <OpponentTeamPanel
      teamName={teamBName || "Motståndare"}
      logoUrl={opponentQ.data?.logoUrl ?? null}
      color={opponentQ.data?.color ?? "#ef4444"}
      config={teamBConfig}
      lineup={Object.fromEntries(Object.entries(lineup).filter(([k]) => k.startsWith("team-b-")))}
      roster={isAdmin && opponentQ.data ? opponentQ.data.players : null}
      onPlace={isAdmin ? placeOpponent : undefined}
      onAddPlayer={isAdmin && setup.opponentId ? async (p) => {
        const r = await addOpponentPlayerM.mutateAsync({ opponentId: setup.opponentId!, name: p.name, number: p.number || null, position: (p.position || null) as never });
        void opponentUtils.opponents.get.invalidate();
        return { id: r.id, name: p.name, number: p.number || null, position: p.position };
      } : undefined}
      compact={compact}
      listIds={setup.oppList ?? null}
      onListChange={isAdmin ? setOppList : undefined}
    />
  );

  const handleRequestClearTeam = useCallback((teamPrefix: string, teamName: string) => {
    pushUndo(); // spara snapshot innan rensning (även lagets storlek)
    const currentLineup = lineupRef.current;
    const removedPlayers: Player[] = [];
    const newLineup: Record<string, Player> = {};
    for (const [slotId, player] of Object.entries(currentLineup)) {
      if (slotId.startsWith(teamPrefix)) removedPlayers.push(player);
      else newLineup[slotId] = player;
    }
    if (removedPlayers.length > 0) {
      setLineup(newLineup);
      const ours = removedPlayers.filter((p) => !isOpponentPlayerId(p.id));
      if (ours.length) setAvailablePlayers((prev) => [...ours, ...prev]);
    }
    // Tillbaka till 1 målvakt, 1 backpar och 1 kedja
    const defaultConfig = { goalkeepers: 1, defensePairs: 1, forwardLines: 1 };
    if (teamPrefix === "team-a-") setTeamAConfig(defaultConfig);
    else setTeamBConfig(defaultConfig);
    toast(`${teamName} rensat`, { action: { label: "Ångra", onClick: () => handleUndoRef.current() }, duration: 5000 });
  }, [pushUndo]);

  // Auto-fördela anmälda spelare på lagen
  /** Räkna fram Auto utan att ändra något (för förhandsvisning). */
  const computeAuto = useCallback((shuffle = false) => {
    const allPlayers = [...availablePlayersRef.current, ...Object.values(lineupRef.current)];
    const result = autoDistribute(allPlayers, {}, { shuffle, useForBalance: displayPirSettings.useForBalance });
    return { allPlayers, result, diff: diffLineups(lineupRef.current, result.lineup) };
  }, [displayPirSettings]);

  // Auto: förhandsvisning – ingen ändring = bara besked, annars bekräftelse med vad som ändras
  const [autoPreview, setAutoPreview] = useState<ReturnType<typeof computeAuto> | null>(null);
  const onAutoClick = useCallback(() => {
    const preview = computeAuto();
    if (isEmptyDiff(preview.diff)) {
      toast.success(doneMessage(preview.diff), { duration: 3000 });
      return;
    }
    setAutoPreview(preview);
  }, [computeAuto]);

  const handleAutoDistribute = useCallback((shuffle = false, precomputed?: ReturnType<typeof computeAuto>) => {
    pushUndo(); // går att ångra
    const { allPlayers, result } = precomputed ?? computeAuto(shuffle);

    // Uppdatera configs
    setTeamAConfig(result.teamAConfig);
    setTeamBConfig(result.teamBConfig);

    // Uppdatera lineup
    setLineup(result.lineup);

    // Kvarvarande spelare tillbaka i truppen
    const placedIds = new Set(Object.values(result.lineup).map(p => p.id));
    const remaining = allPlayers.filter(p => !placedIds.has(p.id));
    setAvailablePlayers(remaining);
  }, [teamAName, teamBName, pushUndo, displayPirSettings]);

  // Demo: simulera X anmälda spelare och kör auto-fördela
  const handleDemo = useCallback(() => {
    if (demoActive) {
      // Avaktivera demo: nollställ alla isRegistered och rensa lagen
      const currentLineup = lineupRef.current;
      const removedPlayers: Player[] = [];
      for (const [, player] of Object.entries(currentLineup)) {
        removedPlayers.push(player);
      }
      const allPlayers = [...availablePlayersRef.current, ...removedPlayers]
        .map(p => ({ ...p, isRegistered: false, isDeclined: false }));
      setLineup({});
      setAvailablePlayers(allPlayers);
      setTeamAConfig({ goalkeepers: 1, defensePairs: 1, forwardLines: 1 });
      setTeamBConfig({ goalkeepers: 1, defensePairs: 1, forwardLines: 1 });
      setDemoActive(false);
      return;
    }

    // Samla alla spelare
    const currentLineup = lineupRef.current;
    const removedPlayers: Player[] = [];
    for (const [, player] of Object.entries(currentLineup)) {
      removedPlayers.push(player);
    }
    const allPlayers = [...availablePlayersRef.current, ...removedPlayers]
      .map(p => ({ ...p, isRegistered: false, isDeclined: false }));

    // Separera efter position
    const goalkeepers = allPlayers.filter(p => p.position === "MV");
    const defenders = allPlayers.filter(p => p.position === "B");
    const centers = allPlayers.filter(p => p.position === "C");
    const forwards = allPlayers.filter(p => p.position === "F");
    const others = allPlayers.filter(p => p.position === "IB");

    // Fisher-Yates shuffle
    const shuffle = <T,>(arr: T[]): T[] => {
      const s = [...arr];
      for (let i = s.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [s[i], s[j]] = [s[j], s[i]];
      }
      return s;
    };

    // Alltid 17 anmälda i demoläget, varav 2 målvakter
    const count = Math.min(DEMO_PLAYER_COUNT, allPlayers.length);
    const selected = new Set<string>();

    // Garantera minst 1 MV (om det finns)
    if (goalkeepers.length > 0) {
      const gk = shuffle(goalkeepers);
      // Ta 1-2 MV beroende på count
      const mvCount = Math.min(2, gk.length);
      for (let i = 0; i < mvCount; i++) selected.add(gk[i].id);
    }

    // Garantera backar (ca 30% av utespelare)
    const outfieldNeeded = count - selected.size;
    const defNeeded = Math.min(Math.max(2, Math.round(outfieldNeeded * 0.3)), defenders.length);
    const shuffledDef = shuffle(defenders);
    for (let i = 0; i < defNeeded && selected.size < count; i++) selected.add(shuffledDef[i].id);

    // Garantera centrar (ca 15% av utespelare)
    const cNeeded = Math.min(Math.max(1, Math.round(outfieldNeeded * 0.15)), centers.length);
    const shuffledC = shuffle(centers);
    for (let i = 0; i < cNeeded && selected.size < count; i++) selected.add(shuffledC[i].id);

    // Fyll med forwards
    const shuffledF = shuffle(forwards);
    for (const f of shuffledF) {
      if (selected.size >= count) break;
      selected.add(f.id);
    }

    // Fyll resten med IB/övriga
    const shuffledOthers = shuffle(others);
    for (const o of shuffledOthers) {
      if (selected.size >= count) break;
      selected.add(o.id);
    }

    // Markera valda som anmälda
    const updatedPlayers = allPlayers.map(p => ({
      ...p,
      isRegistered: selected.has(p.id),
      isDeclined: false,
    }));

    // Uppdatera state: markera som anmälda i spelartruppen, användaren får själv köra Auto
    setLineup({});
    setAvailablePlayers(updatedPlayers);
    setDemoActive(true);
  }, [demoActive]);


  // Ladda en sparad uppställning
  const handleLoadLineup = useCallback((saved: { id: string; name: string; teamAName: string; teamBName: string; lineup: Record<string, Player>; savedAt: number }) => {
    pushUndo();

    // Guard against malformed saved lineups (lineup may be null/undefined in old entries)
    const safeLineup: Record<string, Player> = saved.lineup ?? {};

    // Infer team configs from slot IDs in the saved lineup.
    // Slot naming: team-a-gk-1, team-a-gk-2, team-a-def-{pair}-{1|2}, team-a-fwd-{chain}-{lw|c|rw}
    const inferConfig = (teamId: string) => {
      let goalkeepers = 1;
      let defensePairs = 1;
      let forwardLines = 1;
      for (const slotId of Object.keys(safeLineup)) {
        if (!slotId.startsWith(teamId)) continue;
        const gkMatch = slotId.match(new RegExp(`^${teamId}-gk-(\\d+)$`));
        if (gkMatch) goalkeepers = Math.max(goalkeepers, parseInt(gkMatch[1], 10));
        const defMatch = slotId.match(new RegExp(`^${teamId}-def-(\\d+)-`));
        if (defMatch) defensePairs = Math.max(defensePairs, parseInt(defMatch[1], 10));
        const fwdMatch = slotId.match(new RegExp(`^${teamId}-fwd-(\\d+)-`));
        if (fwdMatch) forwardLines = Math.max(forwardLines, parseInt(fwdMatch[1], 10));
      }
      return { goalkeepers: Math.min(goalkeepers, 2), defensePairs: Math.min(defensePairs, 4), forwardLines: Math.min(forwardLines, 4) };
    };

    const newConfigA = inferConfig("team-a");
    const newConfigB = inferConfig("team-b");

    // Build a map of current player data (live registration status, PIR, etc.)
    const allKnownPlayers = [
      ...availablePlayersRef.current,
      ...Object.values(lineupRef.current),
    ];
    const seen = new Set<string>();
    const allUnique = allKnownPlayers.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    const currentPlayerMap = new Map(allUnique.map((p) => [p.id, p]));

    // Merge saved lineup with current live data: keep slot placement from saved,
    // but preserve current isRegistered, isDeclined, PIR, gamesPlayed, etc.
    const mergedLineup: Record<string, Player> = {};
    for (const [slotId, savedPlayer] of Object.entries(safeLineup)) {
      const current = currentPlayerMap.get(savedPlayer.id);
      if (current) {
        // Bara platsen tas från den sparade uppställningen. Spelarens uppgifter (namn,
        // nummer, lag, C/A, anmälan, PIR …) är alltid de aktuella – annars skrevs t.ex.
        // lagfärgen över av en gammal kopia.
        mergedLineup[slotId] = {
          ...savedPlayer,
          ...current,
          isRegistered: current.isRegistered,
          isDeclined: current.isDeclined,
          pir: current.pir,
          pirRecent: current.pirRecent,
          pirTrend: current.pirTrend,
          pirTrendLabel: current.pirTrendLabel,
          pirMatchesPlayed: current.pirMatchesPlayed,
          pirConfidence: current.pirConfidence,
          pirGoalkeeper: current.pirGoalkeeper,
          pirGoalkeeperTrend: current.pirGoalkeeperTrend,
          pirGoalkeeperTrendLabel: current.pirGoalkeeperTrendLabel,
          pirGoalkeeperMatchesPlayed: current.pirGoalkeeperMatchesPlayed,
          pirGoalkeeperConfidence: current.pirGoalkeeperConfidence,
          pirOutfield: current.pirOutfield,
          pirOutfieldTrend: current.pirOutfieldTrend,
          pirOutfieldTrendLabel: current.pirOutfieldTrendLabel,
          pirOutfieldMatchesPlayed: current.pirOutfieldMatchesPlayed,
          pirOutfieldConfidence: current.pirOutfieldConfidence,
          gamesPlayed: current.gamesPlayed,
          mostPlayedPosition: current.mostPlayedPosition,
          mostPlayedTeam: current.mostPlayedTeam,
        };
      } else {
        // Player no longer exists in current roster — keep saved data as-is
        mergedLineup[slotId] = savedPlayer;
      }
    }

    const savedLineupIds = new Set(Object.values(safeLineup).map((p) => p.id));
    const newAvailable = allUnique.filter((p) => !savedLineupIds.has(p.id));

    setTeamAConfig(newConfigA);
    setTeamBConfig(newConfigB);
    setLineup(mergedLineup);
    setAvailablePlayers(newAvailable);
    setTeamAName(saved.teamAName ?? "");
    setTeamBName(saved.teamBName ?? "");
  }, [pushUndo]);

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

  const handleChangeName = useCallback((playerId: string, name: string) => {
    const update = (p: Player) => p.id === playerId ? { ...p, name } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  const handleChangeCaptainRole = useCallback((playerId: string, role: CaptainRole) => {
    const update = (p: Player) => p.id === playerId ? { ...p, captainRole: role } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  const handleChangeRegistered = useCallback((playerId: string, isRegistered: boolean) => {
    const update = (p: Player) => p.id === playerId ? { ...p, isRegistered } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  const handleChangeGamesPlayed = useCallback((playerId: string, gamesPlayed: number) => {
    const update = (p: Player) => p.id === playerId ? { ...p, gamesPlayed } : p;
    setAvailablePlayers((prev) => prev.map(update));
    setLineup((prev) => {
      const next = { ...prev };
      for (const [slotId, p] of Object.entries(next)) {
        if (p.id === playerId) next[slotId] = update(p);
      }
      return next;
    });
  }, []);

  // Hämta anmälningar från laget.se via backend-API och markera matchade spelare
  const handleBulkRegister = useCallback(async (forceRefresh = false): Promise<{ matched: number; declined?: number; unmatched: string[]; unmatchedDeclined?: string[]; changes?: string[]; eventTitle?: string; eventDate?: string; eventTime?: string; eventEndTime?: string; eventLocation?: string; error?: string; noEvent?: boolean }> => {
    try {
      const data = await fetchAttendanceFromApi(forceRefresh);

      if (data.error) {
        return { matched: 0, unmatched: [], error: data.error };
      }

      if (data.noEvent) {
        // Inget event idag/imorgon — nollställ alla anmälningar
        const clearRegistered = (p: Player): Player => ({ ...p, isRegistered: false, isDeclined: false });
        setAvailablePlayers((prev) => prev.map(clearRegistered));
        setLineup((prev) => {
          const next: Record<string, Player> = {};
          for (const [slotId, p] of Object.entries(prev)) {
            next[slotId] = clearRegistered(p);
          }
          return next;
        });
        return { matched: 0, unmatched: [], noEvent: true };
      }

      const { matchedIds, unmatchedNames } = matchRegisteredPlayers(
        data.registeredNames,
        availablePlayersRef.current,
        lineupRef.current
      );
      const matchedSet = new Set(matchedIds);

      // Matcha avböjda spelare
      const declinedResult = matchDeclinedPlayers(
        data.declinedNames || [],
        availablePlayersRef.current,
        lineupRef.current
      );
      const declinedSet = new Set(declinedResult.matchedIds);

      // Uppdatera alla spelares isRegistered och isDeclined
      const updatePlayer = (p: Player): Player => ({
        ...p,
        isRegistered: matchedSet.has(p.id),
        isDeclined: declinedSet.has(p.id) && !matchedSet.has(p.id),
      });

      // Vad ändrades? (visas i beskedet, så att det syns vad synken gjorde)
      const statusOf = (p: Player) => (p.isRegistered ? "kommer" : p.isDeclined ? "kommer ej" : "inte svarat");
      const changes: string[] = [];
      const seenIds = new Set<string>();
      for (const p of [...Object.values(lineupRef.current), ...availablePlayersRef.current]) {
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        const before = statusOf(p), after = statusOf(updatePlayer(p));
        if (before !== after) changes.push(`${p.name}: ${after}`);
      }

      setAvailablePlayers((prev) => prev.map(updatePlayer));
      setLineup((prev) => {
        const next: Record<string, Player> = {};
        for (const [slotId, p] of Object.entries(prev)) {
          next[slotId] = updatePlayer(p);
        }
        return next;
      });

      // Sätt tidstämpel för senaste synk
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }));

      return {
        matched: matchedIds.length, declined: declinedResult.matchedIds.length,
        unmatched: unmatchedNames, unmatchedDeclined: declinedResult.unmatchedNames ?? [],
        changes, eventTitle: data.eventTitle, eventDate: data.eventDate, eventTime: data.eventTime, eventEndTime: data.eventEndTime, eventLocation: data.eventLocation,
      };
    } catch (err: any) {
      return { matched: 0, unmatched: [], error: err.message || "Kunde inte hämta data" };
    }
  }, []);

  // Spåra vilka spelare som synkas just nu
  const [syncingPlayerIds, setSyncingPlayerIds] = useState<Set<string>>(new Set());

  // Synka en spelares status till laget.se och uppdatera lokalt
  const handleSyncToLaget = useCallback(async (playerId: string, playerName: string, status: "Attending" | "NotAttending" | "NotAnswered") => {
    setSyncingPlayerIds((prev) => new Set(prev).add(playerId));
    try {
      const result = await updateAttendanceOnLaget(playerName, status);
      if (!result.success) {
        alert(`Kunde inte uppdatera ${playerName} på laget.se: ${result.error}`);
        return;
      }
      // Uppdatera lokal status baserat på vad vi satte
      const isRegistered = status === "Attending";
      const isDeclined = status === "NotAttending";
      const update = (p: Player): Player => p.id === playerId ? { ...p, isRegistered, isDeclined } : p;
      setAvailablePlayers((prev) => prev.map(update));
      setLineup((prev) => {
        const next = { ...prev };
        for (const [slotId, p] of Object.entries(next)) {
          if (p.id === playerId) next[slotId] = update(p);
        }
        return next;
      });
    } finally {
      setSyncingPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
    // Hämta om från laget.se för att säkerställa synk
    setTimeout(() => handleBulkRegister(true), 2000);
  }, [handleBulkRegister]);

  // Bulk-ändra status för flera spelare till laget.se
  const handleBulkSyncToLaget = useCallback(async (playerIds: string[], status: "Attending" | "NotAttending" | "NotAnswered") => {
    // Hitta spelarnamn för varje ID
    const allPlayers = [...availablePlayersRef.current, ...Object.values(lineupRef.current)];
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    
    // Kör sekventiellt för att inte överbelasta laget.se
    for (const id of playerIds) {
      const player = playerMap.get(id);
      if (!player) continue;
      await handleSyncToLaget(id, player.name, status);
    }
  }, [handleSyncToLaget]);

  // Auto-hämta anmälningar vid sidladdning — vänta tills initial state har laddats
  // så att matchRegisteredPlayers har spelare att matcha mot
  const autoFetchDone = useRef(false);
  useEffect(() => {
    if (autoFetchDone.current) return;
    if (!sync.ready) return; // Vänta på server-state först
    autoFetchDone.current = true;
    // Liten fördröjning så att serverns state hunnit renderas
    setTimeout(() => {
      handleBulkRegister().then((result) => {
        if (result.eventTitle) {
          setEventInfo({ title: result.eventTitle, date: result.eventDate || "", time: result.eventTime, location: result.eventLocation });
          applyTrainingTime(result);
        } else if (result.noEvent) {
          setEventInfo(null);
        }
      });
    }, 100);
  }, [handleBulkRegister, availablePlayers, sync.ready]);

  const [mobileTab, setMobileTabRaw] = useState<MobileTab>("trupp");
  const [dragHoverTab, setDragHoverTab] = useState<MobileTab | null>(null);

  // Mobile roster drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Mobile empty slot picker state
  const [mobileSlotPicker, setMobileSlotPicker] = useState<{ slotId: string; slotType: string; teamId: string; teamName: string; slotLabel: string } | null>(null);

  const handleEmptySlotClickA = useCallback((slotId: string, slotType: string) => {
    const slot = TEAM_A_SLOTS.find(s => s.id === slotId);
    setMobileSlotPicker({ slotId, slotType, teamId: "team-a", teamName: teamAName, slotLabel: slot?.shortLabel ?? slotType });
  }, [TEAM_A_SLOTS, teamAName]);

  const handleEmptySlotClickB = useCallback((slotId: string, slotType: string) => {
    const slot = TEAM_B_SLOTS.find(s => s.id === slotId);
    setMobileSlotPicker({ slotId, slotType, teamId: "team-b", teamName: teamBName, slotLabel: slot?.shortLabel ?? slotType });
  }, [TEAM_B_SLOTS, teamBName]);

  // ─── Desktop: vald tom plats → truppen sorteras för platsen, klick placerar ───
  const [desktopTarget, setDesktopTarget] = useState<{ slotId: string; slotType: string; teamId: string; teamName: string; slotLabel: string } | null>(null);
  const handleDesktopSlotClickA = useCallback((slotId: string, slotType: string) => {
    const slot = TEAM_A_SLOTS.find(s => s.id === slotId);
    setDesktopTarget(prev => prev?.slotId === slotId ? null : { slotId, slotType, teamId: "team-a", teamName: teamAName, slotLabel: slot?.shortLabel ?? slotType });
  }, [TEAM_A_SLOTS, teamAName]);
  const handleDesktopSlotClickB = useCallback((slotId: string, slotType: string) => {
    const slot = TEAM_B_SLOTS.find(s => s.id === slotId);
    setDesktopTarget(prev => prev?.slotId === slotId ? null : { slotId, slotType, teamId: "team-b", teamName: teamBName, slotLabel: slot?.shortLabel ?? slotType });
  }, [TEAM_B_SLOTS, teamBName]);
  // Platsen fylldes på annat sätt (dra och släpp, synk) → släpp valet
  useEffect(() => {
    if (desktopTarget && lineup[desktopTarget.slotId]) setDesktopTarget(null);
  }, [desktopTarget, lineup]);
  // Esc avbryter
  useEffect(() => {
    if (!desktopTarget) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDesktopTarget(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktopTarget]);

  // Tap-to-assign: placera en spelare i nästa lediga slot i valt lag
  const handleTapAssign = useCallback((player: Player, team: "team-a" | "team-b") => {
    const slots = team === "team-a" ? TEAM_A_SLOTS : TEAM_B_SLOTS;
    const currentLineup = lineupRef.current;
    // Hitta första lediga slot
    const emptySlot = slots.find(s => !currentLineup[s.id]);
    if (!emptySlot) return; // Laget är fullt
    pushUndo();
    setAvailablePlayers(prev => prev.filter(p => p.id !== player.id));
    setLineup(prev => ({ ...prev, [emptySlot.id]: player }));
  }, [TEAM_A_SLOTS, TEAM_B_SLOTS, pushUndo]);

  // Tap-to-assign to a specific slot (mobile slot picker)
  const handleTapAssignToSlot = useCallback((player: Player, slotId: string) => {
    pushUndo();
    setAvailablePlayers(prev => prev.filter(p => p.id !== player.id));
    setLineup(prev => ({ ...prev, [slotId]: player }));
  }, [pushUndo]);

  // Add defense pair for a team (mobile slot picker)
  const handleAddDefensePair = useCallback((team: "team-a" | "team-b") => {
    const setter = team === "team-a" ? setTeamAConfig : setTeamBConfig;
    setter(prev => ({
      ...prev,
      defensePairs: Math.min(prev.defensePairs + 1, MAX_TEAM_CONFIG.defensePairs),
    }));
  }, []);

  // Add forward line for a team (mobile slot picker)
  const handleAddForwardLine = useCallback((team: "team-a" | "team-b") => {
    const setter = team === "team-a" ? setTeamAConfig : setTeamBConfig;
    setter(prev => ({
      ...prev,
      forwardLines: Math.min(prev.forwardLines + 1, MAX_TEAM_CONFIG.forwardLines),
    }));
  }, []);

  // Wrapper med haptic feedback vid flikbyte
  const setMobileTab = useCallback((valOrFn: MobileTab | ((prev: MobileTab) => MobileTab)) => {
    setMobileTabRaw((prev) => {
      const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      if (next !== prev && navigator.vibrate) {
        navigator.vibrate(10);
      }
      return next;
    });
  }, []);

  // Swipe-gester för mobilflikar
  const TAB_ORDER: MobileTab[] = sideLayout
    ? ["trupp", "vita", "grona"]
    : ["vita", "trupp", "grona"];
  const swipeRef = useSwipe({
    onSwipeLeft: () => {
      setMobileTab((prev) => {
        const idx = TAB_ORDER.indexOf(prev);
        return idx < TAB_ORDER.length - 1 ? TAB_ORDER[idx + 1] : prev;
      });
    },
    onSwipeRight: () => {
      setMobileTab((prev) => {
        const idx = TAB_ORDER.indexOf(prev);
        return idx > 0 ? TAB_ORDER[idx - 1] : prev;
      });
    },
    minDistance: 50,
    maxVertical: 80,
    enabled: isMobile, // Bara swipe i mobilvy
  });
  const tabHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredTabRef = useRef<MobileTab | null>(null);

  // Automatiskt flikbyte vid drag: håll spelaren över en flik-knapp i 600ms
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Använd touch/pointer-koordinater från dnd-kit aktivator
    const activatorEvent = event.activatorEvent as TouchEvent | PointerEvent | MouseEvent;
    let clientX = 0;
    let clientY = 0;
    if ("touches" in activatorEvent && activatorEvent.touches.length > 0) {
      // För touch: använd delta + startposition
      const touch = (event.active.rect.current.translated);
      if (touch) {
        clientX = touch.left + touch.width / 2;
        clientY = touch.top + touch.height / 2;
      }
    } else {
      // För pointer/mus: använd overlay-kortets mittpunkt
      const rect = event.active.rect.current.translated;
      if (rect) {
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }
    }

    if (clientX === 0 && clientY === 0) return;

    const screenWidth = window.innerWidth;
    const EDGE_ZONE = 40; // px från skärmkant

    // Kolla om positionen är vid skärmkanten (drag-to-edge)
    let edgeTab: MobileTab | null = null;
    if (clientX <= EDGE_ZONE) {
      // Vänster kant → föregående flik
      const idx = TAB_ORDER.indexOf(mobileTab);
      if (idx > 0) edgeTab = TAB_ORDER[idx - 1];
    } else if (clientX >= screenWidth - EDGE_ZONE) {
      // Höger kant → nästa flik
      const idx = TAB_ORDER.indexOf(mobileTab);
      if (idx < TAB_ORDER.length - 1) edgeTab = TAB_ORDER[idx + 1];
    }

    // Kolla om positionen överlappas med en flik-knapp
    const tabButtons = document.querySelectorAll<HTMLElement>("[data-mobile-tab]");
    let hoveredTab: MobileTab | null = null;
    tabButtons.forEach((btn) => {
      const rect = btn.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        hoveredTab = btn.dataset.mobileTab as MobileTab;
      }
    });

    // Prioritera edge-detection, sedan tab-hover
    const targetTab = edgeTab || hoveredTab;

    if (targetTab && targetTab !== lastHoveredTabRef.current) {
      lastHoveredTabRef.current = targetTab;
      setDragHoverTab(targetTab);
      if (tabHoverTimerRef.current) clearTimeout(tabHoverTimerRef.current);
      const tabToSwitch = targetTab;
      tabHoverTimerRef.current = setTimeout(() => {
        setMobileTab(tabToSwitch);
        setDragHoverTab(null);
      }, edgeTab ? 400 : 600); // Snabbare vid skärmkant
    } else if (!targetTab) {
      lastHoveredTabRef.current = null;
      setDragHoverTab(null);
      if (tabHoverTimerRef.current) {
        clearTimeout(tabHoverTimerRef.current);
        tabHoverTimerRef.current = null;
      }
    }
  }, [mobileTab]);

  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  for (const [slotId, player] of Object.entries(lineup)) {
    if (slotId.startsWith("team-a-")) teamALineup[slotId] = player;
    else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player;
  }

  const teamACount = Object.keys(teamALineup).length;
  const teamBCount = Object.keys(teamBLineup).length;
  const totalSlotsA = TEAM_A_SLOTS.length;
  const totalSlotsB = TEAM_B_SLOTS.length;

  // Antal anmälda spelare i varje lag
  const teamARegistered = Object.values(teamALineup).filter(p => p.isRegistered).length;
  const teamBRegistered = Object.values(teamBLineup).filter(p => p.isRegistered).length;

  // Totalt antal anmälda (trupp + lineup)
  const totalRegistered = useMemo(() => {
    const inList = availablePlayers.filter(p => p.isRegistered).length;
    const inLineup = Object.values(lineup).filter(p => p.isRegistered).length;
    return inList + inLineup;
  }, [availablePlayers, lineup]);

  // Totalt antal avböjda (trupp + lineup)
  const totalDeclined = useMemo(() => {
    const inList = availablePlayers.filter(p => p.isDeclined).length;
    const inLineup = Object.values(lineup).filter(p => p.isDeclined).length;
    return inList + inLineup;
  }, [availablePlayers, lineup]);

  // Totalt antal spelare (trupp + lineup)
  const totalPlayers = availablePlayers.length + Object.keys(lineup).length;
  // Truppens siffror (samma på mobil och desktop)
  const rosterCounts = useMemo(() => ({
    total: totalPlayers,
    registered: totalRegistered,
    declined: totalDeclined,
    unplacedRegistered: availablePlayers.filter((p) => p.isRegistered).length,
  }), [totalPlayers, totalRegistered, totalDeclined, availablePlayers]);

  // Kollisionsdetektion: pointerWithin först, sedan closestCenter som fallback.
  // Eftersom vi nu bara renderar EN layout (åt gången) behövs ingen filtrering.
  const pointerWithinOrClosest: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  };

  // ─── Snabbknappar: ångra, auto-fördela, nyhet till laget.se, hämta anmälda ───
  // Ligger mellan Trupp och lagräknarna (mobil) respektive ovanför lagen (desktop).
  const [syncingAttendance, setSyncingAttendance] = useState(false);
  // Kvitto på knappen några sekunder efter hämtningen: anmälda (grönt) / tackat nej (rött)
  const [syncReceipt, setSyncReceipt] = useState<{ ok: true; matched: number; declined: number } | { ok: false; error: string } | null>(null);
  const syncReceiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSyncAttendance = async () => {
    if (syncingAttendance) return;
    setSyncingAttendance(true);
    setSyncReceipt(null);
    try {
      const result = await handleBulkRegister(true);
      if (result.eventTitle) {
        setEventInfo({ title: result.eventTitle, date: result.eventDate || "", time: result.eventTime, location: result.eventLocation });
        applyTrainingTime(result);
      }
      // Visa vad som ändrades och vilka namn från laget.se som inte hittades i truppen
      if (!result.error && !result.noEvent) {
        const missing = [...(result.unmatched ?? []), ...(result.unmatchedDeclined ?? [])];
        const lines = [
          result.changes?.length ? `Ändrat: ${result.changes.join(", ")}` : "Inga ändringar",
          missing.length ? `Hittades inte i truppen: ${missing.join(", ")}` : "",
        ].filter(Boolean);
        toast(result.eventTitle ? `Anmälningar – ${result.eventTitle}${result.eventDate ? ` ${result.eventDate}` : ""}` : "Anmälningar hämtade", { description: lines.join("\n"), duration: 7000 });
      }
      setSyncReceipt(
        result.error ? { ok: false, error: result.error }
        : result.noEvent ? { ok: false, error: "Inget kommande evenemang på laget.se" }
        : { ok: true, matched: result.matched, declined: result.declined ?? 0 }
      );
    } catch (err) {
      setSyncReceipt({ ok: false, error: (err as Error)?.message || "Kunde inte hämta" });
    } finally {
      setSyncingAttendance(false);
      if (syncReceiptTimer.current) clearTimeout(syncReceiptTimer.current);
      syncReceiptTimer.current = setTimeout(() => setSyncReceipt(null), 4000);
    }
  };
  const renderQuickActions = (withLabels: boolean) => {
    const btn = "flex items-center gap-1.5 rounded-lg font-bold uppercase tracking-wider transition-all disabled:opacity-35 disabled:cursor-not-allowed";
    const size = withLabels ? "px-3 py-1.5 text-[11px]" : "p-1.5";
    const icon = withLabels ? "w-3.5 h-3.5" : "w-4 h-4";
    const label = (t: string) => (withLabels ? <span>{t}</span> : null);
    return (
      <div className={`flex items-center ${withLabels ? "gap-2" : "gap-1.5"}`}>
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          title={`Ångra (Ctrl+Z) – ${undoStack.length} steg`}
          aria-label="Ångra"
          className={`${btn} ${size} ${isLineupDark ? "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10" : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200"}`}
        >
          <Undo2 className={icon} />{label("Ångra")}
        </button>
        <button
          disabled={external}
          onClick={onAutoClick}
          title="Fördela anmälda spelare automatiskt (går att ångra)"
          aria-label="Auto-fördela"
          className={`${btn} ${size} bg-emerald-500 text-white hover:bg-emerald-400`}
        >
          <Shuffle className={icon} />{label("Auto")}
        </button>
        {isAdmin && (
        <button
            onClick={() => setShowNews(true)}
            title="Nyhet till laget.se"
            aria-label="Nyhet till laget.se"
            className={`${btn} ${size} bg-sky-500 text-white hover:bg-sky-400`}
          >
            <Newspaper className={icon} />{label("Nyhet")}
          </button>
        )}
        <button
          onClick={handleSyncAttendance}
          disabled={syncingAttendance}
          title={
            syncReceipt?.ok ? `Hämtat: ${syncReceipt.matched} anmälda, ${syncReceipt.declined} tackat nej`
            : syncReceipt ? `Misslyckades: ${syncReceipt.error}`
            : "Hämta anmälda från laget.se"
          }
          aria-label="Hämta anmälda från laget.se"
          aria-live="polite"
          className={`${btn} ${size} ${
            syncReceipt?.ok ? "bg-emerald-600 text-white border border-emerald-400/60"
            : syncReceipt ? "bg-red-600 text-white border border-red-400/60"
            : isLineupDark ? "bg-violet-500/20 border border-violet-400/40 text-violet-200 hover:bg-violet-500/30" : "bg-violet-100 border border-violet-200 text-violet-700 hover:bg-violet-200"
          }`}
        >
          {syncReceipt?.ok ? (
            <span className="flex items-center gap-1 tabular-nums normal-case tracking-normal">
              <Check className={icon} />
              <span>{syncReceipt.matched}</span>
              <span className="ml-0.5 px-1 rounded bg-red-500 text-white" title="Tackat nej">{syncReceipt.declined}</span>
              {withLabels && <span className="font-medium text-white/80">anmälda / nej</span>}
            </span>
          ) : syncReceipt ? (
            <><XIconSmall className={icon} />{label("Fel")}</>
          ) : (
            <><RefreshCw className={`${icon} ${syncingAttendance ? "animate-spin" : ""}`} />{label("Anmälda")}</>
          )}
        </button>
        <button
          onClick={() => setShowSavedLineups(true)}
          title="Sparade uppställningar – spara eller hämta"
          aria-label="Sparade uppställningar"
          className={`${btn} ${size} ${isLineupDark ? "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10" : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200"}`}
        >
          <BookmarkPlus className={icon} />{label("Sparade")}
        </button>
      </div>
    );
  };

  return (
    <PirSettingsProvider settings={displayPirSettings}>
    <div className={`overflow-x-hidden max-w-[100vw] ${isLineupDark ? '' : 'lineup-light'}`}>
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithinOrClosest}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ enabled: true, threshold: { x: 0.15, y: 0.15 } }}
      onDragStart={handleDragStart}
      onDragMove={(e) => {
        handleDragMove(e);
        // Track if dragging from a slot and currently not over any valid target
        const playerId = e.active.id as string;
        const sourceSlot = findPlayerSlot(playerId);
        if (sourceSlot) {
          // Check collision: is the pointer over any droppable?
          const overAny = e.over;
          const overRemoveZone = overAny && overAny.id === "remove-zone";
          setIsDragOutside(!overAny || !!overRemoveZone);
        } else {
          setIsDragOutside(false);
        }
      }}
      onDragEnd={(e) => {
        // Rensa flik-hover-timer vid drag-slut
        if (tabHoverTimerRef.current) {
          clearTimeout(tabHoverTimerRef.current);
          tabHoverTimerRef.current = null;
        }
        lastHoveredTabRef.current = null;
        setDragHoverTab(null);
        document.body.classList.remove("dnd-scroll-lock");
        handleDragEnd(e);
      }}
    >
      {/* Solid dark background matching mockup */}
      <div
        className={`min-h-screen w-full relative overflow-x-hidden ${isLineupDark ? 'bg-[#0c1424]' : 'bg-gray-100'}`}
      >

        <div
          className="relative flex flex-col min-h-screen"
        >
          {/* Header – compact toolbar matching mockup exactly */}
          <header className="shrink-0">
            <div className="glass-header px-3 py-1.5 sm:py-2">
              <div className={`flex items-center gap-2 mx-auto ${!isMobile && !sideLayout ? "max-w-[940px]" : "max-w-[1400px]"}`}>
              {/* Logga, namn (länk hem) till vänster – verktygen (hem, anslutning, meny) längst till höger */}
              <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0 flex-1">
              {/* Left: Logo + title + event info */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Link href="/">
                  <img src={club().logo} alt={club().name} className="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0" />
                </Link>
                <Link href="/" className="leading-tight min-w-0 block" title="Till startsidan">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1
                      className={`text-xs sm:text-sm font-black tracking-widest uppercase truncate ${isLineupDark ? 'text-white' : 'text-gray-900'}`}
                      style={{ fontFamily: "'Oswald', sans-serif" }}
                    >
                      Stålstadens SF
                    </h1>
                    {/* När uppställningen senast ändrades – direkt efter klubbnamnet */}
                    {lastChangedLabel && (
                      <span
                        className={`shrink-0 text-[8px] sm:text-[10px] font-medium px-1.5 py-px rounded-full whitespace-nowrap ${isLineupDark ? 'text-white/55 bg-white/5' : 'text-gray-500 bg-gray-100'}`}
                        title="Senast en spelare placerades, flyttades, togs ur laget eller lades till"
                      >
                        Ändrad {lastChangedLabel}
                      </span>
                    )}
                  </div>
                  {eventInfo ? (
                    <p className={`flex items-center gap-1 text-[8px] sm:text-[9px] font-medium truncate ${isLineupDark ? 'text-sky-300/70' : 'text-sky-600'}`}>
                      <CalendarDays className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{eventLabel(eventInfo)}</span>
                    </p>
                  ) : (
                    <p className={`text-[8px] sm:text-[9px] ${isLineupDark ? 'text-white/30' : 'text-gray-400'}`}>Formations-verktyg</p>
                  )}
                </Link>
              </div>

              {/* ── VERKTYGSRAD: Hem, anslutning och meny/inställningar (samma på mobil och desktop) ── */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Home icon-only */}
                  <a
                    href="/"
                    title="Hem"
                    className={`p-1 rounded transition-all ${isLineupDark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                  >
                    <HomeIcon className="w-3.5 h-3.5" />
                  </a>

                  {/* SSE sync dot */}
                  <div className="flex items-center mr-0.5">
                    {sseConnected === null ? (
                      <span className="text-[8px] text-white/30">...</span>
                    ) : sseConnected ? (
                      <Wifi className="w-3 h-3 text-emerald-400/60" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-400" />
                    )}
                  </div>

                  {/* Overflow menu trigger */}
                  <div className="relative">
                    <button
                      onClick={() => setShowHeaderMenu((v) => !v)}
                      data-settings-btn
                      title="Meny och inställningar"
                      className={`p-1 rounded transition-all ${
                        showHeaderMenu
                          ? 'text-white bg-white/15'
                          : isLineupDark
                            ? 'text-white/40 hover:text-white/70 hover:bg-white/8'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    {/* Dropdown menu */}
                    {showHeaderMenu && (
                      <>
                        {/* Backdrop */}
                        <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                        <div className={`absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl border min-w-[180px] max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto py-1 ${
                          isLineupDark
                            ? 'bg-[#1a2744] border-white/10'
                            : 'bg-white border-gray-200'
                        }`}>
                          {/* Sparade uppställningar (på desktop finns de även under truppen) */}
                          <button
                            onClick={() => { setShowSavedLineups(true); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <BookmarkPlus className="w-4 h-4" />
                            <span>Sparade uppställningar</span>
                          </button>

                          {/* Alternativ position i brickan: från hur stor andel av matcherna */}
                          <label
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] ${isLineupDark ? 'text-white/60' : 'text-gray-600'}`}
                            title="Brickan får två färger när spelaren spelat en annan position (MV/B/C/F) minst så här ofta – eller har en alternativ position i spelarkortet"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="w-4 h-4 rounded-sm shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6 0 52%, #8b5cf6 52% 100%)" }} />
                            <span className="flex-1">Alt. position</span>
                            <select
                              value={altThreshold}
                              onChange={(e) => { const v = Number(e.target.value); setAltThreshold(v); setAltThresholdState(v); }}
                              className={`rounded px-1 py-0.5 text-[11px] ${isLineupDark ? 'bg-white/10 text-white' : 'bg-gray-100'}`}
                            >
                              <option value={0} className="text-black">Av</option>
                              {[10, 15, 20, 25, 30, 40].map((v) => <option key={v} value={v} className="text-black">{v} %</option>)}
                            </select>
                          </label>

                          {/* Matchtid */}
                          <div className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] ${
                            isLineupDark ? 'text-white/60' : 'text-gray-600'
                          }`}>
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>Matchtid</span>
                            {matchTimeSource === "laget" && <span className="text-[9px] text-emerald-400/80" title="Längden på träningen på laget.se">från laget.se</span>}
                            <div className="ml-auto flex items-center gap-0.5">
                              <input
                                type="number"
                                min={10}
                                max={120}
                                value={matchTime}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!isNaN(v) && v >= 1 && v <= 999) {
                                    setMatchTime(v);
                                    // Egen tid gäller för den här träningen – skrivs inte över vid nästa hämtning
                                    matchTimeManualFor.current = eventInfo?.date ?? "";
                                    setMatchTimeSource("manual");
                                  }
                                }}
                                className={`w-[36px] text-center bg-transparent outline-none font-bold tabular-nums text-[11px] rounded border ${
                                  isLineupDark ? 'text-white/70 border-white/15' : 'text-gray-700 border-gray-300'
                                }`}
                              />
                              <span className={`text-[9px] ${isLineupDark ? 'text-white/30' : 'text-gray-400'}`}>min</span>
                            </div>
                          </div>

                          {/* Separator */}
                          <div className={`my-1 border-t ${isLineupDark ? 'border-white/5' : 'border-gray-100'}`} />

                          {/* Sidoläge – bara desktop */}
                          {!isMobile && (
                          <button
                            onClick={() => { toggleSideLayout(); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              sideLayout
                                ? 'text-violet-300 bg-violet-500/10'
                                : isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {sideLayout ? <Columns3 className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                            <span>{sideLayout ? 'Standard-layout' : 'Sidoläge'}</span>
                          </button>
                          )}

                          {/* Dela */}
                          <button
                            onClick={() => { handleShare(); setShowHeaderMenu(false); }}
                            disabled={shareState === 'saving'}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              shareState === 'copied'
                                ? 'text-emerald-300'
                                : isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {shareState === 'copied' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                            <span>{shareState === 'copied' ? 'Kopierad!' : 'Dela länk'}</span>
                          </button>
                          <button
                            onClick={() => { handleShareText(); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                            <span>Dela som text</span>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => { setShowNews(true); setShowHeaderMenu(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                                isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <Newspaper className="w-4 h-4" />
                              <span>Dela på laget.se</span>
                            </button>
                          )}

                          {/* Separator */}
                          <div className={`my-1 border-t ${isLineupDark ? 'border-white/5' : 'border-gray-100'}`} />

                          {/* Stats */}
                          <button
                            onClick={() => { setShowStats((v) => !v); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              showStats
                                ? 'text-sky-300 bg-sky-500/10'
                                : isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <BarChart3 className="w-4 h-4" />
                            <span>Statistik</span>
                          </button>

                          {/* Theme */}
                          <button
                            onClick={() => { toggleLineupTheme(); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {isLineupDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            <span>{isLineupDark ? 'Ljust tema' : 'Mörkt tema'}</span>
                          </button>

                          {/* Separator */}
                          <div className={`my-1 border-t ${isLineupDark ? 'border-white/5' : 'border-gray-100'}`} />

                          {/* Demoläge: 17 anmälda (2 målvakter) för att testa utan riktiga anmälningar */}
                          <button
                            role="switch"
                            aria-checked={demoActive}
                            onClick={() => { handleDemo(); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              demoActive
                                ? 'text-amber-300 bg-amber-500/10'
                                : isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <FlaskConical className="w-4 h-4" />
                            <span className="flex-1 text-left">Demoläge</span>
                            <span className={`w-7 h-4 rounded-full relative shrink-0 ${demoActive ? 'bg-amber-500/70' : isLineupDark ? 'bg-white/15' : 'bg-gray-300'}`}>
                              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow" style={{ left: demoActive ? '14px' : '2px' }} />
                            </span>
                          </button>

                          {isAdmin && (
                            <>
                          {/* PIR-inställningar */}
                          <button
                            onClick={() => { setShowSettings(true); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>Player Impact Rating</span>
                          </button>
                          {/* Match: internmatch eller mot annat lag (dag, tid och plats för bortamatcher) */}
                          <button
                            onClick={() => { setShowMatchSetup(true); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <Swords className="w-4 h-4" />
                            <span className="flex-1 text-left">Match</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${setup.mode === 'external' ? 'bg-sky-500/20 text-sky-300' : isLineupDark ? 'bg-white/10 text-white/40' : 'bg-gray-200 text-gray-500'}`}>{setup.mode === 'external' ? 'EXTERN' : 'INTERN'}</span>
                          </button>
                          {/* Auto-lag: gör om laget före match om det inte stämmer med anmälningarna */}
                          <button
                            onClick={() => { setShowAutoLineup(true); setShowHeaderMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                              isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <Wand2 className="w-4 h-4" />
                            <span className="flex-1 text-left">Auto-lag</span>
                            {autoLineupQ.data && <span className={`text-[9px] px-1.5 py-0.5 rounded ${autoLineupQ.data.config.enabled ? 'bg-emerald-500/20 text-emerald-300' : isLineupDark ? 'bg-white/10 text-white/40' : 'bg-gray-200 text-gray-500'}`}>{autoLineupQ.data.config.enabled ? 'PÅ' : 'AV'}</span>}
                          </button>
                              {/* Dela verktyg: tillfälliga länkar till Lineup och Score Tracker */}
                              <button
                                onClick={() => { setShowShareTools(true); setShowHeaderMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${
                                  isLineupDark ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                <Link2 className="w-4 h-4" />
                                <span>Dela verktyg</span>
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {/* "Ändrad …" visas ovanför lagen (platsen i rubriken räcker inte med hallens namn) */}
              </div>
            </div>
          </header>

          {/* Matchprediktion (experimentell, endast styrelsen) */}
          {isAdmin && pirSettings.enabled && pirSettings.showPrediction && !external && (
            <MatchPredictionBar lineup={lineup} teamAName={teamAName} teamBName={teamBName} dark={isLineupDark} />
          )}

          {/* Resultatrad: vem som vunnit de senaste matcherna (tomma block = ännu ej spelade) */}
          <MatchResultsBar dark={isLineupDark} />

          {/* Expanderbar statistik-panel */}
          {showStats && (() => {
            const allPlayers = [...availablePlayers, ...Object.values(lineup)];
            const posCount = (pos: string) => allPlayers.filter(p => p.position === pos).length;
            const regCount = allPlayers.filter(p => p.isRegistered).length;
            const decCount = allPlayers.filter(p => p.isDeclined).length;
            const noAnswer = allPlayers.length - regCount - decCount;
            const teamAAll = Object.values(lineup).filter((_, i, arr) => {
              const keys = Object.keys(lineup);
              return keys[arr.indexOf(_)]?.startsWith("team-a-");
            });
            const teamBAll = Object.values(lineup).filter((_, i, arr) => {
              const keys = Object.keys(lineup);
              return keys[arr.indexOf(_)]?.startsWith("team-b-");
            });
            // Simpler approach: use teamALineup/teamBLineup already computed
            const tAPlayers = Object.values(teamALineup);
            const tBPlayers = Object.values(teamBLineup);
            const tAPosCount = (pos: string) => tAPlayers.filter(p => p.position === pos).length;
            const tBPosCount = (pos: string) => tBPlayers.filter(p => p.position === pos).length;

            return (
              <div className="px-4 pb-2 shrink-0">
                <div className="max-w-7xl mx-auto">
                  <div className="glass-panel rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {/* Översikt */}
                      <div>
                        <h3 className="text-white/60 font-bold uppercase tracking-wider text-[10px] mb-2">Spelartrupp</h3>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="text-white/50">Totalt</span><span className="text-white font-semibold">{allPlayers.length}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-400/70">Anmälda</span><span className="text-emerald-400 font-semibold">{regCount}</span></div>
                          <div className="flex justify-between"><span className="text-red-400/70">Avböjda</span><span className="text-red-400 font-semibold">{decCount}</span></div>
                          <div className="flex justify-between"><span className="text-white/30">Ej svarat</span><span className="text-white/40 font-semibold">{noAnswer}</span></div>
                        </div>
                      </div>

                      {/* Per position */}
                      <div>
                        <h3 className="text-white/60 font-bold uppercase tracking-wider text-[10px] mb-2">Per position</h3>
                        <div className="space-y-1">
                          {[
                            { pos: "MV", label: "Målvakter", color: "text-amber-400" },
                            { pos: "B", label: "Backar", color: "text-blue-400" },
                            { pos: "F", label: "Forwards", color: fc.sectionHeader },
                            { pos: "C", label: "Center", color: "text-purple-400" },
                            { pos: "IB", label: "Ice Box", color: "text-white/40" },
                          ].map(({ pos, label, color }) => (
                            <div key={pos} className="flex justify-between">
                              <span className={color}>{label}</span>
                              <span className="text-white font-semibold">{posCount(pos)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Per lag */}
                      <div>
                        <h3 className="text-white/60 font-bold uppercase tracking-wider text-[10px] mb-2">Lagfördelning</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <span className="text-white/50 font-semibold">{teamAName}</span>
                          <span className="text-white/50 font-semibold">{teamBName}</span>
                          {[
                            { pos: "MV", label: "MV", color: "text-amber-400" },
                            { pos: "B", label: "B", color: "text-blue-400" },
                            { pos: "F", label: "F", color: fc.sectionHeader },
                            { pos: "C", label: "C", color: "text-purple-400" },
                          ].map(({ pos, label, color }) => (
                            <React.Fragment key={pos}>
                              <div className="flex justify-between"><span className={`${color} text-[10px]`}>{label}</span><span className="text-white/70">{tAPosCount(pos)}</span></div>
                              <div className="flex justify-between"><span className={`${color} text-[10px]`}>{label}</span><span className="text-white/70">{tBPosCount(pos)}</span></div>
                            </React.Fragment>
                          ))}
                          <div className="flex justify-between border-t border-white/10 pt-1 mt-1"><span className="text-white/50">Totalt</span><span className="text-white font-semibold">{teamACount}</span></div>
                          <div className="flex justify-between border-t border-white/10 pt-1 mt-1"><span className="text-white/50">Totalt</span><span className="text-white font-semibold">{teamBCount}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mobil: Trupp-knapp (öppnar drawer) */}
          {isMobile && (
            <div className="shrink-0 px-2 py-1.5 flex items-center justify-between">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-button text-xs font-bold uppercase tracking-wider text-emerald-300"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden min-[380px]:inline">Trupp</span>
                <RosterSummary counts={rosterCounts} size="xs" />
              </button>
              {renderQuickActions(false)}
            </div>
          )}

          {/* Desktop: snabbknapparna ovanför lagen */}
          {!isMobile && (
            <div className="shrink-0 px-3 pt-2 pb-1 flex items-center justify-center gap-4 max-w-[1400px] mx-auto w-full">
              {renderQuickActions(true)}
            </div>
          )}

          <main className="px-2 md:px-3 pb-8 overflow-x-hidden max-w-[1400px] mx-auto w-full">
            {/* Matchen mot annat lag ("Ändrad …" står i rubriken efter klubbnamnet) */}
            {setup.mode === "external" && (
              <div className="mb-2 px-1 text-[11px] text-sky-200/80 truncate">{setupLabel(setup, opponentQ.data?.name)}</div>
            )}
            {/* Villkorlig rendering: ANTINGEN desktop ELLER mobil – aldrig båda */}
            {/* Detta eliminerar dubbla droppables som förvirrar dnd-kit */}
            {!isMobile ? (
              <SlotHighlightContext.Provider value={desktopTarget?.slotId ?? null}>
              {/* Desktop layout – standard eller sidoläge */}
              {sideLayout ? (
                /* Sidoläge: Trupp till vänster (fast bredd), lagen bredvid varandra */
                <div className="flex gap-1.5 w-full max-w-full">
                  {/* Spelarlista (vänster) – fast bredd */}
                  <div
                    className="flex flex-col gap-2 shrink-0 min-w-0"
                    style={{ width: `${ROSTER_WIDTH}px`, maxWidth: '25vw' }}
                  >
                    <div>
                      <PlayerList
                        players={availablePlayers}
                        onAddPlayer={handleAddPlayer}
                        onDeletePlayer={handleDeletePlayer}
                        onChangePosition={handleChangePosition}
                        onChangeTeamColor={handleChangeTeamColor}
                        onChangeNumber={handleChangeNumber}
                        onChangeName={handleChangeName}
                        onChangeCaptainRole={handleChangeCaptainRole}
                        onChangeRegistered={handleChangeRegistered}
                         onSyncToLaget={handleSyncToLaget}
                         syncingPlayerIds={syncingPlayerIds}
                         onBulkSyncToLaget={handleBulkSyncToLaget}
                         onChangeGamesPlayed={handleChangeGamesPlayed}
                         onBulkRegister={handleBulkRegister}
                         onEventInfoUpdate={setEventInfo}
                         totalRegistered={totalRegistered}
                         totalDeclined={totalDeclined}
                         totalPlayers={totalPlayers}
          rosterCounts={rosterCounts}
                         targetSlot={desktopTarget}
                         onPickForTarget={(player) => { if (desktopTarget) { handleTapAssignToSlot(player, desktopTarget.slotId); setDesktopTarget(null); } }}
                         onCancelTarget={() => setDesktopTarget(null)}
                       />
                    </div>
                  </div>

                  {/* Lagen bredvid varandra */}
                  <div className="flex-1 grid grid-cols-2 gap-1 md:gap-1.5 min-w-0">
                    {/* Lag A (VITA) – vänster */}
                    <TeamPanel
                      teamId="team-a"
                      logoUrl={external ? ourLogoUrl(setup) : undefined}
                      onEmptySlotClick={handleDesktopSlotClickA}
                      onChangeName={handleChangeName}
                      onChangeNumber={handleChangeNumber}
                      onChangeTeamColor={handleChangeTeamColor}
                      onChangeCaptainRole={handleChangeCaptainRole}
                      onChangeRegistered={handleChangeRegistered}
                      onSyncToLaget={handleSyncToLaget}
                      onDeletePlayer={handleDeletePlayer}
                      teamName={teamAName}
                      slots={TEAM_A_SLOTS}
                      lineup={teamALineup}
                      onRemovePlayer={handleRemoveFromSlot}
                      onChangePosition={handleChangePosition}
                      onRenameTeam={setTeamAName}
                      onClearTeam={() => handleRequestClearTeam("team-a-", teamAName)}
                      registeredLabel={`${teamARegistered}/${teamACount}`}
                      isWhite
                      config={teamAConfig}
                      onConfigChange={setTeamAConfig}
                      otherConfig={teamBConfig}
                      matchTime={matchTime}
                    />

                    {/* Lag B (GRÖNA) – höger */}
                    {external ? renderOpponentPanel(false) : (
<TeamPanel
                      teamId="team-b"
                      onEmptySlotClick={handleDesktopSlotClickB}
                      onChangeName={handleChangeName}
                      onChangeNumber={handleChangeNumber}
                      onChangeTeamColor={handleChangeTeamColor}
                      onChangeCaptainRole={handleChangeCaptainRole}
                      onChangeRegistered={handleChangeRegistered}
                      onSyncToLaget={handleSyncToLaget}
                      onDeletePlayer={handleDeletePlayer}
                      teamName={teamBName}
                      slots={TEAM_B_SLOTS}
                      lineup={teamBLineup}
                      onRemovePlayer={handleRemoveFromSlot}
                      onChangePosition={handleChangePosition}
                      onRenameTeam={setTeamBName}
                      onClearTeam={() => handleRequestClearTeam("team-b-", teamBName)}
                      registeredLabel={`${teamBRegistered}/${teamBCount}`}
                      isWhite={false}
                      config={teamBConfig}
                      onConfigChange={setTeamBConfig}
                      otherConfig={teamAConfig}
                      matchTime={matchTime}
                    />
)}
                  </div>
                </div>
              ) : (
                /* Standard-layout: Vita | Trupp | Gröna */
                <div
                  className="grid gap-1.5 md:gap-2 mx-auto w-full justify-center"
                  style={{
                    gridTemplateColumns: "max-content minmax(240px, 380px) max-content",
                  }}
                >
                  {/* Lag A (VITA) – vänster */}
                  <TeamPanel
                    teamId="team-a"
                      logoUrl={external ? ourLogoUrl(setup) : undefined}
                    onEmptySlotClick={handleDesktopSlotClickA}
                    onChangeName={handleChangeName}
                    onChangeNumber={handleChangeNumber}
                    onChangeTeamColor={handleChangeTeamColor}
                    onChangeCaptainRole={handleChangeCaptainRole}
                    onChangeRegistered={handleChangeRegistered}
                    onSyncToLaget={handleSyncToLaget}
                    onDeletePlayer={handleDeletePlayer}
                    teamName={teamAName}
                    slots={TEAM_A_SLOTS}
                    lineup={teamALineup}
                    onRemovePlayer={handleRemoveFromSlot}
                    onChangePosition={handleChangePosition}
                    onRenameTeam={setTeamAName}
                    onClearTeam={() => handleRequestClearTeam("team-a-", teamAName)}
                    registeredLabel={`${teamARegistered}/${teamACount}`}
                    isWhite
                    config={teamAConfig}
                    onConfigChange={setTeamAConfig}
                    otherConfig={teamBConfig}
                    matchTime={matchTime}
                    compact
                  />

                  {/* Spelarlista (mitten) */}
                  <div className="flex flex-col gap-2">
                    <div>
                      <PlayerList
                        players={availablePlayers}
                        onAddPlayer={handleAddPlayer}
                        onDeletePlayer={handleDeletePlayer}
                        onChangePosition={handleChangePosition}
                        onChangeTeamColor={handleChangeTeamColor}
                        onChangeNumber={handleChangeNumber}
                        onChangeName={handleChangeName}
                        onChangeCaptainRole={handleChangeCaptainRole}
                        onChangeRegistered={handleChangeRegistered}
                        onSyncToLaget={handleSyncToLaget}
                        syncingPlayerIds={syncingPlayerIds}
                        onBulkSyncToLaget={handleBulkSyncToLaget}
                        onChangeGamesPlayed={handleChangeGamesPlayed}
                        onBulkRegister={handleBulkRegister}
                        onEventInfoUpdate={setEventInfo}
                        totalRegistered={totalRegistered}
                        totalDeclined={totalDeclined}
                        totalPlayers={totalPlayers}
          rosterCounts={rosterCounts}
                        targetSlot={desktopTarget}
                        onPickForTarget={(player) => { if (desktopTarget) { handleTapAssignToSlot(player, desktopTarget.slotId); setDesktopTarget(null); } }}
                        onCancelTarget={() => setDesktopTarget(null)}
                      />
                    </div>
                  </div>

                  {/* Lag B (GRÖNA) – höger */}
                  {external ? renderOpponentPanel(true) : (
<TeamPanel
                    teamId="team-b"
                    onEmptySlotClick={handleDesktopSlotClickB}
                    onChangeName={handleChangeName}
                    onChangeNumber={handleChangeNumber}
                    onChangeTeamColor={handleChangeTeamColor}
                    onChangeCaptainRole={handleChangeCaptainRole}
                    onChangeRegistered={handleChangeRegistered}
                    onSyncToLaget={handleSyncToLaget}
                    onDeletePlayer={handleDeletePlayer}
                    teamName={teamBName}
                    slots={TEAM_B_SLOTS}
                    lineup={teamBLineup}
                    onRemovePlayer={handleRemoveFromSlot}
                    onChangePosition={handleChangePosition}
                    onRenameTeam={setTeamBName}
                    onClearTeam={() => handleRequestClearTeam("team-b-", teamBName)}
                    registeredLabel={`${teamBRegistered}/${teamBCount}`}
                    isWhite={false}
                    config={teamBConfig}
                    onConfigChange={setTeamBConfig}
                    otherConfig={teamAConfig}
                    matchTime={matchTime}
                    compact
                  />
)}
                </div>
              )}
              </SlotHighlightContext.Provider>
            ) : null}

            {/* Desktop inline remove drop zone – directly below the lineup */}
            {!isMobile && (
              <RemoveDropZone
                isDragging={!!activePlayer}
                isFromSlot={!!activePlayer && !!findPlayerSlot(activePlayer.id)}
              />
            )}

            {isMobile ? (
              /* Mobilvy – Side-by-side: båda lagen synliga + trupp-drawer */
              <div className="flex gap-1 min-h-0">
                {/* Lag A (VITA) – vänster kolumn */}
                <div className="mobile-team-col">
                  <TeamPanel
                    teamId="team-a"
                      logoUrl={external ? ourLogoUrl(setup) : undefined}
                    teamName={teamAName}
                    slots={TEAM_A_SLOTS}
                    lineup={teamALineup}
                    onRemovePlayer={handleRemoveFromSlot}
                    onChangePosition={handleChangePosition}
                    onRenameTeam={setTeamAName}
                    onClearTeam={() => handleRequestClearTeam("team-a-", teamAName)}
                    registeredLabel={`${teamARegistered}/${teamACount}`}
                    isWhite
                    config={teamAConfig}
                    onConfigChange={setTeamAConfig}
                    compact
                    otherConfig={teamBConfig}
                    matchTime={matchTime}
                    onChangeName={handleChangeName}
                    onChangeNumber={handleChangeNumber}
                    onChangeTeamColor={handleChangeTeamColor}
                    onChangeCaptainRole={handleChangeCaptainRole}
                    onChangeRegistered={handleChangeRegistered}
                    onSyncToLaget={handleSyncToLaget}
                    onDeletePlayer={handleDeletePlayer}
                    onEmptySlotClick={handleEmptySlotClickA}
                  />
                </div>

                {/* Lag B (GRÖNA) – höger kolumn */}
                <div className="mobile-team-col">
                  {external ? renderOpponentPanel(true) : (
<TeamPanel
                    teamId="team-b"
                    teamName={teamBName}
                    slots={TEAM_B_SLOTS}
                    lineup={teamBLineup}
                    onRemovePlayer={handleRemoveFromSlot}
                    onChangePosition={handleChangePosition}
                    onRenameTeam={setTeamBName}
                    onClearTeam={() => handleRequestClearTeam("team-b-", teamBName)}
                    registeredLabel={`${teamBRegistered}/${teamBCount}`}
                    isWhite={false}
                    config={teamBConfig}
                    onConfigChange={setTeamBConfig}
                    compact
                    otherConfig={teamAConfig}
                    matchTime={matchTime}
                    onChangeName={handleChangeName}
                    onChangeNumber={handleChangeNumber}
                    onChangeTeamColor={handleChangeTeamColor}
                    onChangeCaptainRole={handleChangeCaptainRole}
                    onChangeRegistered={handleChangeRegistered}
                    onSyncToLaget={handleSyncToLaget}
                    onDeletePlayer={handleDeletePlayer}
                    onEmptySlotClick={handleEmptySlotClickB}
                  />
)}
                </div>
              </div>
            ) : null}
          </main>
        </div>

        {/* Drag overlay – inuti DndContext, position:fixed så den alltid syns över allt */}
        <DragOverlay style={{ zIndex: 99999, pointerEvents: "none" }} modifiers={[snapCenterToCursor]}>
          {activePlayer ? <PlayerCardOverlay player={activePlayer} isRemoving={isDragOutside} /> : null}
        </DragOverlay>

        {/* Visible remove drop zone – mobile: fixed at bottom; desktop: inline (rendered inside main) */}
        {isMobile && (
          <RemoveDropZone
            isDragging={!!activePlayer}
            isFromSlot={!!activePlayer && !!findPlayerSlot(activePlayer.id)}
            isMobile
          />
        )}
      </div>

      {showShareTools && <ShareToolsModal onClose={() => setShowShareTools(false)} />}

      {showSavedLineups && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowSavedLineups(false)}>
          <div className="w-full sm:max-w-md glass-panel-strong panel-solid rounded-t-2xl sm:rounded-2xl p-3 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end">
              <button onClick={() => setShowSavedLineups(false)} className="text-white/50 hover:text-white text-xs px-2 py-1">Stäng</button>
            </div>
            <SavedLineupsPanel
              teamAName={teamAName}
              teamBName={teamBName}
              lineup={lineup}
              onLoadLineup={(saved) => { handleLoadLineup(saved); setShowSavedLineups(false); }}
              defaultOpen
            />
          </div>
        </div>
      )}

      {/* Nyhet till laget.se */}
      {showNews && (
        <LagetNewsModal
          onClose={() => setShowNews(false)}
          teamAName={teamAName}
          teamBName={teamBName}
          teamASlots={TEAM_A_SLOTS}
          teamBSlots={oppListTeam ? oppListTeam.slots : TEAM_B_SLOTS}
          teamALineup={teamALineup}
          teamBLineup={oppListTeam ? oppListTeam.lineup : teamBLineup}
          lineupText={oppListTeam
            ? generateLineupText({ teamAName, teamBName } as never, TEAM_A_SLOTS, oppListTeam.slots, teamALineup, oppListTeam.lineup, { bold: true })
            : lineupStateToText({ teamAName, teamBName, teamAConfig, teamBConfig, lineup }, { bold: true })}
          logoWhite={external ? ourLogoUrl(setup) : teamLogo("white")}
          logoGreen={external ? (opponentQ.data?.logoUrl ?? "") : teamLogo("green")}
          {...(external && opponentQ.data ? { accentGreen: opponentQ.data.color } : {})}
          bgUrl={BG_URL}
        />
      )}

      {/* Inställningar-modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} pirSettings={pirSettings} onPirSettingsChange={handlePirSettingsChange} />
      <AutoLineupModal open={showAutoLineup} onClose={() => setShowAutoLineup(false)} />
      <MatchSetupModal open={showMatchSetup} onClose={() => setShowMatchSetup(false)} setup={setup}
        onChange={(next, name) => { applySetup(next, name); void fetchAttendanceFromApi(true).catch(() => undefined); }} />

      {/* Bekäftelsedialog för Rensa */}

      {/* Mobile Roster Drawer */}
      {isMobile && (
        <MobileRosterDrawer
          open={mobileDrawerOpen || !!mobileSlotPicker}
          onClose={() => { setMobileDrawerOpen(false); setMobileSlotPicker(null); }}
          targetSlot={mobileSlotPicker}
          players={availablePlayers}
          onDeletePlayer={handleDeletePlayer}
          onChangePosition={handleChangePosition}
          onChangeTeamColor={handleChangeTeamColor}
          onChangeNumber={handleChangeNumber}
          onChangeName={handleChangeName}
          onChangeCaptainRole={handleChangeCaptainRole}
          onChangeRegistered={handleChangeRegistered}
          onSyncToLaget={handleSyncToLaget}
          onBulkRegister={handleBulkRegister}
          onEventInfoUpdate={(info) => setEventInfo(info)}
          totalRegistered={totalRegistered}
          totalDeclined={totalDeclined}
          totalPlayers={totalPlayers}
          rosterCounts={rosterCounts}
          onCreatePlayer={handleAddPlayer}
          onTapAssignToSlot={handleTapAssignToSlot}
          onAddDefensePair={handleAddDefensePair}
          onAddForwardLine={handleAddForwardLine}
          teamAName={teamAName}
          teamBName={teamBName}
          teamASlots={TEAM_A_SLOTS}
          teamBSlots={TEAM_B_SLOTS}
          teamAConfig={teamAConfig}
          teamBConfig={teamBConfig}
          lineup={lineup}
        />
      )}


      {/* Låst lag efter publicering: Lineup har ändrats sedan dess */}
      {lockStatus.data?.locked && lockStatus.data.changed && (
        <button
          onClick={() => {
            if (!confirm("Låsa upp laget? Score Tracker och statistiken använder då uppställningen som den ser ut nu i stället för den publicerade.")) return;
            unlockLineup.mutate();
          }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99998] max-w-[92vw] glass-panel-strong text-white text-xs px-4 py-2 rounded-2xl shadow-lg border border-sky-400/40 text-center"
        >
          🔒 Lagen är låsta sedan publiceringen {new Date(lockStatus.data.lockedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} – ändringarna används inte i Score Tracker eller statistiken.{" "}
          <span className="underline text-sky-300">Tryck för att låsa upp</span>
        </button>
      )}

      {/* Auto: vad kommer att ändras? */}
      {autoPreview && (
        <ConfirmDialog
          title="Auto-fördela"
          message={["Auto kommer att:", ...previewLines(autoPreview.diff)].join("\n")}
          confirmLabel="OK"
          cancelLabel="Avbryt"
          onCancel={() => setAutoPreview(null)}
          onConfirm={() => {
            const p = autoPreview;
            setAutoPreview(null);
            handleAutoDistribute(false, p);
            toast.success(doneMessage(p.diff), { action: { label: "Ångra", onClick: () => handleUndo() }, duration: 5000 });
          }}
        />
      )}

      {/* Remote change toast */}
      {remoteChangeToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99999] glass-panel-strong text-white text-xs px-4 py-2 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {remoteChangeToast}
        </div>
      )}
    </DndContext>
    </div>
    </PirSettingsProvider>
  );
}
