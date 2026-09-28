/**
 * Matchrapport för Instagram (ersätter den gamla exporten med A4).
 * Två bilder i 4:5 – resultatet och målen – plus en färdig bildtext.
 * Dela öppnar telefonens delningsmeny (Instagram m.fl.), annars laddas bilderna ned.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { starCandidates, autoStars, starLine, starStat, type StarCandidate } from "@/lib/starsOfGame";
import { X, Download, Copy, Share2, Loader2, Check, Star, RotateCcw, Plus } from "lucide-react";
import { toast } from "sonner";
import { useSponsors, logoForName } from "@/lib/sponsors";
import { renderResultImage, renderGoalsImage, type ReportData, type ReportGoal } from "@/lib/matchReportImages";

interface RawGoal {
  team: "white" | "green";
  timestamp?: string;
  scorer?: string;
  assist?: string;
  other?: string;
  sponsor?: string;
}

export interface ReportMatch {
  id: number;
  name: string;
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory: RawGoal[]; // nyast först, som Score Tracker sparar
  matchEndTime?: string | null;
  matchStartTime?: string | null;
  createdAt: string;
  lineup?: { teamAName?: string; teamBName?: string; lineup?: Record<string, { id?: string; name?: string; number?: string }> } | null;
  /** Sparade val: stjärnor (nycklar) och sponsor */
  report?: { stars?: string[]; sponsor?: string | null; showStats?: boolean[]; title?: string | null } | null;
}

const LOGO_WHITE = "/images/logo-white.png";
const LOGO_GREEN = "/images/logo-green.png";
const BACKGROUND = "/images/background.jpg";

