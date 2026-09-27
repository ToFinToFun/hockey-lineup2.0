/**
 * Spelarprofil på spelarsidan: bild, form, sammanfattning, rekord, kemi
 * (kedjekamrater, lagkamrater, motståndare), matchlogg och jämförelse.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { FormStrip } from "@/components/PlayerCard";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { positionName } from "@/lib/players";

type Profile = inferRouterOutputs<AppRouter>["players"]["profile"];
type Mate = Profile["teammates"][number];
interface Basic { id: string; name: string; number: string; position: string; teamColor: string | null }

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}${d.getFullYear() !== new Date().getFullYear() ? ` -${String(d.getFullYear()).slice(2)}` : ""}`;
};
const pct = (w: number, m: number) => (m ? `${Math.round((w / m) * 100)}%` : "–");
const streakText = (s: Profile["records"]["currentStreak"]) =>
  !s ? "" : `${s.length} ${s.result === "V" ? (s.length === 1 ? "vinst" : "raka vinster") : s.result === "F" ? (s.length === 1 ? "förlust" : "raka förluster") : s.length === 1 ? "oavgjord" : "raka oavgjorda"}`;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1.5 text-center">
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-white/40">{label}</p>
      {sub && <p className="text-[9px] text-white/30">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/5 pt-3">
      <p className="text-xs font-semibold text-white/70">{title}</p>
      {hint && <p className="text-[10px] text-white/30 mb-1.5">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </section>
  );
}

function MateRow({ m }: { m: Mate }) {
  const color = m.winPct >= 60 ? "bg-emerald-500/70" : m.winPct >= 40 ? "bg-white/30" : "bg-red-500/60";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-32 min-w-0 truncate text-white/80">{m.name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${m.winPct}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums text-white/80">{m.winPct}%</span>
      <span className="w-16 text-right tabular-nums text-white/35">{m.wins}-{m.draws}-{m.losses}</span>
    </div>
  );
}

/** Bäst/sämst bland dem med tillräckligt många matcher tillsammans. */
function bestWorst(list: Mate[], min: number, n: number) {
  const enough = list.filter((m) => m.matches >= min);
  const byPct = [...enough].sort((a, b) => b.winPct - a.winPct || b.matches - a.matches);
  const best = byPct.slice(0, n);
  const worst = byPct.slice(-n).reverse().filter((m) => !best.includes(m));
  return { best, worst, enough: enough.length };
}

