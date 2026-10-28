/**
 * PIR över tid: linje med betyget efter var och en av spelarens matcher.
 * Punkterna färgas efter resultat; preliminära punkter (före tredje matchen i
 * rollen) är ihåliga. Tryck på en punkt för datum, resultat och betyg.
 * Utespelare och målvakt visas var för sig med växling om spelaren har båda.
 */
import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type History = NonNullable<inferRouterOutputs<AppRouter>["pir"]["history"]>;
type Point = History["outfield"][number];
type Role = "outfield" | "goalkeeper";

const RESULT = {
  V: { color: "#34d399", text: "Vinst" },
  O: { color: "#9ca3af", text: "Oavgjort" },
  F: { color: "#f87171", text: "Förlust" },
} as const;

const shortDate = (iso: string) => {
  const t = new Date(iso);
  return `${t.getDate()}/${t.getMonth() + 1}`;
};
const longDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });

export function PirHistoryChart({ history, initialRole }: { history: History; initialRole?: Role }) {
  const roles = (["outfield", "goalkeeper"] as const).filter((r) => history[r].length > 0);
  const [role, setRole] = useState<Role>(initialRole && history[initialRole].length ? initialRole : roles[0] ?? "outfield");
  const points: Point[] = history[role] ?? [];
  const [sel, setSel] = useState<number>(points.length - 1);
  useEffect(() => setSel(points.length - 1), [role, points.length]);

  const geo = useMemo(() => {
    const W = 440, H = 160, padL = 34, padR = 14, padT = 14, padB = 22;
    const vals = points.map((p) => p.rating);
    let min = Math.min(...vals, 1000), max = Math.max(...vals, 1000);
    const span = Math.max(max - min, 30);
    min = Math.floor((min - span * 0.12) / 10) * 10;
    max = Math.ceil((max + span * 0.12) / 10) * 10;
    const x = (i: number) => (points.length === 1 ? (W + padL - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1));
    const y = (v: number) => padT + ((max - v) * (H - padT - padB)) / (max - min);
    return { W, H, padL, padR, padB, min, max, x, y };
  }, [points]);

  if (roles.length === 0) return <p className="text-[11px] text-white/30">Ingen matchhistorik än.</p>;

  const { W, H, padL, padR, padB, min, max, x, y } = geo;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
  const cur = points[Math.min(Math.max(sel, 0), points.length - 1)];
  const first = points[0], last = points[points.length - 1];
  const change = last.rating - first.rating;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[10px] text-white/40">
          Utveckling · {points.length} {points.length === 1 ? "match" : "matcher"}
          {points.length > 1 && (
            <span className={change > 0 ? "text-emerald-300/80" : change < 0 ? "text-red-300/80" : ""}>
              {" "}· {change > 0 ? "+" : ""}{change} sedan {shortDate(first.date)}
            </span>
          )}
        </p>
        {roles.length > 1 && (
          <div className="flex rounded-md border border-white/10 overflow-hidden text-[10px]" role="tablist" aria-label="Roll">
            {roles.map((r) => (
              <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}
                className={`px-2 py-0.5 ${role === r ? "bg-white/15 text-white" : "text-white/45"}`}>
                {r === "outfield" ? "Ute" : "Målvakt"}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
        aria-label={`PIR över tid som ${role === "outfield" ? "utespelare" : "målvakt"}: från ${first.rating} till ${last.rating}`}>
        {/* Skala */}
        {[max, min].map((v) => (
          <text key={v} x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">{v}</text>
        ))}
        <line x1={padL} x2={W - padR} y1={y(1000)} y2={y(1000)} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
        {1000 !== max && 1000 !== min && (
          <text x={padL - 6} y={y(1000) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.45)">1000</text>
        )}
        {/* Vald punkt */}
        <line x1={x(sel)} x2={x(sel)} y1={y(max)} y2={H - padB} stroke="rgba(255,255,255,0.1)" />
        {points.length > 1 && <path d={path} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />}
        {points.map((p, i) => {
          const c = RESULT[p.result].color;
          return (
            <g key={`${p.matchId}-${i}`} onClick={() => setSel(i)} className="cursor-pointer">
              <circle cx={x(i)} cy={y(p.rating)} r="11" fill="transparent" />
              <circle cx={x(i)} cy={y(p.rating)} r={i === sel ? 5 : 3.5}
                fill={p.provisional ? "#0b0b0b" : c} stroke={c} strokeWidth={p.provisional ? 1.5 : i === sel ? 2 : 0} />
            </g>
          );
        })}
        <text x={padL} y={H - 6} fontSize="9" fill="rgba(255,255,255,0.3)">{shortDate(first.date)}</text>
        {points.length > 1 && <text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">{shortDate(last.date)}</text>}
      </svg>

      {cur && (
        <p className="text-[11px] text-white/60 tabular-nums mt-0.5">
          {longDate(cur.date)} · <span style={{ color: RESULT[cur.result].color }}>{RESULT[cur.result].text} {cur.score[0]}–{cur.score[1]}</span>
          {" "}· PIR <b className="text-white/85">{cur.rating}</b>
          {sel > 0 && (() => {
            const d = cur.rating - points[sel - 1].rating;
            return <span className={d > 0 ? "text-emerald-300/80" : d < 0 ? "text-red-300/80" : "text-white/40"}> ({d > 0 ? "+" : ""}{d})</span>;
          })()}
          {cur.provisional && <span className="text-white/35"> · preliminärt</span>}
        </p>
      )}
      <p className="text-[9px] text-white/30 mt-0.5 flex flex-wrap gap-x-2.5">
        {(["V", "O", "F"] as const).map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: RESULT[r].color }} />{RESULT[r].text}
          </span>
        ))}
        {points.some((p) => p.provisional) && (
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-white/50" />Preliminärt (före 3:e matchen)</span>
        )}
        <span>Tryck på en punkt för detaljer</span>
      </p>
    </div>
  );
}
