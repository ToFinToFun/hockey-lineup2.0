// Hockey Lineup App – Home
// Design: Industrial Ice Arena

// - SQL database + SSE real-time sync (alla användare ser samma data)
// - localStorage som fallback om servern är offline
// - Ångra-funktion (Ctrl+Z + knapp i header)
// - In-app bekräftelsedialog för Rensa
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
  type CollisionDetection,
} from "@dnd-kit/core";
import { initialPlayers, type Player, type Position, type TeamColor, type CaptainRole } from "@/lib/players";
import { useIsMobile } from "@/hooks/useMobile";
import { createTeamSlots, DEFAULT_TEAM_CONFIG, MAX_TEAM_CONFIG, type TeamConfig } from "@/lib/lineup";
import { PlayerList } from "@/components/PlayerList";
import { TeamPanel } from "@/components/TeamPanel";
import { PlayerCardOverlay } from "@/components/PlayerCard";
import { ExportModal } from "@/components/ExportModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SavedLineupsPanel } from "@/components/SavedLineupsPanel";
import { LongPressTooltip } from "@/components/LongPressTooltip";
import { trpc } from "@/lib/trpc";
import type { Player as PlayerType } from "@/lib/players";
import { Download, Wifi, WifiOff, Share2, Check, CalendarDays, Shuffle, Dices, PanelLeft, Columns3, Undo2, BarChart3, ChevronDown, ChevronUp, Settings, Sun, Moon, Home as HomeIcon } from "lucide-react";
import { useLineupTheme } from "@/hooks/useLineupTheme";
import { Link } from "wouter";
import { SettingsModal } from "@/components/SettingsModal";
import { matchRegisteredPlayers, matchDeclinedPlayers, fetchAttendanceFromApi, updateAttendanceOnLaget } from "@/lib/laget";
import { createPortal } from "react-dom"; // används av PlayerList context-meny
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useSwipe } from "@/hooks/useSwipe";
import { autoDistribute } from "@/lib/autoDistribute";

type MobileTab = "vita" | "trupp" | "grona";

const BG_URL =
  "/images/background.jpg";

const LOGO_GREEN = "/images/logo-green.png";
const LOGO_WHITE = "/images/logo-white.png";

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

