/**
 * Media → Video (styrelsen) – route /media/video.
 *
 * Instagram-video i klubbens grafiska profil:
 *   intro 1 (puckflippen) → intro 2 (titelkort) → klippet med overlay → outro (tack till sponsor)
 *
 * Klippet laddas upp direkt när det väljs (medan resten fylls i). Grafiken ritas
 * här och skickas som PNG; servern sätter ihop videon (server/video/).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2, Download, Share2, Copy, Check, Shuffle, Film, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSponsors, pickLeastShown, type Sponsor } from "@/lib/sponsors";
import { starCandidates, autoStars, type StarCandidate } from "@/lib/starsOfGame";
import type { ReportMatch } from "@/components/score/MatchReportModal";
import { renderCard, DEFAULT_SETTINGS as CARD_DEFAULTS, type CardSettings } from "@shared/cardRender";
import { cellsFor } from "@shared/cardStats";
import { teamName } from "@shared/teams";
import { POSITION_LABELS, type Position } from "@/lib/players";
import { club } from "@shared/club";
import {
  VIDEO_KINDS, VIDEO_SIZE, defaultShow, renderVideoGraphics, hasOverlay,
  type VideoFormat, type VideoKind, type Side, type VideoShow, type VideoGraphicsData,
} from "@/lib/videoGraphics";

interface Limits { maxBytes: number; maxSeconds: number; maxClipSeconds: number }
interface Upload { id: string; duration: number }
type JobState = { id: string; status: "queued" | "rendering" | "done" | "failed"; progress: number; error?: string; fileName?: string };

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
function matchDateLine(m: ReportMatch | undefined): string {
  const d = new Date(m?.matchEndTime ?? m?.createdAt ?? Date.now());
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}${m?.location ? ` · ${m.location}` : ""}`;
}
const fmtMB = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;
/** Intro 1 + intro 2 + outro minus övergångarna (samma som server/video/videoFfmpeg.ts) */
const ADDED_SECONDS = 1.6 + 2.8 + 2.6 - 3 * 0.4;

/** Målen i tidsordning med ställningen efter varje mål (exporteras för test) */
export function goalsWithScore(m: ReportMatch | undefined) {
  if (!m) return [];
  let w = 0, g = 0;
  return [...(m.goalHistory ?? [])].reverse().map((goal, i) => {
    if (goal.team === "white") w++; else g++;
    return { index: i, team: goal.team, scorer: goal.scorer ?? "", assist: goal.assist ?? "", score: `${w}–${g}` };
  });
}

/** "2 mål · 1 assist" eller "1 insläppt" (exporteras för test) */
export function starLine(c: StarCandidate): string {
  if (c.position === "MV" && c.goalsAgainst !== null) return c.goalsAgainst === 0 ? "Hållen nolla" : `${c.goalsAgainst} insläppta`;
  const parts = [c.goals ? `${c.goals} mål` : "", c.assists ? `${c.assists} assist` : ""].filter(Boolean);
  return parts.join(" · ") || "";
}

export type VideoStatsMode = "match" | "season" | "playoff" | "preseason" | "career";
export const VIDEO_STATS_MODES: Array<{ id: VideoStatsMode; name: string }> = [
  { id: "match", name: "Matchen" },
  { id: "season", name: "Säsong" },
  { id: "playoff", name: "Slutspel" },
  { id: "preseason", name: "Försäsong" },
  { id: "career", name: "Totalt" },
];

/**
 * Spelarens siffror i en match (exporteras för test). Utespelare: mål, assist,
 * poäng; målvakt: insläppta och nolla. Plus resultatet för hans lag och
 * stjärnan om han blev matchens ★★★/★★/★.
 */
export function matchStatCells(c: StarCandidate, match: { teamWhiteScore: number; teamGreenScore: number }, starRankOf: number | null): { title: string; cells: Array<{ label: string; value: string }> } {
  const own = c.team === "white" ? match.teamWhiteScore : match.teamGreenScore;
  const opp = c.team === "white" ? match.teamGreenScore : match.teamWhiteScore;
  const res = own > opp ? "V" : own < opp ? "F" : "O";
  const cells = c.position === "MV" && c.goalsAgainst !== null
    ? [{ label: "GA", value: String(c.goalsAgainst) }, { label: "NOLLA", value: c.goalsAgainst === 0 ? "JA" : "–" }]
    : [{ label: "G", value: String(c.goals) }, { label: "A", value: String(c.assists) }, { label: "PTS", value: String(c.goals + c.assists) }];
  cells.push({ label: "RES", value: res });
  if (starRankOf) cells.push({ label: "STJÄRNA", value: "★".repeat(4 - starRankOf) });
  return { title: "Matchen", cells };
}

