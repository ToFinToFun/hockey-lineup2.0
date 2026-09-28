/**
 * Inställningar (styrelsen): allt som styr appen på ett ställe.
 *  - PIR: hur det fungerar, träffsäkerhet, förklaring per spelare, vikter och justeringar
 *  - Sponsorer: registret med loggor och räknare
 *  - Perioder: försäsong, säsong och slutspel för statistiken
 *  - laget.se: kontot som används och anslutningstest
 *  - Om appen: version och databas
 * Fliken styrs av ?flik= i adressen, så länkar och tillbaka-knappen fungerar.
 */
import { useEffect, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { ArrowLeft, Gauge, Handshake, CalendarRange, Link2, Info, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PirPanel } from "./PirPanel";
import { PeriodsPanel } from "./PeriodsPanel";
import { SponsorsPanel } from "../sponsors/SponsorsApp";
import { DatabaseInfo } from "@/components/auth/DatabaseInfo";

const TABS = [
  { id: "pir", label: "PIR", icon: Gauge },
  { id: "sponsorer", label: "Sponsorer", icon: Handshake },
  { id: "perioder", label: "Perioder", icon: CalendarRange },
  { id: "laget", label: "laget.se", icon: Link2 },
  { id: "om", label: "Om appen", icon: Info },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function SettingsApp() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const fromUrl = new URLSearchParams(search).get("flik");
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "pir");
  useEffect(() => {
    if (fromUrl && TABS.some((t) => t.id === fromUrl) && fromUrl !== tab) setTab(fromUrl as TabId);
  }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id: TabId) => {
    setTab(id);
    navigate(`/installningar?flik=${id}`, { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Inställningar</h1>
        </div>
        <nav className="max-w-3xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => choose(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                tab === id ? "bg-[#0a7ea4] text-white" : "bg-white/5 text-white/55 hover:text-white"
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {tab === "pir" && <PirPanel />}
        {tab === "sponsorer" && <SponsorsPanel />}
        {tab === "perioder" && <PeriodsPanel />}
        {tab === "laget" && <LagetPanel />}
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
