/**
 * Statistik → Lag: serietabellen (NHL-stil, 2 p vinst och 1 p oavgjort) och,
 * i slutspelet, finalen mellan Vita och Gröna som matchserie med pokalen.
 */
import { Loader2, Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { teamColor, teamName } from "@shared/teams";
import { seasonShort, type StandingRow } from "@shared/standings";
import { IMAGES } from "@/lib/scoreConstants";
import { renderFinal, TROPHY } from "@/lib/statsImages";
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

type Series = { white: number; green: number; ties: number; leader: "white" | "green" | null; matches: Array<{ date: string; white: number; green: number }> };

function FinalCard({ series, title }: { series: Series; title: string }) {
  const team = (t: "white" | "green") => ({ name: teamName(t), logo: logoOf(t), color: teamColor(t), wins: series[t] });
  useShareImage((format) => renderFinal({ title, white: team("white"), green: team("green"), ties: series.ties, matches: series.matches, format }), [series, title]);
  const side = (t: "white" | "green") => {
    const lead = series.leader === t || !series.leader;
    return (
      <div className={`flex flex-col items-center gap-1.5 ${lead ? "" : "opacity-55"}`}>
        <img src={logoOf(t)} alt={teamName(t)} className="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
        <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: teamColor(t) }}>{teamName(t)}</span>
        <span className="text-4xl sm:text-5xl font-bold tabular-nums text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>{series[t]}</span>
      </div>
    );
  };
  return (
    <div className="rounded-xl bg-[#111] border border-amber-300/20 p-4 sm:p-6 space-y-4">
      <div className="text-center">
        <p className="text-[10px] tracking-[0.3em] text-white/45">SLUTSPEL</p>
        <p className="text-2xl sm:text-3xl font-bold tracking-[0.12em] text-amber-300" style={{ fontFamily: "'Oswald', sans-serif" }}>{title}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {side("white")}
        <img src={TROPHY} alt="Pokalen" className="h-40 sm:h-52 w-auto object-contain mix-blend-lighten" />
        {side("green")}
      </div>
      <p className="text-center text-[11px] text-white/45">vunna matcher{series.ties ? ` · ${series.ties} oavgjord${series.ties === 1 ? "" : "a"}` : ""}</p>
      {series.matches.length > 0 && (
        <div className="rounded-lg bg-white/[0.03] divide-y divide-white/5">
          {series.matches.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
              <span className="text-white/45 tracking-wider w-16">MATCH {i + 1}</span>
              <span className="text-white/40 flex-1">{new Date(m.date).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}</span>
              <span className="tabular-nums font-semibold">
                <span style={{ color: m.white > m.green ? teamColor("white") : undefined }} className={m.white > m.green ? "" : "text-white/60"}>{m.white}</span>
                <span className="text-white/40 px-1">–</span>
                <span style={{ color: m.green > m.white ? teamColor("green") : undefined }} className={m.green > m.white ? "" : "text-white/60"}>{m.green}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StandingsSection({ input, playoff }: { input: Input; playoff: boolean }) {
  const q = trpc.scoreStats.standings.useQuery(input ?? {});
  if (q.isLoading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-white/40" /></div>;
  if (!q.data) return null;
  if (playoff) {
    const title = `FINAL ${seasonShort(input?.from ?? new Date().toISOString())}`;
    return (
      <StatSection title="Finalen" icon={<Trophy size={14} className="text-amber-300" />} hint="Matchserie mellan lagen i slutspelet – flest vunna matcher vinner.">
        {q.data.series.matches.length ? <FinalCard series={q.data.series} title={title} /> : <p className="text-xs text-white/40 py-3">Inga slutspelsmatcher än.</p>}
      </StatSection>
    );
  }
  return (
    <StatSection title="Tabellen" icon={<Trophy size={14} className="text-amber-300" />} hint="GP = matcher, W/L/T = vinster/förluster/oavgjorda, GF/GA = gjorda/insläppta mål, +/- = målskillnad, P = poäng (2 för vinst, 1 för oavgjort).">
      <StandingsTable rows={q.data.rows} />
    </StatSection>
  );
}
