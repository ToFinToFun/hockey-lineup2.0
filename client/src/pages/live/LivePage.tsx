/**
 * /live – öppen för alla. Före matchen: lagen, tid, hall, nedräkning och
 * uppställningar (enligt publiceringsreglerna). Under matchen (när en inloggad
 * Score Tracker sänder): ställning, mål, poäng per spelare och tid kvar till
 * sluttid. Efter: resultatet i en halvtimme. Läktaren: hjärtan och kommentarer
 * (Inställningar → Live). Uppdateras var 4:e sekund.
 */
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { matchSides, type OpponentInfo, type SideInfo } from "@/lib/matchSides";
import type { MatchSetup } from "@shared/matchSetup";
import { isTeamAWhite } from "@shared/teams";
import { club } from "@shared/club";

type Side = "white" | "green";
interface P { id: string; name: string; number?: string; position?: string }
interface Goal { team: Side; timestamp: string; scorer?: string; scorerId?: string; assist?: string }

const WD = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
const posOf = (slot: string, p: P) => (slot.includes("-gk-") ? "MV" : slot.includes("-def-") ? "B" : slot.endsWith("-c") ? "C" : (p.position === "MV" ? "MV" : "F"));
const POS_ORDER: Record<string, number> = { MV: 0, B: 1, C: 2, F: 3 };
const POS_COLOR: Record<string, string> = { MV: "#fbbf24", B: "#60a5fa", C: "#c084fc", F: "#34d399" };

function eventStart(date?: string | null, time?: string | null): Date | null {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = time?.match(/^(\d{1,2}):(\d{2})/);
  return new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0);
}

function Heart({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" fill={color} />
    </svg>
  );
}

