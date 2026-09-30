/*
 * MatchPage - Main match tracking interface
 * Design: Dark theme with hockey background, team logos, score counters, goal history with sponsors
 * Mirrors the native app's Match tab
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { IMAGES, COLORS, STORAGE_KEY, type GoalEvent, type MatchState } from "@/lib/scoreConstants";
import { useSponsors, pickLeastShown, logoForName } from "@/lib/sponsors";
import { useWakeLock } from "@/hooks/useWakeLock";
import { resolveMatchStart, matchName } from "@shared/matchTiming";
import { playGoalSound as playGoalSoundFx, playEndSignal, unlockAudio } from "@/lib/matchSounds";
import { type AppState, createTeamSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import { type Player } from "@/lib/players";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { queueMatch, isNetworkError } from "@/lib/offlineScore";
import { toast } from "sonner";

interface MatchPageProps {
  lineupState: AppState | null;
}

// Position badge colors (matching native app)
const POS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MV: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" },
  RES: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" },
  B: { bg: "#DBEAFE", text: "#1E40AF", border: "#3B82F6" },
  LW: { bg: "#D1FAE5", text: "#065F46", border: "#10B981" },
  C: { bg: "#EDE9FE", text: "#5B21B6", border: "#8B5CF6" },
  RW: { bg: "#D1FAE5", text: "#065F46", border: "#10B981" },
  F: { bg: "#D1FAE5", text: "#065F46", border: "#10B981" },
  IB: { bg: "#DBEAFE", text: "#1E40AF", border: "#3B82F6" },
};

function getGoalBg(team: "white" | "green"): string {
  return team === "white" ? "rgba(255,255,255,0.92)" : "rgba(34,197,94,0.75)";
}
function getGoalText(team: "white" | "green"): string {
  return team === "white" ? "#1a1a1a" : "#ffffff";
}

/** Positionsbricka i spelarväljaren – samma färger som i resten av appen. */
function PickPos({ pos }: { pos: string }) {
  if (!pos) return <span className="w-6 shrink-0" />;
  const cls = pos === "M" ? "mv" : pos.toLowerCase();
  const name = { M: "Målvakt", B: "Back", C: "Center", F: "Forward" }[pos] ?? pos;
  return <span className={`pos-badge pos-badge-sm pos-badge-${cls} shrink-0`} title={name}>{pos}</span>;
}

