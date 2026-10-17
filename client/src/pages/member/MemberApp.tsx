/**
 * Medlemmarna: logga in med e-post (kod eller länk) och svara på kallelser.
 *
 * /logga-in      – e-post → kod (eller länk från mejlet)
 * /mina          – mina kommande aktiviteter med ✓ / ✕
 * /mina/:id      – en aktivitet: info, extra avgift, mitt svar och vilka som kommer
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Loader2, LogOut, MapPin, Smartphone, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { shortDate, stockholmParts } from "@shared/activities";
import { dayMark } from "@shared/holidays";
import { DayBadge, FeeBox, PlayerName, PosBadge, TypeChip } from "../activities/ActivitiesApp";

const HEAD_FONT = { fontFamily: "'Oswald', sans-serif" };
const inputCls =
  "w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a7ea4]";
const primary = "w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 disabled:opacity-50";

const timeRange = (startsAt: Date | string, endsAt: Date | string | null) => {
  const s = stockholmParts(new Date(startsAt)).time;
  return endsAt ? `${s}–${stockholmParts(new Date(endsAt)).time}` : s;
};
const fmt = (d: Date | string) => {
  const p = stockholmParts(new Date(d));
  return `${shortDate(p.date)} kl ${p.time}`;
};

function Shell({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        {back && (
          <Link href={back} className="text-white/60 hover:text-white" aria-label="Tillbaka">
            <ArrowLeft size={20} />
          </Link>
        )}
        <h1 className="text-lg font-bold flex-1 truncate" style={HEAD_FONT}>
          {title}
        </h1>
      </header>
      <main className="max-w-lg mx-auto p-4">{children}</main>
    </div>
  );
}

export default function MemberApp() {
  const [isLogin] = useRoute("/logga-in");
  const [, detail] = useRoute("/mina/:id");
  if (isLogin) return <Login />;
  if (detail?.id) return <Detail id={Number(detail.id)} />;
  return <Mine />;
}

// ─── Logga in ────────────────────────────────────────────────────────────────

function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("t");
  // Tillbaka dit man var på väg (t.ex. länken i kallelsen)
  const next = /^\/mina(\/\d+)?$/.test(params.get("next") ?? "") ? params.get("next")! : "/mina";
  const utils = trpc.useUtils();
  const me = trpc.member.me.useQuery();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [choice, setChoice] = useState<{ ticket: string; choices: { memberId: number; name: string }[] } | null>(null);

  const done = (r: { done: boolean; ticket?: string; choices?: { memberId: number; name: string }[] }) => {
    if (!r.done && r.ticket && r.choices) return setChoice({ ticket: r.ticket, choices: r.choices });
    utils.member.invalidate();
    navigate(next);
  };
  const request = trpc.member.requestCode.useMutation({ onSuccess: () => setStep("code"), onError: (e) => toast.error(e.message) });
  const verify = trpc.member.verifyCode.useMutation({ onSuccess: done, onError: (e) => toast.error(e.message) });
  const link = trpc.member.verifyLink.useMutation({ onSuccess: done, onError: (e) => toast.error(e.message) });
  const choose = trpc.member.choose.useMutation({ onSuccess: () => done({ done: true }), onError: (e) => toast.error(e.message) });

  useEffect(() => {
    if (me.data) navigate(next);
  }, [me.data, navigate, next]);

  if (choice)
    return (
      <Shell title="Vem loggar in?">
        <p className="text-white/70 mb-4">Flera medlemmar har samma e-postadress. Välj vem du är:</p>
        <div className="space-y-2">
          {choice.choices.map((c) => (
            <button key={c.memberId} onClick={() => choose.mutate({ ticket: choice.ticket, memberId: c.memberId })} className="w-full text-left rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 font-semibold">
              {c.name}
            </button>
          ))}
        </div>
      </Shell>
    );

  // Länken från mejlet: logga in först när man trycker (skydd mot e-postens förhandsgranskning)
  if (token)
    return (
      <Shell title="Logga in">
        <div className="space-y-4 pt-6 text-center">
          <img src="/images/logo.png" alt="" className="w-20 h-20 mx-auto" onError={(e) => (e.currentTarget.style.display = "none")} />
          <p className="text-white/70">Tryck för att logga in i Stålstadens app.</p>
          <button onClick={() => link.mutate({ token })} disabled={link.isPending} className={primary}>
            {link.isPending && <Loader2 size={16} className="animate-spin" />} Logga in
          </button>
        </div>
      </Shell>
    );

  return (
    <Shell title="Logga in" back="/">
      <div className="space-y-5 pt-4">
        {step === "email" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate({ email });
            }}
          >
            <p className="text-white/70">Skriv e-postadressen du har i föreningens medlemsregister. Du får en kod på mejlen.</p>
            <input className={inputCls} type="email" autoComplete="email" inputMode="email" placeholder="namn@exempel.se" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button type="submit" disabled={request.isPending || !email} className={primary}>
              {request.isPending && <Loader2 size={16} className="animate-spin" />} Skicka kod
            </button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate({ email, code });
            }}
          >
            <p className="text-white/70">
              Om <strong className="text-white">{email}</strong> finns i registret har vi skickat en kod. Den gäller i 15 minuter.
            </p>
            <input
              className={`${inputCls} text-center text-2xl tracking-[0.4em] font-semibold`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
            <button type="submit" disabled={verify.isPending || code.length !== 6} className={primary}>
              {verify.isPending && <Loader2 size={16} className="animate-spin" />} Logga in
            </button>
            <button type="button" onClick={() => setStep("email")} className="w-full text-sm text-white/50 py-2">
              Fel adress eller ingen kod? Försök igen
            </button>
          </form>
        )}
      </div>
    </Shell>
  );
}

// ─── Mina aktiviteter ────────────────────────────────────────────────────────

function Answer({ id, status, disabledYes, compact }: { id: number; status: "yes" | "no" | "reserve" | null; disabledYes?: boolean; compact?: boolean }) {
  const utils = trpc.useUtils();
  const respond = trpc.member.respond.useMutation({
    onSuccess: (r) => {
      utils.member.activities.invalidate();
      utils.member.activity.invalidate({ id });
      if (r.status === "reserve") toast("Det är fullt – du står på reservlistan");
    },
    onError: (e) => toast.error(e.message),
  });
  const yesOn = status === "yes" || status === "reserve";
  const size = compact ? "h-10 px-3 text-sm" : "h-12 px-4 text-base flex-1";
  return (
    <div className={`flex gap-2 ${compact ? "" : "w-full"}`}>
      <button
        onClick={(e) => {
          e.preventDefault();
          respond.mutate({ id, status: "yes" });
        }}
        disabled={respond.isPending || (disabledYes && !yesOn)}
        aria-pressed={yesOn}
        className={`${size} rounded-xl border font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 ${yesOn ? "bg-emerald-600 border-emerald-600 text-white" : "border-white/15 text-white/70"}`}
      >
        <Check size={18} /> {compact ? "" : status === "reserve" ? "Reserv" : "Kommer"}
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          respond.mutate({ id, status: "no" });
        }}
        disabled={respond.isPending}
        aria-pressed={status === "no"}
        className={`${size} rounded-xl border font-semibold inline-flex items-center justify-center gap-1.5 ${status === "no" ? "bg-red-500/80 border-red-500/80 text-white" : "border-white/15 text-white/70"}`}
      >
        <X size={18} /> {compact ? "" : "Kommer inte"}
      </button>
    </div>
  );
}

function Mine() {
  const [, navigate] = useLocation();
  const me = trpc.member.me.useQuery();
  const list = trpc.member.activities.useQuery(undefined, { enabled: !!me.data });

  useEffect(() => {
    if (me.data === null) navigate("/logga-in");
  }, [me.data, navigate]);

  if (!me.data)
    return (
      <Shell title="Mina aktiviteter">
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-white/40" />
        </div>
      </Shell>
    );

  return (
    <Shell title="Mina aktiviteter" back="/">
      <div className="space-y-4">
        <p className="text-white/60 text-sm">Hej {me.data.name?.split(" ")[0] ?? ""}!</p>
        {list.data && !list.data.linked && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Du är inte kopplad till en spelare än. Kontakta styrelsen, så fixar de det.
          </p>
        )}
        {list.data?.linked && list.data.items.length === 0 && <p className="text-white/40 py-8 text-center">Inga kommande aktiviteter.</p>}
        <ul className="space-y-2">
          {list.data?.items.map((a) => {
            const start = stockholmParts(new Date(a.startsAt));
            const mark = dayMark(start.date);
            return (
              <li key={a.id}>
                <Link href={`/mina/${a.id}`}>
                  <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 cursor-pointer ${a.cancelled ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TypeChip type={a.type} />
                      {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
                      <DayBadge mark={mark} />
                      {a.feeEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200">Avgift</span>}
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{a.title}</div>
                        <div className="text-sm text-white/60">
                          {shortDate(start.date)} kl {timeRange(a.startsAt, a.endsAt)}
                        </div>
                        {a.location && <div className="text-xs text-white/45 truncate">{a.location}</div>}
                        <div className="text-xs text-white/45 mt-0.5">
                          {a.yes} kommer{a.maxParticipants ? ` av ${a.maxParticipants}` : ""}
                          {a.notOpenYet && a.opensAt ? ` · anmälan öppnar ${fmt(a.opensAt)}` : a.closed ? " · anmälan stängd" : ""}
                        </div>
                      </div>
                      {!a.cancelled && <Answer id={a.id} status={a.myStatus} disabledYes={a.notOpenYet || a.closed} compact />}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <Devices />
      </div>
    </Shell>
  );
}

function Devices() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const devices = trpc.member.devices.useQuery(undefined, { enabled: open });
  const out = trpc.member.logoutDevice.useMutation({ onSuccess: () => utils.member.devices.invalidate() });
  const logout = trpc.member.logout.useMutation({
    onSuccess: () => {
      utils.member.invalidate();
      navigate("/");
    },
  });
  const all = trpc.member.logoutAll.useMutation({
    onSuccess: () => {
      utils.member.invalidate();
      navigate("/");
    },
  });
  return (
    <section className="pt-6 space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setOpen((x) => !x)} className="flex-1 text-sm rounded-xl border border-white/10 py-2.5 text-white/70 inline-flex items-center justify-center gap-2">
          <Smartphone size={15} /> Mina enheter
        </button>
        <button onClick={() => logout.mutate()} className="flex-1 text-sm rounded-xl border border-white/10 py-2.5 text-white/70 inline-flex items-center justify-center gap-2">
          <LogOut size={15} /> Logga ut
        </button>
      </div>
      {open && (
        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          {devices.data?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="flex-1 min-w-0">
                <div>
                  {d.device || "Okänd enhet"}
                  {d.current && <span className="text-emerald-300 text-xs ml-1.5">den här</span>}
                </div>
                <div className="text-xs text-white/40">Senast {fmt(d.lastSeenAt)}</div>
              </div>
              {!d.current && (
                <button onClick={() => out.mutate({ id: d.id })} className="text-xs text-red-300 px-2 py-1">
                  Logga ut
                </button>
              )}
            </div>
          ))}
          <button onClick={() => all.mutate()} className="w-full text-xs text-red-300 py-2.5">
            Logga ut alla enheter
          </button>
        </div>
      )}
    </section>
  );
}

// ─── En aktivitet ────────────────────────────────────────────────────────────

function Detail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const q = trpc.member.activity.useQuery({ id }, { retry: false });
  useEffect(() => {
    if (q.error?.data?.code === "UNAUTHORIZED") navigate(`/logga-in?next=/mina/${id}`);
  }, [q.error, id, navigate]);
  if (!q.data)
    return (
      <Shell title="Aktivitet" back="/mina">
        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-white/40" />
          </div>
        ) : (
          <p className="text-red-300 text-sm">{q.error?.message}</p>
        )}
      </Shell>
    );
  const { activity: a, myStatus, yes, reserve, playerId } = q.data;
  const start = stockholmParts(new Date(a.startsAt));
  const status = a.cancelled
    ? "Aktiviteten är inställd."
    : q.data.notOpenYet && q.data.opensAt
      ? `Anmälan öppnar ${fmt(q.data.opensAt)}.`
      : q.data.closed
        ? "Anmälan har stängt. Du kan fortfarande lämna återbud."
        : `Anmälan är öppen till ${fmt(q.data.closesAt)}.`;
  return (
    <Shell title="Aktivitet" back="/mina">
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={a.type} />
            {a.cancelled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Inställd</span>}
            <DayBadge mark={dayMark(start.date)} />
          </div>
          <h2 className="text-2xl font-bold leading-tight" style={HEAD_FONT}>
            {a.title}
          </h2>
          <div className="text-white/80 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock size={15} className="text-white/50" /> {shortDate(start.date)} kl {timeRange(a.startsAt, a.endsAt)}
            </div>
            {a.location && (
              <div className="flex items-center gap-1.5">
                <MapPin size={15} className="text-white/50" /> {a.location}
              </div>
            )}
          </div>
          {a.description && <p className="text-white/80 whitespace-pre-line">{a.description}</p>}
          {a.feeEnabled && <FeeBox amount={a.feeAmount} reason={a.feeReason} swish={a.feeSwish} />}
          <p className="text-sm text-white/50">{status}</p>
          {!a.cancelled && <Answer id={a.id} status={myStatus} disabledYes={q.data.notOpenYet || q.data.closed} />}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            Kommer <span className="text-white/50 font-normal">({yes.length}{a.maxParticipants ? ` av ${a.maxParticipants}` : ""})</span>
          </h3>
          <ul className="rounded-xl border border-white/10 bg-white/[0.02]">
            {yes.length === 0 && <li className="px-3 py-3 text-sm text-white/40">Ingen anmäld än.</li>}
            {yes.map((p) => (
              <li key={p.playerId} className={`flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0 ${p.playerId === playerId ? "bg-emerald-500/10" : ""}`}>
                <PosBadge position={p.position} />
                <PlayerName name={p.name} number={p.number} isMember={p.isMember} />
              </li>
            ))}
          </ul>
          {reserve.length > 0 && (
            <>
              <h3 className="text-sm font-semibold pt-2">Reserver ({reserve.length})</h3>
              <ul className="rounded-xl border border-white/10 bg-white/[0.02]">
                {reserve.map((p) => (
                  <li key={p.playerId} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
                    <PosBadge position={p.position} />
                    <PlayerName name={p.name} number={p.number} isMember={p.isMember} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
