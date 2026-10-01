// ShareView – Skrivskyddad vy av en sparad uppställning (SQL/tRPC-version)
// Design: Industrial Ice Arena – mörk, polerad, läsbar

import { teamLogo, club, clubHeading } from "@shared/club";
import { useParams, Link } from "wouter";
import { positionRowColors, CAPTAIN_COLORS } from "@/lib/positionColors";
import { trpc } from "@/lib/trpc";
import { createTeamSlots, groupSlots, MAX_TEAM_CONFIG } from "@/lib/lineup";
import type { Player } from "@/lib/players";
import { Clock, Users } from "lucide-react";

const BG_URL =
  "/images/background.jpg";

const TEAM_A_SLOTS = createTeamSlots("team-a", MAX_TEAM_CONFIG);
const TEAM_B_SLOTS = createTeamSlots("team-b", MAX_TEAM_CONFIG);

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Formatera rubrik: "Laguppställning Torsdag 26/2"
function formatHeadingDate(ts: number): string {
  const d = new Date(ts);
  const weekday = d.toLocaleDateString("sv-SE", { weekday: "long" });
  // Stor bokstav på veckodagen
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `Laguppställning ${capitalizedWeekday} ${day}/${month}`;
}

// Positionsfärg baserat på slot-shortLabel (spelarens roll i uppställningen)
// En enskild slot-rad i den skrivskyddade vyn
function SlotRow({ player, label, shortLabel }: { player: Player | undefined; label: string; shortLabel: string }) {
  // Samma färger som i Lineup och Score Tracker
  const c = positionRowColors(shortLabel);
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border-l-2 text-xs"
        style={{ borderLeftColor: "#ffffff15", backgroundColor: "#ffffff08" }}>
        <span className="shrink-0 w-7 h-[18px] rounded flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: "#ffffff10", color: "#ffffff30" }}>—</span>
        <span className="text-white/25 italic truncate flex-1">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border-l-2 text-xs"
      style={{ borderLeftColor: c.border, backgroundColor: c.bg }}>
      <span className="shrink-0 w-7 h-[18px] rounded flex items-center justify-center text-[9px] font-bold"
        style={{ backgroundColor: c.border, color: c.text }}>
        {shortLabel}
      </span>
      {player.captainRole && (
        <span className="shrink-0 text-[10px] font-black" style={{ color: CAPTAIN_COLORS[player.captainRole as "C" | "A"] }}>
          {player.captainRole}
        </span>
      )}
      <span className="text-white/90 font-semibold truncate flex-1">
        {player.name}
        {player.number && <span className="text-white/45 font-normal ml-1.5">#{player.number}</span>}
      </span>
    </div>
  );
}