export default function MatchPage({ lineupState }: MatchPageProps) {
  // ─── State ─────────────────────────────────────────────────────
  const { sponsors } = useSponsors();
  const [teamWhiteScore, setTeamWhiteScore] = useState(0);
  const [teamGreenScore, setTeamGreenScore] = useState(0);
  const [goalHistory, setGoalHistory] = useState<GoalEvent[]>([]);
  const [matchStartTime, setMatchStartTime] = useState<string | undefined>();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedGoalIndex, setSelectedGoalIndex] = useState<number | null>(null);
  const [scorerName, setScorerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [playerPickerVisible, setPlayerPickerVisible] = useState(false);
  const [playerPickerField, setPlayerPickerField] = useState<"scorer" | "assist">("scorer");
  const [playerPickerSearch, setPlayerPickerSearch] = useState("");
  const [otherInfo, setOtherInfo] = useState("");
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [endMatchModalVisible, setEndMatchModalVisible] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);

  // ─── End Time (slutsignal) ─────────────────────────────────────
  const [endTime, setEndTime] = useState<string | null>(null);
  const [endTimeModalVisible, setEndTimeModalVisible] = useState(false);
  const [endTimeInput, setEndTimeInput] = useState("");
  const [endTimeTriggered, setEndTimeTriggered] = useState(false);
  const [isMuted, setIsMutedRaw] = useState(() => {
    try { return localStorage.getItem("score_muted") === "1"; } catch { return false; }
  });
  const setIsMuted = (fn: (prev: boolean) => boolean) => setIsMutedRaw((prev) => {
    const next = fn(prev);
    try { localStorage.setItem("score_muted", next ? "1" : "0"); } catch { /* bara den här sessionen */ }
    if (!next) unlockAudio(); // tryckningen låser upp ljudet på iPhone
    return next;
  });

  // Ljud: pling (Vita), tut-tut (Gröna) och utdraget horn som slutsignal – se lib/matchSounds
  const playGoalSound = useCallback((team: "white" | "green") => {
    if (!isMuted) playGoalSoundFx(team);
  }, [isMuted]);
  const playEndHorn = useCallback(() => {
    if (!isMuted) playEndSignal();
  }, [isMuted]);
  // Lås upp ljudet vid första tryck så att slutsignalen (från en timer) hörs även på mobil
  useEffect(() => {
    // Vid varje tryck: väck ljudet om systemet pausat det (iPhone gör det efter samtal m.m.)
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchend", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, []);

  // Check end time every second inside the clock timer
  useEffect(() => {
    if (!endTime || endTimeTriggered) return;
    const checkInterval = setInterval(() => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const currentTimeStr = `${hh}:${mm}`;
      if (currentTimeStr === endTime) {
        setEndTimeTriggered(true);
        // Play sound
        playEndHorn();
        // Show alert after a short delay so sound starts first
        setTimeout(() => {
          alert(`📣 Sluttid! Matchen har nått sluttiden ${endTime}`);
          setEndTime(null);
          setEndTimeTriggered(false);
        }, 500);
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [endTime, endTimeTriggered, playEndHorn]);

  const handleSetEndTime = () => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (timeRegex.test(endTimeInput)) {
      // Normalize to HH:MM (pad single-digit hour)
      const parts = endTimeInput.split(":");
      const normalized = `${parts[0].padStart(2, "0")}:${parts[1]}`;
      setEndTime(normalized);
      setEndTimeModalVisible(false);
      setEndTimeInput("");
    } else {
      alert("Ogiltigt format. Ange tid i formatet HH:MM (t.ex. 15:30)");
    }
  };

  const handleEndTimeInputChange = (text: string) => {
    // Remove non-digits
    const digits = text.replace(/\D/g, "");
    // Auto-format as HH:MM
    if (digits.length <= 2) {
      setEndTimeInput(digits);
    } else if (digits.length <= 4) {
      setEndTimeInput(`${digits.slice(0, 2)}:${digits.slice(2)}`);
    } else {
      setEndTimeInput(`${digits.slice(0, 2)}:${digits.slice(2, 4)}`);
    }
  };

  const testEndSignalSound = () => {
    unlockAudio();
    playEndHorn();
  };

  // ─── Wake Lock (prevent screen from turning off) ────────────────
  // Håll skärmen tänd – se hooks/useWakeLock (tas tillbaka automatiskt när appen visas igen)
  const wakeLock = useWakeLock();

  // ─── Clock ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // ─── Persistence ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: MatchState = JSON.parse(saved);
        setTeamWhiteScore(state.teamWhiteScore);
        setTeamGreenScore(state.teamGreenScore);
        setGoalHistory(state.goalHistory);
        setMatchStartTime(state.matchStartTime);
      }
    } catch (e) {
      console.error("Failed to load match state:", e);
    }
  }, []);

  const saveState = useCallback((ws: number, gs: number, gh: GoalEvent[], mst?: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        teamWhiteScore: ws, teamGreenScore: gs, goalHistory: gh, matchStartTime: mst,
      }));
    } catch (e) {
      console.error("Failed to save match state:", e);
    }
  }, []);

  // ─── Score actions ─────────────────────────────────────────────
  const incrementScore = (team: "white" | "green") => {
    const now = new Date();
    const timestamp = formatTime(now);
    // Sponsorn som visats minst i matcher denna säsong (inklusive mål i den här matchen)
    const inThisMatch = (name: string) =>
      goalHistory.filter((g) => g.sponsor?.trim().toLowerCase() === name.trim().toLowerCase()).length;
    const sponsor = pickLeastShown(sponsors, (s) => s.counts.matches + inThisMatch(s.name))?.name;
    const newGoal: GoalEvent = { team, timestamp, sponsor };
    const newHistory = [newGoal, ...goalHistory];
    const newMst = matchStartTime || now.toISOString();

    // Play team-specific goal sound
    playGoalSound(team);

    if (team === "white") {
      setTeamWhiteScore(prev => prev + 1);
      saveState(teamWhiteScore + 1, teamGreenScore, newHistory, newMst);
    } else {
      setTeamGreenScore(prev => prev + 1);
      saveState(teamWhiteScore, teamGreenScore + 1, newHistory, newMst);
    }
    setGoalHistory(newHistory);
    setMatchStartTime(newMst);
  };

  const decrementScore = (team: "white" | "green") => {
    if (team === "white" && teamWhiteScore > 0) {
      const newHistory = goalHistory.filter((_, i) => {
        const idx = goalHistory.findIndex(g => g.team === "white");
        return i !== idx;
      });
      setTeamWhiteScore(prev => prev - 1);
      setGoalHistory(newHistory);
      saveState(teamWhiteScore - 1, teamGreenScore, newHistory, matchStartTime);
    } else if (team === "green" && teamGreenScore > 0) {
      const newHistory = goalHistory.filter((_, i) => {
        const idx = goalHistory.findIndex(g => g.team === "green");
        return i !== idx;
      });
      setTeamGreenScore(prev => prev - 1);
      setGoalHistory(newHistory);
      saveState(teamWhiteScore, teamGreenScore - 1, newHistory, matchStartTime);
    }
  };

  const resetMatch = () => {
    if (!confirm("Är du säker på att du vill återställa matchen?")) return;
    setTeamWhiteScore(0);
    setTeamGreenScore(0);
    setGoalHistory([]);
    setMatchStartTime(undefined);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ─── End match / save to database ──────────────────────────────
  const saveMatchMutation = trpc.score.match.save.useMutation();

  // Starttid från dagens träning på laget.se (hämtas när Avsluta öppnas), annars uppskattad
  const eventQuery = trpc.laget.attendance.useQuery(undefined, { enabled: endMatchModalVisible, staleTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false });
  const resolvedStart = () => resolveMatchStart(eventQuery.data ?? null, matchStartTime ?? null);
  const getMatchName = () => matchName(resolvedStart().start, teamWhiteScore, teamGreenScore);

  const resetAfterSave = () => {
    setTeamWhiteScore(0);
    setTeamGreenScore(0);
    setGoalHistory([]);
    setMatchStartTime(undefined);
    localStorage.removeItem(STORAGE_KEY);
    setEndMatchModalVisible(false);
  };

  const handleEndMatch = async () => {
    setSavingMatch(true);
    const { start, source } = resolvedStart();
    const location = source === "event" ? (eventQuery.data?.eventLocation ?? undefined) : undefined;
    const name = matchName(start, teamWhiteScore, teamGreenScore);
    const payload = {
      name,
      teamWhiteScore,
      teamGreenScore,
      goalHistory: goalHistory,
      matchStartTime: start.toISOString(),
      location,
      // Sluttiden sätts nu, så att en match som laddas upp senare (utan nät) får rätt tid
      matchEndTime: new Date().toISOString(),
      lineup: lineupState || undefined,
    };
    try {
      const res = await saveMatchMutation.mutateAsync(payload);
      resetAfterSave();
      toast.success("☁️ Matchen är uppladdad", {
        description: res?.reviewStatus === "approved"
          ? `${name} – godkänd`
          : `${name} – väntar på godkännande`,
        duration: 6000,
      });
    } catch (e) {
      if (isNetworkError(e)) {
        // Ingen täckning: spara lokalt och skicka automatiskt senare.
        queueMatch(payload);
        resetAfterSave();
        toast.warning("📱 Matchen är sparad lokalt på telefonen", {
          description: "Den laddas upp automatiskt så fort du har nät – eller tryck Skicka nu i den gula raden.",
          duration: 7000,
        });
      } else {
        console.error('Failed to save match:', e);
        toast.error("Kunde inte spara matchen", {
          description: "Försök igen.",
          duration: 4000,
        });
      }
    } finally {
      setSavingMatch(false);
    }
  };



  // ─── Goal details modal ────────────────────────────────────────
  const openScorerModal = (index: number) => {
    setSelectedGoalIndex(index);
    const goal = goalHistory[index];
    setScorerName(goal.scorer || "");
    setAssistName(goal.assist || "");
    setOtherInfo(goal.other === "Straff" ? "Straff" : "");
    setModalVisible(true);
  };

  const saveGoalDetails = () => {
    if (selectedGoalIndex === null) return;
    const updated = [...goalHistory];
    // Koppla målskytt/assist till spelarens fasta ID (statistiken följer med vid namnbyte).
    const idForLabel = (label: string) => {
      if (!label || !lineupState) return undefined;
      const all = [...(lineupState.players ?? []), ...Object.values(lineupState.lineup ?? {})];
      const found = all.find((p) => (p.number ? `${p.name} #${p.number}` : p.name) === label) ?? all.find((p) => p.name === label);
      return found?.id;
    };
    updated[selectedGoalIndex] = {
      ...updated[selectedGoalIndex],
      scorer: scorerName || undefined,
      scorerId: idForLabel(scorerName),
      assist: assistName || undefined,
      assistId: idForLabel(assistName),
      // Bara straff markeras – allt annat är ett vanligt mål
      other: otherInfo === "Straff" ? "Straff" : undefined,
    };
    setGoalHistory(updated);
    saveState(teamWhiteScore, teamGreenScore, updated, matchStartTime);
    setModalVisible(false);
  };

  const normalizePlayerName = (rawName: string) => {
    const match = rawName.match(/^#(\d+)\s+(.+)$/);
    if (match) return `${match[2]} #${match[1]}`;
    return rawName;
  };

  const formatGoalDetails = (goal: GoalEvent): { lines: string[]; otherTag: string | null; hasDetails: boolean } => {
    const lines: string[] = [];
    if (goal.scorer) lines.push(`Målskytt: ${normalizePlayerName(goal.scorer)}`);
    if (goal.assist) lines.push(`Assist: ${normalizePlayerName(goal.assist)}`);
    // Bara straff visas som märke – "Övrigt" och äldre typer visas inte
    const otherTag = goal.other === "Straff" ? "Straff" : null;
    if (lines.length === 0) return { lines: ["Tryck för att ange målskytt / assist"], otherTag, hasDetails: false };
    return { lines, otherTag, hasDetails: true };
  };

  // ─── Player picker data ────────────────────────────────────────
  const getSortedPlayers = useCallback((goalTeam: "white" | "green") => {
    if (!lineupState) return { scoring: [], other: [], unplaced: [] };
    const teamASlots = createTeamSlots("team-a", lineupState.teamAConfig ?? MAX_TEAM_CONFIG);
    const teamBSlots = createTeamSlots("team-b", lineupState.teamBConfig ?? MAX_TEAM_CONFIG);
    const teamAName = (lineupState.teamAName || "").toLowerCase();
    const isTeamAWhite = teamAName.includes("vit");
    const scoringSlots = goalTeam === "white" ? (isTeamAWhite ? teamASlots : teamBSlots) : (isTeamAWhite ? teamBSlots : teamASlots);
    const otherSlots = goalTeam === "white" ? (isTeamAWhite ? teamBSlots : teamASlots) : (isTeamAWhite ? teamASlots : teamBSlots);

    // Position som enkel bokstav (M, B, C, F) – målvakter sist, annars namnordning
    type PickerPlayer = Player & { pickPos: "M" | "B" | "C" | "F" | "" };
    const fromSlot = (slot: { type: string; shortLabel: string }): PickerPlayer["pickPos"] =>
      slot.type === "goalkeeper" ? "M" : slot.type === "defense" ? "B" : slot.shortLabel === "C" ? "C" : "F";
    const fromRegistry = (pos: string | undefined): PickerPlayer["pickPos"] =>
      pos === "MV" ? "M" : pos === "B" ? "B" : pos === "C" ? "C" : pos === "F" || pos === "IB" ? "F" : "";
    const byPos = (a: PickerPlayer, b: PickerPlayer) =>
      (a.pickPos === "M" ? 1 : 0) - (b.pickPos === "M" ? 1 : 0) || a.name.localeCompare(b.name, "sv");

    const scoring: PickerPlayer[] = [];
    const other: PickerPlayer[] = [];
    const placedIds = new Set<string>();

    for (const slot of scoringSlots) {
      const p = lineupState.lineup[slot.id];
      if (p) { scoring.push({ ...p, pickPos: fromSlot(slot) }); placedIds.add(p.id); }
    }
    for (const slot of otherSlots) {
      const p = lineupState.lineup[slot.id];
      if (p) { other.push({ ...p, pickPos: fromSlot(slot) }); placedIds.add(p.id); }
    }

    const unplaced = (lineupState.players || [])
      .filter(p => !placedIds.has(p.id))
      .map((p) => ({ ...p, pickPos: fromRegistry(p.position) }))
      .sort(byPos);

    return { scoring: scoring.sort(byPos), other: other.sort(byPos), unplaced };
  }, [lineupState]);

  const pickerData = useMemo(() => {
    if (selectedGoalIndex === null || !lineupState) return null;
    const goal = goalHistory[selectedGoalIndex];
    if (!goal) return null;
    const { scoring, other, unplaced } = getSortedPlayers(goal.team);
    const teamAName = lineupState.teamAName || "Lag A";
    const teamBName = lineupState.teamBName || "Lag B";
    const isTeamAWhite = (teamAName).toLowerCase().includes("vit");
    const scoringTeamName = goal.team === "white" ? (isTeamAWhite ? teamAName : teamBName) : (isTeamAWhite ? teamBName : teamAName);
    const otherTeamName = goal.team === "white" ? (isTeamAWhite ? teamBName : teamAName) : (isTeamAWhite ? teamAName : teamBName);

    const search = playerPickerSearch.toLowerCase();
    const filter = (p: Player) => !search || p.name.toLowerCase().includes(search) || (p.number ?? "").includes(search);

    return {
      scoringTeamName,
      otherTeamName,
      goalTeam: goal.team,
      filteredScoring: scoring.filter(filter),
      filteredOther: other.filter(filter),
      filteredUnplaced: unplaced.filter(filter),
    };
  }, [selectedGoalIndex, goalHistory, lineupState, playerPickerSearch, getSortedPlayers]);

  const selectPlayer = (name: string) => {
    if (playerPickerField === "scorer") setScorerName(name);
    else setAssistName(name);
    setPlayerPickerVisible(false);
    setPlayerPickerSearch("");
  };

  // ─── Statistics ────────────────────────────────────────────────
  const statsData = useMemo(() => {
    const playerStats: Record<string, { goals: number; assists: number; team: "white" | "green" }> = {};
    for (const goal of goalHistory) {
      if (goal.scorer) {
        if (!playerStats[goal.scorer]) playerStats[goal.scorer] = { goals: 0, assists: 0, team: goal.team };
        playerStats[goal.scorer].goals++;
      }
      if (goal.assist) {
        if (!playerStats[goal.assist]) playerStats[goal.assist] = { goals: 0, assists: 0, team: goal.team };
        playerStats[goal.assist].assists++;
      }
    }

    // Convert players to array (Firebase may return an object with numeric keys)
    const getPlayersArray = (): Player[] => {
      if (!lineupState) return [];
      const raw = lineupState.players;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      return Object.values(raw);
    };

    const getPlayerInfo = (name: string): Player | null => {
      // First search in players array
      const players = getPlayersArray();
      const found = players.find(p => 
        `${p.name} #${p.number}` === name || 
        `#${p.number} ${p.name}` === name || 
        p.name === name
      );
      if (found) return found;
      // Also search in lineup entries (players placed in lineup)
      if (lineupState?.lineup) {
        for (const p of Object.values(lineupState.lineup)) {
          if (p && (
            `${p.name} #${p.number}` === name || 
            `#${p.number} ${p.name}` === name || 
            p.name === name
          )) return p;
        }
      }
      return null;
    };

    const getSlotLabel = (player: Player) => {
      if (!lineupState?.lineup) return player.position;
      for (const [slotId, p] of Object.entries(lineupState.lineup)) {
        if (p && (p.id === player.id || (p.name === player.name && p.number === player.number))) {
          if (slotId.includes("-gk-")) return slotId.includes("-2") ? "RES" : "MV";
          if (slotId.includes("-def-")) return "B";
          if (slotId.includes("-fwd-")) {
            if (slotId.endsWith("-lw")) return "LW";
            if (slotId.endsWith("-c")) return "C";
            if (slotId.endsWith("-rw")) return "RW";
          }
        }
      }
      return player.position;
    };

    // Normalize name to always be "Name #Nr" format
    const normalizeName = (rawName: string) => {
      const playerInfo = getPlayerInfo(rawName);
      if (playerInfo) return `${playerInfo.name} #${playerInfo.number}`;
      // Fallback: if name starts with #Nr, reorder it
      const match = rawName.match(/^#(\d+)\s+(.+)$/);
      if (match) return `${match[2]} #${match[1]}`;
      return rawName;
    };

    const sorted = Object.entries(playerStats)
      .map(([name, stats]) => {
        const playerInfo = getPlayerInfo(name);
        const posLabel = playerInfo ? getSlotLabel(playerInfo) : "";
        const displayName = normalizeName(name);
        return { name: displayName, ...stats, points: stats.goals + stats.assists, posLabel, playerInfo };
      })
      .sort((a, b) => b.points - a.points || b.goals - a.goals);

    return { all: sorted };
  }, [goalHistory, lineupState]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="relative h-full flex flex-col" style={{
      backgroundImage: `url(${IMAGES.hockeyBackground})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }}>
      {/* Fixed top section: buttons + scores */}
      <div className="shrink-0 flex flex-col gap-3 p-4 pb-2" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
        {/* Time Display */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={wakeLock.toggle}
              disabled={wakeLock.status === "unsupported"}
              title={
                wakeLock.status === "unsupported" ? "Webbläsaren kan inte hålla skärmen tänd (kräver t.ex. iOS 18.4 eller Chrome)"
                : wakeLock.status === "on" ? "Skärmen hålls tänd – tryck för att stänga av"
                : wakeLock.status === "waiting" ? "Väntar – tryck var som helst på skärmen så aktiveras det"
                : "Skärmen kan släckas – tryck för att hålla den tänd"
              }
              className={`px-2.5 py-1.5 rounded-full border text-xs transition-colors disabled:opacity-40 ${
                wakeLock.status === "on" ? "bg-[#22C55E]/20 border-[#22C55E] text-[#22C55E]"
                : wakeLock.status === "waiting" ? "bg-amber-500/20 border-amber-400 text-amber-300"
                : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
              }`}
            >
              {wakeLock.status === "on" ? "☀️ Skärm på" : wakeLock.status === "waiting" ? "☀️ Tryck" : wakeLock.status === "unsupported" ? "🔅 Stöds ej" : "🔅 Skärm av"}
            </button>
            <button
              onClick={() => setIsMuted(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-full border text-xs transition-colors ${
                isMuted
                  ? "bg-[#EF4444]/20 border-[#EF4444] text-[#EF4444]"
                  : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
              }`}
            >
              {isMuted ? "🔇 Ljud av" : "🔊 Ljud"}
            </button>
          </div>
          <span className="text-xl font-bold text-[#9BA1A6]">{formatTime(currentTime)}</span>
          <button
            onClick={() => {
              setEndTimeModalVisible(true);
              if (endTime) setEndTimeInput(endTime);
            }}
            className={`px-2.5 py-1.5 rounded-full border text-xs transition-colors ${
              endTime
                ? "bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]"
                : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
            }`}
          >
            📣 {endTime || "Sluttid"}
          </button>
        </div>

        {/* Teams Side by Side */}
        <div className="flex gap-3">
          {/* Team White */}
          <div className="flex-1 bg-[#2a2a2a]/80 rounded-3xl p-4 border border-[#3a3a3a] backdrop-blur-sm">
            <div className="flex justify-center mb-2">
              <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-20 h-20 object-contain" />
            </div>
            <div className="text-5xl font-bold text-[#0a7ea4] text-center mb-3">{teamWhiteScore}</div>
            <div className="flex gap-2">
              <button onClick={() => decrementScore("white")}
                className="flex-1 bg-[#EF4444] text-[#1a1a1a] font-bold text-lg py-2.5 rounded-2xl active:opacity-80 transition-opacity">
                -
              </button>
              <button onClick={() => incrementScore("white")}
                className="flex-1 bg-[#22C55E] text-[#1a1a1a] font-bold text-lg py-2.5 rounded-2xl active:opacity-80 transition-opacity">
                +
              </button>
            </div>
          </div>

          {/* Team Green */}
          <div className="flex-1 bg-[#2a2a2a]/80 rounded-3xl p-4 border border-[#3a3a3a] backdrop-blur-sm">
            <div className="flex justify-center mb-2">
              <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-20 h-20 object-contain" />
            </div>
            <div className="text-5xl font-bold text-[#0a7ea4] text-center mb-3">{teamGreenScore}</div>
            <div className="flex gap-2">
              <button onClick={() => decrementScore("green")}
                className="flex-1 bg-[#EF4444] text-[#1a1a1a] font-bold text-lg py-2.5 rounded-2xl active:opacity-80 transition-opacity">
                -
              </button>
              <button onClick={() => incrementScore("green")}
                className="flex-1 bg-[#22C55E] text-[#1a1a1a] font-bold text-lg py-2.5 rounded-2xl active:opacity-80 transition-opacity">
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable bottom section */}
      <div className="flex-1 overflow-y-auto p-4 pt-2 flex flex-col gap-3" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        {/* Goal History */}
        {goalHistory.length > 0 && (
          <div className="flex-1 bg-[#2a2a2a]/80 rounded-3xl p-4 border border-[#3a3a3a] backdrop-blur-sm overflow-y-auto">
            {(() => {
              // Determine GWG index in the live match (goalHistory is newest-first)
              // Reverse to chronological, find GWG, then map back to original index
              const chronological = [...goalHistory].reverse();
              let gwgOriginalIndex = -1;
              if (teamWhiteScore !== teamGreenScore) {
                const winningTeam = teamWhiteScore > teamGreenScore ? 'white' : 'green';
                const loserScoreVal = Math.min(teamWhiteScore, teamGreenScore);
                let winnerGoalCount = 0;
                for (let ci = 0; ci < chronological.length; ci++) {
                  const gt = chronological[ci].team?.toLowerCase();
                  const isWinner = (winningTeam === 'white' && (gt === 'white' || gt === 'vita' || gt === 'vit')) ||
                                  (winningTeam === 'green' && (gt === 'green' || gt === 'gröna' || gt === 'grön'));
                  if (isWinner) {
                    if (winnerGoalCount === loserScoreVal) {
                      // ci in chronological = (goalHistory.length - 1 - ci) in original
                      gwgOriginalIndex = goalHistory.length - 1 - ci;
                      break;
                    }
                    winnerGoalCount++;
                  }
                }
              }
              return goalHistory.map((goal, index) => {
              let ws2 = 0, gs2 = 0;
              for (let i = goalHistory.length - 1; i >= index; i--) {
                if (goalHistory[i].team === "white") ws2++;
                else gs2++;
              }
              const scoreDisplay = `${ws2}-${gs2}`;
              const timeMatch = goal.timestamp.match(/(\d{2}:\d{2})/);
              const timeDisplay = timeMatch ? timeMatch[1] : goal.timestamp;
              const isGwg = index === gwgOriginalIndex;

              return (
                <button key={index} onClick={() => openScorerModal(index)}
                  className="w-full flex items-center justify-between mb-2 rounded-xl px-4 py-3 text-left transition-opacity active:opacity-80"
                  style={{
                    backgroundColor: isGwg ? 'rgba(234,179,8,0.2)' : getGoalBg(goal.team),
                    border: isGwg ? '2px solid rgba(234,179,8,0.5)' : 'none',
                  }}
                >
                  <div className="flex-1 flex flex-col">
                    <span className="text-sm font-semibold" style={{ color: getGoalText(goal.team) }}>
                      {scoreDisplay} [{timeDisplay}]
                    </span>
                    <div className="text-sm" style={{ color: getGoalText(goal.team) }}>
                      {(() => {
                        const { lines, otherTag, hasDetails } = formatGoalDetails(goal);
                        if (!hasDetails) return (
                          <>
                            <span className="opacity-70 italic">👆 {lines[0]}</span>
                            {otherTag && <span className="ml-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #555' }}>{otherTag}</span>}
                          </>
                        );
                        return (
                          <>
                            {lines.map((line, li) => (
                              <div key={li} style={{ lineHeight: "1.5" }}>{line}</div>
                            ))}
                            {otherTag && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide" style={{
                                backgroundColor: '#1a1a1a',
                                color: '#ffffff',
                                border: '1px solid #555',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                              }}>
                                {otherTag}
                              </span>
                            )}
                            {isGwg && (
                              <span className="inline-block mt-1 ml-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide" style={{
                                backgroundColor: '#92400e',
                                color: '#fbbf24',
                                border: '1px solid #b45309',
                              }}>
                                GWG ⭐
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {goal.sponsor && (
                    <div className="flex flex-col items-center ml-2 shrink-0" style={{ width: 70 }}>
                      <span className="text-[8px] mb-0.5" style={{ color: getGoalText(goal.team), opacity: 0.6 }}>
                        Presenteras av
                      </span>
                      {logoForName(sponsors, goal.sponsor) ? (
                        <img
                          src={logoForName(sponsors, goal.sponsor)!}
                          alt={goal.sponsor}
                          className="max-h-6 max-w-[70px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: getGoalText(goal.team) }}>
                          {goal.sponsor}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            });
            })()}
          </div>
        )}

        {/* Knappar på en rad: Statistik, Återställ, Avsluta */}
        <div className="flex gap-2 mb-1">
          <button onClick={() => setStatsModalVisible(true)} disabled={goalHistory.length === 0}
            className="flex-1 bg-[#2a2a2a]/80 border border-[#0a7ea4] text-[#0a7ea4] font-semibold text-sm py-2 rounded-full backdrop-blur-sm active:opacity-80 transition-opacity disabled:opacity-35">
            Statistik
          </button>
          <button onClick={resetMatch}
            className="flex-1 bg-[#9BA1A6] text-[#1a1a1a] font-semibold text-sm py-2 rounded-full active:opacity-80 transition-opacity">
            Återställ
          </button>
          <button onClick={() => setEndMatchModalVisible(true)}
            className="flex-1 bg-[#0a7ea4] text-[#1a1a1a] font-semibold text-sm py-2 rounded-full active:opacity-80 transition-opacity">
            Avsluta
          </button>
        </div>
      </div>

      {/* Goal Details Modal */}
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE]">Måldetaljer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-[#9BA1A6] mb-1 block">Målskytt</label>
              <button onClick={() => { setPlayerPickerField("scorer"); setPlayerPickerSearch(""); setPlayerPickerVisible(true); }}
                className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl px-4 py-3 text-left flex items-center justify-between">
                <span className={scorerName ? "text-[#ECEDEE]" : "text-[#9BA1A6]"}>
                  {scorerName || "Välj målskytt..."}
                </span>
                {scorerName ? (
                  <span onClick={(e) => { e.stopPropagation(); setScorerName(""); }} className="text-[#EF4444] font-bold cursor-pointer">✕</span>
                ) : (
                  <span className="text-[#9BA1A6]">▼</span>
                )}
              </button>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#9BA1A6] mb-1 block">Assist</label>
              <button onClick={() => { setPlayerPickerField("assist"); setPlayerPickerSearch(""); setPlayerPickerVisible(true); }}
                className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl px-4 py-3 text-left flex items-center justify-between">
                <span className={assistName ? "text-[#ECEDEE]" : "text-[#9BA1A6]"}>
                  {assistName || "Välj assist..."}
                </span>
                {assistName ? (
                  <span onClick={(e) => { e.stopPropagation(); setAssistName(""); }} className="text-[#EF4444] font-bold cursor-pointer">✕</span>
                ) : (
                  <span className="text-[#9BA1A6]">▼</span>
                )}
              </button>
            </div>
            {/* Straff – det enda som markeras; allt annat är ett vanligt mål */}
            <button
              onClick={() => setOtherInfo(otherInfo === "Straff" ? "" : "Straff")}
              aria-pressed={otherInfo === "Straff"}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition-colors ${
                otherInfo === "Straff" ? "bg-[#0a7ea4]/20 border-[#0a7ea4] text-white" : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
              }`}
            >
              <span>Straff</span>
              <span className={`w-9 h-5 rounded-full relative ${otherInfo === "Straff" ? "bg-[#0a7ea4]" : "bg-white/15"}`}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ left: otherInfo === "Straff" ? 18 : 2 }} />
              </span>
            </button>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setModalVisible(false)}
                className="flex-1 bg-[#2a2a2a] border border-[#3a3a3a] text-[#ECEDEE] py-3 rounded-2xl font-semibold">
                Avbryt
              </button>
              <button onClick={saveGoalDetails}
                className="flex-1 bg-[#0a7ea4] text-[#1a1a1a] py-3 rounded-2xl font-semibold">
                Spara
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Player Picker Modal */}
      <Dialog open={playerPickerVisible} onOpenChange={setPlayerPickerVisible}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-sm max-h-[80vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE]">
              {playerPickerField === "scorer" ? "Välj målskytt" : "Välj assist"}
            </DialogTitle>
          </DialogHeader>
          <input
            type="text"
            placeholder="Sök spelare... (eller lägg till)"
            value={playerPickerSearch}
            onChange={(e) => setPlayerPickerSearch(e.target.value)}
            className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl px-4 py-3 text-[#ECEDEE] placeholder-[#9BA1A6] outline-none focus:border-[#0a7ea4]"
          />
          {playerPickerSearch && (
            <button onClick={() => selectPlayer(playerPickerSearch)}
              className="bg-[#0a7ea4] text-[#1a1a1a] rounded-2xl px-4 py-2.5 text-sm font-semibold">
              Lägg till "{playerPickerSearch}"
            </button>
          )}
          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {pickerData && (
              <>
                {pickerData.filteredScoring.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-4 py-2 rounded-t-lg font-semibold text-sm"
                      style={pickerData.goalTeam === "white"
                        ? { backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1a1a" }
                        : { backgroundColor: "rgba(51,121,49,0.85)", color: "#fff" }}>
                      {pickerData.scoringTeamName} (uppställning)
                    </div>
                    {pickerData.filteredScoring.map(p => (
                      <button key={p.id} onClick={() => selectPlayer(`${p.name} #${p.number}`)}
                        className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#ECEDEE] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                        <span className="text-green-400 text-sm">✓</span>
                        <PickPos pos={p.pickPos} />
                        <span>{p.name}{p.number ? ` #${p.number}` : ""}</span>
                      </button>
                    ))}
                  </>
                )}
                {pickerData.filteredOther.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-4 py-2 font-semibold text-sm"
                      style={pickerData.goalTeam === "white"
                        ? { backgroundColor: "rgba(51,121,49,0.85)", color: "#fff" }
                        : { backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1a1a" }}>
                      {pickerData.otherTeamName} (uppställning)
                    </div>
                    {pickerData.filteredOther.map(p => (
                      <button key={p.id} onClick={() => selectPlayer(`${p.name} #${p.number}`)}
                        className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#ECEDEE] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                        <span className="text-green-400 text-sm">✓</span>
                        <PickPos pos={p.pickPos} />
                        <span>{p.name}{p.number ? ` #${p.number}` : ""}</span>
                      </button>
                    ))}
                  </>
                )}
                {pickerData.filteredUnplaced.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-4 py-2 font-semibold text-sm bg-[#3a3a3a] text-[#9BA1A6]">
                      Övriga spelare
                    </div>
                    {pickerData.filteredUnplaced.map(p => (
                      <button key={p.id} onClick={() => selectPlayer(`${p.name} #${p.number}`)}
                        className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#9BA1A6] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                        <PickPos pos={p.pickPos} />
                        <span>{p.name}{p.number ? ` #${p.number}` : ""}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          <button onClick={() => { setPlayerPickerVisible(false); setPlayerPickerSearch(""); }}
            className="w-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#ECEDEE] py-3 rounded-2xl font-semibold mt-2">
            Avbryt
          </button>
        </DialogContent>
      </Dialog>

      {/* Statistics Modal */}
      <Dialog open={statsModalVisible} onOpenChange={setStatsModalVisible}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE]">Matchstatistik</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#3a3a3a]">
              <h3 className="text-[#ECEDEE] font-semibold mb-3">Poäng (Mål + Assist)</h3>
              {statsData.all.length === 0 ? (
                <p className="text-[#9BA1A6] text-sm">Inga poäng</p>
              ) : (
                statsData.all.map((s, i) => (
                  <div key={i} className="flex items-center py-2 border-b border-[#3a3a3a] last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: s.team === "green" ? "#22C55E" : "#ffffff", border: s.team === "white" ? "1px solid #9BA1A6" : "none" }} />
                      <span className="text-[#ECEDEE] text-sm truncate">{s.name}</span>
                    </div>
                    {s.posLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2"
                        style={{ backgroundColor: (POS_COLORS[s.posLabel] || POS_COLORS.F).border, color: "#fff" }}>
                        {s.posLabel}
                      </span>
                    )}
                    <span className="text-[#0a7ea4] font-bold text-sm shrink-0 ml-2">{s.goals} + {s.assists}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Time Modal */}
      <Dialog open={endTimeModalVisible} onOpenChange={setEndTimeModalVisible}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center">⏰ Ställ in sluttid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-[#9BA1A6] text-sm">Ange klockslag (HHMM eller HH:MM):</p>
            <input
              type="text"
              inputMode="numeric"
              value={endTimeInput}
              onChange={(e) => handleEndTimeInputChange(e.target.value)}
              placeholder="1530 eller 15:30"
              maxLength={5}
              className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl p-3 text-[#ECEDEE] text-lg placeholder-[#687076] outline-none focus:border-[#0a7ea4] transition-colors"
            />

            {endTime && (
              <p className="text-[#F59E0B] text-sm text-center">Aktiv sluttid: {endTime}</p>
            )}

            {/* Test Sound Button */}
            <button
              onClick={testEndSignalSound}
              className="w-full bg-[#2a2a2a] border-2 border-[#0a7ea4] text-[#0a7ea4] py-3 rounded-full font-semibold transition-colors hover:bg-[#0a7ea4]/10"
            >
              🔊 Testa slutsignal
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => { setEndTimeModalVisible(false); setEndTimeInput(""); }}
                className="flex-1 bg-[#2a2a2a] border border-[#3a3a3a] text-[#ECEDEE] py-3 rounded-full font-semibold"
              >
                Avbryt
              </button>

              {endTime && (
                <button
                  onClick={() => {
                    setEndTime(null);
                    setEndTimeInput("");
                    setEndTimeModalVisible(false);
                  }}
                  className="flex-1 bg-[#EF4444] text-white py-3 rounded-full font-semibold"
                >
                  Ta bort
                </button>
              )}

              <button
                onClick={handleSetEndTime}
                className="flex-1 bg-[#0a7ea4] text-white py-3 rounded-full font-semibold"
              >
                Spara
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Match Confirmation Modal */}
      <Dialog open={endMatchModalVisible} onOpenChange={setEndMatchModalVisible}>
        <DialogContent className="bg-[#2a2a2a] border-[#3a3a3a] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center text-xl">Avsluta match</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-[#9BA1A6] text-base">
              Spara matchen till statistiken och börja om? Eller avsluta utan att spara.
            </p>
            <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#3a3a3a]">
              <p className="text-[#ECEDEE] text-lg font-bold">
                {teamWhiteScore} - {teamGreenScore}
              </p>
              <p className="text-[#9BA1A6] text-xs mt-1">
                Sparas som: {getMatchName()}
                <span className="block text-[11px] text-[#687076] mt-0.5">
                  {eventQuery.isLoading ? "Hämtar träningstiden från laget.se …" : resolvedStart().source === "event" ? `Starttid från träningen på laget.se${eventQuery.data?.eventLocation ? ` · ${eventQuery.data.eventLocation}` : ""}` : resolvedStart().source === "goal" ? "Starttid = första målet (ingen träning hittades)" : "Uppskattad starttid (ingen träning hittades)"}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleEndMatch}
                disabled={savingMatch}
                className="w-full bg-[#22C55E] text-white py-3.5 rounded-full font-semibold text-base disabled:opacity-50 transition-opacity"
              >
                {savingMatch ? 'Sparar...' : 'Spara och avsluta'}
              </button>
              <button
                onClick={() => {
                  if (!confirm("Avsluta utan att spara? Målen raderas och matchen räknas inte i statistiken.")) return;
                  resetAfterSave();
                  toast("Matchen avslutades utan att sparas");
                }}
                disabled={savingMatch}
                className="w-full bg-transparent text-[#EF4444] py-3 rounded-full font-semibold text-sm border border-[#EF4444]/50 disabled:opacity-50"
              >
                Avsluta utan att spara
              </button>
              <button
                onClick={() => setEndMatchModalVisible(false)}
                disabled={savingMatch}
                className="w-full bg-[#1a1a1a] text-[#ECEDEE] py-3 rounded-full font-semibold text-sm border border-[#444444] disabled:opacity-50"
              >
                Avbryt – fortsätt matchen
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