export default function VideoApp() {
  const utils = trpc.useUtils();
  const { sponsors } = useSponsors();
  const registry = trpc.players.list.useQuery(undefined, { staleTime: 60_000 });
  const savedCards = trpc.cards.list.useQuery(undefined, { staleTime: 60_000 });
  const matchesQ = trpc.score.match.list.useQuery(undefined, { staleTime: 60_000 });
  const tagsQ = trpc.score.reportTags.get.useQuery(undefined, { staleTime: 60_000 });

  // ─── Klippet ───
  const [limits, setLimits] = useState<Limits | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [upProgress, setUpProgress] = useState<number | null>(null);
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/media/video/limits").then((r) => (r.ok ? r.json() : null)).then(setLimits).catch(() => undefined);
  }, []);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  const pickFile = async (f: File) => {
    xhrRef.current?.abort();
    setUpload(null);
    setFrame(null);
    setJob(null);
    if (limits && f.size > limits.maxBytes) {
      toast.error(`Filen är ${fmtMB(f.size)} – max ${fmtMB(limits.maxBytes)}`, { description: "Filma i 1080p eller korta klippet i telefonen." });
      return;
    }
    const url = URL.createObjectURL(f);
    // Längd och en bildruta (till förhandsvisningen) innan uppladdningen
    const meta = await new Promise<{ duration: number; frame: HTMLCanvasElement | null }>((resolve) => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 1) / 3); };
      v.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        try { c.getContext("2d")!.drawImage(v, 0, 0); resolve({ duration: v.duration, frame: c }); } catch { resolve({ duration: v.duration, frame: null }); }
      };
      v.onerror = () => resolve({ duration: 0, frame: null });
    });
    if (limits && meta.duration > limits.maxClipSeconds + 0.5) {
      URL.revokeObjectURL(url);
      toast.error(`Klippet är ${Math.round(meta.duration)} s – max ${limits.maxClipSeconds} s`, { description: `Hela videon får vara ${limits.maxSeconds} s med intro och outro. Korta klippet i telefonen först.` });
      return;
    }
    setFile(f);
    setLocalUrl(url);
    setFrame(meta.frame);
    // Ladda upp direkt, medan resten fylls i
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/media/video/upload");
    xhr.setRequestHeader("Content-Type", f.type || "video/mp4");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUpProgress(e.loaded / e.total); };
    xhr.onload = () => {
      setUpProgress(null);
      let body: { uploadId?: string; duration?: number; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* tomt */ }
      if (xhr.status === 200 && body.uploadId) setUpload({ id: body.uploadId, duration: body.duration ?? meta.duration });
      else { toast.error("Uppladdningen misslyckades", { description: body.error ?? `Fel ${xhr.status}` }); setFile(null); }
    };
    xhr.onerror = () => { setUpProgress(null); toast.error("Uppladdningen avbröts", { description: "Kontrollera täckningen och välj klippet igen." }); setFile(null); };
    setUpProgress(0);
    xhr.send(f);
  };

  // ─── Val ───
  const [format, setFormat] = useState<VideoFormat>("reel");
  const [kind, setKind] = useState<VideoKind>("goal");
  const [show, setShow] = useState<VideoShow>(defaultShow("goal"));
  /** null = förval (senaste matchen för mål/stjärnor/resultat), "none" = ingen match */
  const [matchId, setMatchId] = useState<number | "none" | null>(null);
  const [goalIdx, setGoalIdx] = useState<number | null>(null);
  const [starRank, setStarRank] = useState<1 | 2 | 3>(1);
  const [playerId, setPlayerId] = useState<string>("");
  const [heading, setHeading] = useState("");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [dateLine, setDateLine] = useState("");
  const [side, setSide] = useState<Side>("green");
  const [introSponsor, setIntroSponsor] = useState<string>("");
  const [outroSponsor, setOutroSponsor] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);

  const matches = useMemo(() => ((matchesQ.data ?? []) as unknown as Array<ReportMatch & { reviewStatus?: string }>).filter((m) => m.reviewStatus !== "rejected").slice(0, 20), [matchesQ.data]);
  const matchBased = kind === "goal" || kind === "stars" || kind === "result";
  const match = matchId === "none" ? undefined : matches.find((m) => m.id === matchId) ?? (matchBased ? matches[0] : undefined);
  // Motståndare i matcher mot andra lag (vårt lag sparas som "white", motståndaren som "green")
  const opponentsQ = trpc.opponents.list.useQuery({ includeArchived: true }, { staleTime: 5 * 60_000 });
  const sideName = (t: Side) => {
    if (!match?.opponentId) return teamName(t);
    return t === "white" ? club().name : opponentsQ.data?.find((o) => o.id === match.opponentId)?.name ?? "Motståndare";
  };
  const goals = useMemo(() => goalsWithScore(match), [match]);
  const goal = goals.find((g) => g.index === goalIdx) ?? goals[goals.length - 1];
  const stars = useMemo(() => {
    if (!match) return [];
    const cands = starCandidates({ teamWhiteScore: match.teamWhiteScore, teamGreenScore: match.teamGreenScore, goalHistory: match.goalHistory, lineup: match.lineup });
    const saved = match.report?.stars?.filter((k) => cands.some((c) => c.key === k));
    const keys = saved && saved.length === 3 ? saved : autoStars(cands, match.id);
    return keys.map((k) => cands.find((c) => c.key === k)).filter(Boolean) as StarCandidate[];
  }, [match]);
  const star = stars[starRank - 1];
  const players = useMemo(() => [...(registry.data ?? [])].filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, "sv")), [registry.data]);
  const byName = (name: string) => players.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  /** Fyll i fälten när kategori, match, mål eller stjärna byts (allt går att ändra efteråt) */
  useEffect(() => {
    setShow(defaultShow(kind));
    setDateLine(match ? matchDateLine(match) : matchDateLine(undefined));
    const wn = sideName("white"), gn = sideName("green");
    if (kind === "goal" && !match) {
      setHeading("Mål"); setHeadline(""); setSubline("");
    } else if (kind === "stars" && !match) {
      setHeading(`Matchens ${"★".repeat(4 - starRank)}`); setHeadline(""); setSubline("");
    } else if (kind === "result" && !match) {
      setHeading("Slutresultat"); setHeadline(""); setSubline(""); setPlayerId("");
    } else if (kind === "player") {
      setHeading("Möt spelaren"); setHeadline(""); setSubline("");
    } else if (kind === "goal" && goal) {
      setHeading("Mål"); setHeadline(goal.score); setSubline(goal.assist ? `Assist: ${goal.assist}` : "");
      setPlayerId(byName(goal.scorer)?.id ?? ""); setSide(goal.team);
    } else if (kind === "stars" && star) {
      setHeading(`Matchens ${"★".repeat(4 - starRank)}`); setHeadline(""); setSubline(starLine(star));
      setPlayerId(star.key && players.some((p) => p.id === star.key) ? star.key : byName(star.name)?.id ?? ""); setSide(star.team);
    } else if (kind === "result" && match) {
      setHeading("Slutresultat"); setHeadline(`${wn} ${match.teamWhiteScore}–${match.teamGreenScore} ${gn}`); setSubline("");
      setPlayerId(""); setSide(match.teamWhiteScore > match.teamGreenScore ? "white" : "green");
    } else if (kind === "interview") {
      setHeading("Intervju"); setHeadline(""); setSubline("");
    } else if (kind === "free") {
      setHeading(""); setHeadline(""); setSubline(""); setPlayerId("");
    }
  }, [kind, match?.id, goal?.index, starRank, star?.key, registry.data, opponentsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pucken landar på spelarens lag när en spelare väljs
  const player = players.find((p) => p.id === playerId) ?? null;
  useEffect(() => {
    if ((kind === "interview" || kind === "player" || !match) && (player?.teamColor === "white" || player?.teamColor === "green")) setSide(player.teamColor);
    if (kind === "player") setSubline(player ? POSITION_LABELS[player.position as Position] ?? "" : "");
  }, [playerId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sponsorer: den som visats minst i Media (intro 2), sedan nästa (outro)
  const active = sponsors.filter((s) => s.active);
  const pickDefaults = () => {
    const a = pickLeastShown(active, (s) => s.counts.media ?? 0);
    const b = pickLeastShown(active.filter((s) => s.name !== a?.name), (s) => s.counts.media ?? 0) ?? a;
    setIntroSponsor(a?.name ?? ""); setOutroSponsor(b?.name ?? "");
  };
  useEffect(() => { if (!introSponsor && active.length) pickDefaults(); }, [sponsors]); // eslint-disable-line react-hooks/exhaustive-deps
  const shuffle = () => {
    if (!active.length) return;
    const r = () => active[Math.floor(Math.random() * active.length)];
    const a = r(); let b = r();
    for (let i = 0; i < 5 && active.length > 1 && b.name === a.name; i++) b = r();
    setIntroSponsor(a.name); setOutroSponsor(b.name);
  };
  const sponsorOf = (name: string): Sponsor | undefined => sponsors.find((s) => s.name === name);

  // ─── Spelarens kort/foto och statistik ───
  // Statistiken (rutan och siffrorna på hockeykortet) följer samma val
  const [statsMode, setStatsMode] = useState<VideoStatsMode>("season");
  useEffect(() => { setStatsMode(match && kind !== "interview" && kind !== "player" ? "match" : "season"); }, [kind, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [playerStats, setPlayerStats] = useState<Awaited<ReturnType<typeof utils.client.cards.stats.query>> | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setPlayerStats(undefined);
    if (playerId) utils.client.cards.stats.query({ playerId }).then((st) => { if (!cancelled) setPlayerStats(st); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const matchCandidate = useMemo(() => {
    if (!match || !player) return null;
    const cands = starCandidates({ teamWhiteScore: match.teamWhiteScore, teamGreenScore: match.teamGreenScore, goalHistory: match.goalHistory, lineup: match.lineup });
    return cands.find((c) => c.key === player.id) ?? cands.find((c) => c.name.trim().toLowerCase() === player.name.trim().toLowerCase()) ?? null;
  }, [match, player]);
  const stats: VideoGraphicsData["stats"] = useMemo(() => {
    if (statsMode === "match") {
      if (!match || !matchCandidate) return null;
      const rank = stars.findIndex((c) => c.key === matchCandidate.key);
      const r = matchStatCells(matchCandidate, match, rank >= 0 ? rank + 1 : null);
      return { ...r, title: `Matchen ${matchDateLine(match).split(" · ")[0].toLowerCase()}` };
    }
    const r = cellsFor(statsMode, playerStats);
    return r.cells.length ? r : null;
  }, [statsMode, match, matchCandidate, stars, playerStats]);
  const matchMissingPlayer = statsMode === "match" && !!player && !!match && !matchCandidate;

  const [picture, setPicture] = useState<VideoGraphicsData["picture"]>(null);
  const statsKey = JSON.stringify(stats);
  useEffect(() => {
    let cancelled = false;
    if (!playerId) { setPicture(null); return; }
    const load = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    (async () => {
      const card = savedCards.data?.find((c) => c.playerId === playerId);
      if (card) {
        const v = new Date(card.updatedAt).getTime();
        const [photo, mask] = await Promise.all([load(`/api/players/${encodeURIComponent(playerId)}/card-source?v=${v}`), load(`/api/players/${encodeURIComponent(playerId)}/card-mask?v=${v}`)]);
        let settings: CardSettings = { ...CARD_DEFAULTS, ...(card.settings as Partial<CardSettings>) };
        // Kortet visar samma statistik som valts för videon (kortet i registret ändras inte)
        if (settings.statsMode !== "none") {
          settings = stats
            ? { ...settings, statsMode: "custom", cells: stats.cells, statsTitle: stats.title, form: playerStats?.form ?? settings.form }
            : { ...settings, statsMode: "custom", cells: [], statsTitle: "" };
        }
        const canvas = await renderCard({ settings, photo, mask, scale: 0.9 });
        if (!cancelled) setPicture({ image: canvas, isCard: true });
        return;
      }
      const img = await load(`/api/players/${encodeURIComponent(playerId)}/photo`);
      if (!cancelled) setPicture(img ? { image: img, isCard: false } : null);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [playerId, savedCards.data, statsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data: VideoGraphicsData = {
    format, kind, team: side, heading, headline, subline, dateLine,
    player: player ? { name: player.name, number: player.number ?? "" } : null,
    stats, picture,
    introSponsor: introSponsor ? { name: introSponsor, logo: sponsorOf(introSponsor)?.logo ?? null } : null,
    outroSponsor: outroSponsor ? { name: outroSponsor, logo: sponsorOf(outroSponsor)?.logo ?? null } : null,
    show,
  };

  // ─── Förhandsvisning ───
  const introRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const outroRef = useRef<HTMLCanvasElement>(null);
  const [graphics, setGraphics] = useState<Awaited<ReturnType<typeof renderVideoGraphics>> | null>(null);
  const dataKey = JSON.stringify({ ...data, picture: !!picture, frame: !!frame });
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const g = await renderVideoGraphics(data);
      if (cancelled) return;
      setGraphics(g);
      const { w, h } = VIDEO_SIZE[format];
      const paint = (ref: React.RefObject<HTMLCanvasElement | null>, draw: (ctx: CanvasRenderingContext2D) => void) => {
        const c = ref.current; if (!c) return;
        c.width = w; c.height = h;
        draw(c.getContext("2d")!);
      };
      paint(introRef, (ctx) => ctx.drawImage(g.intro2, 0, 0));
      paint(outroRef, (ctx) => ctx.drawImage(g.outro, 0, 0));
      paint(overlayRef, (ctx) => {
        ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
        if (frame) {
          // Som på servern: suddig utfyllnad bakom, klippet i mitten
          const s1 = Math.max(w / frame.width, h / frame.height);
          ctx.filter = "blur(30px) brightness(0.85)";
          ctx.drawImage(frame, (w - frame.width * s1) / 2, (h - frame.height * s1) / 2, frame.width * s1, frame.height * s1);
          ctx.filter = "none";
          const s2 = Math.min(w / frame.width, h / frame.height);
          ctx.drawImage(frame, (w - frame.width * s2) / 2, (h - frame.height * s2) / 2, frame.width * s2, frame.height * s2);
        }
        if (g.overlay) ctx.drawImage(g.overlay, 0, 0);
      });
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bildtext ───
  const autoCaption = useMemo(() => {
    const p = player ? `${player.name}${player.number ? ` #${player.number}` : ""}` : "";
    const first =
      kind === "goal" ? `MÅL! ${p}${headline ? ` – ${headline}` : ""}`
      : kind === "interview" ? `Intervju med ${p}`
      : kind === "stars" ? `${heading} – ${p}`
      : kind === "result" ? `${heading}: ${headline}`
      : kind === "player" ? `${heading}: ${p}`
      : [heading, headline].filter(Boolean).join(" – ");
    return [first, subline, dateLine, introSponsor ? `Stolt sponsor: ${introSponsor}` : "", (tagsQ.data ?? []).join(" ")].filter(Boolean).join("\n\n");
  }, [kind, player, heading, headline, subline, dateLine, introSponsor, tagsQ.data]);
  useEffect(() => { if (!captionEdited) setCaption(autoCaption); }, [autoCaption, captionEdited]);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(caption).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // ─── Rendering ───
  const [job, setJob] = useState<JobState | null>(null);
  const [starting, setStarting] = useState(false);
  const fileName = () => `${club().fileSlug}-${[heading, player?.name, headline].filter(Boolean).join("-")}`.toLowerCase();
  const render = async () => {
    if (!upload || !graphics) return;
    setStarting(true);
    try {
      const png = (c: HTMLCanvasElement) => c.toDataURL("image/png");
      const sponsorIds = [sponsorOf(introSponsor), sponsorOf(outroSponsor)]
        .filter((s, i) => s && (i === 0 ? show.intro.sponsor : show.outro.sponsor)).map((s) => s!.id).filter((id) => id > 0);
      const res = await fetch("/api/media/video/render", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: upload.id, format, introSide: side,
          intro2: png(graphics.intro2), outro: png(graphics.outro), overlay: graphics.overlay && hasOverlay(data) ? png(graphics.overlay) : null,
          fileName: fileName(), sponsorIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Fel ${res.status}`);
      setJob({ id: body.jobId, status: "queued", progress: 0 });
    } catch (e) {
      toast.error("Kunde inte starta renderingen", { description: (e as Error).message });
    } finally {
      setStarting(false);
    }
  };
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/media/video/jobs/${job.id}`).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json();
      setJob((prev) => (prev && prev.id === job.id ? { ...prev, ...j } : prev));
      if (j.status === "done") { void utils.sponsors.list.invalidate(); toast.success("Videon är klar"); }
      if (j.status === "failed") toast.error("Renderingen misslyckades", { description: j.error });
    }, 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const videoUrl = job?.status === "done" ? `/api/media/video/jobs/${job.id}/file` : null;
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (!videoUrl) return;
    setSharing(true);
    try {
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      const blob = await (await fetch(videoUrl)).blob();
      const f = new File([blob], job?.fileName ?? "video.mp4", { type: "video/mp4" });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: caption });
      else window.location.href = `${videoUrl}?download=1`;
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela");
    } finally {
      setSharing(false);
    }
  };

  // ─── Gränssnitt ───
  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200" : "bg-white/5 border-white/10 text-white/60"}`;
  const toggle = <K extends keyof VideoShow>(part: K, key: keyof VideoShow[K], label: string) => {
    const on = show[part][key] as boolean;
    return <button key={`${part}.${String(key)}`} onClick={() => setShow((s) => ({ ...s, [part]: { ...s[part], [key]: !on } }))} className={chip(on)}>{on ? "✓ " : ""}{label}</button>;
  };
  const aspect = format === "reel" ? "aspect-[9/16]" : "aspect-[4/5]";
  const needsPlayer = kind === "goal" || kind === "interview" || kind === "stars" || kind === "player";

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/media" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Media · Video</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Val */}
        <section className="space-y-4">
          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Klipp</p>
            <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 border border-dashed border-white/20 text-sm">
              <Upload size={15} /> {file ? "Byt klipp" : "Välj klipp"}
            </button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ""; }} />
            {file && (
              <p className="text-[11px] text-white/50 mt-1.5">
                {file.name} · {fmtMB(file.size)}
                {upProgress !== null ? ` · laddar upp ${Math.round(upProgress * 100)} %` : upload ? ` · ${Math.round(upload.duration)} s · uppladdat ✓` : ""}
              </p>
            )}
            {upProgress !== null && <div className="h-1 mt-1 rounded bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${upProgress * 100}%` }} /></div>}
            {limits && <p className="text-[10px] text-white/35 mt-1">Max {fmtMB(limits.maxBytes)} och {limits.maxClipSeconds} s (hela videon {limits.maxSeconds} s med intro och outro). Filma gärna i 1080p.</p>}
            {upload && format === "reel" && upload.duration + ADDED_SECONDS > 60 && (
              <p className="text-[10px] text-amber-300/80 mt-1">Videon blir {Math.round(upload.duration + ADDED_SECONDS)} s. Som Story delas den i flera bitar om 60 s – lägg upp den som Reel, eller korta klippet till högst {60 - Math.ceil(ADDED_SECONDS)} s.</p>
            )}
            <details className="mt-2 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
              <summary className="text-[11px] text-white/60 cursor-pointer">Tips: hur långt ska klippet vara?</summary>
              <div className="text-[11px] text-white/55 space-y-1.5 mt-2 leading-relaxed">
                <p>Intro och outro lägger till ca {Math.round(ADDED_SECONDS)} s till klippet.</p>
                <p><b className="text-white/75">Reel:</b> högst 3 min (verktyget stoppar vid {limits?.maxSeconds ?? 180} s totalt). Korta Reels får oftast mer räckvidd – bara det viktigaste.</p>
                <p><b className="text-white/75">Story:</b> Instagram delar upp videor i bitar om 60 s. Håll hela videon under 60 s (klippet högst ca {60 - Math.ceil(ADDED_SECONDS)} s) så att intro, klipp och outro hamnar i samma bit.</p>
                <p><b className="text-white/75">Flöde (4:5):</b> samma längder som Reel – videor i flödet visas även bland Reels.</p>
                <p className="text-white/45">Riktmärken för klippet: mål 5–15 s (från uppspelet till firandet), matchens stjärna 10–30 s, resultat 10–20 s, intervju 20–60 s (en–två frågor). Längre intervjuer fungerar, men tittarna hoppar ofta av efter en minut.</p>
              </div>
            </details>
          </div>

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Format</p>
            <div className="flex gap-1.5">
              <button onClick={() => setFormat("reel")} className={chip(format === "reel")}>Reel / Story (9:16)</button>
              <button onClick={() => setFormat("feed")} className={chip(format === "feed")}>Flöde (4:5)</button>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Kategori</p>
            <div className="flex flex-wrap gap-1.5">
              {VIDEO_KINDS.map((k) => <button key={k.id} onClick={() => setKind(k.id)} className={chip(kind === k.id)}>{k.name}</button>)}
            </div>
          </div>

          <label className="block text-[11px] text-white/50">Match
            <select value={match?.id ?? "none"} onChange={(e) => setMatchId(e.target.value === "none" ? "none" : Number(e.target.value))} className={input}>
              <option value="none" className="text-black">Ingen match – fyll i själv, säsongsstatistik</option>
              {matches.map((m) => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
            </select>
          </label>
          {kind === "goal" && match && (
            <label className="block text-[11px] text-white/50">Mål
              <select value={goal?.index ?? ""} onChange={(e) => setGoalIdx(Number(e.target.value))} className={input}>
                {goals.map((g) => <option key={g.index} value={g.index} className="text-black">{g.score} {g.scorer || "okänd"}{g.assist ? ` (${g.assist})` : ""} – {sideName(g.team)}</option>)}
              </select>
            </label>
          )}
          {kind === "stars" && (
            <div className="flex gap-1.5">
              {([1, 2, 3] as const).map((r) => <button key={r} onClick={() => setStarRank(r)} className={chip(starRank === r)}>{"★".repeat(4 - r)} {match ? stars[r - 1]?.name ?? "" : ""}</button>)}
            </div>
          )}
          {needsPlayer && (
            <label className="block text-[11px] text-white/50">Spelare
              <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={input}>
                <option value="" className="text-black">Ingen spelare</option>
                {players.map((p) => <option key={p.id} value={p.id} className="text-black">{p.number ? `#${p.number} ` : ""}{p.name}</option>)}
              </select>
            </label>
          )}

          <label className="block text-[11px] text-white/50">Rubrik<input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={30} placeholder="T.ex. Veckans räddning" className={input} /></label>
          <label className="block text-[11px] text-white/50">{kind === "goal" ? "Ställning" : kind === "result" ? "Resultat" : "Stor rad"}<input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={40} className={input} /></label>
          <label className="block text-[11px] text-white/50">Liten rad<input value={subline} onChange={(e) => setSubline(e.target.value)} maxLength={60} placeholder={kind === "goal" ? "Assist: …" : ""} className={input} /></label>
          <label className="block text-[11px] text-white/50">Datumrad<input value={dateLine} onChange={(e) => setDateLine(e.target.value)} maxLength={60} className={input} /></label>

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Pucken landar på</p>
            <div className="flex gap-1.5">
              <button onClick={() => setSide("green")} className={chip(side === "green")}>{teamName("green")}</button>
              <button onClick={() => setSide("white")} className={chip(side === "white")}>{teamName("white")}</button>
            </div>
            <p className="text-[10px] text-white/35 mt-1">Styr också färgen och loggan i titelkortet, overlayn och outron.</p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-white/50">Visa</p>
            <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[10px] text-white/40 w-16">Intro 2</span>
              {toggle("intro", "picture", "Kort/foto")}{toggle("intro", "stats", "Statistik")}{toggle("intro", "dateLine", "Datum")}{toggle("intro", "sponsor", "Sponsor")}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[10px] text-white/40 w-16">Klippet</span>
              {toggle("overlay", "nameBar", "Namnlist")}{toggle("overlay", "score", "Ställning")}{toggle("overlay", "stats", "Statistik")}{toggle("overlay", "clubLogo", "Logga")}{toggle("overlay", "sponsorLogo", "Sponsor")}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[10px] text-white/40 w-16">Outro</span>
              {toggle("outro", "sponsor", "Tack till sponsor")}
            </div>
            {needsPlayer && player && !picture && show.intro.picture && <p className="text-[10px] text-white/35">{player.name} har inget hockeykort eller foto – titelkortet visas utan bild.</p>}
          </div>

          {player && (
            <div>
              <p className="text-[11px] text-white/50 mb-1.5">Statistik (rutan och hockeykortet)</p>
              <div className="flex flex-wrap gap-1.5">
                {VIDEO_STATS_MODES.filter((m) => m.id !== "match" || match).map((m) => <button key={m.id} onClick={() => setStatsMode(m.id)} className={chip(statsMode === m.id)}>{m.name}</button>)}
              </div>
              {statsMode === "match" && <p className="text-[10px] text-white/35 mt-1">Mål, assist och poäng (målvakt: insläppta och nolla), lagets resultat och stjärnan om spelaren blev matchens ★★★/★★/★.</p>}
              {matchMissingPlayer && <p className="text-[10px] text-amber-300/80 mt-1">{player.name} finns inte i uppställningen för den matchen.</p>}
              {kind === "interview" && !match && <p className="text-[10px] text-white/35 mt-1">Välj en match ovan för att kunna visa matchens siffror.</p>}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-white/50">Sponsorer</p>
              <div className="flex gap-3">
                <button onClick={pickDefaults} className="flex items-center gap-1 text-[11px] text-sky-300/80"><RefreshCw size={12} /> Minst visade</button>
                <button onClick={shuffle} className="flex items-center gap-1 text-[11px] text-sky-300/80"><Shuffle size={12} /> Slumpa</button>
              </div>
            </div>
            <label className="block text-[11px] text-white/50">Stolt sponsor (intro 2)
              <select value={introSponsor} onChange={(e) => setIntroSponsor(e.target.value)} className={input}>
                <option value="" className="text-black">Ingen</option>
                {active.map((s) => <option key={s.name} value={s.name} className="text-black">{s.name} ({s.counts.media ?? 0} videor)</option>)}
              </select>
            </label>
            <label className="block text-[11px] text-white/50">Tack till (outro)
              <select value={outroSponsor} onChange={(e) => setOutroSponsor(e.target.value)} className={input}>
                <option value="" className="text-black">Ingen</option>
                {active.map((s) => <option key={s.name} value={s.name} className="text-black">{s.name} ({s.counts.media ?? 0} videor)</option>)}
              </select>
            </label>
          </div>
        </section>

        {/* Förhandsvisning och resultat */}
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[["Intro 2", introRef], ["Klippet", overlayRef], ["Outro", outroRef]].map(([label, ref]) => (
              <div key={label as string}>
                <canvas ref={ref as React.RefObject<HTMLCanvasElement>} className={`w-full h-auto rounded-lg bg-black ${aspect}`} />
                <p className="text-[10px] text-white/40 text-center mt-1">{label as string}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/35">Före intro 2 kommer puckflippen (1,6 s). {format === "reel" ? "Text och loggor hålls inom Instagrams säkra yta för Reels." : ""}</p>

          <button onClick={() => void render()} disabled={!upload || !graphics || starting || job?.status === "queued" || job?.status === "rendering"}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-40">
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />} Skapa video
          </button>
          {!upload && <p className="text-[10px] text-white/35 text-center">{upProgress !== null ? "Väntar på uppladdningen …" : "Välj ett klipp först."}</p>}

          {job && job.status !== "done" && (
            <div className="rounded-lg border border-white/10 p-3 text-sm">
              {job.status === "failed" ? <p className="text-red-300">{job.error ?? "Renderingen misslyckades"}</p> : (
                <>
                  <p className="flex items-center gap-2 text-white/70"><Loader2 size={14} className="animate-spin" /> {job.status === "queued" ? "I kö …" : `Skapar videon … ${Math.round(job.progress * 100)} %`}</p>
                  <div className="h-1 mt-2 rounded bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${job.progress * 100}%` }} /></div>
                </>
              )}
            </div>
          )}
          {videoUrl && (
            <div className="space-y-2">
              <video src={videoUrl} controls playsInline className={`w-full rounded-lg bg-black ${aspect}`} />
              <div className="grid grid-cols-3 gap-2">
                <a href={`${videoUrl}?download=1`} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-sm"><Download size={14} /> Ladda ned</a>
                <button onClick={() => void share()} disabled={sharing} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white text-sm font-semibold disabled:opacity-40">
                  {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Dela
                </button>
                <button onClick={() => void copy()} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-sm">{copied ? <Check size={14} /> : <Copy size={14} />} Text</button>
              </div>
              <p className="text-[10px] text-white/35">Videon sparas i 24 timmar. Dela kopierar bildtexten först – klistra in den i Instagram.</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="video-caption" className="text-[11px] text-white/50">Bildtext</label>
              {captionEdited && <button onClick={() => setCaptionEdited(false)} className="text-[10px] text-sky-300/80">Återställ</button>}
            </div>
            <textarea id="video-caption" value={caption} onChange={(e) => { setCaptionEdited(true); setCaption(e.target.value); }} rows={6}
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-3 py-2" />
          </div>
        </section>
      </main>
    </div>
  );
}