// En sektion (Målvakter / Backar / Forwards) för ett lag
function TeamSection({
  slots,
  lineup,
  title,
  headerColor,
}: {
  slots: ReturnType<typeof createTeamSlots>;
  lineup: Record<string, Player>;
  title: string;
  headerColor: string;
}) {
  const groups = groupSlots(slots);
  return (
    <div className="space-y-3">
      <h3
        className={`text-xs font-black uppercase tracking-widest ${headerColor}`}
        style={{ fontFamily: "'Oswald', sans-serif" }}
      >
        {title}
      </h3>
      {groups.map(({ groupLabel, slots: groupSlotList }) => {
        // Visa bara grupper som har minst en placerad spelare
        const filledSlots = groupSlotList.filter((s) => lineup[s.id]);
        if (filledSlots.length === 0) return null;
        return (
          <div key={groupLabel} className="space-y-1">
            <p className="text-white/30 text-[9px] uppercase tracking-wider pl-1">
              {groupLabel}
            </p>
            {filledSlots.map((slot) => (
              <SlotRow
                key={slot.id}
                player={lineup[slot.id]}
                label={slot.label}
                shortLabel={slot.shortLabel}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Panel för ett helt lag
function TeamPanelView({
  teamName,
  slots,
  lineup,
  logo,
  accentColor,
}: {
  teamName: string;
  slots: ReturnType<typeof createTeamSlots>;
  lineup: Record<string, Player>;
  logo: string;
  accentColor: string;
}) {
  const gkSlots = slots.filter((s) => s.type === "goalkeeper");
  const defSlots = slots.filter((s) => s.type === "defense");
  const fwdSlots = slots.filter((s) => s.type === "forward");
  const placedCount = slots.filter((s) => lineup[s.id]).length;

  return (
    <div className="bg-black/35 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
      {/* Team header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/3`}>
        <img src={logo} alt={teamName} className="w-8 h-8 rounded-full object-cover" />
        <div>
          <h2
            className={`text-base font-black uppercase tracking-widest ${accentColor}`}
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {teamName}
          </h2>
          <p className="text-white/30 text-[10px]">{placedCount} / {slots.length} placerade</p>
        </div>
      </div>

      <div className="p-4 space-y-5">
        <TeamSection
          slots={gkSlots}
          lineup={lineup}
          title="Målvakter"
          headerColor="text-amber-300"
        />
        <TeamSection
          slots={defSlots}
          lineup={lineup}
          title="Backar"
          headerColor="text-blue-300"
        />
        <TeamSection
          slots={fwdSlots}
          lineup={lineup}
          title="Forwards"
          headerColor="text-emerald-300"
        />
      </div>
    </div>
  );
}

export default function ShareView() {
  const { id } = useParams<{ id: string }>();

  const { data: savedLineup, isLoading: loading, error } = trpc.savedLineups.getByShareId.useQuery(
    { shareId: id ?? "" },
    { enabled: !!id, refetchOnWindowFocus: false }
  );

  const notFound = (!loading && !savedLineup) || !!error;

  const teamALineup: Record<string, Player> = {};
  const teamBLineup: Record<string, Player> = {};
  if (savedLineup) {
    const lineupData = savedLineup.lineup as Record<string, Player>;
    for (const [slotId, player] of Object.entries(lineupData)) {
      if (slotId.startsWith("team-a-")) teamALineup[slotId] = player;
      else if (slotId.startsWith("team-b-")) teamBLineup[slotId] = player;
    }
  }

  return (
    <div
      className="min-h-screen w-full relative"
      style={{
        backgroundImage: `url(${BG_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/55 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-4 pt-4 pb-3 border-b border-white/10 backdrop-blur-sm bg-black/20">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1
                  className="text-xl font-black text-white tracking-widest uppercase"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  Stålstadens <span className="text-emerald-400">Lineup</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-400/20 rounded-full px-3 py-1">
              <span className="text-amber-300/70 text-[10px] uppercase tracking-wider font-bold">Skrivskyddad vy</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-white/30 text-sm animate-pulse">Laddar uppställning…</div>
            </div>
          )}

          {notFound && !loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-white/40 text-sm">Länken har gått ut eller finns inte längre. Delade länkar gäller i 48 timmar.</p>
              <Link href="/lineup">
                <button className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all">
                  Gå till appen
                </button>
              </Link>
            </div>
          )}

          {savedLineup && !loading && (
            <div className="space-y-6">
              {/* Uppställningsinfo */}
              <div className="text-center space-y-1">
                <h2
                  className="text-2xl font-black text-white tracking-widest uppercase"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  {formatHeadingDate(savedLineup.savedAt)}
                </h2>
                <div className="flex items-center justify-center gap-4 text-white/35 text-xs">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Delad {formatDate(savedLineup.savedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {Object.keys(savedLineup.lineup as Record<string, any>).length} placerade spelare
                  </span>
                </div>
              </div>

              {/* Lag-paneler */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TeamPanelView
                  teamName={savedLineup.teamAName}
                  slots={TEAM_A_SLOTS}
                  lineup={teamALineup}
                  logo={teamLogo("white")}
                  accentColor="text-slate-200"
                />
                <TeamPanelView
                  teamName={savedLineup.teamBName}
                  slots={TEAM_B_SLOTS}
                  lineup={teamBLineup}
                  logo={teamLogo("green")}
                  accentColor="text-emerald-400"
                />
              </div>

              {/* Footer */}
              <p className="text-center text-white/20 text-[10px] pb-4">
                Stålstadens Sportförening · A-lag Herrar · Formations-verktyg
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
