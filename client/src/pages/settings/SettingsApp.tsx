/**
 * Inställningar (styrelsen): allt som styr appen på ett ställe. Startsidan visar
 * delarna i grupper; ?flik= i adressen öppnar en del (länkar och tillbaka fungerar).
 *  - PIR: hur det fungerar, träffsäkerhet, förklaring per spelare, vikter och justeringar
 *  - Sponsorer: registret med loggor och räknare
 *  - Perioder: försäsong, säsong och slutspel för statistiken
 *  - laget.se: kontot som används och anslutningstest
 *  - Om appen: version och databas
 * Fliken styrs av ?flik= i adressen, så länkar och tillbaka-knappen fungerar.
 */
import { useEffect, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { ArrowLeft, Gauge, Handshake, CalendarRange, Link2, Info, Loader2, CheckCircle2, AlertTriangle, ExternalLink, Bell, Shield, Swords, KeyRound, ChevronRight, Radio, Globe } from "lucide-react";
import { AccessPanel } from "./AccessPanel";
import { OpponentsPanel } from "./OpponentsPanel";
import { ClubPanel } from "./ClubPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { ExternalPanel } from "./ExternalPanel";
import { trpc } from "@/lib/trpc";
import { PirPanel } from "./PirPanel";
import { PeriodsPanel } from "./PeriodsPanel";
import { SponsorsPanel } from "../sponsors/SponsorsApp";
import { DatabaseInfo } from "@/components/auth/DatabaseInfo";

const TABS = [
  { id: "klubb", label: "Klubb", hint: "Namn, lag, färger och loggor", icon: Shield },
  { id: "motstandare", label: "Motståndare", hint: "Lag vi möter, deras spelare och länkar", icon: Swords },
  { id: "perioder", label: "Perioder", hint: "Försäsong, säsong och slutspel", icon: CalendarRange },
  { id: "pir", label: "PIR", hint: "Player Impact Rating: vikter, gränser och träffsäkerhet", icon: Gauge },
  { id: "sponsorer", label: "Sponsorer", hint: "Registret med loggor och räknare", icon: Handshake },
  { id: "live", label: "Live", hint: "Livesidan och Läktaren (hjärtan och kommentarer)", icon: Radio },
  { id: "laget", label: "laget.se", hint: "Konto, anslutning och automatisk nyhet", icon: Link2 },
  { id: "externa", label: "Externa källor", hint: "SHL-tabell och matcher (API-nyckel)", icon: Globe },
  { id: "notiser", label: "Notiser", hint: "Vem som får vilka mejl", icon: Bell },
  { id: "atkomst", label: "Åtkomst", hint: "Delade länkar till moduler (utan styrelselösenordet)", icon: KeyRound },
  { id: "om", label: "Om", hint: "Version och databas", icon: Info },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Grupperna på startsidan */
const GROUPS: Array<{ title: string; tabs: TabId[] }> = [
  { title: "Klubb och lag", tabs: ["klubb", "motstandare", "perioder"] },
  { title: "Match och data", tabs: ["pir", "sponsorer", "live"] },
  { title: "Kopplingar", tabs: ["laget", "externa", "notiser"] },
  { title: "Åtkomst", tabs: ["atkomst"] },
  { title: "", tabs: ["om"] },
];

export default function SettingsApp() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const fromUrl = new URLSearchParams(search).get("flik");
  const tab: TabId | null = TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : null;
  const current = TABS.find((t) => t.id === tab);
  const open = (id: TabId) => navigate(`/installningar?flik=${id}`);

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {tab ? (
            <button onClick={() => navigate("/installningar")} className="text-white/60 hover:text-white" aria-label="Tillbaka till inställningar"><ArrowLeft size={20} /></button>
          ) : (
            <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          )}
          <h1 className="text-lg font-bold flex-1 truncate" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {current ? <><Link href="/installningar" className="text-white/45 font-normal" title="Till inställningarna">Inställningar · </Link>{current.label}</> : <Link href="/" title="Till startsidan">Inställningar</Link>}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {!tab && (
          <div className="space-y-5">
            {GROUPS.map((g, gi) => (
              <section key={gi}>
                {g.title && <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1.5 px-1">{g.title}</h2>}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5 overflow-hidden">
                  {g.tabs.map((id) => {
                    const t = TABS.find((x) => x.id === id)!;
                    const Icon = t.icon;
                    return (
                      <button key={id} onClick={() => open(id)} className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/5">
                        <Icon size={18} className="text-sky-300/80 shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold">{t.label}</span>
                          <span className="block text-[11px] text-white/45 truncate">{t.hint}</span>
                        </span>
                        <ChevronRight size={16} className="text-white/25 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {tab === "pir" && <PirPanel />}
        {tab === "sponsorer" && <SponsorsPanel />}
        {tab === "perioder" && <PeriodsPanel />}
        {tab === "laget" && <LagetPanel />}
        {tab === "notiser" && <NotificationsPanel />}
        {tab === "externa" && <ExternalPanel />}
        {tab === "klubb" && <ClubPanel />}
        {tab === "motstandare" && <OpponentsPanel />}
        {tab === "atkomst" && <AccessPanel />}
        {tab === "live" && <LivePanel />}
        {tab === "om" && <AboutPanel />}
      </main>
    </div>
  );
}

function LagetPanel() {
  const account = trpc.laget.newsAccount.useQuery(undefined, { staleTime: 60_000 });
  const test = trpc.settings.testLagetSeConnection.useMutation();
  const r = test.data;
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">
        Appen loggar in på laget.se med kontot i Coolify (LAGET_SE_USERNAME och LAGET_SE_PASSWORD) för att hämta och synka
        anmälningar och publicera nyheter. Byt konto där; kontot behöver vara admin för A-lag Herrar.
      </p>
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-1">
        <p className="text-xs text-white/50">Konto</p>
        <p className="text-sm font-semibold">{account.isLoading ? "…" : account.data?.name ?? "Kunde inte läsa kontots namn"}</p>
      </div>
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
        <p className="text-xs text-white/50">Anslutning</p>
        <button onClick={() => test.mutate()} disabled={test.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a7ea4] text-white text-xs font-semibold disabled:opacity-50">
          {test.isPending && <Loader2 size={14} className="animate-spin" />} Testa anslutningen
        </button>
        {r && (r.success ? (
          <p className="flex items-start gap-2 text-xs text-emerald-300">
            <CheckCircle2 size={14} className="shrink-0 mt-px" />
            Inloggningen fungerar. Nästa evenemang: {r.eventTitle ?? "–"} {r.eventDate ?? ""} ({r.totalRegistered ?? 0} anmälda).
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-red-300"><AlertTriangle size={14} className="shrink-0 mt-px" /> {r.error}</p>
        ))}
      </div>
      <AutoNewsSettings />
      {account.data?.adminUrl && (
        <a href={account.data.adminUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300/80 hover:text-sky-200">
          Nyheter i laget.se-admin <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
        <p className="text-xs text-white/50">Version</p>
        <p className="text-sm font-semibold">v{__APP_VERSION__} <span className="text-white/40 font-normal">· byggd {__BUILD_DATE__}</span></p>
      </div>
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
        <DatabaseInfo />
      </div>
    </div>
  );
}

/** Automatisk nyhet till laget.se före träningen. */
function AutoNewsSettings() {
  const utils = trpc.useUtils();
  const q = trpc.laget.autoNews.useQuery();
  const save = trpc.laget.setAutoNews.useMutation({ onSuccess: () => { void utils.laget.autoNews.invalidate(); } });
  const [cfg, setCfg] = useState<{ enabled: boolean; minutesBefore: number; minPlayers: number } | null>(null);
  useEffect(() => { if (q.data && !cfg) setCfg(q.data.config); }, [q.data, cfg]);
  if (!cfg) return null;
  const dirty = JSON.stringify(cfg) !== JSON.stringify(q.data?.config);
  const status = q.data?.status;
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">Automatisk nyhet</span>
          <span className="block text-[11px] text-white/45">Före träningen: uppdaterar en tidsinställd nyhet med aktuell uppställning, eller publicerar dagens lag om ingen nyhet finns.</span>
        </span>
        <input type="checkbox" className="w-5 h-5 shrink-0" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-white/50">Minuter före start
          <input type="number" min={15} max={240} value={cfg.minutesBefore} onChange={(e) => setCfg({ ...cfg, minutesBefore: Number(e.target.value) || 45 })}
            className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5" />
        </label>
        <label className="text-[11px] text-white/50">Minst anmälda i uppställningen
          <input type="number" min={1} max={40} value={cfg.minPlayers} onChange={(e) => setCfg({ ...cfg, minPlayers: Number(e.target.value) || 10 })}
            className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5" />
        </label>
      </div>
      <p className="text-[10px] text-white/35">
        Redan publicerade nyheter rörs inte. Förhandsvisning (eller varning vid för få spelare) går ut 15 min innan till dem som valt det under Notiser.
      </p>
      {status && (
        <p className={`text-[11px] ${status.ok ? "text-emerald-300/80" : "text-amber-300/90"}`}>
          Senast: {status.message}
        </p>
      )}
      <button onClick={() => save.mutate(cfg)} disabled={!dirty || save.isPending}
        className="w-full py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
        {save.isPending ? "Sparar…" : dirty ? "Spara" : "Sparat"}
      </button>
    </div>
  );
}


/** Live: livesidan och Läktaren */
function LivePanel() {
  const utils = trpc.useUtils();
  const cfg = trpc.live.getConfig.useQuery();
  const save = trpc.live.setConfig.useMutation({ onSuccess: () => void utils.live.getConfig.invalidate() });
  const on = cfg.data?.laktaren ?? true;
  const url = `${window.location.origin}/live`;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-[11px] text-white/45">
        Livesidan visar alltid aktuell eller nästa match: före matchen lagen, tid, hall och uppställningar (enligt publiceringen),
        under matchen ställning, mål och poäng när en inloggad Score Tracker trycker Starta live, och resultatet en halvtimme efter.
        Adressen läggs automatiskt i laget.se-nyheten.
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="block rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sky-300 break-all">{url}</a>
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3">
        <span className="flex-1">
          <span className="block font-semibold">Läktaren under livematcher</span>
          <span className="block text-[11px] text-white/45">Hjärtan i lagens färger och korta kommentarer (max 140 tecken). En kommentar per 10 s och max 50 per enhet och match. Kommentarerna raderas efter 24 h. Den som sänder kan dölja kommentarer.</span>
        </span>
        <button role="switch" aria-checked={on} aria-label="Läktaren under livematcher" disabled={!cfg.data || save.isPending}
          onClick={() => save.mutate({ laktaren: !on })}
          className={`shrink-0 w-11 h-6 rounded-full relative ${on ? "bg-emerald-500/70" : "bg-white/15"}`}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: on ? "22px" : "2px" }} />
        </button>
      </div>
      <p className="text-[11px] text-white/40">Unika tittare räknas utan kakor: en anonym kod per enhet och match som raderas när matchen är slut – bara antalet sparas.</p>
    </div>
  );
}
