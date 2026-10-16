/**
 * Aktiviteter – träningar, matcher, möten och anmälan (styrelsen).
 *
 * Styrelsen lägger upp enstaka aktiviteter eller återkommande serier (t.ex. tilldelade
 * istider) och sköter anmälan: lägger till spelare ur truppen, även icke-medlemmar som
 * en extern målvakt. Medlemmarna anmäler sig själva i ett senare steg (egen inloggning).
 * Lineup kan hämta anmälningarna härifrån i stället för från laget.se.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { positionName } from "@/lib/players";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_NAMES,
  DEFAULT_FEE,
  INVITE_NAMES,
  INVITES,
  WEEKDAY_NAMES,
  seriesDates,
  shortDate,
  signupWindow,
  sortAttendees,
  stockholmParts,
  stockholmToDate,
  type ActivityType,
  type Invite,
} from "@shared/activities";
import { dayMark, type DayMark } from "@shared/holidays";

const HEAD_FONT = { fontFamily: "'Oswald', sans-serif" };
const TYPE_COLORS: Record<ActivityType, string> = {
  training: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  match: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  meeting: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  other: "bg-white/10 text-white/70 border-white/20",
};

// Knappar och fält – samma utseende överallt
const btn = "inline-flex items-center justify-center gap-1.5 text-sm px-3.5 py-2 rounded-lg border transition-colors disabled:opacity-50";
const btnGhost = `${btn} bg-white/5 border-white/10 text-white/80 hover:bg-white/10`;
const btnPrimary = `${btn} bg-emerald-600 border-emerald-600 text-white font-semibold hover:bg-emerald-500`;
const btnDanger = `${btn} border-red-400/30 text-red-300 hover:bg-red-500/10`;
const chip = (on: boolean) =>
  `text-xs px-3 py-1.5 rounded-full border transition-colors ${on ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/15 text-white/60 hover:border-white/30"}`;
const smallBtn = (tone: "yes" | "no") =>
  `text-xs px-2.5 py-1 rounded-md border whitespace-nowrap ${tone === "yes" ? "border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10" : "border-white/15 text-white/60 hover:bg-white/5"}`;
const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a7ea4]";
const labelCls = "block text-xs text-white/60 mb-1";

type Fields = {
  type: ActivityType;
  title: string;
  location: string;
  description: string;
  invite: Invite;
  invitedPlayerIds: string[];
  startTime: string;
  endTime: string;
  maxParticipants: number | null;
  waitlist: boolean;
  opensDaysBefore: number | null;
  closesHoursBefore: number | null;
  feeEnabled: boolean;
  feeAmount: number | null;
  feeReason: string;
  feeSwish: string;
};

type RosterPlayer = { id: string; name: string; number: string; position: string; isMember: boolean };

const today = () => stockholmParts(new Date()).date;
const timeRange = (startsAt: Date | string, endsAt: Date | string | null) => {
  const s = stockholmParts(new Date(startsAt)).time;
  return endsAt ? `${s}–${stockholmParts(new Date(endsAt)).time}` : s;
};
const fmtDateTime = (d: Date | string) => {
  const p = stockholmParts(new Date(d));
  return `${shortDate(p.date)} kl ${p.time}`;
};

// ─── Små byggstenar ──────────────────────────────────────────────────────────

function TypeChip({ type }: { type: string }) {
  const t = (ACTIVITY_TYPES as readonly string[]).includes(type) ? (type as ActivityType) : "other";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[t]}`}>{ACTIVITY_TYPE_NAMES[t]}</span>;
}

function PosBadge({ position }: { position: string }) {
  return (
    <span
      className={`pos-badge pos-badge-sm ${position ? `pos-badge-${position.toLowerCase()}` : "bg-white/10 text-white/40"} shrink-0`}
      title={position ? positionName(position) : "Ingen position"}
    >
      {position || "–"}
    </span>
  );
}

/** Röd dag eller dag före röd dag. */
function DayBadge({ mark }: { mark: DayMark | null }) {
  if (!mark) return null;
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${mark.kind === "red" ? "bg-red-500/20 text-red-300" : "bg-amber-400/15 text-amber-200"}`}
      title={mark.kind === "red" ? "Röd dag" : "Dagen före en röd dag"}
    >
      {mark.name}
    </span>
  );
}

function PlayerName({ name, number, isMember }: { name: string; number: string; isMember: boolean }) {
  return (
    <span className={`flex-1 min-w-0 truncate ${isMember ? "" : "text-white/55"}`}>
      {name}
      {number && <span className="text-white/40"> #{number}</span>}
      {!isMember && <span className="text-[10px] text-white/40 ml-1.5">ej medlem</span>}
    </span>
  );
}

function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold flex-1">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Header({ title, back }: { title: string; back: string }) {
  return (
    <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
      <Link href={back} className="text-white/60 hover:text-white" aria-label="Tillbaka">
        <ArrowLeft size={20} />
      </Link>
      <h1 className="text-lg font-bold flex-1 truncate" style={HEAD_FONT}>
        {title}
      </h1>
    </header>
  );
}

/** Extra avgift – syns tydligt i kallelsen. */
function FeeBox({ amount, reason, swish }: { amount: number | null; reason: string; swish: string }) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2.5">
      <Coins size={18} className="text-amber-300 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-semibold text-amber-100">
          Extra avgift {amount != null ? `${amount} kr` : ""}
          {reason ? ` – ${reason}` : ""}
        </div>
        {swish && <div className="text-amber-100/80">Swisha till {swish}</div>}
      </div>
    </div>
  );
}

export default function ActivitiesApp() {
  const [, params] = useRoute("/aktiviteter/:id");
  const id = params?.id ? Number(params.id) : null;
  return id ? <ActivityDetail id={id} /> : <ActivityList />;
}

// ─── Lista ───────────────────────────────────────────────────────────────────

function ActivityList() {
  const [past, setPast] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = trpc.activities.list.useQuery({ past });
  const rows = past ? [...(list.data ?? [])].reverse() : list.data ?? [];

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <Header title="Aktiviteter" back="/" />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <SourceCard />
        <div className="flex items-center gap-2">
          <button onClick={() => setPast(false)} className={chip(!past)}>
            Kommande
          </button>
          <button onClick={() => setPast(true)} className={chip(past)}>
            Tidigare
          </button>
          <span className="flex-1" />
          <button onClick={() => setCreating(true)} className={btnPrimary}>
            <CalendarPlus size={15} /> Ny aktivitet
          </button>
        </div>

        {list.isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-white/40" />
          </div>
        )}
        {list.error && <p className="text-red-300 text-sm">{list.error.message}</p>}
        {list.data && rows.length === 0 && (
          <p className="text-white/40 text-sm py-8 text-center">{past ? "Inga tidigare aktiviteter." : "Inga kommande aktiviteter. Lägg upp en med Ny aktivitet."}</p>
        )}

        <ul className="space-y-2">
          {rows.map((a) => {
            const start = stockholmParts(new Date(a.startsAt));
            const [wd, ...rest] = shortDate(start.date).split(" ");
            const mark = dayMark(start.date);
            return (
              <li key={a.id}>
                <Link href={`/aktiviteter/${a.id}`}>
                  <div
                    className={`rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 transition-colors px-3 py-3 flex items-center gap-3 cursor-pointer ${a.cancelled ? "opacity-50" : ""}`}
                  >
                    <div className="w-14 shrink-0 text-center">
                      <div className={`text-[11px] uppercase ${mark?.kind === "red" ? "text-red-300" : mark ? "text-amber-200" : "text-white/50"}`}>{wd}</div>
                      <div className={`text-lg font-bold leading-tight ${mark?.kind === "red" ? "text-red-300" : ""}`} style={HEAD_FONT}>
                        {rest.join(" ").replace(".", "")}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <TypeChip type={a.type} />
                        {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
                        <DayBadge mark={mark} />
                        {a.feeEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200">Avgift</span>}
                      </div>
                      <div className="font-semibold truncate">{a.title}</div>
                      <div className="text-xs text-white/50 flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Clock size={11} /> {timeRange(a.startsAt, a.endsAt)}
                        </span>
                        {a.location && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin size={11} /> {a.location}
                          </span>
                        )}
                        {a.seriesId && <Repeat size={11} className="shrink-0" aria-label="Återkommande" />}
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-sm font-semibold inline-flex items-center gap-1">
                      <Users size={14} className="text-white/50" />
                      {a.yes}
                      {a.maxParticipants ? <span className="text-white/40 font-normal">/{a.maxParticipants}</span> : null}
                    </div>
                    <ChevronRight size={18} className="text-white/20 shrink-0" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      {creating && <ActivityForm onClose={() => setCreating(false)} recent={list.data ?? []} />}
    </div>
  );
}

/** Varifrån Lineup hämtar anmälningarna. */
function SourceCard() {
  const utils = trpc.useUtils();
  const q = trpc.activities.source.useQuery();
  const set = trpc.activities.setSource.useMutation({
    onSuccess: (r) => {
      utils.activities.source.invalidate();
      utils.laget.attendance.invalidate();
      toast.success(r.source === "app" ? "Lineup hämtar nu anmälningarna från Aktiviteter" : "Lineup hämtar nu anmälningarna från laget.se");
    },
    onError: (e) => toast.error(e.message),
  });
  const source = q.data?.source;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-white/60 w-full sm:w-auto sm:flex-1">Lineup hämtar anmälningar från</span>
      {(["laget", "app"] as const).map((s) => (
        <button key={s} disabled={!q.data || set.isPending} onClick={() => source !== s && set.mutate({ source: s })} className={chip(source === s)}>
          {s === "laget" ? "laget.se" : "Aktiviteter"}
        </button>
      ))}
    </div>
  );
}

// ─── Skapa / ändra ──────────────────────────────────────────────────────────

type Recent = {
  type: string;
  title: string;
  location: string;
  startsAt: Date | string;
  endsAt: Date | string | null;
  maxParticipants: number | null;
  opensDaysBefore: number | null;
  closesHoursBefore: number | null;
  invite: string;
};

/** Förslag för en typ: senast skapade aktiviteten av samma typ. */
function templateFor(type: ActivityType, recent: Recent[]): Partial<Fields> {
  const last = [...recent].reverse().find((r) => r.type === type);
  if (!last)
    return { title: ACTIVITY_TYPE_NAMES[type], location: "", startTime: type === "meeting" ? "19:00" : "21:00", endTime: "", invite: type === "meeting" ? "all" : "all" };
  return {
    title: last.title,
    location: last.location,
    startTime: stockholmParts(new Date(last.startsAt)).time,
    endTime: last.endsAt ? stockholmParts(new Date(last.endsAt)).time : "",
    maxParticipants: last.maxParticipants,
    opensDaysBefore: last.opensDaysBefore,
    closesHoursBefore: last.closesHoursBefore,
    invite: (INVITES as readonly string[]).includes(last.invite) ? (last.invite as Invite) : "all",
  };
}

function numOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
}

const EMPTY: Fields = {
  type: "training",
  title: "Träning",
  location: "",
  description: "",
  invite: "all",
  invitedPlayerIds: [],
  startTime: "21:00",
  endTime: "",
  maxParticipants: null,
  waitlist: false,
  opensDaysBefore: null,
  closesHoursBefore: null,
  feeEnabled: false,
  feeAmount: null,
  feeReason: "",
  feeSwish: "",
};

type EditTarget = { id: number; scope: "one" | "following"; date: string; fields: Fields; count?: number };

function ActivityForm({ onClose, recent, edit }: { onClose: () => void; recent: Recent[]; edit?: EditTarget }) {
  const utils = trpc.useUtils();
  const roster = trpc.players.list.useQuery(undefined, { staleTime: 60_000 });
  const board = trpc.activities.board.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [f, setF] = useState<Fields>(edit?.fields ?? { ...EMPTY, ...templateFor("training", recent) });
  const [date, setDate] = useState(edit?.date ?? today());
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pick, setPick] = useState("");

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((x) => ({ ...x, [k]: v }));
  const dates = useMemo(() => (repeat ? seriesDates(date, until, weekdays) : [date]), [repeat, date, until, weekdays]);
  const chosen = dates.filter((d) => !skipped.includes(d));
  const players: RosterPlayer[] = useMemo(
    () => sortAttendees(((roster.data ?? []) as (RosterPlayer & { active: boolean })[]).filter((p) => p.active)),
    [roster.data],
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const selected = f.invitedPlayerIds.map((id) => byId.get(id)).filter((p): p is RosterPlayer => !!p);
  const needle = pick.trim().toLowerCase();
  const pickable = needle ? players.filter((p) => !f.invitedPlayerIds.includes(p.id) && `${p.name} ${p.number}`.toLowerCase().includes(needle)).slice(0, 8) : [];

  const done = (msg: string) => {
    utils.activities.invalidate();
    toast.success(msg);
    onClose();
  };
  const create = trpc.activities.create.useMutation({
    onSuccess: (r) => done(r.ids.length === 1 ? "Aktiviteten är upplagd" : `${r.ids.length} tillfällen är upplagda`),
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.activities.update.useMutation({
    onSuccess: (r) => done(r.changed === 1 ? "Aktiviteten är ändrad" : `${r.changed} tillfällen är ändrade`),
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!f.title.trim()) return toast.error("Ange en rubrik");
    if (f.invite === "none" && f.invitedPlayerIds.length === 0) return toast.error("Välj vilka som kallas");
    if (edit) return update.mutate({ id: edit.id, scope: edit.scope, fields: f, date: edit.scope === "one" ? date : undefined });
    if (chosen.length === 0) return toast.error(repeat ? "Välj veckodag och till-datum" : "Välj ett datum");
    create.mutate({ fields: f, dates: chosen });
  };
  const busy = create.isPending || update.isPending;
  const previewDate = chosen[0] ?? date;
  const title = edit ? (edit.scope === "following" ? `Ändra serien (${edit.count ?? "alla"} kommande)` : "Ändra tillfället") : "Ny aktivitet";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[94dvh] overflow-y-auto text-white">
        <div className="sticky top-0 z-10 bg-[#141414] border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <h2 className="font-bold flex-1 text-lg" style={HEAD_FONT}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Vad och när */}
          <Section title="Vad och när">
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setF((x) => ({ ...x, type: t, ...(edit ? {} : templateFor(t, recent)) }))}
                  className={`text-xs px-3 py-1.5 rounded-full border ${f.type === t ? TYPE_COLORS[t] : "border-white/15 text-white/50"}`}
                >
                  {ACTIVITY_TYPE_NAMES[t]}
                </button>
              ))}
            </div>
            <div>
              <label className={labelCls} htmlFor="act-title">Rubrik</label>
              <input id="act-title" className={inputCls} value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="Match Vita mot Gröna" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {!(edit?.scope === "following") && (
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelCls} htmlFor="act-date">{repeat ? "Första datum" : "Datum"}</label>
                  <input id="act-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="act-start">Start</label>
                <input id="act-start" type="time" className={inputCls} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="act-end">Slut</label>
                <input id="act-end" type="time" className={inputCls} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </div>
            </div>
            {!repeat && !(edit?.scope === "following") && dayMark(date) && (
              <p className="text-xs">
                <DayBadge mark={dayMark(date)} />
              </p>
            )}
            {edit?.scope === "following" && <p className="text-xs text-white/50">Varje tillfälle behåller sitt datum. Tider, plats, text och övrigt ändras för alla kommande.</p>}
            <div>
              <label className={labelCls} htmlFor="act-loc">Plats</label>
              <input id="act-loc" className={inputCls} value={f.location} maxLength={120} onChange={(e) => set("location", e.target.value)} placeholder="C-hallen" />
            </div>
            <div>
              <label className={labelCls} htmlFor="act-text">Text i kallelsen (valfri)</label>
              <textarea id="act-text" rows={3} className={inputCls} value={f.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
            </div>
          </Section>

          {/* Återkommande */}
          {!edit && (
            <Section title="Återkommande">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                Upprepa varje vecka (t.ex. tilldelade istider)
              </label>
              {repeat && (
                <div className="space-y-3 rounded-xl border border-white/10 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_NAMES.map((w, i) => (
                      <button key={w} onClick={() => setWeekdays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} className={chip(weekdays.includes(i))}>
                        {w.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div className="max-w-[200px]">
                    <label className={labelCls} htmlFor="act-until">Till och med</label>
                    <input id="act-until" type="date" className={inputCls} value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
                  </div>
                  {dates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-white/60">
                        <strong className="text-white">{chosen.length} tillfällen.</strong> Tryck på ett datum för att hoppa över det. Röda dagar och dagar före är markerade.
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                        {dates.map((d) => {
                          const off = skipped.includes(d);
                          const m = dayMark(d);
                          const tone = off
                            ? "border-white/10 text-white/30 line-through"
                            : m?.kind === "red"
                              ? "border-red-400/50 text-red-200 bg-red-500/10"
                              : m
                                ? "border-amber-400/50 text-amber-100 bg-amber-500/10"
                                : "border-emerald-400/30 text-emerald-200 bg-emerald-500/10";
                          return (
                            <button key={d} title={m?.name} onClick={() => setSkipped((x) => (off ? x.filter((y) => y !== d) : [...x, d]))} className={`text-xs px-2 py-1 rounded-md border ${tone}`}>
                              {shortDate(d)}
                              {m && !off ? " •" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Vilka kallas */}
          <Section title="Vilka kallas">
            <div className="flex flex-wrap gap-2">
              {INVITES.map((i) => (
                <button key={i} onClick={() => set("invite", i)} className={chip(f.invite === i)}>
                  {INVITE_NAMES[i]}
                </button>
              ))}
            </div>
            {f.invite === "board" && (
              <p className="text-xs text-white/50">
                {board.data?.names.length ? `Styrelsen enligt sajten: ${board.data.names.join(", ")}.` : "Styrelsen hämtas från Organisation på sajten."}
                {board.data?.error ? ` (Sajten svarar inte just nu: senast kända lista används.)` : ""}
              </p>
            )}
            <div className="space-y-2">
              <p className="text-xs text-white/60">{f.invite === "none" ? "Välj vilka som kallas:" : "Fler som ska kallas (valfritt), t.ex. en extern målvakt:"}</p>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 text-xs pl-1 pr-2 py-1 rounded-full bg-white/10">
                      <PosBadge position={p.position} />
                      {p.name}
                      <button onClick={() => set("invitedPlayerIds", f.invitedPlayerIds.filter((x) => x !== p.id))} aria-label={`Ta bort ${p.name}`} className="text-white/50 hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2">
                  <Search size={14} className="text-white/40" />
                  <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Sök i truppen" className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
                </div>
                {pickable.length > 0 && (
                  <ul className="absolute left-0 right-0 mt-1 rounded-lg border border-white/15 bg-[#1b1b1b] z-20 max-h-56 overflow-y-auto shadow-xl">
                    {pickable.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => {
                            set("invitedPlayerIds", [...f.invitedPlayerIds, p.id]);
                            setPick("");
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
                        >
                          <PosBadge position={p.position} />
                          <PlayerName name={p.name} number={p.number} isMember={p.isMember} />
                          <Plus size={14} className="text-white/40" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* Anmälan */}
          <Section title="Anmälan">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls} htmlFor="act-max">Max antal</label>
                <input id="act-max" inputMode="numeric" className={inputCls} value={f.maxParticipants ?? ""} placeholder="Ingen gräns" onChange={(e) => set("maxParticipants", numOrNull(e.target.value) || null)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="act-open">Öppnar, dagar före</label>
                <input id="act-open" inputMode="numeric" className={inputCls} value={f.opensDaysBefore ?? ""} placeholder="Direkt" onChange={(e) => set("opensDaysBefore", numOrNull(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="act-close">Stänger, timmar före</label>
                <input id="act-close" inputMode="numeric" className={inputCls} value={f.closesHoursBefore ?? ""} placeholder="Vid start" onChange={(e) => set("closesHoursBefore", numOrNull(e.target.value))} />
              </div>
            </div>
            {f.maxParticipants != null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.waitlist} onChange={(e) => set("waitlist", e.target.checked)} />
                Reservlista när det är fullt
              </label>
            )}
            <p className="text-xs text-white/40">Avanmälan går alltid, även efter att anmälan stängt.</p>
          </Section>

          {/* Extra avgift */}
          <Section title="Extra avgift">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.feeEnabled}
                onChange={(e) =>
                  setF((x) => ({
                    ...x,
                    feeEnabled: e.target.checked,
                    feeAmount: x.feeAmount ?? DEFAULT_FEE.amount,
                    feeReason: x.feeReason || DEFAULT_FEE.reason,
                    feeSwish: x.feeSwish || DEFAULT_FEE.swish,
                  }))
                }
              />
              Deltagarna betalar en extra avgift
            </label>
            {f.feeEnabled && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls} htmlFor="act-fee">Belopp (kr)</label>
                  <input id="act-fee" inputMode="numeric" className={inputCls} value={f.feeAmount ?? ""} onChange={(e) => set("feeAmount", numOrNull(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="act-fee-reason">Avser</label>
                  <input id="act-fee-reason" className={inputCls} value={f.feeReason} maxLength={120} onChange={(e) => set("feeReason", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="act-fee-swish">Swishnummer</label>
                  <input id="act-fee-swish" className={inputCls} value={f.feeSwish} maxLength={40} onChange={(e) => set("feeSwish", e.target.value)} />
                </div>
              </div>
            )}
          </Section>

          {/* Förhandsvisning */}
          <Section title="Så här ser kallelsen ut">
            <Preview f={f} date={previewDate} count={edit ? undefined : chosen.length} invitedNames={selected.map((p) => p.name)} boardNames={board.data?.names ?? []} />
          </Section>
        </div>

        <div className="sticky bottom-0 bg-[#141414] border-t border-white/10 px-4 py-3 flex gap-2 justify-end">
          <button onClick={onClose} className={btnGhost}>
            Avbryt
          </button>
          <button onClick={save} disabled={busy} className={btnPrimary}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {edit ? "Spara" : chosen.length > 1 ? `Lägg upp ${chosen.length} tillfällen` : "Lägg upp"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kallelsen som medlemmen kommer att se den. */
function Preview({ f, date, count, invitedNames, boardNames }: { f: Fields; date: string; count?: number; invitedNames: string[]; boardNames: string[] }) {
  const start = f.startTime ? stockholmToDate(date, f.startTime) : null;
  const win = start ? signupWindow({ startsAt: start, opensDaysBefore: f.opensDaysBefore, closesHoursBefore: f.closesHoursBefore }) : null;
  const who =
    f.invite === "all" ? "Alla medlemmar" : f.invite === "board" ? `Styrelsen${boardNames.length ? ` (${boardNames.length})` : ""}` : "";
  const whoText = [who, invitedNames.length ? invitedNames.join(", ") : ""].filter(Boolean).join(" + ");
  return (
    <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <TypeChip type={f.type} />
        <DayBadge mark={dayMark(date)} />
        {count && count > 1 ? <span className="text-[11px] text-white/50">1 av {count} tillfällen</span> : null}
      </div>
      <div className="text-lg font-bold leading-snug" style={HEAD_FONT}>
        {f.title || "Rubrik"}
      </div>
      <div className="text-sm text-white/80 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-white/50" /> {shortDate(date)} kl {f.startTime || "–"}
          {f.endTime ? `–${f.endTime}` : ""}
        </div>
        {f.location && (
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-white/50" /> {f.location}
          </div>
        )}
      </div>
      {f.description && <p className="text-sm text-white/80 whitespace-pre-line">{f.description}</p>}
      {f.feeEnabled && <FeeBox amount={f.feeAmount} reason={f.feeReason} swish={f.feeSwish} />}
      <div className="text-xs text-white/50 space-y-0.5 pt-1 border-t border-white/10">
        {whoText && <div>Kallade: {whoText}</div>}
        {win && (
          <div>
            Anmälan {win.opensAt ? `öppnar ${fmtDateTime(win.opensAt)}, ` : "är öppen direkt, "}stänger {fmtDateTime(win.closesAt)}
            {f.maxParticipants ? ` · max ${f.maxParticipants}${f.waitlist ? ", sedan reservlista" : ""}` : ""}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <span className={`${btnPrimary} pointer-events-none`}>Kommer</span>
        <span className={`${btnGhost} pointer-events-none`}>Kommer inte</span>
      </div>
    </div>
  );
}

// ─── En aktivitet ───────────────────────────────────────────────────────────

function ActivityDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const q = trpc.activities.get.useQuery({ id });
  const recent = trpc.activities.list.useQuery({});
  const [editing, setEditing] = useState<null | "one" | "following">(null);
  const [askScope, setAskScope] = useState<null | "cancel" | "remove" | "restore">(null);
  const [search, setSearch] = useState("");
  const [showMissing, setShowMissing] = useState(false);

  const refresh = () => {
    utils.activities.get.invalidate({ id });
    utils.activities.list.invalidate();
  };
  const setAtt = trpc.activities.setAttendance.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const cancel = trpc.activities.cancel.useMutation({
    onSuccess: (r, v) => {
      refresh();
      toast.success(v.cancelled ? (r.changed === 1 ? "Aktiviteten är inställd" : `${r.changed} tillfällen är inställda`) : "Aktiviteten blir av igen");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.activities.remove.useMutation({
    onSuccess: (r) => {
      utils.activities.list.invalidate();
      toast.success(r.deleted === 1 ? "Aktiviteten är borttagen" : `${r.deleted} tillfällen är borttagna`);
      navigate("/aktiviteter");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!q.data)
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
        <Header title="Aktivitet" back="/aktiviteter" />
        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-white/40" />
          </div>
        ) : (
          <p className="p-4 text-red-300 text-sm">{q.error?.message ?? "Aktiviteten finns inte"}</p>
        )}
      </div>
    );

  const { activity: a, yes, no, reserve, roster, notAnswered, window: win } = q.data;
  const start = stockholmParts(new Date(a.startsAt));
  const mark = dayMark(start.date);
  const answered = new Set([...yes, ...no, ...reserve].map((x) => x.playerId));
  const needle = search.trim().toLowerCase();
  const addable = needle ? roster.filter((p) => !answered.has(p.id) && `${p.name} ${p.number}`.toLowerCase().includes(needle)) : [];
  const now = Date.now();
  const opensAt = win.opensAt ? new Date(win.opensAt) : null;
  const closesAt = new Date(win.closesAt);
  const signupState = a.cancelled
    ? "Inställd"
    : opensAt && now < +opensAt
      ? `Anmälan öppnar ${fmtDateTime(opensAt)}`
      : now < +closesAt
        ? `Anmälan öppen till ${fmtDateTime(closesAt)}`
        : "Anmälan stängd – avanmälan går fortfarande";
  const seriesLeft = (recent.data ?? []).filter((r) => r.seriesId && r.seriesId === a.seriesId && +new Date(r.startsAt) >= +new Date(a.startsAt)).length;

  const editFields: Fields = {
    type: a.type as ActivityType,
    title: a.title,
    location: a.location,
    description: a.description ?? "",
    invite: (INVITES as readonly string[]).includes(a.invite) ? (a.invite as Invite) : "all",
    invitedPlayerIds: a.invitedPlayerIds ?? [],
    startTime: start.time,
    endTime: a.endsAt ? stockholmParts(new Date(a.endsAt)).time : "",
    maxParticipants: a.maxParticipants,
    waitlist: a.waitlist,
    opensDaysBefore: a.opensDaysBefore,
    closesHoursBefore: a.closesHoursBefore,
    feeEnabled: a.feeEnabled,
    feeAmount: a.feeAmount,
    feeReason: a.feeReason,
    feeSwish: a.feeSwish,
  };

  const doScoped = (kind: "cancel" | "remove" | "restore", sc: "one" | "following") => {
    setAskScope(null);
    if (kind === "remove") remove.mutate({ id, scope: sc });
    else cancel.mutate({ id, scope: sc, cancelled: kind === "cancel", note: "" });
  };
  const startScoped = (kind: "cancel" | "remove" | "restore") => {
    if (a.seriesId) return setAskScope(kind);
    if (kind === "remove" && !window.confirm("Ta bort aktiviteten och alla anmälningar? Det går inte att ångra.")) return;
    doScoped(kind, "one");
  };

  const Row = ({ p, status }: { p: { playerId: string; name: string; number: string; position: string; isMember: boolean }; status: "yes" | "no" | "reserve" | "none" }) => (
    <li className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
      <PosBadge position={p.position} />
      <PlayerName name={p.name} number={p.number} isMember={p.isMember} />
      {status !== "yes" && (
        <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: "yes" })} className={smallBtn("yes")}>
          Kommer
        </button>
      )}
      {status !== "no" && (
        <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: "no" })} className={smallBtn("no")}>
          Kommer inte
        </button>
      )}
      {status !== "none" && (
        <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: null })} aria-label={`Ta bort svaret för ${p.name}`} className="text-white/30 hover:text-red-300 p-1">
          <X size={14} />
        </button>
      )}
    </li>
  );
  const list = (items: ReactNode, empty?: string) => (
    <ul className="rounded-xl border border-white/10 bg-white/[0.02]">{items || (empty && <li className="px-3 py-3 text-sm text-white/40">{empty}</li>)}</ul>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <Header title={ACTIVITY_TYPE_NAMES[editFields.type]} back="/aktiviteter" />
      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 ${a.cancelled ? "opacity-70" : ""}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeChip type={a.type} />
            {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
            <DayBadge mark={mark} />
            {a.seriesId && (
              <span className="text-[11px] text-white/45 inline-flex items-center gap-1">
                <Repeat size={11} /> Återkommande
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold leading-tight" style={HEAD_FONT}>
            {a.title}
          </h2>
          <div className="text-sm text-white/80 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-white/50" /> {shortDate(start.date)} kl {timeRange(a.startsAt, a.endsAt)}
            </div>
            {a.location && (
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-white/50" /> {a.location}
              </div>
            )}
          </div>
          {a.description && <p className="text-sm text-white/80 whitespace-pre-line">{a.description}</p>}
          {a.feeEnabled && <FeeBox amount={a.feeAmount} reason={a.feeReason} swish={a.feeSwish} />}
          <div className="text-xs text-white/50">
            {signupState}
            {a.maxParticipants ? ` · max ${a.maxParticipants}${a.waitlist ? ", sedan reservlista" : ""}` : ""}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {a.seriesId ? (
              <>
                <button onClick={() => setEditing("one")} className={btnGhost}>
                  <Pencil size={14} /> Ändra tillfället
                </button>
                <button onClick={() => setEditing("following")} className={btnGhost}>
                  <Repeat size={14} /> Ändra serien
                </button>
              </>
            ) : (
              <button onClick={() => setEditing("one")} className={btnGhost}>
                <Pencil size={14} /> Ändra
              </button>
            )}
            {a.cancelled ? (
              <button onClick={() => startScoped("restore")} className={btnGhost}>
                <RotateCcw size={14} /> Blir av ändå
              </button>
            ) : (
              <button onClick={() => startScoped("cancel")} className={btnGhost}>
                <Ban size={14} /> Ställ in
              </button>
            )}
            <button onClick={() => startScoped("remove")} className={btnDanger}>
              <Trash2 size={14} /> Ta bort
            </button>
          </div>
          {askScope && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm space-y-2">
              <p className="text-amber-100">
                {askScope === "remove" ? "Ta bort" : askScope === "cancel" ? "Ställ in" : "Återställ"} bara detta tillfälle, eller även alla kommande i serien?
                {askScope === "remove" && " Anmälningarna tas också bort."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => doScoped(askScope, "one")} className={btnGhost}>
                  Bara detta tillfälle
                </button>
                <button onClick={() => doScoped(askScope, "following")} className={btnGhost}>
                  Detta och alla kommande
                </button>
                <button onClick={() => setAskScope(null)} className="text-sm px-3 py-2 text-white/60">
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </section>

        <Section
          title={
            <>
              Anmälda <span className="text-white/50 font-normal">({yes.length}{a.maxParticipants ? ` av ${a.maxParticipants}` : ""})</span>
            </>
          }
        >
          {list(yes.length ? yes.map((p) => <Row key={p.playerId} p={p} status="yes" />) : null, "Ingen anmäld än.")}
        </Section>

        {reserve.length > 0 && <Section title={`Reserver (${reserve.length})`}>{list(reserve.map((p) => <Row key={p.playerId} p={p} status="reserve" />))}</Section>}

        {no.length > 0 && <Section title={`Kommer inte (${no.length})`}>{list(no.map((p) => <Row key={p.playerId} p={p} status="no" />))}</Section>}

        {notAnswered.length > 0 && (
          <Section
            title={`Inte svarat (${notAnswered.length})`}
            right={
              <button onClick={() => setShowMissing((x) => !x)} className="text-xs text-white/60 inline-flex items-center gap-1">
                {showMissing ? "Dölj" : "Visa"} <ChevronDown size={14} className={showMissing ? "rotate-180" : ""} />
              </button>
            }
          >
            {showMissing && list(notAnswered.map((p) => <Row key={p.playerId} p={p} status="none" />))}
          </Section>
        )}
        {q.data.unmatchedBoard.length > 0 && (
          <p className="text-xs text-amber-200">Hittar inte i truppen (styrelsen enligt sajten): {q.data.unmatchedBoard.join(", ")}</p>
        )}

        <Section title="Lägg till ur truppen">
          <p className="text-xs text-white/45">Även den som inte är medlem, t.ex. en extern målvakt. Max antal gäller inte här.</p>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2">
            <Search size={14} className="text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn eller nummer" className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
          </div>
          {needle && list(addable.length ? addable.map((p) => <Row key={p.id} p={{ ...p, playerId: p.id }} status="none" />) : null, "Ingen träff.")}
        </Section>
      </main>
      {editing && (
        <ActivityForm
          onClose={() => setEditing(null)}
          recent={recent.data ?? []}
          edit={{ id, scope: editing, date: start.date, fields: editFields, count: seriesLeft || undefined }}
        />
      )}
    </div>
  );
}
