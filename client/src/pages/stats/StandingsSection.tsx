/**
 * Statistik → Lag: serietabellen (NHL-stil, 2 p vinst och 1 p oavgjort) och,
 * i slutspelet, finalen mellan Vita och Gröna som matchserie med pokalen.
 */
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ShareImageModal } from "@/components/stats/ShareImageModal";
import { trpc } from "@/lib/trpc";
import { teamColor, teamName } from "@shared/teams";
import type { StandingRow } from "@shared/standings";
import { IMAGES } from "@/lib/scoreConstants";
import { renderChampions, renderFinal, TROPHY } from "@/lib/statsImages";
import { StatSection } from "./StatTable";
import { useShareImage, useShareTable } from "./shareContext";

type Input = { from?: string; to?: string } | undefined;

const COLS: Array<{ key: keyof StandingRow; label: string; title: string }> = [
  { key: "gp", label: "GP", title: "Spelade matcher" },
  { key: "w", label: "W", title: "Vinster" },
  { key: "l", label: "L", title: "Förluster" },
  { key: "t", label: "T", title: "Oavgjorda" },
  { key: "gf", label: "GF", title: "Gjorda mål" },
  { key: "ga", label: "GA", title: "Insläppta mål" },
  { key: "diff", label: "+/-", title: "Målskillnad" },
  { key: "pts", label: "P", title: "Poäng: 2 för vinst, 1 för oavgjort" },
];
const logoOf = (t: "white" | "green") => (t === "white" ? IMAGES.teamWhiteLogo : IMAGES.teamGreenLogo);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  useShareTable(() => ({
    title: "Tabellen",
    columns: COLS.map((c) => ({ label: c.label })),
    highlight: COLS.length - 1,
    note: "2 poäng för vinst, 1 för oavgjort",
    rows: rows.map((r, i) => ({
      rank: String(i + 1),
      name: teamName(r.team),
      logo: logoOf(r.team),
      color: teamColor(r.team),
      cells: COLS.map((c) => (c.key === "diff" ? signed(r.diff) : String(r[c.key]))),
    })),
  }), [rows]);
  return (
    <div className="rounded-xl bg-[#161616] border border-white/10 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-white/40 text-[10px] border-b border-white/5">
            <th className="w-7 pl-3 py-2 text-left font-medium">#</th>
            <th className="text-left font-medium py-2">Lag</th>
            {COLS.map((c) => (
              <th key={c.key} title={c.title} className={`font-medium px-1.5 py-2 text-center ${c.key === "pts" ? "text-sky-300" : ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className="border-b border-white/[0.03] last:border-0">
              <td className={`pl-3 py-2 tabular-nums ${i === 0 ? "text-amber-300" : "text-white/40"}`}>{i + 1}</td>
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <img src={logoOf(r.team)} alt="" className="w-6 h-6 object-contain" />
                  <span className="font-semibold" style={{ color: teamColor(r.team) }}>{teamName(r.team)}</span>
                </span>
              </td>
              {COLS.map((c) => (
                <td key={c.key} className={`px-1.5 py-2 text-center tabular-nums ${c.key === "pts" ? "text-white font-bold text-sm" : "text-white/75"}`}>
                  {c.key === "diff" ? signed(r.diff) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type FinalData = inferRouterOutputs<AppRouter>["scoreStats"]["final"];
type Side = "white" | "green";

/** Finalen: ettan i grundserien till vänster, tvåan till höger, pokalen mellan dem. */
function FinalBracket({ f }: { f: FinalData }) {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const setWinner = trpc.scoreStats.setFinalWinner.useMutation({
    onSuccess: () => utils.scoreStats.final.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const [showChampions, setShowChampions] = useState(false);
  const [left, right] = f.seeds as [Side, Side];
  const leader = f.series[left] > f.series[right] ? left : f.series[right] > f.series[left] ? right : null;
  const seedText = (t: Side, i: number) => `${i + 1}:a i serien · ${f.seasonPoints[t]} p`;
  const title = `FINAL ${f.season}`;
  const team = (t: Side, i: number) => ({ name: teamName(t), logo: logoOf(t), color: teamColor(t), wins: f.series[t], seed: seedText(t, i) });
  useShareImage(({ format, background }) => renderFinal({
    title, left: team(left, 0), right: team(right, 1), ties: f.series.ties, format, background,
    winner: f.winner ? (f.winner === left ? "left" : "right") : null,
    matches: f.series.matches.map((m) => ({ date: m.date, left: m[left], right: m[right] })),
  }), [f]);

  const side = (t: Side, i: number) => {
    const lost = !!f.winner && f.winner !== t;
    const won = f.winner === t;
    return (
      <div className={`flex flex-col items-center gap-1 ${lost ? "opacity-45" : ""}`}>
        {won && <span className="text-[10px] font-bold tracking-[0.25em] text-amber-300">MÄSTARE</span>}
        <img src={logoOf(t)} alt={teamName(t)} className={`w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-full ${won ? "ring-2 ring-amber-300" : ""}`} />
        <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: teamColor(t) }}>{teamName(t)}</span>
        <span className="text-[10px] text-white/40">{seedText(t, i)}</span>
        <span className="text-4xl sm:text-5xl font-bold tabular-nums text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>{f.series[t]}</span>
      </div>
    );
  };
  const status = f.winner ? `Avgjord – ${teamName(f.winner)} mästare` : f.started ? (leader ? `${teamName(leader)} leder` : "Jämnt") : `Börjar ${new Date(f.playoffFrom).toLocaleDateString("sv-SE", { day: "numeric", month: "long" })}`;
  return (
    <div className={`rounded-xl border p-4 sm:p-6 space-y-4 ${f.winner ? "bg-gradient-to-b from-[#2a2111] to-[#111] border-amber-300/40" : "bg-[#111] border-amber-300/20"}`}>
      <div className="text-center">
        <p className="text-[10px] tracking-[0.3em] text-white/45">SLUTSPEL · {status.toUpperCase()}</p>
        <p className="text-2xl sm:text-3xl font-bold tracking-[0.12em] text-amber-300" style={{ fontFamily: "'Oswald', sans-serif" }}>{title}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2">
        {side(left, 0)}
        <div className="relative flex items-center">
          <span className="hidden sm:block absolute right-full w-6 h-px bg-amber-300/40" />
          <img src={TROPHY} alt="Pokalen" className="h-40 sm:h-52 w-auto object-contain mix-blend-lighten" />
          <span className="hidden sm:block absolute left-full w-6 h-px bg-amber-300/40" />
        </div>
        {side(right, 1)}
      </div>
      <p className="text-center text-[11px] text-white/45">
        {f.started ? `vunna matcher${f.series.ties ? ` · ${f.series.ties} oavgjord${f.series.ties === 1 ? "" : "a"}` : ""}` : "Finalserien har inte börjat – lagen är seedade efter grundserien."}
      </p>
      {f.series.matches.length > 0 && (
        <div className="rounded-lg bg-white/[0.03] divide-y divide-white/5">
          {f.series.matches.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
              <span className="text-white/45 tracking-wider w-16">MATCH {i + 1}</span>
              <span className="text-white/40 flex-1">{new Date(m.date).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}</span>
              <span className="tabular-nums font-semibold">
                <span style={{ color: m[left] > m[right] ? teamColor(left) : undefined }} className={m[left] > m[right] ? "" : "text-white/60"}>{m[left]}</span>
                <span className="text-white/40 px-1">–</span>
                <span style={{ color: m[right] > m[left] ? teamColor(right) : undefined }} className={m[right] > m[left] ? "" : "text-white/60"}>{m[right]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {f.winner && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => setShowChampions(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#1a1408] bg-gradient-to-b from-[#f6e7bf] to-[#c9a44c]">
            🏆 Mästarbild
          </button>
          <span className="text-[11px] text-white/45">{f.champions.length} spelare med minst {f.minMatches} matcher för {teamName(f.winner)}</span>
        </div>
      )}
      {auth.isAdmin && (
        <div className="border-t border-white/5 pt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {f.winner ? (
            <button disabled={setWinner.isPending} onClick={() => { if (confirm("Ångra att finalen är avgjord?")) setWinner.mutate({ season: f.season, winner: null }); }} className="px-3 py-1.5 rounded-lg border border-white/15 text-white/60">Ångra avgjord</button>
          ) : (
            <>
              <span className="text-white/40">Avsluta finalen – vinnare:</span>
              {([left, right] as Side[]).map((t) => (
                <button key={t} disabled={setWinner.isPending} onClick={() => { if (confirm(`Markera ${teamName(t)} som mästare ${f.season}?`)) setWinner.mutate({ season: f.season, winner: t }); }}
                  className={`px-3 py-1.5 rounded-lg border ${t === leader ? "border-amber-300/60 text-amber-200" : "border-white/15 text-white/70"}`}>{teamName(t)}</button>
              ))}
            </>
          )}
        </div>
      )}
      {showChampions && f.winner && (
        <ShareImageModal
          title={`Mästare ${f.season}`}
          fileName={`mastare-${f.season.replace("/", "-")}`}
          backgrounds={false}
          onClose={() => setShowChampions(false)}
          build={({ format }) => renderChampions({
            season: f.season, format, minMatches: f.minMatches,
            team: { name: teamName(f.winner!), logo: logoOf(f.winner!), color: teamColor(f.winner!) },
            line: [f.started ? `Finalen ${f.series[f.winner!]}–${f.series[f.winner === "white" ? "green" : "white"]}` : "", `${f.seasonPoints[f.winner!]} p i serien`].filter(Boolean).join(" · "),
            players: f.champions.map((p) => ({ name: p.name, number: p.number })),
          })}
        />
      )}
    </div>
  );
}

export function StandingsSection({ input, playoff, season }: { input: Input; playoff: boolean; season: boolean }) {
  const q = trpc.scoreStats.standings.useQuery(input ?? {});
  const fq = trpc.scoreStats.final.useQuery(undefined, { enabled: playoff || season });
  if (q.isLoading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-white/40" /></div>;
  return (
    <div className="space-y-6">
      {!playoff && q.data && (
        <StatSection title="Tabellen" icon={<Trophy size={14} className="text-amber-300" />} hint="GP = matcher, W/L/T = vinster/förluster/oavgjorda, GF/GA = gjorda/insläppta mål, +/- = målskillnad, P = poäng (2 för vinst, 1 för oavgjort).">
          <StandingsTable rows={q.data.rows} />
        </StatSection>
      )}
      {(playoff || season) && fq.data && (
        <StatSection title="Finalen" icon={<Trophy size={14} className="text-amber-300" />} hint="Ettan i grundserien möter tvåan. Matchserie – flest vunna matcher. Admin markerar när finalen är avgjord.">
          <FinalBracket f={fq.data} />
        </StatSection>
      )}
    </div>
  );
}