function TeamBadge({ side, big = true }: { side: SideInfo; big?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      {side.logo ? (
        <img src={side.logo} alt="" className={big ? "w-[76px] h-[76px] object-contain" : "w-9 h-9 object-contain"} />
      ) : (
        <div className={`${big ? "w-[76px] h-[76px] text-2xl" : "w-9 h-9 text-xs"} rounded-full flex items-center justify-center font-bold`} style={{ background: side.color, color: "#07100b" }}>
          {side.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
        </div>
      )}
      {big && <span className="font-oswald font-semibold text-lg tracking-[0.12em] text-center truncate max-w-full" style={{ color: side.color === "#ffffff" || side.color.toLowerCase() === "#fff" ? "#ffffff" : side.color }}>{side.name.toUpperCase()}</span>}
    </div>
  );
}

export default function LivePage() {
  const q = trpc.live.state.useQuery(undefined, { refetchInterval: 4_000, refetchOnWindowFocus: true });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const [tab, setTab] = useState<"goals" | "players" | "teams" | "laktaren">("goals");
  const d = q.data;
  // Styrelsen: avsluta sändningen / ta bort resultatet nu, med nedräkning till det sker automatiskt
  const { isAdmin } = useAuth();
  const adminEnd = trpc.live.adminEnd.useMutation({ onSuccess: () => void q.refetch() });
  const dismiss = trpc.live.dismiss.useMutation({ onSuccess: () => void q.refetch() });

  // ─── Lagen ───
  const lu = (d?.lineup ?? {}) as { setup?: MatchSetup; opponent?: (OpponentInfo & { players?: P[] }) | null; teamAName?: string; lineup?: Record<string, P>; view?: { mode: string; publishedAt?: string; publishAt?: string; showFrom?: string | null } };
  const sides = matchSides(lu.setup, lu.opponent ?? null, lu.teamAName);
  const aWhite = sides.external ? true : isTeamAWhite(lu.teamAName);
  const teamPlayers = useMemo(() => {
    const out: Record<Side, Array<P & { pos: string }>> = { white: [], green: [] };
    for (const [slot, p] of Object.entries(lu.lineup ?? {})) {
      const side: Side = slot.startsWith("team-a-") === aWhite ? "white" : "green";
      out[side].push({ ...p, pos: posOf(slot, p) });
    }
    // Motståndaren som lista
    if (sides.external && Array.isArray(lu.setup?.oppList) && lu.opponent?.players) {
      const ids = new Set(lu.setup!.oppList!.map((n) => `opp-${n}`));
      for (const p of lu.opponent.players) if (ids.has(p.id)) out.green.push({ ...p, pos: p.position || "F" });
    }
    for (const k of ["white", "green"] as Side[]) out[k].sort((a, b) => (POS_ORDER[a.pos] ?? 3) - (POS_ORDER[b.pos] ?? 3) || Number(a.number || 999) - Number(b.number || 999));
    return out;
  }, [lu.lineup, lu.setup, lu.opponent, aWhite, sides.external]);
  const lineupVisible = lu.view?.mode === "published" || lu.view?.mode === "live" || lu.view?.mode === "staff";

  // ─── Tider ───
  const start = eventStart(d?.event?.date, d?.event?.time);
  const live = d?.live ?? null;
  const goals = (live?.goals ?? []) as Goal[];
  const endAt = useMemo(() => {
    if (!live?.endTime) return null;
    const [h, m] = live.endTime.split(":").map(Number);
    const base = new Date(live.matchStartTime ?? live.startedAt);
    const e = new Date(base); e.setHours(h, m, 0, 0);
    if (e.getTime() < base.getTime() - 3600_000) e.setDate(e.getDate() + 1);
    return e;
  }, [live?.endTime, live?.matchStartTime, live?.startedAt]);
  const left = (t: Date | null) => (t ? Math.max(0, Math.floor((t.getTime() - now) / 1000)) : null);
  const toStart = left(start);
  const toEnd = left(endAt);
  const startForBar = live ? new Date(live.matchStartTime ?? live.startedAt) : null;
  const progress = endAt && startForBar ? Math.min(1, Math.max(0, (now - startForBar.getTime()) / (endAt.getTime() - startForBar.getTime()))) : 0;

  // ─── Poäng per spelare ───
  const playerRows = useMemo(() => {
    const m = new Map<string, { name: string; team: Side; g: number; a: number }>();
    const add = (name: string | undefined, team: Side, k: "g" | "a") => {
      if (!name?.trim()) return;
      const key = `${team}:${name.trim().toLowerCase()}`;
      const r = m.get(key) ?? { name: name.trim(), team, g: 0, a: 0 };
      r[k]++; m.set(key, r);
    };
    for (const g of goals) { add(g.scorer, g.team, "g"); add(g.assist, g.team, "a"); }
    return [...m.values()].sort((x, y) => y.g + y.a - (x.g + x.a) || y.g - x.g);
  }, [goals]);
  const goalies = (["white", "green"] as Side[]).flatMap((t) => teamPlayers[t].filter((p) => p.pos === "MV").map((p) => ({ ...p, team: t, ga: t === "white" ? live?.greenScore ?? 0 : live?.whiteScore ?? 0 })));

  // ─── Läktaren ───
  const utils = trpc.useUtils();
  const [name, setName] = useState(() => { try { return localStorage.getItem("laktaren_name") ?? ""; } catch { return ""; } });
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const comment = trpc.live.comment.useMutation({
    onSuccess: () => { setText(""); setErr(null); void utils.live.state.invalidate(); },
    onError: (e) => setErr(e.message),
  });
  const heart = trpc.live.heart.useMutation();
  const [floating, setFloating] = useState<Array<{ id: number; color: string; x: number }>>([]);
  const fid = useRef(0);
  const sendHeart = (team: Side) => {
    heart.mutate({ team });
    const id = ++fid.current;
    setFloating((f) => [...f.slice(-14), { id, color: sides[team].color, x: 10 + Math.random() * 70 }]);
    setTimeout(() => setFloating((f) => f.filter((h) => h.id !== id)), 1800);
  };

  const phase = d?.phase ?? "before";
  const isLive = phase === "live";
  const tabs: Array<[typeof tab, string]> = [["goals", "Mål"], ["players", "Spelare"], ["teams", "Lagen"], ...(d?.laktaren ? [["laktaren", "Läktaren"] as [typeof tab, string]] : [])];
  const fmtDate = start ? `${WD[start.getDay()]} ${start.getDate()}/${start.getMonth() + 1} · ${pad(start.getHours())}:${pad(start.getMinutes())}` : null;
  const textColor = (side: SideInfo) => (side.color.toLowerCase() === "#ffffff" || side.color.toLowerCase() === "#fff" ? "#ffffff" : side.color);

  return (
    <div className="live-arena min-h-[100dvh] text-[#eef3ef]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        .live-arena{background:linear-gradient(180deg,rgba(5,12,8,.55) 0%,rgba(5,12,8,.92) 380px,#07100b 620px),url(/images/background.jpg) center top/cover no-repeat,#07100b}
        .font-oswald{font-family:Oswald,sans-serif}
        @keyframes heartUp{0%{transform:translateY(0) scale(.8);opacity:0}15%{opacity:1}100%{transform:translateY(-220px) scale(1.2);opacity:0}}
      `}</style>
      <div className="max-w-[560px] mx-auto pb-10 relative">
        {isAdmin && d?.live && (d.phase === "live" || d.phase === "after") && (() => {
          const at = d.phase === "live" ? d.live.autoEndAt : d.live.removeAt;
          const left = at ? Math.max(0, Math.round((at - now) / 1000)) : null;
          const clock = left === null ? null : left >= 3600 ? `${Math.floor(left / 3600)} h ${pad(Math.floor((left % 3600) / 60))} min` : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
          return (
            <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-black/60 backdrop-blur px-3 py-2 text-[11px]">
              <span className="flex-1 text-[#e7d9b0]">
                {d.phase === "live"
                  ? <>Styrelsen · sändningen avslutas automatiskt {clock ? <>om <b className="font-oswald text-sm tracking-wide">{clock}</b></> : "senare"}</>
                  : <>Styrelsen · sändningen stängs {clock ? <>om <b className="font-oswald text-sm tracking-wide">{clock}</b></> : "senare"}</>}
              </span>
              {d.phase === "live" ? (
                <button disabled={adminEnd.isPending} onClick={() => { if (confirm("Avsluta livesändningen nu? Bara sändningen avslutas – matchen i Score Tracker och statistiken påverkas inte.")) adminEnd.mutate(); }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 font-semibold disabled:opacity-40">Avsluta nu</button>
              ) : (
                <button disabled={dismiss.isPending} onClick={() => { if (confirm("Stäng livesändningen nu? Slutställningen slutar visas på livesidan – statistiken påverkas inte.")) dismiss.mutate(); }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 font-semibold disabled:opacity-40">Stäng nu</button>
              )}
            </div>
          );
        })()}
        {/* Rubrik */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <div className="flex items-center gap-2">
            <img src={club().logo} alt="" className="w-7 h-7 object-contain" />
            <span className="font-oswald font-semibold text-[15px] tracking-[0.14em]">{club().name.toUpperCase()}</span>
          </div>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider bg-[#c81e3a] rounded-full px-2.5 py-1"><span className="w-[7px] h-[7px] rounded-full bg-white animate-pulse" />LIVE</span>
          ) : phase === "after" ? (
            <span className="text-[11px] font-bold tracking-wider bg-[#eef3ef] text-[#07100b] rounded-full px-2.5 py-1">SLUT</span>
          ) : (
            <span className="text-[11px] font-semibold tracking-wider text-[#a8b8ad] border border-white/20 rounded-full px-2.5 py-1">{toStart !== null && toStart <= 30 * 60 ? "SNART LIVE" : "NÄSTA MATCH"}</span>
          )}
        </div>
        {isLive && <div className="text-right px-5 text-[12px] text-[#a8b8ad]">{d?.watching ?? 0} tittar nu</div>}

        <div className="text-center mt-5 mb-4 font-oswald text-[13px] tracking-[0.3em]" style={{ color: phase === "before" ? "#7ee2a8" : "#a8b8ad" }}>
          {phase === "before" ? "MATCHDAG" : phase === "after" ? "SLUTRESULTAT" : ""}
        </div>

        {/* Lagen och ställning */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4">
          <TeamBadge side={sides.white} />
          {phase === "before" ? (
            <div className="font-oswald text-[22px] text-[#7d8e83] px-1.5">VS</div>
          ) : (
            <div className="flex items-center gap-2.5 font-oswald font-bold text-[64px] leading-none px-1">
              <span style={{ color: textColor(sides.white) }}>{live?.whiteScore ?? 0}</span>
              <span className="text-[#4b5c51] text-[40px]">–</span>
              <span style={{ color: textColor(sides.green) }}>{live?.greenScore ?? 0}</span>
            </div>
          )}
          <TeamBadge side={sides.green} />
        </div>
        {(fmtDate || d?.event?.location) && (
          <div className="flex justify-center flex-wrap gap-1.5 text-xs text-[#a8b8ad] mt-3.5 px-4 text-center">
            {fmtDate && <span>{fmtDate}</span>}{fmtDate && d?.event?.location && <span aria-hidden>·</span>}{d?.event?.location && <span>{d.event.location}</span>}
          </div>
        )}

        {/* Nedräkning före / tid kvar under */}
        {phase === "before" && toStart !== null && toStart > 0 && (
          <div className="mx-5 mt-6 rounded-2xl bg-white/5 border border-white/10 px-4 py-4 flex flex-col items-center gap-1.5">
            <span className="text-[11px] tracking-[0.18em] text-[#a8b8ad]">NEDSLÄPP OM</span>
            <div className="flex items-end gap-2.5 font-oswald">
              {toStart >= 86400 && <><div className="flex flex-col items-center"><span className="text-[46px] font-semibold leading-none">{Math.floor(toStart / 86400)}</span><span className="text-[10px] text-[#7d8e83] tracking-[0.12em]">DAGAR</span></div><span className="text-[40px] text-[#4b5c51] leading-[1.1]">:</span></>}
              {[[Math.floor((toStart % 86400) / 3600), "TIM"], [Math.floor((toStart % 3600) / 60), "MIN"], [toStart % 60, "SEK"]].map(([v, l], i) => (
                <div key={l as string} className="flex items-end gap-2.5">
                  {i > 0 && <span className="text-[40px] text-[#4b5c51] leading-[1.1]">:</span>}
                  <div className="flex flex-col items-center"><span className="text-[46px] font-semibold leading-none tabular-nums">{pad(v as number)}</span><span className="text-[10px] text-[#7d8e83] tracking-[0.12em]">{l}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {phase === "before" && !start && (
          <p className="text-center text-sm text-[#a8b8ad] mt-6 px-6">Ingen kommande match just nu.</p>
        )}
        {isLive && (
          <div className="mx-5 mt-5 flex flex-col gap-1.5">
            <div className="flex justify-between text-[11px] text-[#a8b8ad]">
              <span>{toEnd !== null ? <>Slut om <b className="text-[#eef3ef] font-oswald text-sm tracking-wide">{pad(Math.floor(toEnd / 60))}:{pad(toEnd % 60)}</b></> : "Sluttid ej satt"}</span>
              {live?.endTime && <span>Sluttid {live.endTime}</span>}
            </div>
            {endAt && <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#22c55e] transition-all" style={{ width: `${progress * 100}%` }} /></div>}
          </div>
        )}
        {phase === "after" && (
          <p className="text-center mt-4"><span className="text-xs font-semibold bg-[#eef3ef] text-[#07100b] rounded-full px-3 py-1">
            {(live?.whiteScore ?? 0) === (live?.greenScore ?? 0) ? "Oavgjort" : `${(live?.whiteScore ?? 0) > (live?.greenScore ?? 0) ? sides.white.name : sides.green.name} vann`}
          </span></p>
        )}

        {/* Flikar */}
        {phase !== "before" ? (
          <div className="mx-5 mt-5 flex gap-1.5" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`flex-1 h-10 rounded-[10px] text-[13px] font-semibold ${tab === id ? "bg-[#eef3ef] text-[#07100b]" : "border border-white/15 text-[#a8b8ad]"}`}>{label}</button>
            ))}
          </div>
        ) : null}

        {/* Mål */}
        {phase !== "before" && tab === "goals" && (
          <div className="mx-5 mt-3 flex flex-col gap-2">
            {goals.length === 0 && <p className="text-center text-sm text-[#7d8e83] py-6">Inga mål än.</p>}
            {(() => {
              // Ställningen efter varje mål (historiken är nyast först)
              let w = live?.whiteScore ?? 0, g = live?.greenScore ?? 0;
              return goals.map((goal, i) => {
                const score = `${w}–${g}`;
                if (goal.team === "white") w--; else g--;
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.07]">
                    <span className="font-oswald font-semibold text-base rounded-lg px-2 py-1 min-w-[38px] text-center" style={{ background: sides[goal.team].color, color: "#07100b" }}>{score}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{goal.scorer || `Mål ${sides[goal.team].name}`}</div>
                      <div className="text-xs text-[#8fa196] truncate">{goal.assist ? `Assist: ${goal.assist}` : sides[goal.team].name}</div>
                    </div>
                    <span className="text-xs text-[#8fa196]">{goal.timestamp?.slice(0, 5)}</span>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Spelare */}
        {phase !== "before" && tab === "players" && (
          <div className="mx-5 mt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_30px_30px_34px] gap-2 text-[10px] tracking-[0.12em] text-[#7d8e83] px-3">
              <span>SPELARE</span><span className="text-center">M</span><span className="text-center">A</span><span className="text-center text-[#eef3ef]">P</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {playerRows.length === 0 && <p className="text-center text-sm text-[#7d8e83] py-6">Inga poäng än.</p>}
              {playerRows.map((r) => (
                <div key={`${r.team}${r.name}`} className="grid grid-cols-[minmax(0,1fr)_30px_30px_34px] gap-2 items-center px-3 py-2 rounded-[10px] bg-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: sides[r.team].color }} /><span className="text-[13px] font-semibold truncate">{r.name}</span></div>
                  <span className="text-center text-[13px]">{r.g}</span><span className="text-center text-[13px]">{r.a}</span>
                  <span className="text-center font-oswald font-semibold text-[15px]">{r.g + r.a}</span>
                </div>
              ))}
            </div>
            {goalies.length > 0 && (
              <>
                <div className="mt-4 font-oswald text-[13px] tracking-[0.14em] text-[#a8b8ad]">MÅLVAKTER</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {goalies.map((p) => (
                    <div key={p.id} className="rounded-xl bg-white/5 px-3 py-2.5">
                      <div className="text-xs font-semibold truncate">{p.name}</div>
                      <div className="text-[11px] text-[#8fa196]">{sides[p.team].name} · {p.ga} insläppta</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Lagen (även före matchen) */}
        {(phase === "before" || tab === "teams") && (
          <div className="mx-5 mt-6">
            <div className="flex items-baseline justify-between">
              <span className="font-oswald text-[15px] tracking-[0.12em]">UPPSTÄLLNINGAR</span>
              <span className="text-[11px] text-[#7d8e83]">
                {lu.view?.mode === "published" && lu.view.publishedAt ? `Publicerat ${new Date(lu.view.publishedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}` : lu.view?.mode === "live" ? "Från Lineup" : ""}
              </span>
            </div>
            {lineupVisible ? (
              <div className="mt-2.5 flex gap-3.5">
                {(["white", "green"] as Side[]).map((t) => (
                  <div key={t} className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="font-oswald text-[13px] tracking-[0.14em] pb-1 border-b border-white/10 truncate" style={{ color: textColor(sides[t]) }}>{sides[t].name.toUpperCase()}</div>
                    {teamPlayers[t].length === 0 && <span className="text-xs text-[#7d8e83]">–</span>}
                    {teamPlayers[t].map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5 text-xs">
                        <span className="w-[26px] shrink-0 text-center text-[10px] font-bold rounded py-0.5" style={{ background: POS_COLOR[p.pos] ?? "#34d399", color: "#07100b" }}>{p.pos}</span>
                        <span className="truncate">{p.name}</span>
                        {p.number && <span className="ml-auto text-[11px] text-[#7d8e83]">#{p.number}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#a8b8ad]">
                {lu.view?.mode === "scheduled" && lu.view.publishAt
                  ? `Laget publiceras ${new Date(lu.view.publishAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}.`
                  : "Uppställningarna visas när laget publiceras, eller 75 min före matchstart."}
              </p>
            )}
          </div>
        )}

        {/* Läktaren */}
        {phase !== "before" && tab === "laktaren" && d?.laktaren && (
          <div className="mx-5 mt-3 relative">
            <div className="flex gap-2.5">
              {(["white", "green"] as Side[]).map((t) => (
                <button key={t} onClick={() => sendHeart(t)} aria-label={`Skicka hjärta till ${sides[t].name}`}
                  className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold"
                  style={{ borderColor: `${sides[t].color}66`, background: `${sides[t].color}1f`, color: textColor(sides[t]) }}>
                  <Heart color={sides[t].color} size={20} /> {live?.hearts?.[t] ?? 0}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0">
              {floating.map((h) => (
                <div key={h.id} className="absolute" style={{ left: `${h.x}%`, top: 0, animation: "heartUp 1.8s ease-out forwards" }}><Heart color={h.color} size={22} /></div>
              ))}
            </div>
            <form className="mt-3 flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) comment.mutate({ name, text }); }}>
              <label className="text-[11px] text-[#7d8e83]">Namn (valfritt)
                <input value={name} maxLength={30} onChange={(e) => { setName(e.target.value); try { localStorage.setItem("laktaren_name", e.target.value); } catch { /* */ } }}
                  className="mt-1 w-full h-10 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm text-[#eef3ef]" />
              </label>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="laktaren-text">Kommentar</label>
                <input id="laktaren-text" value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="Heja! (max 140 tecken)"
                  className="flex-1 h-11 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm text-[#eef3ef]" />
                <button type="submit" disabled={comment.isPending || !text.trim()} className="h-11 px-4 rounded-xl bg-[#22c55e] text-[#07100b] font-bold text-sm disabled:opacity-40">Skicka</button>
              </div>
              {err && <p className="text-xs text-amber-300">{err}</p>}
            </form>
            <div className="mt-4 flex flex-col gap-3">
              {(d.comments ?? []).length === 0 && <p className="text-center text-sm text-[#7d8e83] py-4">Bli först på läktaren.</p>}
              {(d.comments ?? []).map((c) => (
                <div key={c.id} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-2"><span className="text-xs font-bold text-[#a8f0c4]">{c.name}</span><span className="text-[10px] text-[#7d8e83]">{new Date(c.at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span></div>
                  <p className="text-sm leading-snug text-[#e3ebe5] break-words">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 px-5 flex justify-between text-[11px] text-[#7d8e83]">
          <span>{isLive ? "Uppdateras automatiskt" : phase === "after" ? "Preliminärt – granskas av styrelsen" : "Sidan går live när matchen sänds"}</span>
          {phase === "after" && live?.uniqueViewers ? <span>{live.uniqueViewers} följde matchen</span> : null}
        </div>
      </div>
    </div>
  );
}