export default function Home() {
  const local = loadLocalState();
  const { theme: lineupTheme, toggle: toggleLineupTheme, isDark: isLineupDark } = useLineupTheme();

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

  // Dynamisk lagkonfiguration
  const [teamAConfig, setTeamAConfig] = useState<TeamConfig>(
    local?.teamAConfig ?? { ...DEFAULT_TEAM_CONFIG }
  );
  const [teamBConfig, setTeamBConfig] = useState<TeamConfig>(
    local?.teamBConfig ?? { ...DEFAULT_TEAM_CONFIG }
  );

  // Generera slots dynamiskt baserat på config
  const TEAM_A_SLOTS = useMemo(() => createTeamSlots("team-a", teamAConfig), [teamAConfig]);
  const TEAM_B_SLOTS = useMemo(() => createTeamSlots("team-b", teamBConfig), [teamBConfig]);

  // När config minskas: flytta spelare från borttagna slots tillbaka till truppen
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
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sseConnected, setSseConnected] = useState<boolean | null>(null);
  const [shareState, setShareState] = useState<"idle" | "saving" | "copied">("idle");

  // Event-info från senaste anmälningshämtning
  const [eventInfo, setEventInfo] = useState<{ title: string; date: string } | null>(null);

  // Tidstämpel för senaste synk
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const createSavedLineupMutation = trpc.savedLineups.create.useMutation();
  const saveStateMutation = trpc.lineup.saveState.useMutation();

  const handleShare = useCallback(async () => {
    setShareState("saving");
    try {
      const result = await createSavedLineupMutation.mutateAsync({
        name: `Delad ${new Date().toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
        teamAName,
        teamBName,
        lineup,
      });
      const url = `${window.location.origin}/lineup/${result.shareId}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("idle");
    }
  }, [teamAName, teamBName, lineup, createSavedLineupMutation]);

  // IDs för medvetet borttagna spelare – hindrar merge från att lägga tillbaka dem
  const [deletedPlayerIds, setDeletedPlayerIds] = useState<Set<string>>(new Set());
  const deletedPlayerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletedPlayerIdsRef.current = deletedPlayerIds; }, [deletedPlayerIds]);

  // Ångra-historik
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const skipNextUndoSnapshot = useRef(false); // hoppa över snapshot vid ångra-återställning

  // Bekräftelsedialog för Rensa
  const [confirmClear, setConfirmClear] = useState<{ teamPrefix: string; teamName: string } | null>(null);

  // Bekräftelsedialog för Auto-fördela
  const [confirmAutoDistribute, setConfirmAutoDistribute] = useState(false);

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
  const ROSTER_WIDTH = 320;

  // Statistik-panel toggle
  const [showStats, setShowStats] = useState(false);

  // Track if we've received the initial server state
  const hasReceivedInitial = useRef(false);
  // === VERSION-BASED SSE SYNC (Firebase-style) ===
  // Instead of time-based blocking (dirtyRef/debounce), we use version numbers:
  // - versionRef tracks the latest version we've sent to or received from the server
  // - When we save, we get back a version number and update versionRef
  // - When an SSE event arrives with version <= versionRef, we ignore it (echo)
  // - When an SSE event arrives with version > versionRef, we apply it (remote change)
  // - isSyncing prevents the save effect from firing during applyRemoteState
  const versionRef = useRef(0);
  const isSyncing = useRef(false);
  // Epoch counter: incremented by applyRemoteState. The save effect captures
  // the current epoch when it schedules a save. If the epoch has changed by
  // the time the 50ms timer fires, the save is skipped (it was triggered by
  // remote state, not a local change).
  const syncEpochRef = useRef(0);
  // Toast for remote changes
  const [remoteChangeToast, setRemoteChangeToast] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  // Helper to apply remote state (from initial load or SSE)
  // The version parameter is passed so we can update versionRef here too.
  const applyRemoteState = useCallback((state: {
    players: any[];
    lineup: Record<string, any>;
    teamAName: string;
    teamBName: string;
    teamAConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number } | null;
    teamBConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number } | null;
    deletedPlayerIds?: string[] | null;
  }, version?: number) => {
    isSyncing.current = true;
    skipNextUndoSnapshot.current = true;
    // Increment epoch so any pending save-effect timer knows to skip
    syncEpochRef.current += 1;
    // Update versionRef so the save-effect won't re-save this same state
    if (version && version > versionRef.current) {
      versionRef.current = version;
    }

    const remotePlayers: Player[] = (state.players ?? []) as Player[];
    const remoteDeletedIds = new Set<string>(state.deletedPlayerIds ?? []);
    if (remoteDeletedIds.size > 0) {
      setDeletedPlayerIds((prev) => {
        const merged = new Set(Array.from(prev).concat(Array.from(remoteDeletedIds)));
        deletedPlayerIdsRef.current = merged;
        return merged;
      });
    }

    // Only merge with initialPlayers if the database is completely empty
    // (i.e., first-ever app launch). Otherwise, trust the server's data entirely.
    const remoteLineup = state.lineup ?? {};
    let finalPlayers: Player[];
    if (remotePlayers.length === 0 && Object.keys(remoteLineup).length === 0) {
      finalPlayers = initialPlayers;
    } else {
      // Server owns the truth — use its data directly.
      // This preserves isRegistered/isDeclined from laget.se syncs.
      finalPlayers = remotePlayers;
    }

    // Filtrera bort ogiltiga slot-IDs
    const sanitizedLineup: Record<string, Player> = {};
    for (const [slotId, player] of Object.entries(remoteLineup)) {
      if (ALL_SLOT_IDS.has(slotId)) {
        sanitizedLineup[slotId] = player as Player;
      }
    }

    setAvailablePlayers(finalPlayers);
    setLineup(sanitizedLineup);
    setTeamAName(state.teamAName ?? "VITA");
    setTeamBName(state.teamBName ?? "GRÖNA");
    if (state.teamAConfig) setTeamAConfig(state.teamAConfig);
    if (state.teamBConfig) setTeamBConfig(state.teamBConfig);
    // Keep isSyncing true long enough for the save effect to see it.
    // The save effect has a 50ms debounce, so 150ms ensures we cover:
    // - React commit + useEffect scheduling (~16ms)
    // - The 50ms setTimeout in the save effect
    // - Some margin for safety
    setTimeout(() => {
      isSyncing.current = false;
    }, 150);
  }, []);

  // Direct save to server — no debounce, no queue.
  // Uses mutateAsync so we can await the version number.
  // The returned version is used for SSE echo-prevention.
  const saveToServer = useCallback(async (
    players?: Player[],
    lineupData?: Record<string, Player>,
    operation?: { opType: string; description: string; payload?: Record<string, any> }
  ) => {
    const currentPlayers = players ?? availablePlayersRef.current;
    const currentLineup = lineupData ?? lineupRef.current;
    try {
      const result = await saveStateMutation.mutateAsync({
        players: currentPlayers,
        lineup: currentLineup,
        teamAName,
        teamBName,
        deletedPlayerIds: Array.from(deletedPlayerIdsRef.current),
        teamAConfig,
        teamBConfig,
        operation,
      });
      // Update our version — all SSE events with version <= this will be ignored
      versionRef.current = result.version;
      return result;
    } catch (err) {
      console.error("Save to server failed:", err);
      return null;
    }
  }, [saveStateMutation, teamAName, teamBName, teamAConfig, teamBConfig]);

  // Load initial state from SQL + subscribe to SSE for real-time updates
  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;

    // 1. Load initial state from server
    fetch("/api/trpc/lineup.getState", { credentials: "include" })
      .then(res => res.json())
      .then((json) => {
        if (!mounted) return;
        const wrapped = json?.result?.data;
        const state = wrapped?.json ?? wrapped;
        if (state && state.players) {
          applyRemoteState(state, state.version);
        } else if (!hasReceivedInitial.current) {
          // No data in SQL yet — push our local state up
          const localState = loadLocalState();
          if (localState) {
            const rawLocalLineup = localState.lineup ?? {};
            const sanitizedLocalLineup: Record<string, Player> = {};
            for (const [slotId, player] of Object.entries(rawLocalLineup)) {
              if (ALL_SLOT_IDS.has(slotId)) {
                sanitizedLocalLineup[slotId] = player;
              }
            }
            saveStateMutation.mutateAsync({
              players: localState.availablePlayers,
              lineup: sanitizedLocalLineup,
              teamAName: localState.teamAName,
              teamBName: localState.teamBName,
            }).then((result) => {
              if (result?.version) versionRef.current = result.version;
            }).catch(() => {});
          }
        }
        hasReceivedInitial.current = true;
      })
      .catch(() => {
        if (mounted) setSseConnected(false);
      });

    // 2. Subscribe to SSE for real-time updates
    es = new EventSource("/api/sse/lineup");

    es.addEventListener("connected", (event) => {
      if (!mounted) return;
      setSseConnected(true);
    });

    es.addEventListener("stateChange", (event) => {
      if (!mounted) return;
      try {
        const data = JSON.parse(event.data);
        // Version-based echo prevention (Firebase-style):
        // If this event's version is <= our last known version, it's an echo
        // of our own save — ignore it. Only apply truly new remote changes.
        if (data.version && data.version <= versionRef.current) {
          return;
        }
        if (data.state) {
          applyRemoteState(data.state, data.version);
        }
        // Show toast for remote changes
        if (data.description) {
          setRemoteChangeToast(data.description);
          setTimeout(() => setRemoteChangeToast(null), 3000);
        }
      } catch { /* ignore parse errors */ }
    });

    es.onerror = () => {
      if (mounted) setSseConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      mounted = false;
      es?.close();
    };
  }, [applyRemoteState, saveStateMutation]);

  // Save to both SQL and localStorage on every state change.
  // Uses syncEpochRef to distinguish local changes from remote state:
  // - applyRemoteState increments syncEpochRef before setting state
  // - The save effect captures the epoch when it runs
  // - If the epoch changed by the time the timer fires, it means
  //   applyRemoteState caused this effect, so we skip the save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // isSyncing is set by applyRemoteState — don't save remote state back
    if (isSyncing.current) return;
    if (!hasReceivedInitial.current) return;

    const state: SavedState = { availablePlayers, lineup, teamAName, teamBName, teamAConfig, teamBConfig };
    saveLocalState(state);

    // Capture the current epoch at schedule time
    const epochAtSchedule = syncEpochRef.current;

    // Small debounce (50ms) to batch rapid React state updates (e.g. drag-end
    // sets both lineup and availablePlayers in quick succession)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Skip if applyRemoteState ran since we scheduled this save
      if (syncEpochRef.current !== epochAtSchedule) return;
      if (isSyncing.current) return;
      saveToServer();
    }, 50);
  }, [availablePlayers, lineup, teamAName, teamBName, deletedPlayerIds, teamAConfig, teamBConfig, saveToServer]);

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
      isSyncing.current = true;
      skipNextUndoSnapshot.current = true;
      setAvailablePlayers(snapshot.availablePlayers);
      setLineup(snapshot.lineup);
      // Allow React to commit the state updates before re-enabling saves
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isSyncing.current = false;
        });
      });
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
    document.body.classList.remove("dnd-scroll-lock");
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
  const handleRequestClearTeam = useCallback((teamPrefix: string, teamName: string) => {
    setConfirmClear({ teamPrefix, teamName });
  }, []);

  // Auto-fördela anmälda spelare på lagen
  const handleAutoDistribute = useCallback((shuffle = false) => {
    // Rensa befintliga lag först
    const currentLineup = lineupRef.current;
    const removedPlayers: Player[] = [];
    for (const [slotId, player] of Object.entries(currentLineup)) {
      removedPlayers.push(player);
    }

    // Alla spelare tillbaka i truppen
    const allPlayers = [...availablePlayersRef.current, ...removedPlayers];

    // Kör auto-fördela (med eller utan shuffle)
    const result = autoDistribute(allPlayers, {}, { shuffle });

    // Uppdatera configs
    setTeamAConfig(result.teamAConfig);
    setTeamBConfig(result.teamBConfig);

    // Uppdatera lineup
    setLineup(result.lineup);

    // Kvarvarande spelare tillbaka i truppen
    const placedIds = new Set(Object.values(result.lineup).map(p => p.id));
    const remaining = allPlayers.filter(p => !placedIds.has(p.id));
    setAvailablePlayers(remaining);
  }, [teamAName, teamBName]);

  // Utför Rensa efter bekräftelse
  const handleConfirmClearTeam = useCallback(() => {
    if (!confirmClear) return;
    setConfirmClear(null);

    const { teamPrefix } = confirmClear;

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
  }, [confirmClear, pushUndo]);

  // Ladda en sparad uppställning
  const handleLoadLineup = useCallback((saved: { id: string; name: string; teamAName: string; teamBName: string; lineup: Record<string, Player>; savedAt: number }) => {
    pushUndo();

    // Guard against malformed saved lineups (lineup may be null/undefined in old entries)
    const safeLineup: Record<string, Player> = saved.lineup ?? {};

    // Bygg ny spelartrupp: alla spelare som inte är i den sparade lineup
    const savedLineupIds = new Set(Object.values(safeLineup).map((p) => p.id));
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
    const newAvailable = allUnique.filter((p) => !savedLineupIds.has(p.id));

    setLineup(safeLineup);
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
  const handleBulkRegister = useCallback(async (forceRefresh = false): Promise<{ matched: number; unmatched: string[]; eventTitle?: string; eventDate?: string; error?: string; noEvent?: boolean }> => {
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
        isDeclined: declinedSet.has(p.id),
      });

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

      return { matched: matchedIds.length, unmatched: unmatchedNames, eventTitle: data.eventTitle, eventDate: data.eventDate };
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
    if (!hasReceivedInitial.current) return; // Vänta på server-state först
    autoFetchDone.current = true;
    // Small delay to ensure React has committed the state from applyRemoteState
    setTimeout(() => {
      handleBulkRegister().then((result) => {
        if (result.eventTitle) {
          setEventInfo({ title: result.eventTitle, date: result.eventDate || "" });
        } else if (result.noEvent) {
          setEventInfo(null);
        }
      });
    }, 100);
  }, [handleBulkRegister, availablePlayers]);

  const [mobileTab, setMobileTabRaw] = useState<MobileTab>("trupp");
  const [dragHoverTab, setDragHoverTab] = useState<MobileTab | null>(null);

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

  // Kollisionsdetektion: pointerWithin först, sedan closestCenter som fallback.
  // Eftersom vi nu bara renderar EN layout (åt gången) behövs ingen filtrering.
  const pointerWithinOrClosest: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  };

  return (
    <div className={isLineupDark ? '' : 'lineup-light'}>
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithinOrClosest}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ enabled: true, threshold: { x: 0.15, y: 0.15 } }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
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
      {/* Bakgrundsbild */}
      <div
        className="min-h-screen w-full relative"
        style={{
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className={`absolute inset-0 pointer-events-none ${isLineupDark ? 'bg-black/45' : 'bg-white/75'}`} />

        <div
          className="relative flex flex-col min-h-screen"
        >
          {/* Header */}
          <header className="px-4 pt-4 pb-2 shrink-0">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <Link href="/">
                    <button
                      title="Tillbaka till startsidan"
                      className={`p-1.5 rounded transition-all ${isLineupDark ? 'bg-white/10 hover:bg-white/20 text-white/60 hover:text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700'}`}
                    >
                      <HomeIcon className="w-4 h-4" />
                    </button>
                  </Link>
                  <div>
                    <h1
                      className={`text-xl md:text-3xl font-black tracking-widest uppercase ${isLineupDark ? 'text-white' : 'text-gray-900'}`}
                      style={{ fontFamily: "'Oswald', sans-serif" }}
                    >
                      Stålstadens
                      <span className={`ml-2 ${isLineupDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Lineup</span>
                    </h1>
                    <p className={`text-[10px] md:text-xs tracking-wider uppercase ${isLineupDark ? 'text-white/40' : 'text-gray-500'}`}>
                      A-lag Herrar · Formations-verktyg
                    </p>
                  </div>
                </div>
                {eventInfo && (
                  <p className={`flex items-center gap-1.5 text-[10px] md:text-[11px] mt-0.5 font-medium ${isLineupDark ? 'text-sky-300/80' : 'text-sky-600'}`}>
                    <CalendarDays className="w-3 h-3" />
                    {eventInfo.title}{eventInfo.date ? ` · ${eventInfo.date}` : ""}
                    {lastSyncTime && (
                      <span className={`ml-1.5 ${isLineupDark ? 'text-white/30' : 'text-gray-400'}`}>· Hämtat {lastSyncTime}</span>
                    )}
                  </p>
                )}
              </div>
              </div>
              <div className="flex items-center flex-wrap gap-1 md:gap-1.5 mt-1.5 md:mt-0">
                {/* SSE sync status – bara ikon, ingen text */}
                <div className="flex items-center">
                  {sseConnected === null ? (
                    <span className={`text-[9px] ${isLineupDark ? 'text-white/30' : 'text-gray-400'}`}>...</span>
                  ) : sseConnected ? (
                    <Wifi className={`w-3 h-3 ${isLineupDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  ) : (
                    <WifiOff className="w-3 h-3 text-red-400" />
                  )}
                </div>

                {/* Ångra-knapp */}
                <LongPressTooltip label={`Ångra (${undoStack.length} steg)`}>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  title={`Ångra (Ctrl+Z) – ${undoStack.length} steg`}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    undoStack.length > 0
                      ? isLineupDark
                        ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white"
                        : "bg-gray-200 border border-gray-300 text-gray-600 hover:bg-gray-300 hover:text-gray-800"
                      : isLineupDark
                        ? "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
                        : "bg-gray-100 border border-gray-200 text-gray-300 cursor-not-allowed"
                  }`}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {undoStack.length > 0 && <span>{undoStack.length}</span>}
                </button>
                </LongPressTooltip>

                {/* Layout-toggle-knapp */}
                <LongPressTooltip label={sideLayout ? "Standard" : "Sidoläge"}>
                <button
                  onClick={toggleSideLayout}
                  title={sideLayout ? "Standard-layout (Vita | Trupp | Gröna)" : "Sidoläge (Trupp till vänster, lagen bredvid)"}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    sideLayout
                      ? isLineupDark
                        ? "bg-violet-500/30 border border-violet-400/50 text-violet-300 hover:bg-violet-500/40"
                        : "bg-violet-100 border border-violet-300 text-violet-700 hover:bg-violet-200"
                      : isLineupDark
                        ? "bg-white/5 border border-white/15 text-white/50 hover:bg-white/10 hover:text-white/80"
                        : "bg-gray-100 border border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                >
                  {sideLayout ? <Columns3 className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
                  <span>{sideLayout ? "Standard" : "Sidoläge"}</span>
                </button>
                </LongPressTooltip>

                {/* Auto-fördela-knapp */}
                <LongPressTooltip label="Autofördela">
                <button
                  onClick={() => setConfirmAutoDistribute(true)}
                  title="Fördela anmälda spelare automatiskt på lagen"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${isLineupDark ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30' : 'bg-cyan-100 border border-cyan-300 text-cyan-700 hover:bg-cyan-200'}`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Auto</span>
                </button>
                </LongPressTooltip>

                {/* Slumpa om-knapp */}
                <LongPressTooltip label="Slumpa">
                <button
                  onClick={() => handleAutoDistribute(true)}
                  title="Slumpa om neutrala spelare (utan lagfärg) mellan lagen"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${isLineupDark ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30' : 'bg-amber-100 border border-amber-300 text-amber-700 hover:bg-amber-200'}`}
                >
                  <Dices className="w-3.5 h-3.5" />
                  <span>Slumpa</span>
                </button>
                </LongPressTooltip>


                {/* Dela-knapp */}
                <LongPressTooltip label="Dela länk">
                <button
                  onClick={handleShare}
                  disabled={shareState === "saving"}
                  title="Dela skrivskyddad länk till aktuell uppställning"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    shareState === "copied"
                      ? isLineupDark
                        ? "bg-emerald-500/30 border border-emerald-400/60 text-emerald-200"
                        : "bg-emerald-100 border border-emerald-300 text-emerald-700"
                      : isLineupDark
                        ? "bg-white/5 border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
                        : "bg-gray-100 border border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
                  }`}
                >
                  {shareState === "copied"
                    ? <><Check className="w-3.5 h-3.5" /><span>Kopierad!</span></>
                    : <><Share2 className="w-3.5 h-3.5" /><span>Dela</span></>}
                </button>
                </LongPressTooltip>

                {/* Export-knapp */}
                <LongPressTooltip label="Exportera">
                <button
                  onClick={() => setShowExport(true)}
                  title="Exportera laguppställning"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${isLineupDark ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-100 border border-emerald-300 text-emerald-700 hover:bg-emerald-200'}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportera</span>
                </button>
                </LongPressTooltip>

                {/* Statistik-knapp */}
                <LongPressTooltip label="Statistik">
                <button
                  onClick={() => setShowStats((v) => !v)}
                  title="Visa/dölj statistik"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    showStats
                      ? isLineupDark
                        ? "bg-sky-500/30 border border-sky-400/50 text-sky-300"
                        : "bg-sky-100 border border-sky-300 text-sky-700"
                      : isLineupDark
                        ? "bg-white/5 border border-white/15 text-white/50 hover:bg-white/10 hover:text-white/80"
                        : "bg-gray-100 border border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  {showStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                </LongPressTooltip>

                {/* Tema-toggle */}
                <LongPressTooltip label={isLineupDark ? "Ljust tema" : "Mörkt tema"}>
                <button
                  onClick={toggleLineupTheme}
                  title={isLineupDark ? "Byt till ljust tema" : "Byt till mörkt tema"}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    isLineupDark
                      ? 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'
                      : 'bg-gray-100 border border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                  }`}
                >
                  {isLineupDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
                </LongPressTooltip>

                {/* Inställningar-knapp (dold) */}
                <LongPressTooltip label="Inställningar">
                <button
                  data-settings-btn
                  onClick={() => setShowSettings(true)}
                  title="Inställningar"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all uppercase tracking-wider ${
                    isLineupDark
                      ? 'bg-white/5 border border-white/10 text-white/30 hover:bg-white/10 hover:text-white/60'
                      : 'bg-gray-50 border border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                </LongPressTooltip>
              </div>
              {/* Hjälptext – positioner och instruktioner */}
              <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] ${isLineupDark ? 'text-white/35' : 'text-gray-500'}`}>
                <span className="flex items-center gap-1"><span className="bg-yellow-500/30 text-yellow-300 px-1 rounded text-[9px] font-bold">MV</span> Målvakt</span>
                <span className="flex items-center gap-1"><span className="bg-blue-500/30 text-blue-300 px-1 rounded text-[9px] font-bold">B</span> Back</span>
                <span className="flex items-center gap-1"><span className="bg-red-500/30 text-red-300 px-1 rounded text-[9px] font-bold">F</span> Forward</span>
                <span className="flex items-center gap-1"><span className="bg-purple-500/30 text-purple-300 px-1 rounded text-[9px] font-bold">C</span> Center</span>
                <span className="flex items-center gap-1"><span className="bg-teal-500/30 text-teal-300 px-1 rounded text-[9px] font-bold">IB</span> IceBox</span>
                <span className="text-white/20">|</span>
                <span>Dra spelare till en plats · Klicka på badge för att ändra position</span>
              </div>
            </div>
          </header>

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
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 backdrop-blur-sm">
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
                            { pos: "F", label: "Forwards", color: "text-emerald-400" },
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
                            { pos: "F", label: "F", color: "text-emerald-400" },
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

          {/* Mobilflikar – styrs av isMobile (samma källa som innehållet) */}
          {isMobile && <div className="shrink-0">
            <div className="flex gap-0 px-2">
              {(sideLayout
                ? [
                    { key: "trupp" as MobileTab, label: "Trupp", color: "border-emerald-400/60 text-emerald-300" },
                    { key: "vita" as MobileTab, label: `${teamAName} (${teamARegistered}/${teamACount})`, color: "border-slate-300/60 text-slate-200" },
                    { key: "grona" as MobileTab, label: `${teamBName} (${teamBRegistered}/${teamBCount})`, color: "border-emerald-500/60 text-emerald-400" },
                  ]
                : [
                    { key: "vita" as MobileTab, label: `${teamAName} (${teamARegistered}/${teamACount})`, color: "border-slate-300/60 text-slate-200" },
                    { key: "trupp" as MobileTab, label: "Trupp", color: "border-emerald-400/60 text-emerald-300" },
                    { key: "grona" as MobileTab, label: `${teamBName} (${teamBRegistered}/${teamBCount})`, color: "border-emerald-500/60 text-emerald-400" },
                  ]
              ).map(({ key, label, color }) => (
                <button
                  key={key}
                  data-mobile-tab={key}
                  onClick={() => setMobileTab(key)}
                  className={`
                    flex-1 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all
                    ${mobileTab === key
                      ? `${color} bg-white/5`
                      : dragHoverTab === key
                      ? `${color} bg-white/10 scale-105 animate-pulse`
                      : "border-transparent text-white/30 hover:text-white/50"}
                  `}
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Swipe-indikator (prickar) */}
            <div className="flex justify-center gap-1.5 py-1.5">
              {(sideLayout ? ["trupp", "vita", "grona"] as MobileTab[] : TAB_ORDER).map((tab) => (
                <div
                  key={tab}
                  className={`rounded-full transition-all duration-200 ${
                    mobileTab === tab
                      ? "w-4 h-1.5 bg-emerald-400/70"
                      : "w-1.5 h-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>
          </div>}

          <main className="px-2 md:px-4 pb-8" ref={exportRef}>
            {/* Villkorlig rendering: ANTINGEN desktop ELLER mobil – aldrig båda */}
            {/* Detta eliminerar dubbla droppables som förvirrar dnd-kit */}
            {!isMobile ? (
              /* Desktop layout – standard eller sidoläge */
              sideLayout ? (
                /* Sidoläge: Trupp till vänster (fast bredd), lagen bredvid varandra */
                <div className="flex gap-2 overflow-x-auto" style={{ minWidth: '850px' }}>
                  {/* Spelarlista (vänster) – fast bredd */}
                  <div
                    className="flex flex-col gap-2 shrink-0 min-w-0"
                    style={{ width: `${ROSTER_WIDTH}px` }}
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
                       />
                    </div>
                    <SavedLineupsPanel
                       teamAName={teamAName}
                       teamBName={teamBName}
                       lineup={lineup}
                       onLoadLineup={handleLoadLineup}
                    />
                  </div>

                  {/* Lagen bredvid varandra */}
                  <div className="flex-1 grid grid-cols-2 gap-1 md:gap-1.5 min-w-0">
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
                      config={teamAConfig}
                      onConfigChange={setTeamAConfig}
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
                      config={teamBConfig}
                      onConfigChange={setTeamBConfig}
                    />
                  </div>
                </div>
              ) : (
                /* Standard-layout: Vita | Trupp | Gröna */
                <div className="overflow-x-auto">
                <div
                  className="grid gap-1 md:gap-1.5"
                  style={{
                    gridTemplateColumns: "minmax(220px, 1fr) 320px minmax(220px, 1fr)",
                    minWidth: "850px",
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
                    config={teamAConfig}
                    onConfigChange={setTeamAConfig}
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
                      />
                    </div>
                    <SavedLineupsPanel
                      teamAName={teamAName}
                      teamBName={teamBName}
                      lineup={lineup}
                      onLoadLineup={handleLoadLineup}
                    />
                  </div>

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
                    config={teamBConfig}
                    onConfigChange={setTeamBConfig}
                  />
                </div>
                </div>
              )
            ) : (
              /* Mobilvy – bara den aktiva fliken renderas */
              <div
                ref={swipeRef}
                className="relative touch-pan-y transition-transform duration-200 ease-out"
              >
                {/* Kantindikatorer vid drag – visar att man kan dra åt sidan */}
                {activePlayer && isMobile && (
                  <>
                    {TAB_ORDER.indexOf(mobileTab) > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 w-8 z-30 pointer-events-none flex items-center justify-center bg-gradient-to-r from-cyan-400/20 to-transparent animate-pulse rounded-l">
                        <span className="text-white/60 text-lg">❮</span>
                      </div>
                    )}
                    {TAB_ORDER.indexOf(mobileTab) < TAB_ORDER.length - 1 && (
                      <div className="absolute right-0 top-0 bottom-0 w-8 z-30 pointer-events-none flex items-center justify-center bg-gradient-to-l from-emerald-400/20 to-transparent animate-pulse rounded-r">
                        <span className="text-white/60 text-lg">❯</span>
                      </div>
                    )}
                  </>
                )}
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
                    config={teamAConfig}
                    onConfigChange={setTeamAConfig}
                  />
                )}
                {mobileTab === "trupp" && (
                  <div className="flex flex-col gap-2">
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
                     />
                    <SavedLineupsPanel
                      teamAName={teamAName}
                      teamBName={teamBName}
                      lineup={lineup}
                      onLoadLineup={handleLoadLineup}
                    />
                  </div>
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
                    config={teamBConfig}
                    onConfigChange={setTeamBConfig}
                  />
                )}
              </div>
            )}
          </main>
        </div>

        {/* Drag overlay – inuti DndContext, position:fixed så den alltid syns över allt */}
        <DragOverlay style={{ zIndex: 99999, pointerEvents: "none" }} modifiers={[snapCenterToCursor]}>
          {activePlayer ? <PlayerCardOverlay player={activePlayer} /> : null}
        </DragOverlay>
      </div>

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
           allPlayers={availablePlayers}
         />
      )}

      {/* Inställningar-modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Bekäftelsedialog för Rensa */}
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

      {/* Bekräftelsedialog för Auto-fördela */}
      {confirmAutoDistribute && (
        <ConfirmDialog
          title="Auto-fördela"
          message="Vill du fördela alla anmälda spelare automatiskt på lagen? Befintliga laguppställningar rensas först."
          confirmLabel="Fördela"
          cancelLabel="Avbryt"
          onConfirm={() => {
            setConfirmAutoDistribute(false);
            handleAutoDistribute();
          }}
          onCancel={() => setConfirmAutoDistribute(false)}
        />
      )}
      {/* Remote change toast */}
      {remoteChangeToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99999] bg-black/80 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-sm border border-white/10 animate-in fade-in slide-in-from-bottom-2">
          {remoteChangeToast}
        </div>
      )}
    </DndContext>
    </div>
  );
}