function dateLine(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const wd = d.toLocaleDateString("sv-SE", { weekday: "long" });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Bygger bildernas data ur en sparad match (exporteras för test). */
export function buildReportData(
  match: ReportMatch,
  stars: StarCandidate[],
  sponsor: { name: string; logo: string | null } | null,
  showStats: boolean[] = [true, true, true],
  title?: string
): ReportData {
  const wrap = match.lineup ?? {};
  const aWhite = (wrap.teamAName ?? "VITA").toLowerCase().includes("vit");
  const cap = (s: string | undefined, fallback: string) => {
    const t = (s ?? "").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : fallback;
  };
  const whiteName = cap(aWhite ? wrap.teamAName : wrap.teamBName, "Vita");
  const greenName = cap(aWhite ? wrap.teamBName : wrap.teamAName, "Gröna");

  const chrono = [...(match.goalHistory ?? [])].reverse();
  const goals: ReportGoal[] = chrono.map((g) => ({
    team: g.team,
    time: g.timestamp?.match(/\d{2}:\d{2}/)?.[0],
    scorer: g.other === "Självmål" ? (g.scorer ? `${g.scorer} (självmål)` : "Självmål") : g.scorer,
    assist: g.assist,
    penalty: g.other === "Straff",
  }));

  return {
    title,
    whiteName, greenName,
    whiteScore: match.teamWhiteScore, greenScore: match.teamGreenScore,
    dateLine: dateLine(match.matchEndTime ?? match.matchStartTime ?? match.createdAt),
    goals,
    // Bilden: bara namn och (valfritt) statistik – ingen position
    stars: stars.map((c, i) => ({ name: c.name, stat: showStats[i] === false ? "" : starStat(c) })),
    sponsor,
    logoWhite: LOGO_WHITE, logoGreen: LOGO_GREEN, background: BACKGROUND,
  };
}

/** Bildtexten enligt klubbens mall (exporteras för test). */
export function buildCaption(stars: StarCandidate[], sponsorName: string | null, tags: string[], showStats: boolean[] = [true, true, true]): string {
  const marks = ["⭐⭐⭐", "⭐⭐", "⭐"];
  const parts: string[] = [];
  if (stars.length) parts.push(["Kvällens Stars of the Game", ...stars.map((c, i) => `${marks[i]} ${starLine(c, { position: false, stats: showStats[i] !== false })}`)].join("\n"));
  if (sponsorName) parts.push(`Dagens mål presenterades av ${sponsorName}`);
  if (tags.length) parts.push(tags.join(" "));
  return parts.join("\n\n");
}

/** Den sponsor som presenterade flest mål i matchen. */
function mostFrequentSponsor(goals: RawGoal[]): string | null {
  const count = new Map<string, number>();
  for (const g of goals) if (g.sponsor) count.set(g.sponsor, (count.get(g.sponsor) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function MatchReportModal({ match, onClose }: { match: ReportMatch; onClose: () => void }) {
  const { sponsors } = useSponsors();
  const utils = trpc.useUtils();
  const saveReport = trpc.score.match.setReport.useMutation({ onSuccess: () => utils.score.match.list.invalidate() });
  const tagsQuery = trpc.score.reportTags.get.useQuery(undefined, { staleTime: 60_000 });
  const saveTags = trpc.score.reportTags.set.useMutation({ onSuccess: () => utils.score.reportTags.get.invalidate() });

  // ─── Stars of the Game ───
  const candidates = useMemo(() => starCandidates({
    teamWhiteScore: match.teamWhiteScore, teamGreenScore: match.teamGreenScore,
    goalHistory: match.goalHistory, lineup: match.lineup,
  }), [match]);
  const auto = useMemo(() => autoStars(candidates, match.id), [candidates, match.id]);
  const [starKeys, setStarKeys] = useState<string[]>(() => {
    const saved = match.report?.stars?.filter((k) => candidates.some((c) => c.key === k));
    return saved && saved.length === 3 ? saved : auto;
  });
  // Rubrik på resultatbilden (tom = "Slutresultat"); sparas när fältet lämnas
  const [title, setTitle] = useState(match.report?.title ?? "");
  const [titleDebounced, setTitleDebounced] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setTitleDebounced(title), 400);
    return () => clearTimeout(t);
  }, [title]);

  const [showStats, setShowStats] = useState<boolean[]>(() => {
    const saved = match.report?.showStats;
    return [0, 1, 2].map((i) => saved?.[i] !== false);
  });
  const stars = useMemo(() => starKeys.map((k) => candidates.find((c) => c.key === k)).filter(Boolean) as StarCandidate[], [starKeys, candidates]);

  // ─── Presenteras av ───
  const activeSponsors = sponsors.filter((sp) => sp.active);
  const [sponsorName, setSponsorName] = useState<string | null>(() =>
    match.report?.sponsor !== undefined ? match.report.sponsor ?? null : mostFrequentSponsor(match.goalHistory)
  );
  const sponsor = sponsorName ? { name: sponsorName, logo: logoForName(sponsors, sponsorName) } : null;

  // Spara valen på matchen
  const persist = (next: { stars?: string[]; sponsor?: string | null; showStats?: boolean[]; title?: string | null }) => {
    saveReport.mutate({ id: match.id, report: {
      stars: next.stars ?? starKeys,
      sponsor: next.sponsor !== undefined ? next.sponsor : sponsorName,
      showStats: next.showStats ?? showStats,
      title: next.title !== undefined ? next.title : title || null,
    } });
  };
  const toggleStats = (i: number) => {
    const next = showStats.map((v, k) => (k === i ? !v : v));
    setShowStats(next);
    persist({ showStats: next });
  };
  const setStar = (i: number, key: string) => {
    const next = [...starKeys];
    const other = next.indexOf(key);
    if (other >= 0 && other !== i) next[other] = next[i]; // byt plats om spelaren redan hade en stjärna
    next[i] = key;
    setStarKeys(next);
    persist({ stars: next });
  };
  const resetStars = () => {
    setStarKeys(auto);
    persist({ stars: auto });
  };
  const chooseSponsor = (name: string | null) => {
    setSponsorName(name);
    persist({ sponsor: name });
  };

  // ─── Hashtags (sparas för alla rapporter) ───
  const tags = tagsQuery.data ?? [];
  const [newTag, setNewTag] = useState("");
  const addTag = () => {
    const t = newTag.trim().replace(/\s+/g, "");
    if (!t) return;
    const tag = t.startsWith("#") ? t : `#${t}`;
    if (!tags.includes(tag)) saveTags.mutate([...tags, tag], { onError: (e) => toast.error(e.message) });
    setNewTag("");
  };
  const removeTag = (tag: string) => saveTags.mutate(tags.filter((t) => t !== tag));

  const data = useMemo(() => buildReportData(match, stars, sponsor, showStats, titleDebounced), [match, stars, sponsor?.name, sponsor?.logo, showStats, titleDebounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoCaption = useMemo(() => buildCaption(stars, sponsorName, tags, showStats), [stars, sponsorName, tags, showStats]);
  const [caption, setCaption] = useState(autoCaption);
  const [captionEdited, setCaptionEdited] = useState(false);
  useEffect(() => {
    if (!captionEdited) setCaption(autoCaption);
  }, [autoCaption, captionEdited]);

  const [images, setImages] = useState<{ result: Blob; goals: Blob; resultUrl: string; goalsUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [include, setInclude] = useState({ result: true, goals: true });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const renderId = useRef(0);

  useEffect(() => {
    const id = ++renderId.current;
    const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Bilden kunde inte skapas"))), "image/jpeg", 0.92));
    (async () => {
      try {
        const [r, g] = await Promise.all([renderResultImage(data), renderGoalsImage(data)]);
        const [rb, gb] = await Promise.all([toBlob(r), toBlob(g)]);
        if (id !== renderId.current) return;
        setImages((prev) => {
          if (prev) { URL.revokeObjectURL(prev.resultUrl); URL.revokeObjectURL(prev.goalsUrl); }
          return { result: rb, goals: gb, resultUrl: URL.createObjectURL(rb), goalsUrl: URL.createObjectURL(gb) };
        });
      } catch (e) {
        if (id === renderId.current) setError((e as Error).message);
      }
    })();
  }, [data]);

  const slug = match.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "match";
  const files = (): File[] => {
    if (!images) return [];
    const out: File[] = [];
    if (include.result) out.push(new File([images.result], `${slug}-resultat.jpg`, { type: "image/jpeg" }));
    if (include.goals) out.push(new File([images.goals], `${slug}-malen.jpg`, { type: "image/jpeg" }));
    return out;
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare && images ? navigator.canShare({ files: files() }) : false;

  const download = (quiet = false) => {
    for (const f of files()) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (!quiet) toast.success(files().length === 1 ? "Bilden sparad" : "Bilderna sparade");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Texten kunde inte kopieras");
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      // Instagram/Business Suite tar inte med texten från delningen – kopiera den så den kan klistras in
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      await navigator.share({ files: files(), text: caption });
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };


  const nothing = !include.result && !include.goals;
  const select = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5";
  const starMarks = ["⭐⭐⭐", "⭐⭐", "⭐"];

  return (
    <div className="fixed inset-0 z-[99999] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel-strong panel-solid sm:rounded-2xl shadow-2xl flex flex-col w-full sm:max-w-3xl sm:max-h-[94vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white font-black text-base uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>Matchrapport</h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Förhandsgranskning */}
          <div className="space-y-2">
            {error && <p className="text-red-300 text-sm">Bilderna kunde inte skapas: {error}</p>}
            <div className="grid grid-cols-2 gap-2">
              {([["result", "Resultat", images?.resultUrl], ["goals", "Målen", images?.goalsUrl]] as const).map(([key, label, url]) => (
                <button key={key} onClick={() => setInclude((p) => ({ ...p, [key]: !p[key] }))} aria-pressed={include[key]}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${include[key] ? "border-emerald-400" : "border-white/10 opacity-45"}`}
                  title={include[key] ? `Ta bort ${label.toLowerCase()} ur inlägget` : `Ta med ${label.toLowerCase()} i inlägget`}>
                  <div className="aspect-[4/5] bg-black flex items-center justify-center">
                    {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : <Loader2 className="w-6 h-6 text-white/40 animate-spin" />}
                  </div>
                  <span className={`absolute top-1.5 left-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${include[key] ? "bg-emerald-500 text-emerald-950" : "bg-black/70 text-white/60"}`}>
                    {include[key] && <Check className="w-3 h-3" />}{label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-white/35 text-[10px]">4:5 (1080×1350). Tryck på en bild för att ta med eller utesluta den.</p>
          </div>

          {/* Val */}
          <div className="space-y-4">
            <div>
              <label htmlFor="report-title" className="block text-white/50 text-[11px] mb-1.5">Rubrik på resultatbilden</label>
              <input
                id="report-title"
                value={title}
                maxLength={30}
                placeholder="Slutresultat"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => persist({ title: title.trim() || null })}
                className={select}
              />
              <p className="text-white/35 text-[10px] mt-1">T.ex. Match 1/5 eller Julmatchen. Tomt = Slutresultat.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-white/50 text-[11px] flex items-center gap-1"><Star className="w-3 h-3" /> Stars of the Game</p>
                <button onClick={resetStars} className="text-[10px] text-sky-300/80 hover:text-sky-200 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Automatiskt</button>
              </div>
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs">{starMarks[i]}</span>
                    <select value={starKeys[i] ?? ""} onChange={(e) => setStar(i, e.target.value)} className={`${select} flex-1 min-w-0`} aria-label={`Stjärna ${i + 1}`}>
                      {candidates.map((c) => (
                        <option key={c.key} value={c.key} className="text-black">{starLine(c)}{c.team === "white" ? " – Vita" : " – Gröna"}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[10px] text-white/55 shrink-0" title="Visa statistik (G/A/TP eller GA) på bilden och i texten">
                      <input type="checkbox" checked={showStats[i]} onChange={() => toggleStats(i)} />
                      Stats
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="report-sponsor" className="block text-white/50 text-[11px] mb-1.5">Presenteras av</label>
              <select id="report-sponsor" value={sponsorName ?? ""} onChange={(e) => chooseSponsor(e.target.value || null)} className={select}>
                <option value="" className="text-black">Ingen sponsor</option>
                {[...new Set([...(sponsorName ? [sponsorName] : []), ...activeSponsors.map((sp) => sp.name)])].map((n) => (
                  <option key={n} value={n} className="text-black">{n}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-white/50 text-[11px] mb-1.5">Hashtags (sparas och används alltid)</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200">
                    {t}
                    <button onClick={() => removeTag(t)} aria-label={`Ta bort ${t}`} className="text-sky-200/60 hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
                    placeholder="#ny" className="w-24 rounded-full bg-white/5 border border-white/10 text-white text-[11px] px-2 py-0.5" />
                  <button onClick={addTag} aria-label="Lägg till hashtag" className="text-white/50 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="report-caption" className="text-white/50 text-[11px]">Bildtext</label>
                {captionEdited && (
                  <button onClick={() => setCaptionEdited(false)} className="text-[10px] text-sky-300/80 hover:text-sky-200 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Återställ</button>
                )}
              </div>
              <textarea id="report-caption" value={caption} onChange={(e) => { setCaptionEdited(true); setCaption(e.target.value); }} rows={8}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-3 py-2" />
              <p className="text-white/35 text-[10px] mt-1">Texten kopieras automatiskt när du delar – klistra in den i inlägget.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold uppercase tracking-wider hover:bg-white/5">Avbryt</button>
          <button onClick={() => download()} disabled={!images || nothing} title="Spara bilderna" aria-label="Spara bilderna"
            className="flex items-center justify-center px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={copy} title="Kopiera bildtexten" aria-label="Kopiera bildtexten"
            className="flex items-center justify-center px-3 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          {canShare ? (
            <button onClick={share} disabled={!images || nothing || busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Dela
            </button>
          ) : (
            <button onClick={() => download()} disabled={!images || nothing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-emerald-950 text-xs font-black uppercase tracking-wider disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Ladda ned
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
