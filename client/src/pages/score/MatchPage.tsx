/*
 * MatchPage - Main match tracking interface
 * Design: Dark theme with hockey background, team logos, score counters, goal history with sponsors
 * Mirrors the native app's Match tab
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { IMAGES, COLORS, SOUNDS, getSponsorImage, getRandomSponsor, STORAGE_KEY, type GoalEvent, type MatchState } from "@/lib/scoreConstants";
import { type AppState, createTeamSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import { type Player } from "@/lib/players";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
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

export default function MatchPage({ lineupState }: MatchPageProps) {
  // ─── State ─────────────────────────────────────────────────────
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
  const endSignalAudioRef = useRef<HTMLAudioElement | null>(null);
  const goalWhiteAudioRef = useRef<HTMLAudioElement | null>(null);
  const goalGreenAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Preload all sounds
  useEffect(() => {
    const endAudio = new Audio(SOUNDS.slutsignal);
    endAudio.preload = "auto";
    endSignalAudioRef.current = endAudio;

    const whiteAudio = new Audio(SOUNDS.goalWhite);
    whiteAudio.preload = "auto";
    goalWhiteAudioRef.current = whiteAudio;

    const greenAudio = new Audio(SOUNDS.goalGreen);
    greenAudio.preload = "auto";
    goalGreenAudioRef.current = greenAudio;

    return () => {
      endAudio.pause(); endAudio.src = "";
      whiteAudio.pause(); whiteAudio.src = "";
      greenAudio.pause(); greenAudio.src = "";
    };
  }, []);

  const playGoalSound = useCallback((team: "white" | "green") => {
    if (isMuted) return;
    const audioRef = team === "white" ? goalWhiteAudioRef : goalGreenAudioRef;
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("Failed to play goal sound:", e));
    }
  }, [isMuted]);

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
        if (endSignalAudioRef.current && !isMuted) {
          endSignalAudioRef.current.currentTime = 0;
          endSignalAudioRef.current.play().catch(e => console.error("Failed to play end signal:", e));
        }
        // Show alert after a short delay so sound starts first
        setTimeout(() => {
          alert(`📣 Sluttid! Matchen har nått sluttiden ${endTime}`);
          setEndTime(null);
          setEndTimeTriggered(false);
        }, 500);
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [endTime, endTimeTriggered]);

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
    if (endSignalAudioRef.current) {
      endSignalAudioRef.current.currentTime = 0;
      endSignalAudioRef.current.play().catch(e => console.error("Failed to play test sound:", e));
    }
  };

  // ─── Wake Lock (prevent screen from turning off) ────────────────
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const toggleWakeLock = useCallback(async () => {
    if (wakeLockActive && wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockActive(false);
      } catch (e) {
        console.error("Failed to release wake lock:", e);
      }
    } else {
      try {
        if ("wakeLock" in navigator) {
          const lock = await navigator.wakeLock.request("screen");
          wakeLockRef.current = lock;
          setWakeLockActive(true);
          lock.addEventListener("release", () => {
            setWakeLockActive(false);
            wakeLockRef.current = null;
          });
        } else {
          // Fallback: try NoSleep.js-style video trick for older browsers
          alert("Din webbläsare stöder inte Wake Lock API. Prova Chrome.");
        }
      } catch (e) {
        console.error("Failed to acquire wake lock:", e);
      }
    }
  }, [wakeLockActive]);

  // Re-acquire wake lock when page becomes visible again (e.g. switching tabs)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && wakeLockActive && !wakeLockRef.current) {
        try {
          if ("wakeLock" in navigator) {
            const lock = await navigator.wakeLock.request("screen");
            wakeLockRef.current = lock;
            lock.addEventListener("release", () => {
              setWakeLockActive(false);
              wakeLockRef.current = null;
            });
          }
        } catch (e) {
          console.error("Failed to re-acquire wake lock:", e);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [wakeLockActive]);

  // Clean up wake lock on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

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
    const sponsor = getRandomSponsor();
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

  const getMatchName = () => {
    const d = new Date();
    const weekdays = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const weekday = weekdays[d.getDay()];
    // Subtract 1 hour, then round to nearest whole hour
    const adjustedDate = new Date(d.getTime() - 60 * 60 * 1000);
    const endHour = adjustedDate.getMinutes() >= 30 ? adjustedDate.getHours() + 1 : adjustedDate.getHours();
    const hh = String(endHour % 24).padStart(2, '0');
    return `${yy}-${mm}-${dd} ${weekday} ${hh}:00 ${teamWhiteScore}-${teamGreenScore}`;
  };

  const handleEndMatch = async () => {
    setSavingMatch(true);
    try {
      const name = getMatchName();
      await saveMatchMutation.mutateAsync({
        name,
        teamWhiteScore,
        teamGreenScore,
        goalHistory: goalHistory,
        matchStartTime: matchStartTime || undefined,
        lineup: lineupState || undefined,
      });
      // Reset match after successful save
      setTeamWhiteScore(0);
      setTeamGreenScore(0);
      setGoalHistory([]);
      setMatchStartTime(undefined);
      localStorage.removeItem(STORAGE_KEY);
      setEndMatchModalVisible(false);
      toast.success("Matchen sparad!", {
        description: name,
        duration: 4000,
      });
    } catch (e) {
      console.error('Failed to save match:', e);
      toast.error("Kunde inte spara matchen", {
        description: "Försök igen.",
        duration: 4000,
      });
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
    setOtherInfo(goal.other || "Övrigt");
    setModalVisible(true);
  };

  const saveGoalDetails = () => {
    if (selectedGoalIndex === null) return;
    const updated = [...goalHistory];
    updated[selectedGoalIndex] = {
      ...updated[selectedGoalIndex],
      scorer: scorerName || undefined,
      assist: assistName || undefined,
      other: otherInfo || undefined,
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
    const otherTag = goal.other || null;
    if (lines.length === 0 && !otherTag) return { lines: ["Tryck för att lägga till detaljer"], otherTag: null, hasDetails: false };
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

    const scoring: Player[] = [];
    const other: Player[] = [];
    const placedIds = new Set<string>();

    for (const slot of scoringSlots) {
      const p = lineupState.lineup[slot.id];
      if (p) { scoring.push(p); placedIds.add(p.id); }
    }
    for (const slot of otherSlots) {
      const p = lineupState.lineup[slot.id];
      if (p) { other.push(p); placedIds.add(p.id); }
    }

    const unplaced = (lineupState.players || [])
      .filter(p => !placedIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));

    return { scoring, other, unplaced };
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
    const filter = (p: Player) => !search || p.name.toLowerCase().includes(search) || p.number.includes(search);

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
              onClick={toggleWakeLock}
              className={`px-2.5 py-1.5 rounded-full border text-xs transition-colors ${
                wakeLockActive
                  ? "bg-[#22C55E]/20 border-[#22C55E] text-[#22C55E]"
                  : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
              }`}
            >
              {wakeLockActive ? "☀️ Aktiv" : "🔅 Inaktiv"}
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
                        if (!hasDetails) return <span className="opacity-60 italic">{lines[0]}</span>;
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
                      <img src={getSponsorImage(goal.sponsor)} alt={goal.sponsor}
                        className="w-14 h-10 object-contain" />
                    </div>
                  )}
                </button>
              );
            });
            })()}
          </div>
        )}

        {/* Statistics Button */}
        {goalHistory.length > 0 && (
          <button onClick={() => setStatsModalVisible(true)}
            className="bg-[#2a2a2a]/80 border border-[#0a7ea4] px-4 py-2 rounded-full text-[#0a7ea4] font-semibold text-sm text-center backdrop-blur-sm active:opacity-80 transition-opacity">
            Visa statistik
          </button>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mb-1">
          <button onClick={() => setEndMatchModalVisible(true)}
            className="flex-1 bg-[#0a7ea4] text-[#1a1a1a] font-semibold text-sm py-2 rounded-full active:opacity-80 transition-opacity">
            Avsluta match
          </button>
          <button onClick={resetMatch}
            className="flex-1 bg-[#9BA1A6] text-[#1a1a1a] font-semibold text-sm py-2 rounded-full active:opacity-80 transition-opacity">
            Återställ match
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
            {/* Goal type options (Övrigt) */}
            <div>
              <label className="text-sm font-semibold text-[#9BA1A6] mb-1 block">Övrigt</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['Övrigt', 'Skott', 'Styrning', 'Friläge', 'Solo', 'Straff', 'Självmål'].map((option) => {
                  const isSelected = otherInfo === option;
                  return (
                    <button key={option}
                      onClick={() => setOtherInfo(isSelected ? '' : option)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-[#0a7ea4] border-[#0a7ea4] text-white'
                          : 'bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6] hover:border-[#0a7ea4]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

            </div>
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
                        <span>{p.name} #{p.number}</span>
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
                        <span>{p.name} #{p.number}</span>
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
                        <span>{p.name} #{p.number}</span>
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
              Är du säker på att du vill avsluta matchen och spara data till statistiken?
            </p>
            <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#3a3a3a]">
              <p className="text-[#ECEDEE] text-lg font-bold">
                {teamWhiteScore} - {teamGreenScore}
              </p>
              <p className="text-[#9BA1A6] text-xs mt-1">
                Sparas som: {getMatchName()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEndMatchModalVisible(false)}
                disabled={savingMatch}
                className="flex-1 bg-[#1a1a1a] text-[#ECEDEE] py-3.5 rounded-full font-semibold text-base border border-[#444444] disabled:opacity-50"
              >
                Nej
              </button>
              <button
                onClick={handleEndMatch}
                disabled={savingMatch}
                className="flex-1 bg-[#22C55E] text-white py-3.5 rounded-full font-semibold text-base disabled:opacity-50 transition-opacity"
              >
                {savingMatch ? 'Sparar...' : 'Ja, spara'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
