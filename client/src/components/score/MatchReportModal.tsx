/**
 * Matchrapport för Instagram (ersätter den gamla exporten med A4).
 * Två bilder i 4:5 – resultatet och målen – plus en färdig bildtext.
 * Dela öppnar telefonens delningsmeny (Instagram m.fl.), annars laddas bilderna ned.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Copy, Share2, Loader2, Check } from "lucide-react";
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
  name: string;
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory: RawGoal[]; // nyast först, som Score Tracker sparar
  matchEndTime?: string | null;
  matchStartTime?: string | null;
  createdAt: string;
  lineup?: { teamAName?: string; teamBName?: string } | null;
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
export function buildReportData(match: ReportMatch, sponsorLogo: (name: string) => string | null): ReportData {
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

  // Poängbäst: flest poäng, sedan flest mål
  const pts = new Map<string, { goals: number; assists: number }>();
  for (const g of chrono) {
    if (g.other === "Självmål") continue;
    if (g.scorer) pts.set(g.scorer, { goals: (pts.get(g.scorer)?.goals ?? 0) + 1, assists: pts.get(g.scorer)?.assists ?? 0 });
    if (g.assist) pts.set(g.assist, { goals: pts.get(g.assist)?.goals ?? 0, assists: (pts.get(g.assist)?.assists ?? 0) + 1 });
  }
  const best = [...pts.entries()].sort((a, b) => b[1].goals + b[1].assists - (a[1].goals + a[1].assists) || b[1].goals - a[1].goals)[0];

  // Sponsorer som presenterade målen, flest först
  const spCount = new Map<string, number>();
  for (const g of chrono) if (g.sponsor) spCount.set(g.sponsor, (spCount.get(g.sponsor) ?? 0) + 1);
  const sponsors = [...spCount.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => ({ name, logo: sponsorLogo(name) }));

  return {
    whiteName, greenName,
    whiteScore: match.teamWhiteScore, greenScore: match.teamGreenScore,
    dateLine: dateLine(match.matchEndTime ?? match.matchStartTime ?? match.createdAt),
    goals,
    topScorer: best ? { name: best[0], ...best[1] } : null,
    sponsors,
    logoWhite: LOGO_WHITE, logoGreen: LOGO_GREEN, background: BACKGROUND,
  };
}

/** Förslag på bildtext (exporteras för test). */
export function buildCaption(d: ReportData): string {
  const result = `${d.whiteName} ${d.whiteScore}–${d.greenScore} ${d.greenName}`;
  const scorers = new Map<string, number>();
  for (const g of d.goals) if (g.scorer && !g.scorer.includes("självmål") && g.scorer !== "Självmål") scorers.set(g.scorer, (scorers.get(g.scorer) ?? 0) + 1);
  const list = [...scorers.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (c > 1 ? `${n} ${c}` : n)).join(", ");
  const sponsorLine = d.sponsors.length ? `\n\nMålen presenterades av ${d.sponsors.map((s) => s.name).join(", ")}.` : "";
  return `🏒 ${d.dateLine}: ${result}${list ? `\n\nMål: ${list}` : ""}${sponsorLine}\n\n#stålstadenssf #hockey #luleå`;
}

