/**
 * Aktiviteter – träningar, matcher, möten och anmälan (styrelsen).
 *
 * Styrelsen lägger upp enstaka aktiviteter eller återkommande serier (t.ex. tilldelade
 * istider) och sköter anmälan: lägger till spelare ur truppen, även icke-medlemmar som
 * en extern målvakt. Medlemmarna anmäler sig själva i ett senare steg (egen inloggning).
 * Lineup kan hämta anmälningarna härifrån i stället för från laget.se.
 */
import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, ChevronRight, Loader2, MapPin, Repeat, Search, Trash2, Users, X, Ban, Pencil, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { positionName } from "@/lib/players";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_NAMES,
  INVITE_NAMES,
  INVITES,
  WEEKDAY_NAMES,
  seriesDates,
  shortDate,
  stockholmParts,
  type ActivityType,
  type Invite,
} from "@shared/activities";

const HEAD_FONT = { fontFamily: "'Oswald', sans-serif" };
const TYPE_COLORS: Record<ActivityType, string> = {
  training: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  match: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  meeting: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  other: "bg-white/10 text-white/70 border-white/20",
};

type Fields = {
  type: ActivityType;
  title: string;
  location: string;
  description: string;
  invite: Invite;
  startTime: string;
  endTime: string;
  maxParticipants: number | null;
  waitlist: boolean;
  opensDaysBefore: number | null;
  closesHoursBefore: number | null;
};

