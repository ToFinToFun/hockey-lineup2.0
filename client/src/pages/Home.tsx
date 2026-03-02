// Hockey Lineup App – Home
// Design: Industrial Ice Arena
import { useAuth } from "@/_core/hooks/useAuth";
// - Firebase Realtime Database synkronisering (alla användare ser samma data)
// - localStorage som fallback om Firebase är offline
// - Ångra-funktion (Ctrl+Z + knapp i header)
// - In-app bekräftelsedialog för Rensa

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
import { saveStateToFirebase, subscribeToFirebase, saveLineupToFirebase, type AppState, type SavedLineup } from "@/lib/firebase";
import { Download, Wifi, WifiOff, Share2, Check, CalendarDays } from "lucide-react";
import { matchRegisteredPlayers, matchDeclinedPlayers, fetchAttendanceFromApi } from "@/lib/laget";
import { createPortal } from "react-dom"; // används av PlayerList context-meny
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useSwipe } from "@/hooks/useSwipe";

type MobileTab = "vita" | "trupp" | "grona";

const BG_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/gLOHFxhFzgQgHeKl.jpg";

const LOGO_GREEN = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/yvyuOVwYRSLbWwHt.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663363408929/OmjlmGnLDLTblNdj.png";

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
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null);
  const [shareState, setShareState] = useState<"idle" | "saving" | "copied">("idle");

  // Event-info från senaste anmälningshämtning
  const [eventInfo, setEventInfo] = useState<{ title: string; date: string } | null>(null);

  // Tidstämpel för senaste synk
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    setShareState("saving");
    try {
      const id = await saveLineupToFirebase(
        `Delad ${new Date().toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
        teamAName,
        teamBName,
        lineup
      );
      const url = `${window.location.origin}/lineup/${id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("idle");
    }
  }, [teamAName, teamBName, lineup]);

  // IDs för medvetet borttagna spelare – hindrar merge från att lägga tillbaka dem
  const [deletedPlayerIds, setDeletedPlayerIds] = useState<Set<string>>(new Set());
  const deletedPlayerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletedPlayerIdsRef.current = deletedPlayerIds; }, [deletedPlayerIds]);

  // Ångra-historik
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const skipNextUndoSnapshot = useRef(false); // hoppa över snapshot vid ångra-återställning

  // Bekräftelsedialog för Rensa
  const [confirmClear, setConfirmClear] = useState<{ teamPrefix: string; teamName: string } | null>(null);

  // Prevent writing back to Firebase when we just received an update from it
  const isReceivingFromFirebase = useRef(false);
  // Track if we've received the initial Firebase state
  const hasReceivedInitial = useRef(false);

  const exportRef = useRef<HTMLDivElement>(null);

  // Subscribe to Firebase on mount
  useEffect(() => {
    const unsubscribe = subscribeToFirebase((state: AppState | null) => {
      setFirebaseConnected(true);
      if (state) {
        isReceivingFromFirebase.current = true;
        skipNextUndoSnapshot.current = true; // Firebase-uppdateringar ska inte läggas i undo-stacken

        // Merge: se till att alla spelare från initialPlayers alltid finns i truppen
        // (Firebase kan ha en äldre lista som saknar nyare spelare)
        // Spelare som medvetet tagits bort (deletedPlayerIds) läggs INTE tillbaka
        const firebasePlayers: Player[] = state.players ?? [];
        const firebaseIds = new Set(firebasePlayers.map((p) => p.id));
        const lineupIds = new Set(Object.values(state.lineup ?? {}).map((p) => p.id));
        const firebaseDeletedIds = new Set<string>(state.deletedPlayerIds ?? []);
        // Uppdatera deletedPlayerIds med vad Firebase vet om
        if (firebaseDeletedIds.size > 0) {
          setDeletedPlayerIds((prev) => {
            const merged = new Set(Array.from(prev).concat(Array.from(firebaseDeletedIds)));
            deletedPlayerIdsRef.current = merged;
            return merged;
          });
        }
        const allDeletedIds = new Set(Array.from(deletedPlayerIdsRef.current).concat(Array.from(firebaseDeletedIds)));
        const missingPlayers = initialPlayers.filter(
          (p) => !firebaseIds.has(p.id) && !lineupIds.has(p.id) && !allDeletedIds.has(p.id)
        );
        const mergedPlayers = missingPlayers.length > 0
          ? [...firebasePlayers, ...missingPlayers]
          : firebasePlayers;

        // Filtrera bort ogiltiga slot-IDs (t.ex. från äldre versioner av appen)
        // som kan ha sparat spelare i slot-IDs som inte längre existerar
        const rawLineup = state.lineup ?? {};
        const sanitizedLineup: Record<string, Player> = {};
        for (const [slotId, player] of Object.entries(rawLineup)) {
          if (ALL_SLOT_IDS.has(slotId)) {
            sanitizedLineup[slotId] = player;
          }
        }

        setAvailablePlayers(mergedPlayers);
        setLineup(sanitizedLineup);
        setTeamAName(state.teamAName ?? "VITA");
        setTeamBName(state.teamBName ?? "GRÖNA");
        if (state.teamAConfig) setTeamAConfig(state.teamAConfig);
        if (state.teamBConfig) setTeamBConfig(state.teamBConfig);
        // Allow re-renders to settle before re-enabling writes
        setTimeout(() => {
          isReceivingFromFirebase.current = false;
        }, 100);
      } else if (!hasReceivedInitial.current) {
        // No data in Firebase yet — push our local state up
        const localState = loadLocalState();
        if (localState) {
          // Sanitera localStorage-lineup också innan vi skriver till Firebase
          const rawLocalLineup = localState.lineup ?? {};
          const sanitizedLocalLineup: Record<string, Player> = {};
          for (const [slotId, player] of Object.entries(rawLocalLineup)) {
            if (ALL_SLOT_IDS.has(slotId)) {
              sanitizedLocalLineup[slotId] = player;
            }
          }
          saveStateToFirebase({
            players: localState.availablePlayers,
            lineup: sanitizedLocalLineup,
            teamAName: localState.teamAName,
            teamBName: localState.teamBName,
          });
        }
      }
      hasReceivedInitial.current = true;
    });

    return unsubscribe;
  }, []);

  // Save to both Firebase and localStorage on every state change
  useEffect(() => {
    if (isReceivingFromFirebase.current) return;
    if (!hasReceivedInitial.current) return;

    const state: SavedState = { availablePlayers, lineup, teamAName, teamBName, teamAConfig, teamBConfig };
    saveLocalState(state);
    saveStateToFirebase({
      players: availablePlayers,
      lineup,
      teamAName,
      teamBName,
      deletedPlayerIds: Array.from(deletedPlayerIds),
      teamAConfig,
      teamBConfig,
    });
  }, [availablePlayers, lineup, teamAName, teamBName, deletedPlayerIds, teamAConfig, teamBConfig]);

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
      isReceivingFromFirebase.current = true;
      skipNextUndoSnapshot.current = true;
      setAvailablePlayers(snapshot.availablePlayers);
      setLineup(snapshot.lineup);
      setTimeout(() => {
        isReceivingFromFirebase.current = false;
      }, 200);
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

  // Utför Rensa efter bekräftelse
  const handleConfirmClearTeam = useCallback(() => {
    if (!confirmClear) return;
    setConfirmClear(null);

    const { teamPrefix } = confirmClear;

    // Blockera inkommande Firebase-uppdateringar under operationen
    isReceivingFromFirebase.current = true;

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

    // Återaktivera Firebase-synk efter att React hunnit rendera
    setTimeout(() => {
      isReceivingFromFirebase.current = false;
    }, 200);
  }, [confirmClear, pushUndo]);

  // Ladda en sparad uppställning
  const handleLoadLineup = useCallback((saved: SavedLineup) => {
    isReceivingFromFirebase.current = true;
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

    setTimeout(() => {
      isReceivingFromFirebase.current = false;
    }, 200);
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

  // Auto-hämta anmälningar vid sidladdning
  const autoFetchDone = useRef(false);
  useEffect(() => {
    if (autoFetchDone.current) return;
    autoFetchDone.current = true;
    handleBulkRegister().then((result) => {
      if (result.eventTitle) {
        setEventInfo({ title: result.eventTitle, date: result.eventDate || "" });
      } else if (result.noEvent) {
        setEventInfo(null);
      }
    });
  }, [handleBulkRegister]);

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
  const TAB_ORDER: MobileTab[] = ["vita", "trupp", "grona"];
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
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />

        <div className="relative flex flex-col min-h-screen">
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
                {eventInfo && (
                  <p className="flex items-center gap-1.5 text-sky-300/80 text-[11px] mt-0.5 font-medium">
                    <CalendarDays className="w-3 h-3" />
                    {eventInfo.title}{eventInfo.date ? ` · ${eventInfo.date}` : ""}
                    {lastSyncTime && (
                      <span className="text-white/30 ml-1.5">· Hämtat {lastSyncTime}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                {/* Firebase sync status */}
                <div className="flex items-center gap-1.5">
                  {firebaseConnected === null ? (
                    <span className="text-white/30 text-[10px] uppercase tracking-wider">Ansluter...</span>
                  ) : firebaseConnected ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400/70 text-[10px] uppercase tracking-wider">Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-red-400" />
                      <span className="text-red-400/70 text-[10px] uppercase tracking-wider">Offline</span>
                    </>
                  )}
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

                {/* Dela-knapp */}
                <button
                  onClick={handleShare}
                  disabled={shareState === "saving"}
                  title="Dela skrivskyddad länk till aktuell uppställning"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                    shareState === "copied"
                      ? "bg-emerald-500/30 border border-emerald-400/60 text-emerald-200"
                      : "bg-white/5 border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
                  }`}
                >
                  {shareState === "copied"
                    ? <><Check className="w-3.5 h-3.5" /><span className="hidden md:inline">Kopierad!</span></>
                    : <><Share2 className="w-3.5 h-3.5" /><span className="hidden md:inline">Dela</span></>}
                </button>

                {/* Export-knapp */}
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all uppercase tracking-wider"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Exportera</span>
                </button>
              </div>
            </div>
          </header>

          {/* Mobilflikar – syns bara på smala skärmar */}
          <div className="md:hidden shrink-0">
            <div className="flex gap-0 px-2">
              {([
                { key: "vita" as MobileTab, label: `${teamAName} (${teamARegistered}/${teamACount})`, color: "border-slate-300/60 text-slate-200" },
                { key: "trupp" as MobileTab, label: "Trupp", color: "border-emerald-400/60 text-emerald-300" },
                { key: "grona" as MobileTab, label: `${teamBName} (${teamBRegistered}/${teamBCount})`, color: "border-emerald-500/60 text-emerald-400" },
              ]).map(({ key, label, color }) => (
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
              {TAB_ORDER.map((tab) => (
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
          </div>

          <main className="px-2 md:px-4 pb-8" ref={exportRef}>
            {/* Villkorlig rendering: ANTINGEN desktop ELLER mobil – aldrig båda */}
            {/* Detta eliminerar dubbla droppables som förvirrar dnd-kit */}
            {!isMobile ? (
              /* Desktop grid */
              <div
                className="grid gap-2 md:gap-3"
                style={{
                  gridTemplateColumns: "minmax(0, 1fr) 300px minmax(0, 1fr)",
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
        />
      )}

      {/* Bekräftelsedialog för Rensa */}
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
    </DndContext>
  );
}