export function PlayerProfileView({ player, all }: { player: Basic; all: Basic[] }) {
  const profile = trpc.players.profile.useQuery({ id: player.id });
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [compareId, setCompareId] = useState("");
  const compare = trpc.players.profile.useQuery({ id: compareId }, { enabled: !!compareId });
  const others = useMemo(() => all.filter((p) => p.id !== player.id).sort((a, b) => a.name.localeCompare(b.name, "sv")), [all, player.id]);

  if (profile.isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  if (profile.error || !profile.data) return <p className="text-xs text-red-300">Profilen kunde inte hämtas: {profile.error?.message}</p>;
  const p = profile.data;
  const t = p.totals;
  const points = t.goals + t.assists;
  const lines = bestWorst(p.linemates, 2, 3);
  const mates = bestWorst(p.teammates, 3, 3);
  const opps = bestWorst(p.opponents, 3, 3);
  const log = showAllMatches ? p.matchLog : p.matchLog.slice(0, 10);
  const other = compareId ? others.find((o) => o.id === compareId) : null;

  return (
    <div className="space-y-3">
      {/* Huvud: bild, namn, form */}
      <div className="flex gap-3 items-start">
        <PlayerPhoto playerId={player.id} width={72} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold truncate">{player.name}{player.number ? <span className="text-white/40 font-normal"> #{player.number}</span> : null}</p>
          <p className="text-[11px] text-white/45">
            {positionName(player.position)}
            {player.teamColor ? ` · ${player.teamColor === "green" ? "Gröna" : "Vita"}` : ""}
          </p>
          {p.form ? (
            <div className="mt-2 space-y-1">
              <FormStrip form={p.form} className="justify-start" />
              {p.records.currentStreak && <p className="text-[10px] text-white/40">Just nu: {streakText(p.records.currentStreak)}</p>}
            </div>
          ) : (
            <p className="text-[11px] text-white/30 mt-2 italic">Inga godkända matcher än</p>
          )}
        </div>
      </div>

      {t.matches > 0 && (
        <>
          {/* Sammanfattning totalt */}
          <div className="grid grid-cols-5 gap-1.5">
            <Stat label="Matcher" value={t.matches} />
            <Stat label="Mål" value={t.goals} />
            <Stat label="Assist" value={t.assists} />
            <Stat label="Poäng" value={points} sub={`${p.records.pointsPerMatch}/match`} />
            <Stat label="Vinst" value={pct(t.wins, t.matches)} sub={`${t.wins}-${t.draws}-${t.losses}`} />
          </div>

          {/* Rekord */}
          <Section title="Rekord">
            <div className="grid grid-cols-3 gap-1.5">
              <Stat
                label="Bästa match"
                value={p.records.bestMatch ? `${p.records.bestMatch.points} p` : "–"}
                sub={p.records.bestMatch ? `${p.records.bestMatch.goals}+${p.records.bestMatch.assists}, ${shortDate(p.records.bestMatch.date)}` : undefined}
              />
              <Stat label="Längsta vinstsvit" value={p.records.longestWinStreak} />
              <Stat label="Längst obesegrad" value={p.records.longestUnbeaten} sub="matcher i rad" />
            </div>
          </Section>

          {/* Kemi */}
          <Section title="Kemi" hint="Vinstprocent tillsammans. Stapeln: grön ≥ 60 %, röd < 40 %. V-O-F till höger.">
            <div className="space-y-3">
              {lines.enough > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-white/45 uppercase tracking-wider">{player.position === "MV" ? "Lagkamrater (målvakt)" : "Samma kedja / backpar"} – minst 2 matcher</p>
                  {[...lines.best, ...lines.worst].map((m) => <MateRow key={m.id} m={m} />)}
                </div>
              )}
              {mates.enough > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-white/45 uppercase tracking-wider">Bäst med i laget – minst 3 matcher</p>
                  {mates.best.map((m) => <MateRow key={m.id} m={m} />)}
                  {mates.worst.length > 0 && <p className="text-[10px] text-white/45 uppercase tracking-wider pt-1">Svårast med</p>}
                  {mates.worst.map((m) => <MateRow key={m.id} m={m} />)}
                </div>
              )}
              {opps.enough > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-white/45 uppercase tracking-wider">Vinner oftast mot – minst 3 matcher</p>
                  {opps.best.map((m) => <MateRow key={m.id} m={m} />)}
                  {opps.worst.length > 0 && <p className="text-[10px] text-white/45 uppercase tracking-wider pt-1">Svårast mot</p>}
                  {opps.worst.map((m) => <MateRow key={m.id} m={m} />)}
                </div>
              )}
              {lines.enough + mates.enough + opps.enough === 0 && <p className="text-[11px] text-white/30">För få matcher tillsammans med någon än.</p>}
            </div>
          </Section>

          {/* Matchlogg */}
          <Section title={`Matchlogg (${p.matchLog.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-white/80">
                <thead className="text-white/40">
                  <tr>
                    <th className="text-left font-normal py-1">Datum</th>
                    <th className="text-left font-normal">Lag</th>
                    <th className="text-left font-normal">Pos</th>
                    <th className="text-right font-normal">Resultat</th>
                    <th className="text-right font-normal">Mål</th>
                    <th className="text-right font-normal">Ass</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr key={e.matchId} className="border-t border-white/5">
                      <td className="py-1 tabular-nums">{shortDate(e.date)}</td>
                      <td><span className={`inline-block w-2 h-2 rounded-full mr-1 ${e.team === "green" ? "bg-emerald-400" : "bg-white"}`} />{e.team === "green" ? "Gröna" : "Vita"}</td>
                      <td title={positionName(e.position)}>{e.position}</td>
                      <td className="text-right tabular-nums">
                        <span className={`inline-block w-4 text-center rounded-[3px] mr-1 text-[9px] font-black ${e.result === "V" ? "bg-emerald-500/80 text-emerald-950" : e.result === "F" ? "bg-red-500/75 text-red-950" : "bg-white/25"}`}>{e.result}</span>
                        {e.own}–{e.opp}
                      </td>
                      <td className="text-right tabular-nums">{e.goals || ""}</td>
                      <td className="text-right tabular-nums">{e.assists || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.matchLog.length > 10 && (
              <button onClick={() => setShowAllMatches((v) => !v)} className="mt-1 text-[11px] text-sky-300/80 hover:text-sky-200">
                {showAllMatches ? "Visa färre" : `Visa alla ${p.matchLog.length}`}
              </button>
            )}
          </Section>
        </>
      )}

      {/* Jämför */}
      <Section title="Jämför med">
        <select
          value={compareId}
          onChange={(e) => setCompareId(e.target.value)}
          className="w-full bg-[#111] border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white"
        >
          <option value="">Välj spelare …</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}{o.number ? ` #${o.number}` : ""}</option>)}
        </select>
        {compareId && compare.isLoading && <Loader2 className="animate-spin text-white/40 mt-2" />}
        {other && compare.data && (
          <CompareTable a={{ name: player.name, p }} b={{ id: other.id, name: other.name, p: compare.data }} />
        )}
      </Section>
    </div>
  );
}

function CompareTable({ a, b }: { a: { name: string; p: Profile }; b: { id: string; name: string; p: Profile } }) {
  const row = (label: string, va: number, vb: number, fmt: (v: number) => string = String, higherIsBetter = true) => {
    const better = va === vb ? 0 : (va > vb) === higherIsBetter ? -1 : 1;
    return (
      <tr key={label} className="border-t border-white/5">
        <td className={`py-1 text-right tabular-nums ${better === -1 ? "text-emerald-300 font-semibold" : ""}`}>{fmt(va)}</td>
        <td className="text-center text-white/40 px-2">{label}</td>
        <td className={`tabular-nums ${better === 1 ? "text-emerald-300 font-semibold" : ""}`}>{fmt(vb)}</td>
      </tr>
    );
  };
  const winPct = (p: Profile) => (p.totals.matches ? Math.round((p.totals.wins / p.totals.matches) * 100) : 0);
  // Tillsammans i samma lag, och mot varandra (ur a:s perspektiv)
  const together = a.p.teammates.find((m) => m.id === b.id);
  const against = a.p.opponents.find((m) => m.id === b.id);
  return (
    <div className="mt-2">
      <table className="w-full text-[11px] text-white/80">
        <thead>
          <tr className="text-white/60">
            <th className="text-right font-semibold py-1 truncate max-w-0 w-[40%]">{a.name}</th>
            <th />
            <th className="text-left font-semibold truncate max-w-0 w-[40%]">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {row("Matcher", a.p.totals.matches, b.p.totals.matches)}
          {row("Mål", a.p.totals.goals, b.p.totals.goals)}
          {row("Assist", a.p.totals.assists, b.p.totals.assists)}
          {row("Poäng/match", a.p.records.pointsPerMatch, b.p.records.pointsPerMatch)}
          {row("Vinst %", winPct(a.p), winPct(b.p), (v) => `${v}%`)}
          {row("Längsta vinstsvit", a.p.records.longestWinStreak, b.p.records.longestWinStreak)}
          <tr className="border-t border-white/5">
            <td className="py-1"><FormStrip form={a.p.form} size="xs" /></td>
            <td className="text-center text-white/40 px-2">Form</td>
            <td><FormStrip form={b.p.form} size="xs" className="justify-start" /></td>
          </tr>
        </tbody>
      </table>
      {together && (
        <p className="text-[10px] text-white/40 mt-1.5">
          I samma lag: {together.matches} matcher, {together.winPct}% vinster ({together.wins}-{together.draws}-{together.losses}).
        </p>
      )}
      {against && (
        <p className="text-[10px] text-white/40">
          Mot varandra: {a.name} har {against.wins}-{against.draws}-{against.losses} på {against.matches} matcher.
        </p>
      )}
    </div>
  );
}