export function MatchReportModal({ match, onClose }: { match: ReportMatch; onClose: () => void }) {
  const { sponsors } = useSponsors();
  const data = useMemo(() => buildReportData(match, (n) => logoForName(sponsors, n)), [match, sponsors]);
  const [images, setImages] = useState<{ result: Blob; goals: Blob; resultUrl: string; goalsUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [include, setInclude] = useState({ result: true, goals: true });
  const [caption, setCaption] = useState(() => buildCaption(data));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const captionEdited = useRef(false);

  useEffect(() => {
    if (!captionEdited.current) setCaption(buildCaption(data));
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Bilden kunde inte skapas"))), "image/jpeg", 0.92));
    (async () => {
      try {
        const [r, g] = await Promise.all([renderResultImage(data), renderGoalsImage(data)]);
        const [rb, gb] = await Promise.all([toBlob(r), toBlob(g)]);
        if (cancelled) return;
        setImages((prev) => {
          if (prev) { URL.revokeObjectURL(prev.resultUrl); URL.revokeObjectURL(prev.goalsUrl); }
          return { result: rb, goals: gb, resultUrl: URL.createObjectURL(rb), goalsUrl: URL.createObjectURL(gb) };
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  useEffect(() => () => { if (images) { URL.revokeObjectURL(images.resultUrl); URL.revokeObjectURL(images.goalsUrl); } }, [images]);

  const slug = match.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "match";
  const files = (): File[] => {
    if (!images) return [];
    const out: File[] = [];
    if (include.result) out.push(new File([images.result], `${slug}-resultat.jpg`, { type: "image/jpeg" }));
    if (include.goals) out.push(new File([images.goals], `${slug}-malen.jpg`, { type: "image/jpeg" }));
    return out;
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare && images ? navigator.canShare({ files: files() }) : false;

  const download = () => {
    for (const f of files()) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    toast.success(files().length === 1 ? "Bilden sparad" : "Bilderna sparade");
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
      // Instagram tar inte med texten från delningen – kopiera den så den kan klistras in
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      await navigator.share({ files: files(), text: caption });
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const nothing = !include.result && !include.goals;

  return (
    <div className="fixed inset-0 z-[99999] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel-strong panel-solid sm:rounded-2xl shadow-2xl flex flex-col w-full sm:max-w-2xl sm:max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white font-black text-base uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>Matchrapport</h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && <p className="text-red-300 text-sm">Bilderna kunde inte skapas: {error}</p>}
          <div className="grid grid-cols-2 gap-3">
            {([["result", "Resultat", images?.resultUrl], ["goals", "Målen", images?.goalsUrl]] as const).map(([key, label, url]) => (
              <button
                key={key}
                onClick={() => setInclude((p) => ({ ...p, [key]: !p[key] }))}
                className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${include[key] ? "border-emerald-400" : "border-white/10 opacity-45"}`}
                aria-pressed={include[key]}
                title={include[key] ? `Ta bort ${label.toLowerCase()} ur inlägget` : `Ta med ${label.toLowerCase()} i inlägget`}
              >
                <div className="aspect-[4/5] bg-black flex items-center justify-center">
                  {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : <Loader2 className="w-6 h-6 text-white/40 animate-spin" />}
                </div>
                <span className={`absolute top-2 left-2 flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${include[key] ? "bg-emerald-500 text-emerald-950" : "bg-black/70 text-white/60"}`}>
                  {include[key] && <Check className="w-3 h-3" />}{label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-white/35 text-[10px] -mt-2">4:5 för Instagram (1080×1350). Tryck på en bild för att ta med eller utesluta den – båda blir ett karusellinlägg.</p>

          <div>
            <label htmlFor="report-caption" className="block text-white/50 text-[11px] mb-1.5">Bildtext</label>
            <textarea
              id="report-caption"
              value={caption}
              onChange={(e) => { captionEdited.current = true; setCaption(e.target.value); }}
              rows={6}
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-3 py-2"
            />
            <p className="text-white/35 text-[10px] mt-1">Texten kopieras automatiskt när du delar – klistra in den i Instagram.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold uppercase tracking-wider hover:bg-white/5">Avbryt</button>
          <button onClick={download} disabled={!images || nothing} title="Spara bilderna" aria-label="Spara bilderna"
            className="flex items-center justify-center px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={copy} title="Kopiera bildtexten" aria-label="Kopiera bildtexten"
            className="flex items-center justify-center px-3 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          {canShare && (
            <button onClick={share} disabled={!images || nothing || busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Dela
            </button>
          )}
          {!canShare && (
            <button onClick={download} disabled={!images || nothing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-emerald-950 text-xs font-black uppercase tracking-wider disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Ladda ned
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
