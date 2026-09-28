/**
 * PIR under Inställningar – styrelsens verktyg för Player Impact Rating.
 *
 * 1. Så fungerar PIR (kort förklaring).
 * 2. Träffsäkerhet: hur bra prediktionen hade varit bakåt i tiden.
 * 3. Spelare: alla betyg, förklaring och utveckling per spelare, manuell justering.
 * 4. Vikter: hur mycket mål, assist och målvaktsinsatser väger, med förslag
 *    från analysen som styrelsen kan godkänna.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Target, SlidersHorizontal, Users, Sparkles, Info, X } from "lucide-react";

const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)} %`);
const num = (v: number | null | undefined, d = 3) => (v == null ? "–" : v.toFixed(d).replace(".", ","));

type Weights = { goal: number; assist: number; goalkeeper: number; halfLifeDays: number };
const WEIGHT_FIELDS: Array<{ key: keyof Weights; label: string; hint: string; step: number }> = [
  { key: "goal", label: "Mål", hint: "Bonus per mål", step: 1 },
  { key: "assist", label: "Assist", hint: "Bonus per assist", step: 1 },
  { key: "goalkeeper", label: "Målvakt", hint: "Per mål färre/fler insläppta än snittet", step: 1 },
  { key: "halfLifeDays", label: "Halveringstid (dagar)", hint: "Hur snabbt gamla matcher tappar vikt", step: 15 },
];

function Card({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white">
        <Icon size={16} className="text-[#0a7ea4]" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111] rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

export function PirPanel() {
  const utils = trpc.useUtils();
  const config = trpc.pir.getConfig.useQuery();
  const analysis = trpc.pir.analysis.useQuery({ withSuggestion: false });
  const [wantSuggestion, setWantSuggestion] = useState(false);
  const suggestion = trpc.pir.analysis.useQuery({ withSuggestion: true }, { enabled: wantSuggestion, staleTime: 60_000 });
  const ratings = trpc.pir.getRatings.useQuery();

  const [weights, setWeights] = useState<Weights | null>(null);
  useEffect(() => {
    if (config.data && !weights) setWeights(config.data.weights);
  }, [config.data, weights]);

  const refreshAll = () => {
    utils.pir.invalidate();
    setWantSuggestion(false);
  };
  const saveWeights = trpc.pir.setWeights.useMutation({
    onSuccess: () => {
      toast.success("Vikterna sparade – PIR räknas om");
      refreshAll();
    },
  });
  const setAdjustment = trpc.pir.setAdjustment.useMutation({
    onSuccess: () => {
      utils.pir.getRatings.invalidate();
      utils.pir.getConfig.invalidate();
    },
  });

  const m = analysis.data?.current.metrics;
  const teamOnly = analysis.data?.teamOnly;
  const s = suggestion.data?.suggestion;
  const dirty = weights && config.data && JSON.stringify(weights) !== JSON.stringify(config.data.weights);

  const [explainId, setExplainId] = useState<{ key: string; name: string } | null>(null);
  const players = useMemo(
    () => [...(ratings.data ?? [])].sort((a, b) => b.rating - a.rating),
    [ratings.data]
  );

  return (
    <div className="space-y-4 pb-8">
      <Card icon={Info} title="Så fungerar PIR">
        <ul className="text-xs text-white/60 space-y-1.5 list-disc pl-4">
          <li>Alla börjar på <b className="text-white/80">1000</b> (snittet). Betyget ändras efter varje godkänd match utifrån om laget vann, hur starkt det egna och motståndarlaget var, och spelarens egna mål, assist eller målvaktsinsats.</li>
          <li>Nyare matcher väger mer än gamla (halveringstid under Vikter). Utespelare och målvakter får separata betyg.</li>
          <li>Ett betyg visas först efter <b className="text-white/80">3 matcher</b> i rollen; före det räknas spelaren som 1000 i prediktion och Auto.</li>
          <li>Formpilen jämför de senaste matcherna med betyget över tid.</li>
          <li>Har en spelare bytt lag i sista stund räknas hen till det lag målen gjordes för.</li>
        </ul>
        <p className="text-[11px] text-white/40">Tryck på en spelare nedan för att se varför betyget är som det är och hur det utvecklats.</p>
      </Card>

      <Card icon={Target} title="Träffsäkerhet">
        {analysis.isLoading ? (
          <Loader2 className="animate-spin text-white/40" />
        ) : !m || m.matches === 0 ? (
          <p className="text-white/50 text-sm">
            För få matcher med uppställning ännu. Analysen kräver minst 6 godkända matcher.
          </p>
        ) : (
          <>
            <p className="text-white/50 text-xs">
              Varje match har förutsagts med bara det som var känt före matchen. {m.matches} matcher analyserade.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Rätt vinnare" value={pct(m.hitRate)} sub="avgjorda matcher" />
              <Metric label="Brier-poäng" value={num(m.brier)} sub="lägre är bättre · 50/50 = 0,250" />
              <Metric label="Endast lagresultat" value={num(teamOnly?.brier)} sub={`rätt vinnare ${pct(teamOnly?.hitRate)}`} />
              <Metric label="Spelare med historik" value={pct(m.coverage)} sub="i snitt per match" />
            </div>
            {m.calibration.some((c) => c.count > 0) && (
              <div className="text-xs">
                <p className="text-white/40 mb-1">Kalibrering – när favoriten gavs X % chans, hur ofta vann den?</p>
                <div className="grid grid-cols-4 gap-1 text-white/70">
                  {m.calibration.map((c) => (
                    <div key={c.range} className="bg-[#111] rounded-lg p-2 text-center">
                      <p className="text-[10px] text-white/40">{c.range}</p>
                      <p className="font-semibold">{c.count ? pct(c.actual) : "–"}</p>
                      <p className="text-[10px] text-white/30">{c.count} st</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Card icon={SlidersHorizontal} title="Vikter">
        <p className="text-white/50 text-xs">
          Lagresultatet är grunden. Individuella insatser ger en bonus ovanpå, som jämnas ut inom varje match så
          att snittet stannar kring 1000.
        </p>
        {weights && (
          <div className="grid grid-cols-2 gap-2">
            {WEIGHT_FIELDS.map((f) => (
              <label key={f.key} className="bg-[#111] rounded-xl p-3 block">
                <span className="text-xs font-semibold text-white">{f.label}</span>
                <span className="block text-[10px] text-white/40 mb-1">{f.hint}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={f.step}
                  value={weights[f.key]}
                  onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })}
                  className="w-full bg-[#1f1f1f] border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm"
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!dirty || saveWeights.isPending}
            onClick={() => weights && saveWeights.mutate(weights)}
            className="px-4 py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40"
          >
            Spara vikter
          </button>
          <button
            onClick={() => setWantSuggestion(true)}
            disabled={suggestion.isFetching}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {suggestion.isFetching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {suggestion.isFetching ? "Provar olika vikter …" : "Ta fram förslag"}
          </button>
        </div>

        {s && (
          <div className={`rounded-xl p-3 border ${s.recommended ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 bg-[#111]"}`}>
            <p className="text-xs text-white/70 mb-2">{s.reason}</p>
            <div className="grid grid-cols-4 gap-1 text-center text-xs mb-2">
              {WEIGHT_FIELDS.map((f) => (
                <div key={f.key}>
                  <p className="text-[10px] text-white/40">{f.label.split(" ")[0]}</p>
                  <p className="font-semibold text-white">{s.weights[f.key]}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/50 mb-2">
              Brier {num(s.metrics.brier)} (nu {num(m?.brier)}) · rätt vinnare {pct(s.metrics.hitRate)} (nu {pct(m?.hitRate)})
            </p>
            {s.recommended && <button
              onClick={() => {
                setWeights(s.weights);
                saveWeights.mutate(s.weights);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold"
            >
              Använd förslaget
            </button>}
          </div>
        )}
      </Card>

      <Card icon={Users} title="Spelare">
        <p className="text-white/50 text-xs">
          Justering läggs ovanpå det beräknade värdet, t.ex. +50 för en ny spelare som ni vet är stark. 0 tar bort
          justeringen.
        </p>
        {ratings.isLoading ? (
          <Loader2 className="animate-spin text-white/40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-white/40 text-[10px] uppercase">
                <tr>
                  <th className="text-left py-1">Spelare</th>
                  <th className="text-right">PIR</th>
                  <th className="text-right">Ute</th>
                  <th className="text-right">MV</th>
                  <th className="text-right">M</th>
                  <th className="text-right w-20">Justering</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.playerKey} className="border-t border-white/5 text-white/80">
                    <td className="py-1.5 pr-2">
                      <button onClick={() => setExplainId({ key: p.playerKey, name: p.name })} className="text-left hover:text-sky-300 underline-offset-2 hover:underline">
                        {p.name}
                      </button>
                    </td>
                    <td className={`text-right font-semibold ${p.matchesPlayed < 3 ? "text-white/30" : ""}`}>{p.rating}</td>
                    <td className="text-right">{p.outfieldRating ?? "–"}</td>
                    <td className="text-right">{p.goalkeeperRating ?? "–"}</td>
                    <td className="text-right">{p.matchesPlayed}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        inputMode="numeric"
                        defaultValue={p.adjustment || ""}
                        placeholder="0"
                        onBlur={(e) => {
                          const value = Math.round(Number(e.target.value) || 0);
                          if (value !== (p.adjustment || 0)) setAdjustment.mutate({ playerKey: p.playerKey, value });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-16 bg-[#111] border border-white/10 rounded px-1.5 py-1 text-right text-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-white/30 mt-2">Grått PIR = färre än 3 matcher (räknas som 1000 i prediktion och fördelning).</p>
          </div>
        )}
      </Card>
      {explainId && <PirExplain playerKey={explainId.key} name={explainId.name} onClose={() => setExplainId(null)} />}
    </div>
  );
}

/** Förklaring och utveckling för en spelare. */
function PirExplain({ playerKey, name, onClose }: { playerKey: string; name: string; onClose: () => void }) {
  const q = trpc.pir.explain.useQuery({ id: playerKey });
  const e = q.data;
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
  const parts = e
    ? [
        { label: "Lagresultat", hint: "vinster/förluster mot lagens styrka", value: e.teamOnlyRating - 1000, color: "bg-sky-400" },
        { label: "Egna insatser", hint: "mål, assist, målvaktsinsats", value: e.individual, color: "bg-emerald-400" },
        { label: "Manuell justering", hint: "satt av styrelsen", value: e.adjustment, color: "bg-amber-400" },
      ]
    : [];
  const maxAbs = Math.max(1, ...parts.map((p) => Math.abs(p.value)));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-[#161616] border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{name}</h3>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>
        ) : !e ? (
          <p className="text-sm text-white/50">Ingen PIR-data för spelaren.</p>
        ) : (
          <>
            <div>
              <p className="text-[11px] text-white/40 mb-2">Varför {e.rating}? 1000 är startvärdet.</p>
              <div className="space-y-2">
                {parts.map((p) => (
                  <div key={p.label} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2 text-xs">
                    <div>
                      <p className="text-white/80">{p.label}</p>
                      <p className="text-[10px] text-white/35">{p.hint}</p>
                    </div>
                    <div className="relative h-2.5 bg-white/[0.06] rounded-full">
                      <div className="absolute top-0 bottom-0 w-px bg-white/30 left-1/2" />
                      <div
                        className={`absolute top-0 bottom-0 rounded-full ${p.color}`}
                        style={p.value >= 0
                          ? { left: "50%", width: `${(Math.abs(p.value) / maxAbs) * 50}%` }
                          : { right: "50%", width: `${(Math.abs(p.value) / maxAbs) * 50}%` }}
                      />
                    </div>
                    <p className={`text-right tabular-nums font-semibold ${p.value > 0 ? "text-emerald-300" : p.value < 0 ? "text-red-300" : "text-white/40"}`}>{signed(p.value)}</p>
                  </div>
                ))}
                <p className="text-right text-xs text-white/60 tabular-nums">= {e.rating}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-white/40 mb-1">Utveckling – betyget efter var och en av de senaste {e.history.length} matcherna</p>
              <PirHistoryChart history={e.history} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PirHistoryChart({ history }: { history: Array<{ date: string; rating: number; result: "V" | "O" | "F" }> }) {
  if (history.length < 2) return <p className="text-xs text-white/40">För få matcher för en kurva.</p>;
  const W = 440, H = 150, pad = 26;
  const vals = history.map((h) => h.rating);
  const min = Math.min(...vals, 1000) - 10;
  const max = Math.max(...vals, 1000) + 10;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (history.length - 1);
  const y = (v: number) => H - pad - ((v - min) * (H - pad * 2)) / (max - min);
  const path = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.rating).toFixed(1)}`).join(" ");
  const color = { V: "#34d399", O: "#9ca3af", F: "#f87171" };
  const d = (iso: string) => { const t = new Date(iso); return `${t.getDate()}/${t.getMonth() + 1}`; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="PIR över tid">
      <line x1={pad} x2={W - pad} y1={y(1000)} y2={y(1000)} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      <text x={W - pad} y={y(1000) - 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">1000</text>
      <path d={path} fill="none" stroke="#38bdf8" strokeWidth="2" />
      {history.map((h, i) => (
        <circle key={i} cx={x(i)} cy={y(h.rating)} r="3.5" fill={color[h.result]}>
          <title>{`${d(h.date)}: ${h.rating} (${h.result === "V" ? "vinst" : h.result === "F" ? "förlust" : "oavgjort"})`}</title>
        </circle>
      ))}
      <text x={pad} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.35)">{d(history[0].date)}</text>
      <text x={W - pad} y={H - 6} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">{d(history[history.length - 1].date)}</text>
      <text x={x(history.length - 1)} y={y(vals[vals.length - 1]) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="#e2e8f0">{vals[vals.length - 1]}</text>
    </svg>
  );
}
