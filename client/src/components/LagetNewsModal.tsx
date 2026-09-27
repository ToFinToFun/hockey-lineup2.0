// LagetNewsModal – förhandsgranska "Dagens lag" som nyhet till laget.se.
// Publicera direkt på laget.se (servern loggar in med föreningens konto),
// eller spara bilden och kopiera texten för att lägga in den manuellt.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Copy, Loader2, Send, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Player } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { trpc } from "@/lib/trpc";
import { fetchAttendanceFromApi } from "@/lib/laget";
import { useSponsors, pickLeastShown } from "@/lib/sponsors";
import {
  buildNewsBody,
  defaultPublishAt,
  defaultHome,
  formatNewsTitle,
  shortDate,
  type TeamKey,
} from "@/lib/lagetNews";
import { renderNewsImage } from "@/lib/newsImage";

interface LagetNewsModalProps {
  onClose: () => void;
  teamAName: string;
  teamBName: string;
  teamASlots: Slot[];
  teamBSlots: Slot[];
  teamALineup: Record<string, Player>;
  teamBLineup: Record<string, Player>;
  lineupText: string;
  logoWhite: string;
  logoGreen: string;
  bgUrl: string;
}

interface EventDetails {
  date?: string;
  time?: string;
  location?: string;
}

function weekdayLine(isoDate: string | undefined): string {
  const m = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  const wd = d.toLocaleDateString("sv-SE", { weekday: "long" });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${shortDate(isoDate)}`;
}

export function LagetNewsModal(props: LagetNewsModalProps) {
  const { onClose, teamAName, teamBName, teamASlots, teamBSlots, teamALineup, teamBLineup, lineupText, logoWhite, logoGreen, bgUrl } = props;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [eventLoaded, setEventLoaded] = useState(false);
  const { sponsors, query: sponsorsQuery } = useSponsors();
  const activeSponsors = useMemo(() => sponsors.filter((s) => s.active), [sponsors]);
  // null = inte valt än, 0 = ingen sponsor
  const [sponsorId, setSponsorId] = useState<number | null>(null);
  const sponsorObj = activeSponsors.find((s) => s.id === sponsorId) ?? null;
  const sponsor = sponsorObj?.name ?? "";
  const recordNews = trpc.sponsors.recordNews.useMutation();

  // Standard: den sponsor som visats minst i laguppställningar denna säsong
  useEffect(() => {
    if (sponsorId !== null || sponsorsQuery.isLoading) return;
    setSponsorId(pickLeastShown(activeSponsors, (s) => s.counts.lineups)?.id ?? 0);
  }, [sponsorId, sponsorsQuery.isLoading, activeSponsors]);
  const [home, setHome] = useState<TeamKey>("a");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [body, setBody] = useState("");
  const [bodyEdited, setBodyEdited] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPublisher, setShowPublisher] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  // Publiceringstid: direkt eller tidsinställd (standard evenemangsdagen 21:15)
  const [scheduled, setScheduled] = useState(false);
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("21:15");
  const scheduleInitialized = useRef(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ url: string; updated: boolean; publishAt: string | null } | null>(null);
  const utils = trpc.useUtils();
  const lastPublished = trpc.laget.newsLastPublished.useQuery(undefined, { refetchOnWindowFocus: false });
  const publishNews = trpc.laget.publishNews.useMutation();
  const blobRef = useRef<Blob | null>(null);
  const homeRecorded = useRef(false);

  const lastHomeQuery = trpc.laget.newsLastHome.useQuery(undefined, { refetchOnWindowFocus: false });
  const setLastHome = trpc.laget.setNewsLastHome.useMutation();

  // Standard: motsatt hemmalag mot förra nyheten
  useEffect(() => {
    if (lastHomeQuery.data) setHome(defaultHome(lastHomeQuery.data.lastHome));
  }, [lastHomeQuery.data]);

  // Datum, tid och plats från evenemanget (senaste hämtningen återanvänds om den är färsk)
  useEffect(() => {
    let cancelled = false;
    fetchAttendanceFromApi(false)
      .then((d) => {
        if (cancelled) return;
        setEvent(d.noEvent ? null : { date: d.eventDate || undefined, time: d.eventTime, location: d.eventLocation });
      })
      .catch(() => {
        if (!cancelled) setEvent(null);
      })
      .finally(() => {
        if (!cancelled) setEventLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autoTitle = useMemo(
    () => formatNewsTitle({ date: event?.date, location: event?.location, time: event?.time }),
    [event]
  );
  useEffect(() => {
    if (!titleEdited) setTitle(autoTitle);
  }, [autoTitle, titleEdited]);

  const autoBody = useMemo(() => buildNewsBody(sponsor, lineupText, true), [sponsor, lineupText]);

  // Standard: tidsinställ till evenemangsdagen 21:15 om den tiden ligger framåt
  useEffect(() => {
    if (!eventLoaded || scheduleInitialized.current) return;
    scheduleInitialized.current = true;
    const d = defaultPublishAt(event?.date);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setPublishDate(d?.date ?? event?.date ?? `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
    setScheduled(!!d);
  }, [eventLoaded, event?.date]);
  useEffect(() => {
    if (!bodyEdited) setBody(autoBody);
  }, [autoBody, bodyEdited]);

  const placeLine = [event?.location, event?.time].filter(Boolean).join(" ");

  // Lineup-sidan renderas om ofta (live-synk). Bilden ritas bara om när innehållet faktiskt ändras.
  const latestProps = useRef(props);
  latestProps.current = props;
  const contentKey = JSON.stringify([
    teamAName,
    teamBName,
    teamASlots.map((s) => s.id),
    teamBSlots.map((s) => s.id),
    teamALineup,
    teamBLineup,
    logoWhite,
    logoGreen,
    bgUrl,
  ]);

  // Rita bilden när något som syns i den ändras
  useEffect(() => {
    if (!eventLoaded || sponsorId === null) return;
    let cancelled = false;
    setRendering(true);
    const p = latestProps.current;
    renderNewsImage({
      teamA: { name: p.teamAName, slots: p.teamASlots, lineup: p.teamALineup, logoUrl: p.logoWhite, accent: "#e2e8f0" },
      teamB: { name: p.teamBName, slots: p.teamBSlots, lineup: p.teamBLineup, logoUrl: p.logoGreen, accent: "#34d399" },
      home,
      dateLine: weekdayLine(event?.date),
      placeLine,
      sponsor,
      sponsorLogoUrl: sponsorObj?.logo ?? undefined,
      backgroundUrl: p.bgUrl,
    })
      .then(
        (canvas) =>
          new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92))
      )
      .then((blob) => {
        if (cancelled) return;
        if (!blob) throw new Error("Bilden kunde inte skapas");
        blobRef.current = blob;
        setImageUrl(URL.createObjectURL(blob));
      })
      .catch((err) => {
        if (!cancelled) toast.error("Bilden kunde inte skapas", { description: String(err?.message ?? err) });
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventLoaded, home, sponsorId, sponsor, sponsorObj?.logo, placeLine, event?.date, contentKey]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const recordHome = () => {
    if (homeRecorded.current) return;
    homeRecorded.current = true;
    setLastHome.mutate({ home });
    if (sponsorObj && sponsorObj.id > 0) recordNews.mutate({ sponsorId: sponsorObj.id });
  };

  const fileName = `lagen-${shortDate(event?.date).replace("/", "-")}.jpg`;

  const handleSaveImage = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setSaving(true);
    try {
      const file = new File([blob], fileName, { type: "image/jpeg" });
      const canShareFile =
        typeof navigator !== "undefined" &&
        !!navigator.canShare?.({ files: [file] }) &&
        window.matchMedia("(pointer: coarse)").matches;
      if (canShareFile) {
        await navigator.share({ files: [file], title });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast.success("Bilden sparad", { description: fileName });
      }
      recordHome();
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") toast.error("Bilden kunde inte sparas");
    } finally {
      setSaving(false);
    }
  };

  // Finns redan en nyhet från appen för samma evenemang kan den ersättas
  const previous = lastPublished.data && event?.date && lastPublished.data.eventDate === event.date ? lastPublished.data : null;

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Bilden kunde inte läsas"));
      r.readAsDataURL(blob);
    });

  const handlePublish = async () => {
    const blob = blobRef.current;
    if (!blob || publishNews.isPending) return;
    setPublishError(null);
    try {
      const res = await publishNews.mutateAsync({
        title: title.trim(),
        body,
        imageBase64: await blobToBase64(blob),
        imageType: "image/jpeg",
        imageName: fileName,
        showPublisher,
        eventDate: event?.date ?? null,
        publishAt: scheduled && publishDate && /^\d{2}:\d{2}$/.test(publishTime)
          ? { date: publishDate, hour: publishTime.slice(0, 2), minute: publishTime.slice(3, 5) }
          : undefined,
        updateId: previous && updateExisting ? previous.id : undefined,
      });
      if (!res.success) {
        setPublishError(res.error);
        return;
      }
      recordHome();
      setPublished({ url: res.url, updated: res.updated, publishAt: res.publishAt ?? null });
      void utils.laget.newsLastPublished.invalidate();
      toast.success(res.publishAt ? `Nyheten är tidsinställd till ${res.publishAt}` : res.updated ? "Nyheten är uppdaterad på laget.se" : "Nyheten är publicerad på laget.se");
    } catch (err) {
      setPublishError((err as Error)?.message || "Publiceringen misslyckades");
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      toast.success("Rubrik och text kopierade");
      recordHome();
    } catch {
      toast.error("Texten kunde inte kopieras");
    }
  };

  const teamLabel = (k: TeamKey) => (k === "a" ? teamAName : teamBName);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-stretch sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-panel-strong sm:rounded-2xl shadow-2xl flex flex-col w-full sm:max-w-3xl sm:max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-white font-black text-base uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Nyhet till laget.se
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Förhandsgranskning */}
          <div className="space-y-4">
            <div>
              <p className="text-white/50 text-[11px] mb-1.5">Så syns den i flödet</p>
              <div className="rounded-lg overflow-hidden border border-white/10 bg-white">
                <div className="relative w-full bg-black" style={{ aspectRatio: "2 / 1" }}>
                  {imageUrl && (
                    <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
                  )}
                  {rendering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="w-5 h-5 text-white/70 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="text-[#12202e] font-bold text-sm leading-snug">{title || "Rubrik"}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{body.split("\n")[0].replace(/<\/?b>/gi, "")}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-white/50 text-[11px] mb-1.5">Hela bilden i nyheten</p>
              <div className="rounded-lg overflow-hidden border border-white/10 bg-black min-h-24">
                {imageUrl && <img src={imageUrl} alt="Laguppställningen som bild" className="w-full h-auto block" />}
              </div>
            </div>
          </div>

          {/* Inställningar */}
          <div className="space-y-4">
            <div>
              <p className="text-white/50 text-[11px] mb-1.5">Hemmalag</p>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                {(["a", "b"] as TeamKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setHome(k)}
                    className={`py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                      home === k
                        ? k === "a"
                          ? "bg-slate-200 text-slate-900"
                          : "bg-emerald-500 text-emerald-950"
                        : "text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {teamLabel(k)}
                  </button>
                ))}
              </div>
              <p className="text-white/35 text-[10px] mt-1">Hemmalaget står till vänster i matchbilden. Växlar automatiskt varannan gång.</p>
            </div>

            <div>
              <label className="block text-white/50 text-[11px] mb-1.5" htmlFor="news-sponsor">Matchsponsor</label>
              <select
                id="news-sponsor"
                value={sponsorId ?? 0}
                onChange={(e) => setSponsorId(Number(e.target.value))}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2"
              >
                {activeSponsors.map((s) => (
                  <option key={s.id} value={s.id} className="text-black">
                    {s.name} ({s.counts.lineups} denna säsong)
                  </option>
                ))}
                <option value={0} className="text-black">
                  Ingen sponsor
                </option>
              </select>
            </div>

            <div>
              <label className="block text-white/50 text-[11px] mb-1.5" htmlFor="news-title">Rubrik</label>
              <input
                id="news-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2"
              />
              {eventLoaded && !event?.location && (
                <p className="text-amber-300/70 text-[10px] mt-1">Platsen kunde inte läsas från evenemanget. Skriv in den i rubriken vid behov.</p>
              )}
            </div>

            <div>
              <label className="block text-white/50 text-[11px] mb-1.5" htmlFor="news-body">Text i nyheten</label>
              <textarea
                id="news-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setBodyEdited(true);
                }}
                rows={10}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono px-3 py-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={showPublisher} onChange={(e) => setShowPublisher(e.target.checked)} />
                Visa avsändare (kontot som publicerar)
              </label>
              {previous && (
                <label className="flex items-start gap-2 text-xs text-white/70">
                  <input type="checkbox" className="mt-0.5" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                  <span>
                    Uppdatera befintlig nyhet för samma dag
                    <span className="block text-white/40 text-[10px]">"{previous.title}" skrivs över med den nya bilden och texten</span>
                  </span>
                </label>
              )}
              <div className="pt-1">
                <p className="text-white/50 text-[11px] mb-1.5">Publicering</p>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                  {[{ v: false, l: "Direkt" }, { v: true, l: "Vid tid" }].map(({ v, l }) => (
                    <button
                      key={l}
                      onClick={() => setScheduled(v)}
                      className={`py-1.5 rounded-md text-xs font-bold transition-colors ${scheduled === v ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {scheduled && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="date"
                      value={publishDate}
                      onChange={(e) => setPublishDate(e.target.value)}
                      className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5 [color-scheme:dark]"
                      aria-label="Datum"
                    />
                    <input
                      type="time"
                      value={publishTime}
                      step={60}
                      onChange={(e) => setPublishTime(e.target.value)}
                      className="w-28 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5 [color-scheme:dark]"
                      aria-label="Tid"
                    />
                  </div>
                )}
              </div>
              <p className="text-white/35 text-[10px]">Nyheter publiceras öppet på lagets sida. Fet stil: omge text med &lt;b&gt; och &lt;/b&gt;.</p>
            </div>

            {publishError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>{publishError.replace(/^[A-Z_]+:\s*/, "")}</span>
              </div>
            )}
            {published && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 space-y-1">
                <p className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  {published.publishAt
                    ? `${published.updated ? "Uppdaterad och tidsinställd" : "Tidsinställd"} – går ut ${published.publishAt}`
                    : published.updated ? "Uppdaterad på laget.se" : "Publicerad på laget.se"}
                </p>
                <a href={published.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                  Öppna nyheten <ExternalLink className="w-3 h-3" />
                </a>
                {published.publishAt && <p className="text-emerald-200/70 text-[10px]">Länken fungerar när nyheten gått ut. Tills dess syns den under Nyheter i laget.se-admin.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold uppercase tracking-wider hover:bg-white/5"
          >
            {published ? "Stäng" : "Avbryt"}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-bold uppercase tracking-wider hover:bg-sky-500/30"
          >
            <Copy className="w-3.5 h-3.5" /> Kopiera text
          </button>
          <button
            onClick={handleSaveImage}
            disabled={!imageUrl || rendering || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Spara bild
          </button>
          {!published && (
            <button
              onClick={handlePublish}
              disabled={!imageUrl || rendering || publishNews.isPending || !title.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-emerald-950 text-xs font-black uppercase tracking-wider hover:bg-emerald-400 disabled:opacity-50"
            >
              {publishNews.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {publishNews.isPending ? "Skickar…" : previous && updateExisting ? "Uppdatera" : scheduled ? "Tidsinställ" : "Publicera"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

