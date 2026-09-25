/**
 * PirTab – styrelsens verktyg för PIR (Player Impact Rating).
 *
 * 1. Träffsäkerhet: hur bra prediktionen hade varit bakåt i tiden.
 * 2. Vikter: hur mycket mål, assist och målvaktsinsatser väger, med förslag
 *    från analysen som styrelsen kan godkänna.
 * 3. Spelare: alla betyg, med manuell justering per spelare.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Target, SlidersHorizontal, Users, Sparkles } from "lucide-react";

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

export default function PirTab() {
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

  const players = useMemo(
    () => [...(ratings.data ?? [])].sort((a, b) => b.rating - a.rating),
    [ratings.data]
  );

  return (
    <div className="space-y-4 pb-8">
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
            <button
              onClick={() => {
                setWeights(s.weights);
                saveWeights.mutate(s.weights);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold"
            >
              Använd förslaget
            </button>
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
                    <td className="py-1.5 pr-2">{p.playerKey}</td>
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
    </div>
  );
}