const today = () => stockholmParts(new Date()).date;
const timeRange = (startsAt: Date | string, endsAt: Date | string | null) => {
  const s = stockholmParts(new Date(startsAt)).time;
  return endsAt ? `${s}–${stockholmParts(new Date(endsAt)).time}` : s;
};
const fmtDateTime = (d: Date | string) => {
  const p = stockholmParts(new Date(d));
  return `${shortDate(p.date)} ${p.time}`;
};

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
          {[false, true].map((p) => (
            <button
              key={String(p)}
              onClick={() => setPast(p)}
              className={`text-xs px-3 py-1.5 rounded-full border ${past === p ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/10 text-white/60"}`}
            >
              {p ? "Tidigare" : "Kommande"}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300"
          >
            <CalendarPlus size={14} /> Ny aktivitet
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
            const lineupType = a.type === "training" || a.type === "match";
            return (
              <li key={a.id}>
                <Link href={`/aktiviteter/${a.id}`}>
                  <div
                    className={`rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 transition-colors px-3 py-3 flex items-center gap-3 cursor-pointer ${a.cancelled ? "opacity-50" : ""}`}
                  >
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-[11px] uppercase text-white/50">{shortDate(start.date).split(" ")[0]}</div>
                      <div className="text-lg font-bold leading-tight" style={HEAD_FONT}>
                        {shortDate(start.date).split(" ").slice(1).join(" ")}
                      </div>
                      <div className="text-[11px] text-white/50">{timeRange(a.startsAt, a.endsAt)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeChip type={a.type} />
                        {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
                        {a.seriesId && (
                          <span className="text-[10px] text-white/40 inline-flex items-center gap-1">
                            <Repeat size={10} /> serie
                          </span>
                        )}
                      </div>
                      <div className="font-semibold truncate mt-0.5">{a.title}</div>
                      {a.location && (
                        <div className="text-xs text-white/50 truncate inline-flex items-center gap-1">
                          <MapPin size={11} /> {a.location}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold inline-flex items-center gap-1">
                        <Users size={13} className="text-white/50" />
                        {a.yes}
                        {a.maxParticipants ? <span className="text-white/40">/{a.maxParticipants}</span> : null}
                      </div>
                      {lineupType && (
                        <div className={`text-[11px] ${a.goalies < 2 ? "text-amber-300" : "text-white/40"}`}>MV {a.goalies}/2</div>
                      )}
                      {a.reserve > 0 && <div className="text-[11px] text-white/40">{a.reserve} reserv</div>}
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-white/60 flex-1 min-w-[180px]">Lineup hämtar anmälningar från</span>
      {(["laget", "app"] as const).map((s) => (
        <button
          key={s}
          disabled={!q.data || set.isPending}
          onClick={() => source !== s && set.mutate({ source: s })}
          className={`px-3 py-1 rounded-full border ${source === s ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/10 text-white/60"}`}
        >
          {s === "laget" ? "laget.se" : "Aktiviteter"}
        </button>
      ))}
    </div>
  );
}

// ─── Skapa / ändra ──────────────────────────────────────────────────────────

type Recent = { type: string; title: string; location: string; startsAt: Date | string; endsAt: Date | string | null; maxParticipants: number | null; opensDaysBefore: number | null; closesHoursBefore: number | null };

/** Förslag för en typ: senast skapade aktiviteten av samma typ. */
function templateFor(type: ActivityType, recent: Recent[]): Partial<Fields> {
  const last = [...recent].reverse().find((r) => r.type === type);
  if (!last) return { title: ACTIVITY_TYPE_NAMES[type], location: "", startTime: type === "meeting" ? "19:00" : "21:00", endTime: "" };
  return {
    title: last.title,
    location: last.location,
    startTime: stockholmParts(new Date(last.startsAt)).time,
    endTime: last.endsAt ? stockholmParts(new Date(last.endsAt)).time : "",
    maxParticipants: last.maxParticipants,
    opensDaysBefore: last.opensDaysBefore,
    closesHoursBefore: last.closesHoursBefore,
  };
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a7ea4]";
const labelCls = "block text-xs text-white/60 mb-1";

function numOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
}

function ActivityForm({
  onClose,
  recent,
  edit,
}: {
  onClose: () => void;
  recent: Recent[];
  edit?: { id: number; seriesId: string | null; date: string; fields: Fields };
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<Fields>(
    edit?.fields ?? {
      type: "training",
      title: "Träning",
      location: "",
      description: "",
      invite: "all",
      startTime: "21:00",
      endTime: "",
      maxParticipants: null,
      waitlist: false,
      opensDaysBefore: null,
      closesHoursBefore: null,
      ...templateFor("training", recent),
    },
  );
  const [date, setDate] = useState(edit?.date ?? today());
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [scope, setScope] = useState<"one" | "following">("one");

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((x) => ({ ...x, [k]: v }));
  const dates = useMemo(() => (repeat ? seriesDates(date, until, weekdays) : [date]), [repeat, date, until, weekdays]);
  const chosen = dates.filter((d) => !skipped.includes(d));

  const done = (msg: string) => {
    utils.activities.invalidate();
    toast.success(msg);
    onClose();
  };
  const create = trpc.activities.create.useMutation({
    onSuccess: (r) => done(r.ids.length === 1 ? "Aktiviteten är upplagd" : `${r.ids.length} aktiviteter är upplagda`),
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.activities.update.useMutation({
    onSuccess: (r) => done(r.changed === 1 ? "Aktiviteten är ändrad" : `${r.changed} tillfällen är ändrade`),
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!f.title.trim()) return toast.error("Ange en rubrik");
    if (edit) return update.mutate({ id: edit.id, scope, fields: f, date: scope === "one" ? date : undefined });
    if (chosen.length === 0) return toast.error(repeat ? "Välj veckodag och slutdatum" : "Välj ett datum");
    create.mutate({ fields: f, dates: chosen });
  };
  const busy = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={edit ? "Ändra aktivitet" : "Ny aktivitet"}>
      <div className="bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto text-white">
        <div className="sticky top-0 bg-[#141414] border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <h2 className="font-bold flex-1" style={HEAD_FONT}>
            {edit ? "Ändra aktivitet" : "Ny aktivitet"}
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setF((x) => ({ ...x, type: t, ...(edit ? {} : templateFor(t, recent)) }))}
                className={`text-xs px-3 py-1.5 rounded-full border ${f.type === t ? TYPE_COLORS[t] : "border-white/10 text-white/50"}`}
              >
                {ACTIVITY_TYPE_NAMES[t]}
              </button>
            ))}
          </div>

          <div>
            <label className={labelCls} htmlFor="act-title">Rubrik</label>
            <input id="act-title" className={inputCls} value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="Match Vita mot Gröna" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 sm:col-span-1">
              <label className={labelCls} htmlFor="act-date">{repeat ? "Från" : "Datum"}</label>
              <input id="act-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="act-start">Start</label>
              <input id="act-start" type="time" className={inputCls} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="act-end">Slut</label>
              <input id="act-end" type="time" className={inputCls} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>

          {!edit && (
            <div className="rounded-xl border border-white/10 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <Repeat size={14} className="text-white/50" /> Återkommande (t.ex. tilldelade istider)
              </label>
              {repeat && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_NAMES.map((w, i) => (
                      <button
                        key={w}
                        onClick={() => setWeekdays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
                        className={`text-xs px-2.5 py-1 rounded-full border ${weekdays.includes(i) ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/10 text-white/60"}`}
                      >
                        {w.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="act-until">Till och med</label>
                    <input id="act-until" type="date" className={inputCls} value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
                  </div>
                  {dates.length > 0 && (
                    <div>
                      <p className="text-xs text-white/60 mb-1.5">
                        {chosen.length} tillfällen – bocka ur de som inte blir av (t.ex. lov):
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {dates.map((d) => {
                          const off = skipped.includes(d);
                          return (
                            <button
                              key={d}
                              onClick={() => setSkipped((x) => (off ? x.filter((y) => y !== d) : [...x, d]))}
                              className={`text-[11px] px-2 py-0.5 rounded border ${off ? "border-white/10 text-white/30 line-through" : "border-emerald-400/30 text-emerald-200 bg-emerald-500/10"}`}
                            >
                              {shortDate(d)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="act-loc">Plats</label>
            <input id="act-loc" className={inputCls} value={f.location} maxLength={120} onChange={(e) => set("location", e.target.value)} placeholder="C-hallen" />
          </div>
          <div>
            <label className={labelCls} htmlFor="act-text">Text i kallelsen (valfri)</label>
            <textarea id="act-text" className={`${inputCls} min-h-[70px]`} value={f.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div>
            <span className={labelCls}>Vilka som kallas</span>
            <div className="flex flex-wrap gap-2">
              {INVITES.map((i) => (
                <button
                  key={i}
                  onClick={() => set("invite", i)}
                  className={`text-xs px-3 py-1.5 rounded-full border ${f.invite === i ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/10 text-white/60"}`}
                >
                  {INVITE_NAMES[i]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls} htmlFor="act-max">Max antal</label>
              <input id="act-max" inputMode="numeric" className={inputCls} value={f.maxParticipants ?? ""} placeholder="Ingen gräns" onChange={(e) => set("maxParticipants", numOrNull(e.target.value) || null)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="act-open">Öppnar (dagar före)</label>
              <input id="act-open" inputMode="numeric" className={inputCls} value={f.opensDaysBefore ?? ""} placeholder="Direkt" onChange={(e) => set("opensDaysBefore", numOrNull(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="act-close">Stänger (timmar före)</label>
              <input id="act-close" inputMode="numeric" className={inputCls} value={f.closesHoursBefore ?? ""} placeholder="Vid start" onChange={(e) => set("closesHoursBefore", numOrNull(e.target.value))} />
            </div>
          </div>
          {f.maxParticipants != null && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.waitlist} onChange={(e) => set("waitlist", e.target.checked)} />
              Reservlista när det är fullt
            </label>
          )}
          <p className="text-[11px] text-white/40">Avanmälan går alltid, även efter att anmälan stängt.</p>

          {edit?.seriesId && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 space-y-2 text-sm">
              <p className="text-amber-100 text-xs">Aktiviteten ingår i en serie. Vad ska ändras?</p>
              <label className="flex items-center gap-2">
                <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} /> Bara detta tillfälle
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={scope === "following"} onChange={() => setScope("following")} /> Detta och alla kommande (datumen behålls)
              </label>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-[#141414] border-t border-white/10 px-4 py-3 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-white/10 text-white/70">
            Avbryt
          </button>
          <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {edit ? "Spara" : chosen.length > 1 ? `Lägg upp ${chosen.length} tillfällen` : "Lägg upp"}
          </button>
        </div>
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
  const [editing, setEditing] = useState(false);
  const [askScope, setAskScope] = useState<null | "cancel" | "remove" | "restore">(null);
  const [search, setSearch] = useState("");

  const refresh = () => {
    utils.activities.get.invalidate({ id });
    utils.activities.list.invalidate();
  };
  const setAtt = trpc.activities.setAttendance.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const cancel = trpc.activities.cancel.useMutation({
    onSuccess: (r, v) => {
      refresh();
      toast.success(v.cancelled ? `${r.changed === 1 ? "Aktiviteten" : `${r.changed} tillfällen`} är inställd${r.changed === 1 ? "" : "a"}` : "Aktiviteten blir av igen");
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

  if (q.isLoading)
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
        <Header title="Aktivitet" back="/aktiviteter" />
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-white/40" />
        </div>
      </div>
    );
  if (!q.data)
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
        <Header title="Aktivitet" back="/aktiviteter" />
        <p className="p-4 text-red-300 text-sm">{q.error?.message ?? "Aktiviteten finns inte"}</p>
      </div>
    );

  const { activity: a, yes, no, reserve, roster, window: win } = q.data;
  const start = stockholmParts(new Date(a.startsAt));
  const answered = new Set([...yes, ...no, ...reserve].map((x) => x.playerId));
  const needle = search.trim().toLowerCase();
  const addable = roster.filter((p) => !answered.has(p.id) && (!needle || `${p.name} ${p.number}`.toLowerCase().includes(needle)));
  const goalies = yes.filter((x) => x.position === "MV").length;
  const lineupType = a.type === "training" || a.type === "match";
  const now = Date.now();
  const opensAt = win.opensAt ? new Date(win.opensAt) : null;
  const closesAt = new Date(win.closesAt);
  const signupState = a.cancelled
    ? "Inställd"
    : opensAt && now < +opensAt
      ? `Anmälan öppnar ${fmtDateTime(opensAt)}`
      : now < +closesAt
        ? `Anmälan öppen till ${fmtDateTime(closesAt)}`
        : "Anmälan stängd (avanmälan går fortfarande)";

  const editFields: Fields = {
    type: a.type as ActivityType,
    title: a.title,
    location: a.location,
    description: a.description ?? "",
    invite: (INVITES as readonly string[]).includes(a.invite) ? (a.invite as Invite) : "all",
    startTime: start.time,
    endTime: a.endsAt ? stockholmParts(new Date(a.endsAt)).time : "",
    maxParticipants: a.maxParticipants,
    waitlist: a.waitlist,
    opensDaysBefore: a.opensDaysBefore,
    closesHoursBefore: a.closesHoursBefore,
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

  const Row = ({ p, status }: { p: (typeof yes)[number]; status: "yes" | "no" | "reserve" }) => (
    <li className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
      <PosBadge position={p.position} />
      <span className={`flex-1 min-w-0 truncate ${p.isMember ? "" : "text-white/50"}`}>
        {p.name}
        {p.number && <span className="text-white/40"> #{p.number}</span>}
        {!p.isMember && <span className="text-[10px] text-white/40 ml-1.5">(ej medlem)</span>}
      </span>
      {status !== "yes" && (
        <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: "yes" })} className="text-[11px] px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300">
          Kommer
        </button>
      )}
      {status !== "no" && (
        <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: "no" })} className="text-[11px] px-2 py-0.5 rounded border border-white/15 text-white/60">
          Kommer inte
        </button>
      )}
      <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.playerId, status: null })} aria-label={`Ta bort ${p.name}`} className="text-white/30 hover:text-red-300">
        <X size={14} />
      </button>
    </li>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <Header title={a.title} back="/aktiviteter" />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 ${a.cancelled ? "opacity-70" : ""}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeChip type={a.type} />
            {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
            {a.seriesId && (
              <span className="text-[10px] text-white/40 inline-flex items-center gap-1">
                <Repeat size={10} /> ingår i en serie
              </span>
            )}
          </div>
          <div className="text-xl font-bold" style={HEAD_FONT}>
            {shortDate(start.date)} · {timeRange(a.startsAt, a.endsAt)}
          </div>
          {a.location && (
            <div className="text-sm text-white/70 inline-flex items-center gap-1">
              <MapPin size={13} /> {a.location}
            </div>
          )}
          {a.description && <p className="text-sm text-white/80 whitespace-pre-line">{a.description}</p>}
          <div className="text-xs text-white/50">
            Kallas: {INVITE_NAMES[editFields.invite]} · {signupState}
            {a.maxParticipants ? ` · max ${a.maxParticipants}${a.waitlist ? " (reservlista)" : ""}` : ""}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => setEditing(true)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 inline-flex items-center gap-1.5">
              <Pencil size={13} /> Ändra
            </button>
            {a.cancelled ? (
              <button onClick={() => startScoped("restore")} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 inline-flex items-center gap-1.5">
                <RotateCcw size={13} /> Blir av ändå
              </button>
            ) : (
              <button onClick={() => startScoped("cancel")} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 inline-flex items-center gap-1.5">
                <Ban size={13} /> Ställ in
              </button>
            )}
            <button onClick={() => startScoped("remove")} className="text-xs px-3 py-1.5 rounded-lg border border-red-400/30 text-red-300 inline-flex items-center gap-1.5">
              <Trash2 size={13} /> Ta bort
            </button>
          </div>
          {askScope && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm space-y-2">
              <p className="text-xs text-amber-100">
                {askScope === "remove" ? "Ta bort" : askScope === "cancel" ? "Ställa in" : "Återställa"} bara detta tillfälle eller även alla kommande i serien?
                {askScope === "remove" && " Anmälningarna tas också bort."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => doScoped(askScope, "one")} className="text-xs px-3 py-1.5 rounded-lg bg-white/10">
                  Bara detta
                </button>
                <button onClick={() => doScoped(askScope, "following")} className="text-xs px-3 py-1.5 rounded-lg bg-white/10">
                  Detta och alla kommande
                </button>
                <button onClick={() => setAskScope(null)} className="text-xs px-3 py-1.5 rounded-lg text-white/60">
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            Kommer ({yes.length}
            {a.maxParticipants ? `/${a.maxParticipants}` : ""})
            {lineupType && <span className={`text-xs font-normal ${goalies < 2 ? "text-amber-300" : "text-white/40"}`}>MV {goalies}/2</span>}
          </h2>
          <ul className="rounded-xl border border-white/10 bg-white/[0.02]">
            {yes.length === 0 && <li className="px-3 py-3 text-sm text-white/40">Ingen anmäld än.</li>}
            {yes.map((p) => (
              <Row key={p.playerId} p={p} status="yes" />
            ))}
          </ul>
        </section>

        {reserve.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">Reserv ({reserve.length})</h2>
            <ul className="rounded-xl border border-white/10 bg-white/[0.02]">
              {reserve.map((p) => (
                <Row key={p.playerId} p={p} status="reserve" />
              ))}
            </ul>
          </section>
        )}

        {no.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2 text-white/70">Kommer inte ({no.length})</h2>
            <ul className="rounded-xl border border-white/10 bg-white/[0.02] opacity-80">
              {no.map((p) => (
                <Row key={p.playerId} p={p} status="no" />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-1">Lägg till ur truppen</h2>
          <p className="text-[11px] text-white/40 mb-2">Även spelare som inte är medlemmar, t.ex. en extern målvakt. Max antal gäller inte här.</p>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2 mb-2">
            <Search size={14} className="text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn eller nummer" className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
          </div>
          <ul className="rounded-xl border border-white/10 bg-white/[0.02] max-h-80 overflow-y-auto">
            {addable.length === 0 && <li className="px-3 py-3 text-sm text-white/40">Inga fler spelare.</li>}
            {addable.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
                <PosBadge position={p.position} />
                <span className={`flex-1 min-w-0 truncate ${p.isMember ? "" : "text-white/50"}`}>
                  {p.name}
                  {p.number && <span className="text-white/40"> #{p.number}</span>}
                </span>
                <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.id, status: "yes" })} className="text-[11px] px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300">
                  Kommer
                </button>
                <button onClick={() => setAtt.mutate({ activityId: id, playerId: p.id, status: "no" })} className="text-[11px] px-2 py-0.5 rounded border border-white/15 text-white/60">
                  Kommer inte
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
      {editing && (
        <ActivityForm onClose={() => setEditing(false)} recent={recent.data ?? []} edit={{ id, seriesId: a.seriesId, date: start.date, fields: editFields }} />
      )}
    </div>
  );
}
