/**
 * Statistik → Spelare (utespelare) och → Målvakter. Alla listor är samma
 * sorterbara tabell: klicka på en rubrik för att sortera, igen för att vända.
 */
import { useMemo } from "react";
import { Gauge, Timer, Trophy, PartyPopper } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { TrendIcon } from "@/components/PlayerCard";
import { HockeyGoal } from "@/components/score/HockeyIcons";
import { StatTable, StatSection } from "./StatTable";
import { formatMinutes, PositionSplit } from "./IceTimeTab";

type Outputs = inferRouterOutputs<AppRouter>;
type Rating = Outputs["pir"]["getRatings"][number];
type IceRow = Outputs["scoreStats"]["iceTime"][number];
type FunRow = Outputs["scoreStats"]["funStats"][number];
type Input = { from?: string; to?: string; includeExternal?: boolean } | undefined;

interface Scorer { name: string; number?: string; goals: number; assists: number; points: number; gwg: number; matches?: number }

const bareName = (n: string) => n.replace(/\s*#\d*\s*$/, "").trim().toLowerCase();

/** PIR-ranking som tabell (utespelare eller målvakter). */
function PirTable({ ratings, role, onPlayerClick }: { ratings: Rating[] | undefined; role: "outfield" | "goalkeeper"; onPlayerClick: (name: string) => void }) {
  const rows = (ratings ?? []).filter((r) => (role === "outfield" ? r.outfieldRating : r.goalkeeperRating) != null);
  return (
    <StatSection title="PIR-ranking" icon={<Gauge size={14} className="text-amber-400" />} hint="PIR kräver minst 3 matcher i rollen. Bara internmatcher räknas.">
      <StatTable
        rows={rows}
        rowKey={(r) => r.name}
        name={(r) => r.name}
        onRowClick={(r) => onPlayerClick(r.name)}
        defaultSort="pir"
        empty="Ingen har betyg i rollen ännu (kräver 3 matcher)."
        columns={[
          { key: "pir", label: "PIR", value: (r) => (role === "outfield" ? r.outfieldRating : r.goalkeeperRating) },
          { key: "m", label: "M", title: "Matcher i rollen", value: (r) => (role === "outfield" ? r.outfieldMatchesPlayed : r.goalkeeperMatchesPlayed) },
          {
            key: "trend", label: "Trend", title: "Formkurva",
            value: (r) => ({ rising: 2, slightly_rising: 1, stable: 0, slightly_falling: -1, falling: -2 } as Record<string, number>)[(role === "outfield" ? r.outfieldTrendLabel : r.goalkeeperTrendLabel) ?? ""] ?? null,
            render: (r) => <TrendIcon trendLabel={(role === "outfield" ? r.outfieldTrendLabel : r.goalkeeperTrendLabel) ?? undefined} matchesPlayed={role === "outfield" ? r.outfieldMatchesPlayed : r.goalkeeperMatchesPlayed} />,
          },
        ]}
      />
    </StatSection>
  );
}

export function SkatersTab({ stats, input, ratings, onPlayerClick }: { stats: { topScorers?: Scorer[]; starLeaders?: Array<{ name: string; total?: number; points?: number }> } | undefined; input: Input; ratings: Rating[] | undefined; onPlayerClick: (name: string) => void }) {
  const ice = trpc.scoreStats.iceTime.useQuery(input ?? {});
  const fun = trpc.scoreStats.funStats.useQuery(input ?? {});
  const stars = useMemo(() => new Map((stats?.starLeaders ?? []).map((s) => [bareName(s.name), s.points ?? s.total ?? 0])), [stats?.starLeaders]);
  const scorers = stats?.topScorers ?? [];
  // Utespelare: de som bara stått i mål visas under Målvakter
  const skaters = (ice.data ?? []).filter((r) => r.minutes > r.byPos.MV);

  return (
    <div className="space-y-8">
      <StatSection title="Poängliga" icon={<Trophy size={14} className="text-amber-400" />} hint="Sp = matcher, M = mål, A = assist, P = poäng, GWG = matchvinnande mål, ★ = stjärnpoäng (★★★ = 3, ★★ = 2, ★ = 1).">
        <StatTable<Scorer>
          rows={scorers}
          rowKey={(r) => r.name}
          name={(r) => r.name}
          onRowClick={(r) => onPlayerClick(r.name)}
          defaultSort="p"
          empty="Ingen poängdata för perioden."
          columns={[
            { key: "sp", label: "Sp", title: "Spelade matcher", value: (r) => r.matches ?? null },
            { key: "m", label: "M", title: "Mål", value: (r) => r.goals },
            { key: "a", label: "A", title: "Assist", value: (r) => r.assists },
            { key: "p", label: "P", title: "Poäng", value: (r) => r.points },
            { key: "gwg", label: "GWG", title: "Matchvinnande mål", value: (r) => r.gwg },
            { key: "stars", label: "★", title: "Stjärnpoäng", value: (r) => stars.get(bareName(r.name)) ?? 0 },
          ]}
        />
      </StatSection>

      <StatSection title="Speltid" icon={<Timer size={14} className="text-sky-400" />} hint="Uppskattad: samma regler som i Lineup, räknat på varje match utifrån uppställningen och matchens längd. Stapeln: tid per position (MV/B/C/F).">
        <StatTable<IceRow>
          rows={skaters}
          rowKey={(r) => r.id}
          name={(r) => r.name}
          sub={(r) => <PositionSplit byPos={r.byPos} total={r.minutes} />}
          onRowClick={(r) => onPlayerClick(r.name)}
          defaultSort="tid"
          empty="Inga matcher under perioden."
          columns={[
            { key: "m", label: "M", title: "Matcher", value: (r) => r.matches },
            { key: "tid", label: "Tid", value: (r) => r.minutes, render: (r) => formatMinutes(r.minutes), className: "text-right" },
            { key: "snitt", label: "Snitt", title: "Minuter per match", value: (r) => r.perMatch, render: (r) => `${r.perMatch}′` },
            { key: "p60", label: "P/60", title: "Poäng per 60 minuter (efter minst 30 min)", value: (r) => r.p60 },
          ]}
        />
      </StatSection>

      <PirTable ratings={ratings} role="outfield" onPlayerClick={onPlayerClick} />

      <StatSection title="Kul statistik" icon={<PartyPopper size={14} className="text-pink-400" />} hint="1:a = gjorde matchens första mål. Sista = matchens sista mål. Sent = mål de sista 10 minuterna. Torka = längsta svit av matcher utan mål (Nu = pågående). 0 p = matcher utan poäng.">
        <StatTable<FunRow>
          rows={(fun.data ?? []).filter((r) => r.matches > 0)}
          rowKey={(r) => r.id}
          name={(r) => r.name}
          onRowClick={(r) => onPlayerClick(r.name)}
          defaultSort="first"
          columns={[
            { key: "first", label: "1:a", title: "Matchens första mål", value: (r) => r.firstGoals },
            { key: "last", label: "Sista", title: "Matchens sista mål", value: (r) => r.lastGoals },
            { key: "late", label: "Sent", title: "Mål de sista 10 minuterna", value: (r) => r.lateGoals },
            { key: "drought", label: "Torka", title: "Längsta svit av matcher utan mål", value: (r) => r.longestDrought },
            { key: "now", label: "Nu", title: "Pågående svit av matcher utan mål", value: (r) => r.currentDrought },
            { key: "zero", label: "0 p", title: "Matcher utan poäng", value: (r) => r.pointless },
          ]}
        />
      </StatSection>

    </div>
  );
}

export function GoaliesTab({ input, ratings, onPlayerClick }: { input: Input; ratings: Rating[] | undefined; onPlayerClick: (name: string) => void }) {
  const ice = trpc.scoreStats.iceTime.useQuery(input ?? {});
  const goalies = (ice.data ?? []).filter((r) => r.byPos.MV > 0);
  return (
    <div className="space-y-8">
      <StatSection title="Målvakter" icon={<HockeyGoal size={15} className="text-orange-400" />} hint="V = vinster (målvaktens lag vann). Delar två målvakter på matchen fördelas de insläppta målen efter tiden i mål (uppskattad som speltiden). /60 = insläppta per 60 minuter i mål, efter minst 30 minuter. Nollor = ensam i målet utan insläppta.">
        <StatTable<IceRow>
          rows={goalies}
          rowKey={(r) => r.id}
          name={(r) => r.name}
          nameLabel="Målvakt"
          onRowClick={(r) => onPlayerClick(r.name)}
          defaultSort="v"
          empty="Inga målvakter under perioden."
          columns={[
            { key: "m", label: "M", title: "Matcher i mål", value: (r) => r.gkMatches },
            { key: "v", label: "V", title: "Vinster", value: (r) => r.gkWins },
            { key: "tid", label: "Tid", title: "Tid i mål", value: (r) => r.byPos.MV, render: (r) => formatMinutes(r.byPos.MV), className: "text-right" },
            { key: "ga", label: "Insl.", title: "Insläppta mål", value: (r) => r.ga, render: (r) => (Number.isInteger(r.ga) ? r.ga : r.ga.toFixed(1)), lowerIsBetter: true },
            { key: "ga60", label: "/60", title: "Insläppta per 60 minuter i mål", value: (r) => r.ga60, lowerIsBetter: true },
            { key: "so", label: "Nollor", title: "Hållna nollor", value: (r) => r.shutouts },
          ]}
        />
      </StatSection>
      <PirTable ratings={ratings} role="goalkeeper" onPlayerClick={onPlayerClick} />
    </div>
  );
}
