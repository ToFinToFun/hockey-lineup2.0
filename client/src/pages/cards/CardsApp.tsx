/**
 * CardsApp – Hockey Trading Cards gallery and creator
 * Route: /cards
 */
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Upload, Trash2, ChevronDown, Image as ImageIcon, User, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { HockeyCard, exportCardAsImage, type CardStats } from "./HockeyCard";

type TeamTheme = "white" | "green";

export default function CardsApp() {
  const [, setLocation] = useLocation();

  // Fetch player stats (returns per-player data with matches, goals, assists, wins, goalTypes)
  const { data: playerStatsData } = trpc.score.playerStats.useQuery(
    {},
    { staleTime: 60_000 }
  );

  // Fetch PIR data
  const { data: pirData } = trpc.pir.getRatings.useQuery(undefined, { staleTime: 60_000 });

  // Fetch goalkeeper stats
  const { data: gkData } = trpc.score.goalkeeperStats.useQuery(
    {},
    { staleTime: 60_000 }
  );

  // State
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [teamTheme, setTeamTheme] = useState<TeamTheme>("white");
  const [photos, setPhotos] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("stalstaden_card_photos");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showGallery, setShowGallery] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Save photos to localStorage
  useEffect(() => {
    localStorage.setItem("stalstaden_card_photos", JSON.stringify(photos));
  }, [photos]);

  // Build player list from playerStats data
  const playerList = useMemo(() => {
    if (!playerStatsData) return [];
    const pirMap = new Map<string, any>();
    if (pirData) {
      pirData.forEach((p: any) => pirMap.set(p.name, p));
    }
    const gkMap = new Map<string, any>();
    if (gkData && Array.isArray(gkData)) {
      gkData.forEach((g: any) => gkMap.set(g.name, g));
    }

    return playerStatsData.map((p: any) => {
      const pir = pirMap.get(p.name);
      const gk = gkMap.get(p.name);
      const isGk = gk && gk.matchesPlayed > (p.matchesPlayed / 2);

      // Extract number from name if present (format "Name #Number")
      const numberMatch = p.name.match(/#(\d+)$/);
      const playerNumber = numberMatch ? numberMatch[1] : undefined;
      const cleanName = p.name.replace(/\s*#\d+$/, "");

      // Determine position from most played
      let position = "F";
      if (isGk) {
        position = "MV";
      } else if (p.matchesWhite > 0 || p.matchesGreen > 0) {
        // Use generic position - we don't have slot data here
        position = "UT";
      }

      // Calculate longest win streak from recentForm
      let longestStreak = 0;
      let currentStreak = 0;
      if (p.recentForm) {
        for (const r of p.recentForm) {
          if (r === "V") { currentStreak++; longestStreak = Math.max(longestStreak, currentStreak); }
          else { currentStreak = 0; }
        }
      }

      const stats: CardStats = {
        season: "2025/26",
        matches: p.matchesPlayed ?? 0,
        wins: p.wins ?? 0,
        topStreak: longestStreak,
        goals: p.goals ?? 0,
        assists: p.assists ?? 0,
        points: p.points ?? (p.goals + p.assists) ?? 0,
        gwg: p.gwg ?? 0,
        winRate: p.winRate ?? 0,
        isGoalkeeper: !!isGk,
        goalsAgainstPerMatch: isGk && gk ? gk.goalsAgainstPerMatch : undefined,
        cleanSheets: isGk && gk ? gk.cleanSheets : undefined,
      };

      return {
        id: p.name,
        name: cleanName,
        number: playerNumber,
        position,
        stats,
        pirRating: pir?.rating,
        captainRole: undefined as string | undefined,
      };
    }).sort((a: any, b: any) => a.name.localeCompare(b.name, "sv"));
  }, [playerStatsData, pirData, gkData]);

  const selectedPlayerData = useMemo(() => {
    return playerList.find((p: any) => p.id === selectedPlayer);
  }, [playerList, selectedPlayer]);

  // Photo upload handler
  const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPlayer) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setPhotos(prev => ({ ...prev, [selectedPlayer]: url }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [selectedPlayer]);

  // Remove photo
  const handleRemovePhoto = useCallback(() => {
    if (!selectedPlayer) return;
    setPhotos(prev => {
      const next = { ...prev };
      delete next[selectedPlayer];
      return next;
    });
  }, [selectedPlayer]);

  // Export single card
  const handleExport = useCallback(async () => {
    if (!cardRef.current || !selectedPlayerData) return;
    await exportCardAsImage(cardRef.current.querySelector(".hockey-card-inner") as HTMLElement, selectedPlayerData.name);
  }, [selectedPlayerData]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#ECEDEE]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0d1117]/90 backdrop-blur-md border-b border-[#2a2a2a]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/")}
              className="p-2 rounded-lg bg-[#1a1a1a] hover:bg-[#2a2a2a] transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                Hockeykort
              </h1>
              <p className="text-[10px] text-[#687076]">Skapa och exportera spelarkort</p>
            </div>
          </div>

          {/* Theme toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeamTheme("white")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                teamTheme === "white"
                  ? "bg-slate-200/20 text-slate-200 border border-slate-200/30"
                  : "bg-[#1a1a1a] text-[#687076] border border-transparent hover:bg-[#2a2a2a]"
              }`}
            >
              Vita
            </button>
            <button
              onClick={() => setTeamTheme("green")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                teamTheme === "green"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-[#1a1a1a] text-[#687076] border border-transparent hover:bg-[#2a2a2a]"
              }`}
            >
              Gröna
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* Left: Player list / Gallery */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#687076] uppercase tracking-wider">
                Välj spelare ({playerList.length})
              </h2>
              <button
                onClick={() => setShowGallery(!showGallery)}
                className="text-xs text-[#0a7ea4] hover:underline flex items-center gap-1"
              >
                {showGallery ? "Lista" : "Galleri"}
                <ChevronDown size={12} className={showGallery ? "rotate-180" : ""} />
              </button>
            </div>

            {playerList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <User size={40} className="text-[#2a2a2a] mb-4" />
                <p className="text-sm text-[#687076]">Inga spelare hittades</p>
                <p className="text-[10px] text-[#3a3a3a] mt-1">Spela några matcher i Score Tracker först</p>
              </div>
            ) : showGallery ? (
              /* Gallery view: mini cards */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {playerList.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer(p.id)}
                    className={`relative rounded-xl overflow-hidden transition-all hover:scale-[1.02] ${
                      selectedPlayer === p.id
                        ? "ring-2 ring-[#0a7ea4] ring-offset-2 ring-offset-[#0d1117]"
                        : ""
                    }`}
                  >
                    <div className="aspect-[3/4]">
                      <HockeyCard
                        playerName={p.name}
                        playerNumber={p.number}
                        position={p.position}
                        team={teamTheme}
                        stats={p.stats}
                        photoUrl={photos[p.id] ?? null}
                        captainRole={p.captainRole}
                        pirRating={p.pirRating}
                        interactive={false}
                        scale={0.45}
                      />
                    </div>
                    {/* Photo indicator */}
                    {photos[p.id] && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500/80 flex items-center justify-center">
                        <ImageIcon size={8} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              /* List view */
              <div className="space-y-1">
                {playerList.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                      selectedPlayer === p.id
                        ? "bg-[#0a7ea4]/15 border border-[#0a7ea4]/30"
                        : "bg-[#1a1a1a]/50 hover:bg-[#2a2a2a] border border-transparent"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {photos[p.id] ? (
                        <img src={photos[p.id]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={14} className="text-[#687076]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-[#ECEDEE] font-medium truncate block">
                        {p.name}
                        {p.number && <span className="text-[#687076] ml-1">#{p.number}</span>}
                      </span>
                      <span className="text-[10px] text-[#687076]">
                        {p.position} • {p.stats.matches} matcher • {p.stats.goals} mål
                      </span>
                    </div>
                    {p.pirRating && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        {p.pirRating}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Card preview + controls */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            {selectedPlayerData ? (
              <div className="flex flex-col items-center gap-4">
                {/* Card preview */}
                <div ref={cardRef}>
                  <HockeyCard
                    playerName={selectedPlayerData.name}
                    playerNumber={selectedPlayerData.number}
                    position={selectedPlayerData.position}
                    team={teamTheme}
                    stats={selectedPlayerData.stats}
                    photoUrl={photos[selectedPlayer!] ?? null}
                    captainRole={selectedPlayerData.captainRole}
                    pirRating={selectedPlayerData.pirRating}
                    interactive
                  />
                </div>

                {/* Controls */}
                <div className="w-full max-w-[320px] space-y-2">
                  {/* Photo upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-xs font-medium hover:bg-[#2a2a2a] transition-colors"
                    >
                      <Upload size={14} />
                      {photos[selectedPlayer!] ? "Byt foto" : "Ladda upp foto"}
                    </button>
                    {photos[selectedPlayer!] && (
                      <button
                        onClick={handleRemovePhoto}
                        className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Export */}
                  <button
                    onClick={handleExport}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#0a7ea4]/20 border border-[#0a7ea4]/30 text-[#0a7ea4] text-xs font-medium hover:bg-[#0a7ea4]/30 transition-colors"
                  >
                    <Download size={14} />
                    Exportera som PNG
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Sparkles size={40} className="text-[#2a2a2a] mb-4" />
                <p className="text-sm text-[#687076]">Välj en spelare för att se kortet</p>
                <p className="text-[10px] text-[#3a3a3a] mt-1">Klicka på en spelare i listan till vänster</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
