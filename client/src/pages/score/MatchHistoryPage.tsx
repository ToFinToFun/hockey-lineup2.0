import { trpc } from "@/lib/trpc";
import { IMAGES, getSponsorImage } from "@/lib/scoreConstants";
import { useState, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, Trophy, Clock, Target, Search, Filter, X, Pencil, GripVertical, Plus, ChevronDown, Users, UserCheck, CheckSquare, Square, XCircle, Share2, Star } from "lucide-react";
import MatchReportExport from "@/components/score/MatchReportExport";
import { toast } from "sonner";

interface MatchHistoryPageProps {
  onBack: () => void;
}

interface GoalEvent {
  team: "white" | "green";
  timestamp: string;
  scorer?: string;
  assist?: string;
  other?: string;
  sponsor?: string;
}

type ResultFilter = "all" | "white" | "green" | "draw";

const ADMIN_PASSWORD = "Styrelsen";
const GOAL_TYPES = ["Övrigt", "Skott", "Styrning", "Friläge", "Solo", "Straff", "Självmål"];

export default function MatchHistoryPage({ onBack }: MatchHistoryPageProps) {
  const { data: matches, isLoading, refetch } = trpc.score.match.list.useQuery();
  const deleteMutation = trpc.score.match.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Matchen borttagen", { duration: 3000 });
    },
    onError: () => {
      toast.error("Kunde inte ta bort matchen", { description: "Försök igen.", duration: 3000 });
    },
  });
  const deleteManyMutation = trpc.score.match.deleteMany.useMutation({
    onSuccess: (_data, variables) => {
      refetch();
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast.success(`${variables.ids.length} matcher borttagna`, { duration: 3000 });
    },
    onError: () => {
      toast.error("Kunde inte ta bort matcherna", { description: "Försök igen.", duration: 3000 });
    },
  });
  const updateMutation = trpc.score.match.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Matchen uppdaterad", { duration: 3000 });
    },
    onError: () => {
      toast.error("Kunde inte uppdatera matchen", { description: "Försök igen.", duration: 3000 });
    },
  });
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkPasswordInput, setBulkPasswordInput] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportMatchData, setExportMatchData] = useState<any>(null);
  const [bulkPasswordError, setBulkPasswordError] = useState(false);

  // Toggle selection
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredMatches.map(m => m.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (bulkPasswordInput === ADMIN_PASSWORD) {
      setBulkPasswordError(false);
      deleteManyMutation.mutateAsync({ ids: Array.from(selectedIds) }).then(() => {
        setBulkDeleteDialog(false);
        setBulkPasswordInput("");
      });
    } else {
      setBulkPasswordError(true);
    }
  };

  // Password dialog state
  const [passwordDialog, setPasswordDialog] = useState<{ action: "edit" | "delete"; matchId: number } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const [editGoals, setEditGoals] = useState<GoalEvent[]>([]);

  // Player picker state for edit dialog
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerField, setPickerField] = useState<"scorer" | "assist">("scorer");
  const [pickerGoalIdx, setPickerGoalIdx] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Extract unique months
  const availableMonths = useMemo(() => {
    if (!matches) return [];
    const months = new Set<string>();
    for (const m of matches) {
      const parts = m.name.split(" ");
      if (parts.length >= 1) {
        const datePart = parts[0];
        const dateSegments = datePart.split("-");
        if (dateSegments.length >= 2) {
          months.add(`${dateSegments[0]}-${dateSegments[1]}`);
        }
      }
    }
    return Array.from(months).sort().reverse();
  }, [matches]);

  const getMonthLabel = (ym: string) => {
    const [yy, mm] = ym.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    const monthIdx = parseInt(mm) - 1;
    return `${monthNames[monthIdx] ?? mm} 20${yy}`;
  };

  // Filter matches
  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    return matches.filter(match => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = match.name.toLowerCase().includes(q);
        const goalMatch = match.goalHistory && Array.isArray(match.goalHistory) &&
          (match.goalHistory as GoalEvent[]).some(g =>
            g.scorer?.toLowerCase().includes(q) || g.assist?.toLowerCase().includes(q)
          );
        if (!nameMatch && !goalMatch) return false;
      }
      if (resultFilter !== "all") {
        if (resultFilter === "white" && match.teamWhiteScore <= match.teamGreenScore) return false;
        if (resultFilter === "green" && match.teamGreenScore <= match.teamWhiteScore) return false;
        if (resultFilter === "draw" && match.teamWhiteScore !== match.teamGreenScore) return false;
      }
      if (monthFilter !== "all") {
        const datePart = match.name.split(" ")[0];
        const dateSegments = datePart.split("-");
        const matchMonth = `${dateSegments[0]}-${dateSegments[1]}`;
        if (matchMonth !== monthFilter) return false;
      }
      return true;
    });
  }, [matches, searchQuery, resultFilter, monthFilter]);

  const hasActiveFilters = resultFilter !== "all" || monthFilter !== "all" || searchQuery !== "";

  const selectedMatchData = matches?.find(m => m.id === selectedMatch);
  const goalHistory = (selectedMatchData?.goalHistory as GoalEvent[] | null) ?? [];

  // Handle password verification
  const handlePasswordSubmit = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setPasswordError(false);
      if (passwordDialog?.action === "delete") {
        deleteMutation.mutateAsync({ id: passwordDialog.matchId }).then(() => {
          setSelectedMatch(null);
        });
      } else if (passwordDialog?.action === "edit") {
        const match = matches?.find(m => m.id === passwordDialog.matchId);
        if (match) {
          setEditName(match.name);

          const gh = (match.goalHistory as GoalEvent[] | null) ?? [];
          setEditGoals(gh.map(g => ({ ...g })));
          setEditDialog(passwordDialog.matchId);
        }
      }
      setPasswordDialog(null);
      setPasswordInput("");
    } else {
      setPasswordError(true);
    }
  };

  // Goal editing helpers
  const updateGoal = useCallback((idx: number, field: keyof GoalEvent, value: string) => {
    setEditGoals(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const removeGoal = useCallback((idx: number) => {
    setEditGoals(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const addGoal = useCallback((team: "white" | "green") => {
    setEditGoals(prev => [...prev, { team, timestamp: new Date().toISOString(), scorer: "", assist: "", other: "" }]);
  }, []);

  // Drag and drop handlers
  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
    setDraggingIdx(idx);
  };

  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      setEditGoals(prev => {
        const next = [...prev];
        const draggedItem = next[dragItem.current!];
        next.splice(dragItem.current!, 1);
        next.splice(dragOverItem.current!, 0, draggedItem);
        return next;
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggingIdx(null);
  };

  // Touch drag handlers
  const touchStartY = useRef<number>(0);
  const touchCurrentIdx = useRef<number | null>(null);
  const goalListRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    dragItem.current = idx;
    touchCurrentIdx.current = idx;
    touchStartY.current = e.touches[0].clientY;
    setDraggingIdx(idx);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragItem.current === null || !goalListRef.current) return;
    const touch = e.touches[0];
    const elements = goalListRef.current.querySelectorAll('[data-goal-idx]');
    for (const el of Array.from(elements)) {
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        const idx = parseInt(el.getAttribute('data-goal-idx') || '-1');
        if (idx >= 0 && idx !== touchCurrentIdx.current) {
          dragOverItem.current = idx;
          touchCurrentIdx.current = idx;
        }
        break;
      }
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // ─── Player picker helpers for edit dialog ──────────────────────
  const editMatchLineup = useMemo(() => {
    if (editDialog === null || !matches) return null;
    const match = matches.find(m => m.id === editDialog);
    if (!match) return null;
    const lineup = (match as any).lineup;
    if (!lineup) return null;
    return lineup;
  }, [editDialog, matches]);

  const getEditPickerData = useCallback((goalTeam: "white" | "green") => {
    if (!editMatchLineup) return { scoringPlayers: [], otherPlayers: [], allPlayers: [], scoringTeamName: "", otherTeamName: "" };
    const lineupEntries = editMatchLineup.lineup || {};
    const teamAName = editMatchLineup.teamAName || 'Lag A';
    const teamBName = editMatchLineup.teamBName || 'Lag B';
    const isTeamAWhite = (teamAName || '').toLowerCase().includes('vit');
    const whitePrefix = isTeamAWhite ? 'team-a' : 'team-b';
    const greenPrefix = isTeamAWhite ? 'team-b' : 'team-a';
    const scoringPrefix = goalTeam === 'white' ? whitePrefix : greenPrefix;
    const otherPrefix = goalTeam === 'white' ? greenPrefix : whitePrefix;
    const scoringTeamName = goalTeam === 'white' ? (isTeamAWhite ? teamAName : teamBName) : (isTeamAWhite ? teamBName : teamAName);
    const otherTeamName = goalTeam === 'white' ? (isTeamAWhite ? teamBName : teamAName) : (isTeamAWhite ? teamAName : teamBName);

    const extractPlayers = (prefix: string) => {
      const players: { name: string; number: string; displayName: string }[] = [];
      for (const [slotId, p] of Object.entries(lineupEntries)) {
        if (!slotId.startsWith(prefix) || !p) continue;
        const pl = p as any;
        if (pl.name) {
          players.push({ name: pl.name, number: pl.number || '', displayName: pl.number ? `${pl.name} #${pl.number}` : pl.name });
        }
      }
      return players.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    };

    const scoringPlayers = extractPlayers(scoringPrefix);
    const otherPlayers = extractPlayers(otherPrefix);

    // Get all unique players from all matches for "Övriga spelare"
    const placedNames = new Set([...scoringPlayers, ...otherPlayers].map(p => p.displayName));
    const allPlayerNames = new Set<string>();
    if (matches) {
      for (const m of matches) {
        const ml = (m as any).lineup;
        if (!ml?.lineup) continue;
        for (const p of Object.values(ml.lineup)) {
          if (p) {
            const pl = p as any;
            const dn = pl.number ? `${pl.name} #${pl.number}` : pl.name;
            if (dn && !placedNames.has(dn)) allPlayerNames.add(dn);
          }
        }
        // Also check players array
        const pArr = ml.players;
        if (pArr && Array.isArray(pArr)) {
          for (const pl of pArr) {
            const dn = pl.number ? `${pl.name} #${pl.number}` : pl.name;
            if (dn && !placedNames.has(dn)) allPlayerNames.add(dn);
          }
        }
      }
    }
    const allPlayers = Array.from(allPlayerNames).sort((a, b) => a.localeCompare(b, 'sv')).map(dn => ({ displayName: dn }));

    return { scoringPlayers, otherPlayers, allPlayers, scoringTeamName, otherTeamName };
  }, [editMatchLineup, matches]);

  const openPicker = (goalIdx: number, field: "scorer" | "assist") => {
    setPickerGoalIdx(goalIdx);
    setPickerField(field);
    setPickerSearch("");
    setPickerVisible(true);
  };

  const selectPickerPlayer = (displayName: string) => {
    if (pickerGoalIdx !== null) {
      updateGoal(pickerGoalIdx, pickerField, displayName);
    }
    setPickerVisible(false);
    setPickerSearch("");
  };

  // Handle edit save
  const handleEditSave = async () => {
    if (editDialog === null) return;
    const whiteCount = editGoals.filter(g => g.team === 'white').length;
    const greenCount = editGoals.filter(g => g.team === 'green').length;
    // Auto-update the score suffix in the match name (e.g. "25-01-15 Onsdag 19:00 3-2" → "25-01-15 Onsdag 19:00 4-2")
    const updatedName = editName.replace(/\d+-\d+\s*$/, `${whiteCount}-${greenCount}`);
    await updateMutation.mutateAsync({
      id: editDialog,
      name: updatedName,
      teamWhiteScore: whiteCount,
      teamGreenScore: greenCount,
      goalHistory: editGoals,
    });
    setEditDialog(null);
    setSelectedMatch(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
        <button onClick={onBack} className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[#ECEDEE] font-bold text-lg">
          {selectionMode ? `${selectedIds.size} valda` : "Matchhistorik"}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {selectionMode ? (
            <button
              onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
              className="text-[#9BA1A6] hover:text-[#ECEDEE] text-sm font-medium"
            >
              Avbryt
            </button>
          ) : (
            <>
              <span className="text-[#9BA1A6] text-sm">
                {filteredMatches.length}{matches && filteredMatches.length !== matches.length ? ` / ${matches.length}` : ""} matcher
              </span>
              {matches && matches.length > 0 && (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="text-[#9BA1A6] hover:text-[#ECEDEE] transition-colors p-1"
                  title="Välj flera"
                >
                  <CheckSquare size={18} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {selectionMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] border-b border-[#3a3a3a]">
          <button
            onClick={selectedIds.size === filteredMatches.length ? deselectAll : selectAll}
            className="text-[#0a7ea4] text-sm font-medium"
          >
            {selectedIds.size === filteredMatches.length ? "Avmarkera alla" : "Välj alla"}
          </button>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <button
              onClick={() => { setBulkDeleteDialog(true); setBulkPasswordInput(""); setBulkPasswordError(false); }}
              className="flex items-center gap-1.5 bg-[#EF4444] text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-[#DC2626] transition-colors"
            >
              <Trash2 size={14} />
              Ta bort ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="px-3 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687076]" />
            <input
              type="text"
              placeholder="Sök spelare, datum..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl pl-9 pr-8 py-2 text-sm text-[#ECEDEE] placeholder-[#687076] focus:outline-none focus:border-[#0a7ea4]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#687076]">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-xl border transition-colors ${
              hasActiveFilters
                ? "bg-[#0a7ea4]/20 border-[#0a7ea4] text-[#0a7ea4]"
                : "bg-[#2a2a2a] border-[#3a3a3a] text-[#9BA1A6]"
            }`}
          >
            <Filter size={16} />
          </button>
        </div>

        {showFilters && (
          <div className="space-y-2 pb-1">
            <div className="flex gap-1.5 flex-wrap">
              {([
                { key: "all" as ResultFilter, label: "Alla" },
                { key: "white" as ResultFilter, label: "Vita vann" },
                { key: "green" as ResultFilter, label: "Gröna vann" },
                { key: "draw" as ResultFilter, label: "Oavgjort" },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setResultFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    resultFilter === f.key
                      ? "bg-[#0a7ea4] text-white"
                      : "bg-[#2a2a2a] text-[#9BA1A6] border border-[#3a3a3a]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {availableMonths.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setMonthFilter("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    monthFilter === "all"
                      ? "bg-[#0a7ea4] text-white"
                      : "bg-[#2a2a2a] text-[#9BA1A6] border border-[#3a3a3a]"
                  }`}
                >
                  Alla månader
                </button>
                {availableMonths.map(ym => (
                  <button
                    key={ym}
                    onClick={() => setMonthFilter(ym)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      monthFilter === ym
                        ? "bg-[#0a7ea4] text-white"
                        : "bg-[#2a2a2a] text-[#9BA1A6] border border-[#3a3a3a]"
                    }`}
                  >
                    {getMonthLabel(ym)}
                  </button>
                ))}
              </div>
            )}

            {hasActiveFilters && (
              <button
                onClick={() => { setResultFilter("all"); setMonthFilter("all"); setSearchQuery(""); }}
                className="text-[#0a7ea4] text-xs font-medium"
              >
                Rensa alla filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Match List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-8 h-8 border-2 border-[#0a7ea4] border-t-transparent rounded-full" />
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center py-12">
            {matches && matches.length > 0 ? (
              <>
                <Search size={48} className="mx-auto text-[#3a3a3a] mb-4" />
                <p className="text-[#9BA1A6] text-base">Inga matcher matchar filtret</p>
                <button
                  onClick={() => { setResultFilter("all"); setMonthFilter("all"); setSearchQuery(""); }}
                  className="text-[#0a7ea4] text-sm mt-2"
                >
                  Rensa filter
                </button>
              </>
            ) : (
              <>
                <Trophy size={48} className="mx-auto text-[#3a3a3a] mb-4" />
                <p className="text-[#9BA1A6] text-base">Inga sparade matcher ännu</p>
                <p className="text-[#687076] text-sm mt-1">Avsluta en match för att spara den här</p>
              </>
            )}
          </div>
        ) : (
          filteredMatches.map(match => {
            const isWhiteWin = match.teamWhiteScore > match.teamGreenScore;
            const isGreenWin = match.teamGreenScore > match.teamWhiteScore;
            const isDraw = match.teamWhiteScore === match.teamGreenScore;
            const editedAt = (match as any).editedAt;
            const isSelected = selectedIds.has(match.id);

            return (
              <button
                key={match.id}
                onClick={() => selectionMode ? toggleSelection(match.id) : setSelectedMatch(match.id)}
                className={`w-full bg-[#2a2a2a] rounded-2xl p-4 border text-left active:opacity-80 transition-all ${
                  isSelected ? 'border-[#0a7ea4] bg-[#0a7ea4]/10' : 'border-[#3a3a3a]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {selectionMode && (
                      <span className="shrink-0">
                        {isSelected ? (
                          <CheckSquare size={18} className="text-[#0a7ea4]" />
                        ) : (
                          <Square size={18} className="text-[#687076]" />
                        )}
                      </span>
                    )}
                    <span className="text-[#9BA1A6] text-xs font-medium">{match.name}</span>
                  </div>
                  {isDraw ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3a3a3a] text-[#9BA1A6] font-medium">OAVGJORT</span>
                  ) : isWhiteWin ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white font-medium">VITA VANN</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#22C55E]/20 text-[#22C55E] font-medium">GRÖNA VANN</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-8 h-8 object-contain" />
                    <span className={`text-2xl font-bold ${isWhiteWin ? 'text-white' : 'text-[#9BA1A6]'}`}>
                      {match.teamWhiteScore}
                    </span>
                  </div>
                  <span className="text-[#687076] text-lg">-</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${isGreenWin ? 'text-[#22C55E]' : 'text-[#9BA1A6]'}`}>
                      {match.teamGreenScore}
                    </span>
                    <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-8 h-8 object-contain" />
                  </div>
                </div>
                {(() => {
                  const gh = match.goalHistory;
                  if (gh && Array.isArray(gh)) {
                    return (
                      <div className="mt-2 text-[#687076] text-xs text-center">
                        {gh.length} mål registrerade
                      </div>
                    );
                  }
                  return null;
                })()}
                {editedAt && (
                  <div className="mt-1 text-[#F59E0B] text-[10px] text-center italic">
                    Redigerad {new Date(editedAt).toLocaleString('sv-SE')}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Match Detail Modal */}
      <Dialog open={selectedMatch !== null} onOpenChange={(open) => { if (!open) setSelectedMatch(null); }}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center">
              {selectedMatchData?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedMatchData && (
            <div className="space-y-4">
              {/* Edited indicator */}
              {(selectedMatchData as any).editedAt && (
                <div className="text-center">
                  <span className="text-[#F59E0B] text-xs italic">
                    Redigerad {new Date((selectedMatchData as any).editedAt).toLocaleString('sv-SE')}
                  </span>
                </div>
              )}

              {/* Score */}
              <div className="flex items-center justify-center gap-6 py-4">
                <div className="flex flex-col items-center gap-1">
                  <img src={IMAGES.teamWhiteLogo} alt="Vita" className="w-12 h-12 object-contain" />
                  <span className="text-3xl font-bold text-white">{selectedMatchData.teamWhiteScore}</span>
                  <span className="text-[#9BA1A6] text-xs">VITA</span>
                </div>
                <span className="text-[#687076] text-2xl">-</span>
                <div className="flex flex-col items-center gap-1">
                  <img src={IMAGES.teamGreenLogo} alt="Gröna" className="w-12 h-12 object-contain" />
                  <span className="text-3xl font-bold text-[#22C55E]">{selectedMatchData.teamGreenScore}</span>
                  <span className="text-[#9BA1A6] text-xs">GRÖNA</span>
                </div>
              </div>

              {/* Goal History */}
              {goalHistory.length > 0 && (
                <div className="bg-[#2a2a2a] rounded-xl p-3 border border-[#3a3a3a]">
                  <h3 className="text-[#ECEDEE] font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <Target size={14} /> Målhistorik
                  </h3>
                  <div className="space-y-1.5">
                    {(() => {
                      const reversed = [...goalHistory].reverse();
                      // Determine GWG index: in a non-draw, the (loserScore+1)th goal by the winning team
                      const whiteScore = selectedMatchData.teamWhiteScore;
                      const greenScore = selectedMatchData.teamGreenScore;
                      let gwgGoalIndex = -1;
                      if (whiteScore !== greenScore) {
                        const winningTeam = whiteScore > greenScore ? 'white' : 'green';
                        const loserScore = Math.min(whiteScore, greenScore);
                        let winnerGoalCount = 0;
                        for (let gi = 0; gi < reversed.length; gi++) {
                          const gt = reversed[gi].team?.toLowerCase();
                          const isWinner = (winningTeam === 'white' && (gt === 'white' || gt === 'vita' || gt === 'vit')) ||
                                          (winningTeam === 'green' && (gt === 'green' || gt === 'gröna' || gt === 'grön'));
                          if (isWinner) {
                            if (winnerGoalCount === loserScore) {
                              gwgGoalIndex = gi;
                              break;
                            }
                            winnerGoalCount++;
                          }
                        }
                      }
                      let ws = 0, gs = 0;
                      return reversed.map((goal, i) => {
                        if (goal.team === "white") ws++; else gs++;
                        const isGreen = goal.team === "green";
                        const isGwg = i === gwgGoalIndex;
                        return (
                          <div key={i}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm"
                            style={{
                              backgroundColor: isGwg ? "rgba(234,179,8,0.15)" : isGreen ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                              border: isGwg ? '1px solid rgba(234,179,8,0.4)' : 'none',
                            }}
                          >
                            <span className="text-[#9BA1A6] text-xs w-8 shrink-0">{ws}-{gs}</span>
                            <div className="flex-1 min-w-0">
                              <span className={isGreen ? "text-[#22C55E]" : "text-white"}>
                                {goal.scorer || (isGreen ? "GRÖNA" : "VITA")}
                              </span>
                              {goal.assist && (
                                <span className="text-[#687076] text-xs ml-1">({goal.assist})</span>
                              )}
                              {goal.other && (
                                <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded font-bold tracking-wide" style={{ backgroundColor: '#1a1a1a', color: '#ffffff', border: '1px solid #555', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{goal.other}</span>
                              )}
                              {isGwg && (
                                <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded font-bold tracking-wide" style={{ backgroundColor: '#92400e', color: '#fbbf24', border: '1px solid #b45309' }}>GWG ⭐</span>
                              )}
                            </div>
                            {goal.sponsor && (
                              <img src={getSponsorImage(goal.sponsor)} alt={goal.sponsor}
                                className="w-8 h-5 object-contain shrink-0 opacity-70" />
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Match MVP */}
              {(() => {
                const gh = selectedMatchData.goalHistory as GoalEvent[] | null;
                if (!gh || !Array.isArray(gh) || gh.length === 0) return null;
                const reversed = [...gh].reverse();
                // Calculate points per player
                const playerPoints: Record<string, { goals: number; assists: number; points: number; team: string }> = {};
                for (const g of reversed) {
                  if (g.scorer) {
                    if (!playerPoints[g.scorer]) playerPoints[g.scorer] = { goals: 0, assists: 0, points: 0, team: g.team };
                    playerPoints[g.scorer].goals++;
                    playerPoints[g.scorer].points++;
                  }
                  if (g.assist) {
                    if (!playerPoints[g.assist]) playerPoints[g.assist] = { goals: 0, assists: 0, points: 0, team: g.team };
                    playerPoints[g.assist].assists++;
                    playerPoints[g.assist].points++;
                  }
                }
                // Determine GWG scorer
                const whiteScore = selectedMatchData.teamWhiteScore;
                const greenScore = selectedMatchData.teamGreenScore;
                let gwgScorer = '';
                if (whiteScore !== greenScore) {
                  const winningTeam = whiteScore > greenScore ? 'white' : 'green';
                  const loserScore = Math.min(whiteScore, greenScore);
                  let winnerGoalCount = 0;
                  for (const g of reversed) {
                    const gt = g.team?.toLowerCase();
                    const isWinner = (winningTeam === 'white' && (gt === 'white' || gt === 'vita' || gt === 'vit')) ||
                                    (winningTeam === 'green' && (gt === 'green' || gt === 'gröna' || gt === 'grön'));
                    if (isWinner) {
                      if (winnerGoalCount === loserScore) {
                        gwgScorer = g.scorer || '';
                        break;
                      }
                      winnerGoalCount++;
                    }
                  }
                }
                // Sort by points, then goals, then assists, then GWG
                const sorted = Object.entries(playerPoints).sort((a, b) => {
                  if (b[1].points !== a[1].points) return b[1].points - a[1].points;
                  if (b[1].goals !== a[1].goals) return b[1].goals - a[1].goals;
                  if (b[1].assists !== a[1].assists) return b[1].assists - a[1].assists;
                  const aGwg = a[0] === gwgScorer ? 1 : 0;
                  const bGwg = b[0] === gwgScorer ? 1 : 0;
                  return bGwg - aGwg;
                });
                if (sorted.length === 0) return null;
                const mvp = sorted[0];
                const mvpName = mvp[0];
                const mvpStats = mvp[1];
                const isGreen = mvpStats.team === 'green';
                return (
                  <div className="bg-gradient-to-r from-[#F59E0B]/10 to-[#F59E0B]/5 rounded-xl p-3 border border-[#F59E0B]/30">
                    <h3 className="text-[#F59E0B] font-semibold text-sm mb-2 flex items-center gap-1.5">
                      <Trophy size={14} /> Matchens MVP
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#F59E0B]/20 flex items-center justify-center">
                        <Trophy size={20} className="text-[#F59E0B]" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-bold text-sm ${isGreen ? 'text-[#22C55E]' : 'text-white'}`}>{mvpName}</p>
                        <div className="flex items-center gap-2 text-xs text-[#9BA1A6]">
                          <span className="text-[#F59E0B] font-bold">{mvpStats.points} poäng</span>
                          <span>({mvpStats.goals} mål, {mvpStats.assists} assist)</span>
                          {mvpName === gwgScorer && <span className="text-[#F59E0B]">⭐ GWG</span>}
                        </div>
                      </div>
                    </div>
                    {/* Runner-ups */}
                    {sorted.length > 1 && (
                      <div className="mt-2 pt-2 border-t border-[#F59E0B]/20 flex flex-wrap gap-2">
                        {sorted.slice(1, 4).map(([name, s], i) => (
                          <span key={i} className="text-[10px] text-[#9BA1A6] bg-[#1a1a1a]/50 px-2 py-0.5 rounded">
                            {i + 2}. {name} <span className="text-[#F59E0B]">{s.points}p</span> ({s.goals}m {s.assists}a)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Match Info */}
              <div className="bg-[#2a2a2a] rounded-xl p-3 border border-[#3a3a3a]">
                <h3 className="text-[#ECEDEE] font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Clock size={14} /> Matchinfo
                </h3>
                <div className="text-[#9BA1A6] text-xs space-y-1">
                  {selectedMatchData.matchStartTime && (
                    <p>Starttid: {new Date(selectedMatchData.matchStartTime).toLocaleString('sv-SE')}</p>
                  )}
                  <p>Sparad: {new Date(selectedMatchData.createdAt).toLocaleString('sv-SE')}</p>
                  {(selectedMatchData as any).editedAt && (
                    <p className="text-[#F59E0B]">Redigerad: {new Date((selectedMatchData as any).editedAt).toLocaleString('sv-SE')}</p>
                  )}
                </div>
              </div>

              {/* Lineup */}
              {(() => {
                const lineup = (selectedMatchData as any).lineup;
                if (!lineup) return null;
                const lineupEntries = lineup.lineup || {};
                const teamAName = lineup.teamAName || 'Lag A';
                const teamBName = lineup.teamBName || 'Lag B';
                const isTeamAWhite = (teamAName || '').toLowerCase().includes('vit');
                const whiteTeamName = isTeamAWhite ? teamAName : teamBName;
                const greenTeamName = isTeamAWhite ? teamBName : teamAName;
                const whitePrefix = isTeamAWhite ? 'team-a' : 'team-b';
                const greenPrefix = isTeamAWhite ? 'team-b' : 'team-a';

                // Count goals and assists per player from goalHistory
                const goalStats: Record<string, { goals: number; assists: number }> = {};
                const gh = selectedMatchData.goalHistory as GoalEvent[] | null;
                if (gh && Array.isArray(gh)) {
                  for (const g of gh) {
                    if (g.scorer) {
                      if (!goalStats[g.scorer]) goalStats[g.scorer] = { goals: 0, assists: 0 };
                      goalStats[g.scorer].goals++;
                    }
                    if (g.assist) {
                      if (!goalStats[g.assist]) goalStats[g.assist] = { goals: 0, assists: 0 };
                      goalStats[g.assist].assists++;
                    }
                  }
                }

                const getPlayersForTeam = (prefix: string) => {
                  const players: { name: string; number: string; position: string; goals: number; assists: number }[] = [];
                  for (const [slotId, p] of Object.entries(lineupEntries)) {
                    if (!slotId.startsWith(prefix) || !p) continue;
                    const pl = p as any;
                    let pos = '';
                    if (slotId.includes('-gk-')) pos = slotId.includes('-2') ? 'RES' : 'MV';
                    else if (slotId.includes('-fwd-')) {
                      const parts = slotId.split('-');
                      const lastPart = parts[parts.length - 1];
                      pos = lastPart === 'c' ? 'C' : lastPart === 'lw' ? 'LW' : lastPart === 'rw' ? 'RW' : 'F';
                    }
                    else if (slotId.includes('-def-')) pos = 'B';
                    const playerKey = pl.number ? `${pl.name} #${pl.number}` : pl.name;
                    const stats = goalStats[playerKey] || { goals: 0, assists: 0 };
                    players.push({ name: pl.name || '', number: pl.number || '', position: pos, goals: stats.goals, assists: stats.assists });
                  }
                  // Sort: MV first, then by goals desc
                  return players.sort((a, b) => {
                    if (a.position === 'MV' && b.position !== 'MV') return -1;
                    if (b.position === 'MV' && a.position !== 'MV') return 1;
                    return (b.goals + b.assists) - (a.goals + a.assists);
                  });
                };

                const whitePlayers = getPlayersForTeam(whitePrefix);
                const greenPlayers = getPlayersForTeam(greenPrefix);

                if (whitePlayers.length === 0 && greenPlayers.length === 0) return null;

                const posColors: Record<string, string> = {
                  MV: '#F59E0B', LW: '#22C55E', RW: '#22C55E', C: '#EF4444', B: '#3B82F6', RES: '#9BA1A6'
                };

                const renderTeam = (players: typeof whitePlayers, teamLabel: string, color: string) => (
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color }}>{teamLabel}</p>
                    <div className="space-y-1">
                      {players.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          {p.position && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold text-white shrink-0"
                              style={{ backgroundColor: posColors[p.position] || '#687076' }}>
                              {p.position}
                            </span>
                          )}
                          <span className="text-[#ECEDEE] flex-1 truncate">{p.name} #{p.number}</span>
                          {(p.goals > 0 || p.assists > 0) && (
                            <span className="text-[10px] font-bold shrink-0">
                              {p.goals > 0 && <span className="text-[#F59E0B]">{p.goals}M</span>}
                              {p.goals > 0 && p.assists > 0 && <span className="text-[#687076]"> </span>}
                              {p.assists > 0 && <span className="text-[#0a7ea4]">{p.assists}A</span>}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );

                // Calculate team totals
                const whiteGoals = whitePlayers.reduce((s, p) => s + p.goals, 0);
                const whiteAssists = whitePlayers.reduce((s, p) => s + p.assists, 0);
                const greenGoals = greenPlayers.reduce((s, p) => s + p.goals, 0);
                const greenAssists = greenPlayers.reduce((s, p) => s + p.assists, 0);

                return (
                  <div className="bg-[#2a2a2a] rounded-xl p-3 border border-[#3a3a3a]">
                    <h3 className="text-[#ECEDEE] font-semibold text-sm mb-2 flex items-center gap-1.5">
                      <Users size={14} /> Laguppställning & Prestationer
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {renderTeam(whitePlayers, whiteTeamName, '#ECEDEE')}
                      {renderTeam(greenPlayers, greenTeamName, '#22C55E')}
                    </div>
                    {/* Team summary */}
                    <div className="mt-3 pt-2 border-t border-[#3a3a3a] grid grid-cols-2 gap-3">
                      <div className="text-[10px] text-[#9BA1A6]">
                        <span className="text-white font-semibold">{whiteGoals}</span> mål, <span className="text-white font-semibold">{whiteAssists}</span> assist
                      </div>
                      <div className="text-[10px] text-[#9BA1A6]">
                        <span className="text-[#22C55E] font-semibold">{greenGoals}</span> mål, <span className="text-[#22C55E] font-semibold">{greenAssists}</span> assist
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Export Button */}
              <button
                onClick={() => {
                  const matchData = selectedMatchData;
                  setSelectedMatch(null);
                  // Delay export open until Dialog close animation completes
                  // Radix Dialog needs ~300ms to fully unmount and release event handlers
                  setTimeout(() => {
                    setExportMatchData(matchData);
                    setShowExport(true);
                  }, 350);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#2a2a2a] border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl text-sm font-medium hover:bg-[#22C55E]/10 transition-colors"
              >
                <Share2 size={14} /> Exportera matchrapport
              </button>

              {/* Edit & Delete Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPasswordDialog({ action: "edit", matchId: selectedMatchData.id });
                    setPasswordInput("");
                    setPasswordError(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#2a2a2a] border border-[#0a7ea4]/30 text-[#0a7ea4] py-2.5 rounded-xl text-sm font-medium hover:bg-[#0a7ea4]/10 transition-colors"
                >
                  <Pencil size={14} /> Redigera
                </button>
                <button
                  onClick={() => {
                    setPasswordDialog({ action: "delete", matchId: selectedMatchData.id });
                    setPasswordInput("");
                    setPasswordError(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#2a2a2a] border border-[#EF4444]/30 text-[#EF4444] py-2.5 rounded-xl text-sm font-medium hover:bg-[#EF4444]/10 transition-colors"
                >
                  <Trash2 size={14} /> Ta bort
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialog !== null} onOpenChange={(open) => { if (!open) { setPasswordDialog(null); setPasswordInput(""); setPasswordError(false); } }}>
        <DialogContent className="bg-[#2a2a2a] border-[#3a3a3a] max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center">
              {passwordDialog?.action === "delete" ? "Ta bort match" : "Redigera match"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[#9BA1A6] text-sm text-center">
            Ange lösenord för att fortsätta
          </p>
          <input
            type="password"
            placeholder="Lösenord..."
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
            className={`w-full bg-[#1a1a1a] border rounded-xl px-4 py-3 text-[#ECEDEE] placeholder-[#687076] text-sm outline-none ${
              passwordError ? "border-[#EF4444]" : "border-[#3a3a3a] focus:border-[#0a7ea4]"
            }`}
            autoFocus
          />
          {passwordError && (
            <p className="text-[#EF4444] text-xs text-center">Fel lösenord</p>
          )}
          <div className="flex gap-3 mt-1">
            <button
              onClick={() => { setPasswordDialog(null); setPasswordInput(""); setPasswordError(false); }}
              className="flex-1 bg-[#1a1a1a] text-[#ECEDEE] py-3 rounded-full font-semibold border border-[#444444]"
            >
              Avbryt
            </button>
            <button
              onClick={handlePasswordSubmit}
              className={`flex-1 py-3 rounded-full font-semibold text-white ${
                passwordDialog?.action === "delete" ? "bg-[#EF4444]" : "bg-[#0a7ea4]"
              }`}
            >
              {passwordDialog?.action === "delete" ? "Ta bort" : "Fortsätt"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialog} onOpenChange={(open) => { if (!open) { setBulkDeleteDialog(false); setBulkPasswordInput(""); setBulkPasswordError(false); } }}>
        <DialogContent className="bg-[#2a2a2a] border-[#3a3a3a] max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center">Ta bort {selectedIds.size} matcher</DialogTitle>
          </DialogHeader>
          <p className="text-[#9BA1A6] text-sm text-center">
            Är du säker? Denna åtgärd kan inte ångras. Ange lösenord för att bekräfta.
          </p>
          <input
            type="password"
            placeholder="Lösenord..."
            value={bulkPasswordInput}
            onChange={(e) => { setBulkPasswordInput(e.target.value); setBulkPasswordError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleBulkDelete(); }}
            className={`w-full bg-[#1a1a1a] border rounded-xl px-4 py-3 text-[#ECEDEE] placeholder-[#687076] text-sm outline-none ${
              bulkPasswordError ? "border-[#EF4444]" : "border-[#3a3a3a] focus:border-[#0a7ea4]"
            }`}
            autoFocus
          />
          {bulkPasswordError && (
            <p className="text-[#EF4444] text-xs text-center">Fel lösenord</p>
          )}
          <div className="flex gap-3 mt-1">
            <button
              onClick={() => { setBulkDeleteDialog(false); setBulkPasswordInput(""); setBulkPasswordError(false); }}
              className="flex-1 bg-[#1a1a1a] text-[#ECEDEE] py-3 rounded-full font-semibold border border-[#444444]"
            >
              Avbryt
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleteManyMutation.isPending}
              className="flex-1 py-3 rounded-full font-semibold text-white bg-[#EF4444] disabled:opacity-50"
            >
              {deleteManyMutation.isPending ? "Tar bort..." : `Ta bort (${selectedIds.size})`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog !== null} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="bg-[#2a2a2a] border-[#3a3a3a] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE] text-center">Redigera match</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Match name - score suffix auto-updates */}
            <div>
              <label className="text-[#9BA1A6] text-xs font-medium block mb-1">Matchnamn</label>
              <div className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-xl px-4 py-2.5 text-[#ECEDEE] text-sm">
                {(() => {
                  const w = editGoals.filter(g => g.team === 'white').length;
                  const gr = editGoals.filter(g => g.team === 'green').length;
                  const base = editName.replace(/\d+-\d+\s*$/, '').trim();
                  return <>{base} <span className="font-bold">{w}-{gr}</span></>;
                })()}
              </div>
            </div>

            {/* Scores - auto-calculated from goal history */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-[#9BA1A6] text-xs font-medium block mb-1 text-center">Vita</label>
                <div className="flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{editGoals.filter(g => g.team === 'white').length}</span>
                </div>
              </div>
              <div className="text-[#687076] text-lg font-medium flex items-end justify-center pb-0.5">–</div>
              <div className="flex-1">
                <label className="text-[#9BA1A6] text-xs font-medium block mb-1 text-center">Gröna</label>
                <div className="flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#22C55E]">{editGoals.filter(g => g.team === 'green').length}</span>
                </div>
              </div>
            </div>

            {/* Goal History Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[#9BA1A6] text-xs font-medium">Målhistorik</label>
                <span className="text-[#687076] text-[10px]">Dra för att ändra ordning</span>
              </div>

              <div ref={goalListRef} className="space-y-2" onTouchMove={handleTouchMove}>
                {editGoals.map((goal, idx) => {
                  const isGreen = goal.team === "green";
                  return (
                    <div
                      key={idx}
                      data-goal-idx={idx}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onTouchStart={(e) => handleTouchStart(idx, e)}
                      onTouchEnd={handleTouchEnd}
                      className={`rounded-xl border p-2.5 transition-all ${
                        draggingIdx === idx
                          ? "opacity-50 border-[#0a7ea4] bg-[#0a7ea4]/10"
                          : isGreen
                            ? "border-[#22C55E]/30 bg-[#22C55E]/5"
                            : "border-white/10 bg-white/5"
                      }`}
                    >
                      {/* Header row: drag handle + team indicator + delete */}
                      <div className="flex items-center gap-2 mb-2">
                        <GripVertical size={14} className="text-[#687076] cursor-grab shrink-0" />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isGreen ? "bg-[#22C55E]/20 text-[#22C55E]" : "bg-white/10 text-white"
                        }`}>
                          {isGreen ? "GRÖNA" : "VITA"}
                        </span>
                        <span className="text-[#687076] text-[10px] flex-1">Mål {idx + 1}</span>
                        <button
                          onClick={() => removeGoal(idx)}
                          className="text-[#EF4444]/60 hover:text-[#EF4444] transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Fields */}
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => openPicker(idx, "scorer")}
                          className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs outline-none text-left flex items-center justify-between hover:border-[#0a7ea4] transition-colors"
                        >
                          <span className={goal.scorer ? "text-[#ECEDEE]" : "text-[#687076]"}>
                            {goal.scorer || "Välj målskytt..."}
                          </span>
                          {goal.scorer ? (
                            <X size={12} className="text-[#687076] hover:text-[#EF4444] shrink-0" onClick={(e) => { e.stopPropagation(); updateGoal(idx, "scorer", ""); }} />
                          ) : (
                            <UserCheck size={12} className="text-[#687076] shrink-0" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openPicker(idx, "assist")}
                          className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs outline-none text-left flex items-center justify-between hover:border-[#0a7ea4] transition-colors"
                        >
                          <span className={goal.assist ? "text-[#ECEDEE]" : "text-[#687076]"}>
                            {goal.assist || "Välj assist..."}
                          </span>
                          {goal.assist ? (
                            <X size={12} className="text-[#687076] hover:text-[#EF4444] shrink-0" onClick={(e) => { e.stopPropagation(); updateGoal(idx, "assist", ""); }} />
                          ) : (
                            <UserCheck size={12} className="text-[#687076] shrink-0" />
                          )}
                        </button>
                        {/* Goal type chips */}
                        <div className="flex flex-wrap gap-1">
                          {GOAL_TYPES.map(type => (
                            <button
                              key={type}
                              onClick={() => updateGoal(idx, "other", goal.other === type ? "" : type)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                                goal.other === type
                                  ? "bg-[#0a7ea4] text-white"
                                  : "bg-[#1a1a1a] text-[#9BA1A6] border border-[#3a3a3a]"
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add goal buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => addGoal("white")}
                  className="flex-1 flex items-center justify-center gap-1 bg-white/5 border border-white/10 text-white/70 py-2 rounded-xl text-xs font-medium hover:bg-white/10 transition-colors"
                >
                  <Plus size={12} /> Vita mål
                </button>
                <button
                  onClick={() => addGoal("green")}
                  className="flex-1 flex items-center justify-center gap-1 bg-[#22C55E]/5 border border-[#22C55E]/20 text-[#22C55E]/70 py-2 rounded-xl text-xs font-medium hover:bg-[#22C55E]/10 transition-colors"
                >
                  <Plus size={12} /> Gröna mål
                </button>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditDialog(null)}
                className="flex-1 bg-[#1a1a1a] text-[#ECEDEE] py-3 rounded-full font-semibold border border-[#444444]"
              >
                Avbryt
              </button>
              <button
                onClick={handleEditSave}
                disabled={updateMutation.isPending}
                className="flex-1 bg-[#0a7ea4] text-white py-3 rounded-full font-semibold disabled:opacity-50"
              >
                {updateMutation.isPending ? "Sparar..." : "Spara"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Player Picker Dialog for Edit Mode */}
      <Dialog open={pickerVisible} onOpenChange={setPickerVisible}>
        <DialogContent className="bg-[#1a1a1a] border-[#3a3a3a] max-w-sm max-h-[80vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-[#ECEDEE]">
              {pickerField === "scorer" ? "Välj målskytt" : "Välj assist"}
            </DialogTitle>
          </DialogHeader>
          <input
            type="text"
            placeholder="Sök spelare... (eller lägg till)"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl px-4 py-3 text-[#ECEDEE] placeholder-[#9BA1A6] outline-none focus:border-[#0a7ea4]"
          />
          {pickerSearch && (
            <button onClick={() => selectPickerPlayer(pickerSearch)}
              className="bg-[#0a7ea4] text-[#1a1a1a] rounded-2xl px-4 py-2.5 text-sm font-semibold">
              Lägg till "{pickerSearch}"
            </button>
          )}
          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {(() => {
              if (pickerGoalIdx === null) return null;
              const goal = editGoals[pickerGoalIdx];
              if (!goal) return null;
              const data = getEditPickerData(goal.team);
              const search = pickerSearch.toLowerCase();
              const filter = (p: { displayName: string }) => !search || p.displayName.toLowerCase().includes(search);
              const filteredScoring = data.scoringPlayers.filter(filter);
              const filteredOther = data.otherPlayers.filter(filter);
              const filteredAll = data.allPlayers.filter(filter);

              return (
                <>
                  {filteredScoring.length > 0 && (
                    <>
                      <div className="sticky top-0 z-10 px-4 py-2 rounded-t-lg font-semibold text-sm"
                        style={goal.team === "white"
                          ? { backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1a1a" }
                          : { backgroundColor: "rgba(51,121,49,0.85)", color: "#fff" }}>
                        {data.scoringTeamName} (uppställning)
                      </div>
                      {filteredScoring.map((p, i) => (
                        <button key={`s-${i}`} onClick={() => selectPickerPlayer(p.displayName)}
                          className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#ECEDEE] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                          <span className="text-green-400 text-sm">✓</span>
                          <span>{p.displayName}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {filteredOther.length > 0 && (
                    <>
                      <div className="sticky top-0 z-10 px-4 py-2 font-semibold text-sm"
                        style={goal.team === "white"
                          ? { backgroundColor: "rgba(51,121,49,0.85)", color: "#fff" }
                          : { backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1a1a" }}>
                        {data.otherTeamName} (uppställning)
                      </div>
                      {filteredOther.map((p, i) => (
                        <button key={`o-${i}`} onClick={() => selectPickerPlayer(p.displayName)}
                          className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#ECEDEE] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                          <span className="text-green-400 text-sm">✓</span>
                          <span>{p.displayName}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {filteredAll.length > 0 && (
                    <>
                      <div className="sticky top-0 z-10 px-4 py-2 font-semibold text-sm bg-[#3a3a3a] text-[#9BA1A6]">
                        Övriga spelare
                      </div>
                      {filteredAll.map((p, i) => (
                        <button key={`a-${i}`} onClick={() => selectPickerPlayer(p.displayName)}
                          className="w-full text-left px-4 py-3 border-b border-[#3a3a3a] text-[#9BA1A6] hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                          <span>{p.displayName}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {filteredScoring.length === 0 && filteredOther.length === 0 && filteredAll.length === 0 && !pickerSearch && (
                    <p className="text-[#687076] text-sm text-center py-6">Ingen uppställning sparad för denna match</p>
                  )}
                </>
              );
            })()}
          </div>
          <button onClick={() => { setPickerVisible(false); setPickerSearch(""); }}
            className="w-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#ECEDEE] py-3 rounded-2xl font-semibold mt-2">
            Avbryt
          </button>
        </DialogContent>
      </Dialog>

      {/* Match Report Export */}
      {exportMatchData && (
        <MatchReportExport
          match={{
            name: exportMatchData.name,
            teamWhiteScore: exportMatchData.teamWhiteScore,
            teamGreenScore: exportMatchData.teamGreenScore,
            goalHistory: (exportMatchData.goalHistory as GoalEvent[]) ?? [],
            matchStartTime: exportMatchData.matchStartTime ? String(exportMatchData.matchStartTime) : undefined,
            createdAt: String(exportMatchData.createdAt),
            lineup: exportMatchData.lineup,
          }}
          open={showExport}
          onOpenChange={(open) => {
            setShowExport(open);
            if (!open) {
              setSelectedMatch(exportMatchData.id);
              setExportMatchData(null);
            }
          }}
        />
      )}
    </div>
  );
}
