/**
 * Media (styrelsen) – route /media.
 *
 * Egna Instagram-inlägg (4:5) i klubbens grafiska profil, samma format som
 * matchrapporten så att de kan läggas i samma karusell:
 *  - Lagets uppställning: Vita eller Gröna, hämtad direkt från Lineup
 *  - Text: rubrik, text och info-rad, med arenan eller egen bild bakom
 * Teman (standard, jul, nyår, påsk), valfri sponsor, bildtext med klubbens
 * hashtags. Inlägg sparas som utkast och kan öppnas och ändras igen.
 */
import { buildReportData, type ReportMatch } from "@/components/score/MatchReportModal";
import { starCandidates, autoStars, type StarCandidate } from "@/lib/starsOfGame";
import { useFeatures } from "@/contexts/ClubContext";
import { matchSides } from "@/lib/matchSides";
import type { MatchSetup } from "@shared/matchSetup";
import { defaultTeamNames, isTeamAWhite, teamGenitive, teamName, teamSingular } from "@shared/teams";
import { club } from "@shared/club";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Download, Share2, Copy, Check, Save, Plus, Trash2, Loader2, RefreshCw, Upload, X, Users, Type, CalendarDays, IdCard, BarChart3, Trophy, Film } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSponsors, logoForName } from "@/lib/sponsors";
import { createTeamSlots, groupSlots, type TeamConfig } from "@/lib/lineup";
import type { Player } from "@/lib/players";
import { prepareSourcePhoto } from "@/lib/cardPhoto";
import { renderMediaPost, MEDIA_OVERLAYS, MEDIA_BACKGROUNDS, overlayFromTheme, type MediaOverlay, type MediaBackground, type LineupGroup, type MediaPostData } from "@/lib/mediaImages";
import { type CardSettings } from "@shared/cardRender";
import { renderSavedCard } from "@/lib/savedCardImage";
import { cellsFor, defaultStatsTitle } from "@shared/cardStats";
import { STAT_CATEGORIES, STAT_PERIODS, periodRange, statRows, type StatCategory, type StatPeriod } from "./mediaStats";

type Kind = "lineup" | "text" | "cards" | "stats" | "result";

interface Settings {
  kind: Kind;
  overlay: MediaOverlay;
  background: MediaBackground;
  /** Lagets uppställning mot motståndare: lagets logga och färg (annars klubbens) */
  teamLogo?: string | null;
  teamAccent?: string;
  /** Äldre sparade inlägg */
  theme?: string;
  subtitle: string;
  // cards
  cardPlayers: string[];
  // stats
  statCategory: StatCategory;
  statPeriod: StatPeriod;
  statLimit: number;
  /** Senaste resultat: vilken match (standard den senaste) */
  matchId?: number | null;
  /** Ta med matcher mot andra lag (beta) */
  statIncludeExternal?: boolean;
  dateLine: string;
  sponsorName: string | null;
  // lineup
  team: "white" | "green";
  title: string;
  teamName: string;
  groups: LineupGroup[];
  // text
  body: string;
  info: string;
  photoDim: number;
  /** Egen bild används som bakgrund (gäller alla mallar) */
  useOwnPhoto?: boolean;
}

const BASE: Omit<Settings, "kind"> = {
  overlay: "none", background: "arena", subtitle: "", cardPlayers: [], statCategory: "points", statPeriod: "season", statLimit: 10,
  dateLine: "", sponsorName: null, team: "green", title: "", teamName: "", groups: [], body: "", info: "", photoDim: 0.5,
};
const NEW: Record<Kind, Settings> = {
  lineup: { ...BASE, kind: "lineup", title: "Dagens lag", get teamName() { return teamName("green"); } },
  text: { ...BASE, kind: "text" },
  cards: { ...BASE, kind: "cards", title: "Veckans spelare" },
  stats: { ...BASE, kind: "stats", title: "Poängligan" },
  result: { ...BASE, kind: "result", title: "" },
};

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
/** "Tisdag 29/9 · Arenan 22:15" av evenemanget (exporteras för test) */
export function eventLine(ev: { eventDate?: string; eventTime?: string; eventLocation?: string } | undefined | null): string {
  const m = ev?.eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const place = [ev?.eventLocation, ev?.eventTime].filter(Boolean).join(" ");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}${place ? ` · ${place}` : ""}`;
}

/** Grupperna (målvakt, backpar, kedjor) för ett lag ur Lineups dokument (exporteras för test). */
export function teamGroups(
  doc: { teamAName: string; teamBName: string; teamAConfig?: TeamConfig; teamBConfig?: TeamConfig; lineup: Record<string, Player> },
  team: "white" | "green"
): { name: string; groups: LineupGroup[] } {
  const aWhite = isTeamAWhite(doc.teamAName);
  const useA = (team === "white") === aWhite;
  const prefix = useA ? "team-a" : "team-b";
  const slots = createTeamSlots(prefix, useA ? doc.teamAConfig : doc.teamBConfig);
  const posOf = (role: string) => (role === "gk" || role === "res-gk" ? "MV" : role === "def" ? "B" : role === "c" ? "C" : role === "lw" ? "LW" : "RW");
  // Målvakt och reservmålvakt i samma grupp, sedan backpar och kedjor
  const gk = slots.filter((x) => x.type === "goalkeeper");
  const rest = groupSlots(slots.filter((x) => x.type !== "goalkeeper"));
  const raw = [{ groupLabel: "Målvakt", slots: gk }, ...rest];
  const groups = raw.map((g) => ({
    label: g.slots.every((x) => x.type === "goalkeeper") ? (g.slots.filter((x) => doc.lineup[x.id]).length > 1 ? "Målvakter" : "Målvakt") : g.groupLabel,
    players: g.slots
      .map((s) => ({ s, p: doc.lineup[s.id] }))
      .filter((x) => !!x.p)
      .map(({ s, p }) => ({ pos: posOf(s.role), name: p.name, number: p.number || undefined, captain: p.captainRole ?? undefined })),
  }));
  const rawName = useA ? doc.teamAName : doc.teamBName;
  const name = rawName && rawName.toUpperCase() === club().name.toUpperCase() ? club().name
    : rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase() : teamName(team);
  return { name, groups: groups.filter((g) => g.players.length > 0) };
}

function defaultCaption(s: Settings, tags: string[]): string {
  const tagLine = tags.join(" ");
  if (s.kind === "lineup") {
    const lines = s.groups.map((g) => `${g.label}: ${g.players.map((p) => `${p.name}${p.number ? ` #${p.number}` : ""}`).join(", ")}`);
    return [`${s.title || "Dagens lag"} – ${s.teamName} ${s.team === "green" ? "💚" : "🤍"}`, s.dateLine, "", ...lines, s.sponsorName ? `\nPresenteras av ${s.sponsorName}` : "", "", tagLine].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  }
  if (s.kind === "stats" || s.kind === "cards") {
    return [s.title, s.subtitle, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tagLine].filter(Boolean).join("\n\n");
  }
  return [s.title, s.body, s.info, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tagLine].filter(Boolean).join("\n\n");
}

export default function MediaApp() {
  const utils = trpc.useUtils();
  const posts = trpc.media.list.useQuery();
  const save = trpc.media.save.useMutation({ onSuccess: () => utils.media.list.invalidate() });
  const del = trpc.media.delete.useMutation({ onSuccess: () => utils.media.list.invalidate() });
  const lineupState = trpc.lineup.getState.useQuery(undefined, { staleTime: 30_000 });
  const event = trpc.laget.attendance.useQuery(undefined, { staleTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false });
  const tagsQuery = trpc.score.reportTags.get.useQuery(undefined, { staleTime: 60_000 });
  const { sponsors } = useSponsors();
  const registry = trpc.players.list.useQuery(undefined, { staleTime: 60_000 });
  const savedCards = trpc.cards.list.useQuery(undefined, { staleTime: 60_000 });
  const periodsQ = trpc.score.config.getPeriods.useQuery(undefined, { staleTime: 10 * 60_000 });

  const [postId, setPostId] = useState<number | null>(null);
  const [s, setS] = useState<Settings>(NEW.lineup);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null | undefined>(undefined);
  // Egen bild används när en bild finns och den inte valts bort till förmån för en bakgrund
  const ownActive = !!photo && s.useOwnPhoto !== false;
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));
  const tags = tagsQuery.data ?? [];

  // ─── Senaste resultat: matchrapportens resultatbild för en vald match ───
  const matchesQ = trpc.score.match.list.useQuery(undefined, { enabled: s.kind === "result", staleTime: 60_000 });
  const opponentsForResult = trpc.opponents.list.useQuery({ includeArchived: true }, { enabled: s.kind === "result", staleTime: 5 * 60_000 });
  const resultMatches = useMemo(() => ((matchesQ.data ?? []) as unknown as ReportMatch[]).filter((m) => (m as { reviewStatus?: string }).reviewStatus !== "rejected").slice(0, 15), [matchesQ.data]);
  const resultMatch = resultMatches.find((m) => m.id === s.matchId) ?? resultMatches[0];
  const reportData = useMemo(() => {
    if (!resultMatch) return null;
    const cands = starCandidates({ teamWhiteScore: resultMatch.teamWhiteScore, teamGreenScore: resultMatch.teamGreenScore, goalHistory: resultMatch.goalHistory, lineup: resultMatch.lineup });
    const saved = resultMatch.report?.stars?.filter((k) => cands.some((c) => c.key === k));
    const keys = saved && saved.length === 3 ? saved : autoStars(cands, resultMatch.id);
    const stars = keys.map((k) => cands.find((c) => c.key === k)).filter(Boolean) as StarCandidate[];
    const opp = resultMatch.opponentId ? opponentsForResult.data?.find((o) => o.id === resultMatch.opponentId) ?? null : null;
    return buildReportData(resultMatch, stars, null, resultMatch.report?.showStats ?? [true, true, true], s.title || resultMatch.report?.title || undefined, true, opp);
  }, [resultMatch, opponentsForResult.data, s.title]);

  // ─── Statistik ───
  const range = periodRange(s.statPeriod, periodsQ.data as never);
  const featuresM = useFeatures();
  const extInput = featuresM.opponents && s.statIncludeExternal ? { includeExternal: true } : {};
  const rangeInput = range.from ? { from: range.from, to: range.to, ...extInput } : { ...extInput };
  const statsQ = trpc.scoreStats.seasonStats.useQuery(rangeInput, { enabled: s.kind === "stats" && s.statCategory !== "awards" });
  const awardsQ = trpc.scoreStats.seasonAwards.useQuery(rangeInput, { enabled: s.kind === "stats" && s.statCategory === "awards" });
  const statCat = STAT_CATEGORIES.find((c) => c.id === s.statCategory)!;
  const rows = useMemo(() => statRows(s.statCategory, statsQ.data as never, awardsQ.data?.awards as never, s.statLimit), [s.statCategory, s.statLimit, statsQ.data, awardsQ.data]);

  // ─── Spelarkort: rita valda spelares sparade kort med aktuell statistik ───
  const [cardCanvases, setCardCanvases] = useState<HTMLCanvasElement[]>([]);
  const cardsKey = s.kind === "cards" ? s.cardPlayers.join("|") : "";
  useEffect(() => {
    if (s.kind !== "cards" || !savedCards.data) { setCardCanvases([]); return; }
    let cancelled = false;
    (async () => {
      const out: HTMLCanvasElement[] = [];
      for (const id of s.cardPlayers.slice(0, 4)) {
        const card = savedCards.data!.find((c) => c.playerId === id);
        if (!card) continue;
        const stats = await utils.client.cards.stats.query({ playerId: id, ...((card.settings as Partial<CardSettings>)?.includeExternal ? { includeExternal: true } : {}) }).catch(() => undefined);
        out.push(await renderSavedCard(card, { stats, scale: 0.9 }));
      }
      if (!cancelled) setCardCanvases(out);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [cardsKey, s.kind, savedCards.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardPlayers = (registry.data ?? []).filter((p) => savedCards.data?.some((c) => c.playerId === p.id)).sort((a, b) => a.name.localeCompare(b.name, "sv"));

  // Matchtyp i Lineup: mot motståndare → lagens namn, loggor och färger
  const setupNow = (lineupState.data as { setup?: MatchSetup } | undefined)?.setup;
  const oppQ = trpc.opponents.get.useQuery({ id: setupNow?.opponentId ?? 0 }, { enabled: setupNow?.mode === "external" && !!setupNow.opponentId, staleTime: 60_000 });
  const externalSides = () => (setupNow?.mode === "external" ? matchSides(setupNow, oppQ.data ?? null, (lineupState.data as { teamAName?: string } | undefined)?.teamAName) : null);

  const loadTeam = (team: "white" | "green", announce = false) => {
    if (!lineupState.data) return;
    const { name, groups } = teamGroups(lineupState.data as never, team);
    // Mot motståndare: vårt lags logga eller motståndarens logga och färg
    const ext = externalSides();
    update({ team, teamName: name, groups, teamLogo: ext ? ext[team].logo : undefined, teamAccent: ext ? ext[team].color : undefined });
    if (announce) toast.success(`${name}s uppställning hämtad`, { description: `${groups.reduce((n, g) => n + g.players.length, 0)} spelare` });
  };

  // Nytt lag-inlägg: hämta laget och datumraden direkt
  useEffect(() => {
    if (postId === null && s.kind === "lineup" && s.groups.length === 0 && lineupState.data) loadTeam(s.team);
  }, [lineupState.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (postId === null && !s.dateLine && event.data) update({ dateLine: eventLine(event.data) });
  }, [event.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bildtext: statistiken får periodens namn och listan, korten spelarnas namn
  const autoCaption = useMemo(() => {
    if (s.kind === "stats") {
      const list = rows.map((r) => `${/^\d+$/.test(r.rank ?? "") ? `${r.rank}.` : r.rank ?? "•"} ${r.name}${r.sub && s.statCategory === "awards" ? ` – ${r.sub}` : ""} ${r.value}`).join("\n");
      return [`${s.title || statCat.title} – ${s.subtitle || range.label}`, list, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tags.join(" ")].filter(Boolean).join("\n\n");
    }
    if (s.kind === "result" && reportData) {
      const head = `${reportData.whiteName} ${reportData.whiteScore}–${reportData.greenScore} ${reportData.greenName}`;
      const stars = reportData.stars.map((st, i) => `${"⭐".repeat(3 - i)} ${st.name}${st.stat ? ` (${st.stat})` : ""}`).join("\n");
      return [s.title || reportData.title || "Slutresultat", head, reportData.dateLine, stars, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tags.join(" ")].filter(Boolean).join("\n\n");
    }
    if (s.kind === "cards") {
      const names = s.cardPlayers.map((id) => registry.data?.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
      return [s.title, s.subtitle, names, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tags.join(" ")].filter(Boolean).join("\n\n");
    }
    return defaultCaption(s, tags);
  }, [s, tags, rows, range.label, statCat.title, registry.data, reportData]);
  useEffect(() => { if (!captionEdited) setCaption(autoCaption); }, [autoCaption, captionEdited]);

  const sponsor = s.sponsorName ? { name: s.sponsorName, logo: logoForName(sponsors, s.sponsorName) } : null;

  // Förhandsvisning
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const common = { overlay: s.overlay, background: s.background, dateLine: s.dateLine, sponsor, photo: s.useOwnPhoto !== false ? photo : null, photoDim: s.photoDim };
      const data: MediaPostData =
        s.kind === "lineup" ? { ...common, kind: "lineup", team: s.team, teamName: s.teamName, title: s.title, groups: s.groups, ...(s.teamLogo !== undefined ? { logo: s.teamLogo, accent: s.teamAccent } : {}) }
        : s.kind === "cards" ? { ...common, kind: "cards", title: s.title, subtitle: s.subtitle, cards: cardCanvases }
        : s.kind === "stats" ? { ...common, kind: "stats", title: s.title, subtitle: s.subtitle || range.label, valueLabel: statCat.valueLabel, rows }
        : s.kind === "result" ? (reportData ? { ...common, kind: "result", report: reportData } : { ...common, kind: "text", title: "Inga matcher än", body: "", info: "" })
        : { ...common, kind: "text", title: s.title, body: s.body, info: s.info };
      const c = await renderMediaPost(data);
      if (cancelled || !canvasRef.current) return;
      canvasRef.current.width = c.width;
      canvasRef.current.height = c.height;
      canvasRef.current.getContext("2d")!.drawImage(c, 0, 0);
      c.toBlob((b) => { if (!cancelled) setBlob(b); }, "image/jpeg", 0.92);
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s, photo, sponsor?.name, sponsor?.logo, cardCanvases, rows, range.label, reportData]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = (kind: Kind) => {
    setPostId(null);
    setCaptionEdited(false);
    // Utseendet följer med till nästa mall: bakgrund, egen bild, mörkning och överlägg
    const look = { background: s.background, overlay: s.overlay, photoDim: s.photoDim, useOwnPhoto: s.useOwnPhoto };
    // Egen bild från ett öppnat inlägg: ta med den som ny bild så att den sparas med det nya inlägget
    if (photo && newPhoto === undefined) void currentPhotoBase64().then((b) => setNewPhoto(b)).catch(() => undefined);
    setS({ ...NEW[kind], ...look, dateLine: kind === "lineup" || kind === "text" ? eventLine(event.data) : "" });
    if (kind === "lineup" && lineupState.data) {
      const { name, groups } = teamGroups(lineupState.data as never, "green");
      setS({ ...NEW.lineup, ...look, dateLine: eventLine(event.data), teamName: name, groups });
    }
  };

  /** Nästa träning: textinlägg ifyllt från laget.se (dag, tid, plats och antal anmälda) */
  const startNextTraining = () => {
    startNew("text");
    const ev = event.data;
    if (!ev || ev.noEvent || !ev.eventDate) { toast("Inget kommande evenemang hittades på laget.se"); return; }
    const n = ev.totalRegistered ?? ev.registeredNames?.length ?? 0;
    setS((prev) => ({
      ...prev,
      title: ev.eventTitle || "Träning",
      body: n > 0 ? `${n} anmälda – anmäl dig på laget.se` : "Anmäl dig på laget.se",
      info: eventLine(ev),
      dateLine: "",
    }));
  };

  const open = async (p: NonNullable<typeof posts.data>[number]) => {
    setPostId(p.id);
    const saved = p.settings as Partial<Settings>;
    setS({ ...NEW[(p.type as Kind) ?? "text"], ...saved, overlay: saved.overlay ?? overlayFromTheme(saved.theme) });
    setCaption(p.caption ?? "");
    setCaptionEdited(!!p.caption);
    setNewPhoto(undefined);
    setPhoto(null);
    if (p.hasPhoto) {
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = `/api/media/${p.id}/photo?v=${new Date(p.updatedAt).getTime()}`;
    }
  };

  const onFile = async (f: File) => {
    try {
      const { base64 } = await prepareSourcePhoto(f);
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = `data:image/jpeg;base64,${base64}`;
      setNewPhoto(base64);
      update({ useOwnPhoto: true }); // vald bild används direkt
    } catch (e) {
      toast.error("Bilden kunde inte läsas", { description: (e as Error).message });
    }
  };

  const titleFor = () =>
    s.kind === "lineup" ? `${s.title || "Dagens lag"} – ${s.teamName}${s.dateLine ? ` (${s.dateLine.split(" · ")[0]})` : ""}`
    : s.kind === "stats" ? `${s.title || statCat.title} – ${s.subtitle || range.label}`
    : s.kind === "result" ? `Resultat – ${resultMatch?.name ?? ""}`
    : s.title || "Inlägg utan rubrik";

  const doSave = async (asNew: boolean) => {
    setBusy("save");
    try {
      const res = await save.mutateAsync({
        id: asNew ? undefined : postId ?? undefined,
        type: s.kind,
        title: titleFor().slice(0, 120),
        settings: s as unknown as Record<string, unknown>,
        caption: captionEdited ? caption : "",
        photoBase64: asNew ? (newPhoto ?? (photo ? await currentPhotoBase64() : null)) : newPhoto,
      });
      setPostId(res.id);
      setNewPhoto(undefined);
      toast.success(asNew || !postId ? "Inlägget är sparat" : "Ändringarna är sparade");
    } catch (e) {
      toast.error("Kunde inte spara", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  /** Befintlig bild som base64 (när ett inlägg sparas som nytt) */
  const currentPhotoBase64 = async (): Promise<string | null> => {
    if (!photo) return null;
    const c = document.createElement("canvas");
    c.width = photo.naturalWidth; c.height = photo.naturalHeight;
    c.getContext("2d")!.drawImage(photo, 0, 0);
    return c.toDataURL("image/jpeg", 0.86).split(",")[1] ?? null;
  };

  const fileName = () => `${club().fileSlug}-${titleFor().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.jpg`;
  const download = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    if (!blob) return;
    setBusy("share");
    try {
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      const file = new File([blob], fileName(), { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: caption });
      else download();
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela");
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(caption).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200" : "bg-white/5 border-white/10 text-white/60"}`;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Media</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-5 lg:grid-cols-[220px_minmax(0,360px)_minmax(0,1fr)]">
        {/* Nytt och sparade */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            <button onClick={() => startNew("lineup")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Users size={14} /> Lagets uppställning</button>
            <button onClick={() => startNew("text")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Type size={14} /> Text</button>
            <button onClick={() => startNew("cards")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><IdCard size={14} /> Spelarkort</button>
            <button onClick={() => startNew("stats")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><BarChart3 size={14} /> Statistik</button>
            <button onClick={() => startNew("result")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Trophy size={14} /> Senaste resultat</button>
            <button onClick={startNextTraining} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><CalendarDays size={14} /> Nästa träning</button>
            <Link href="/media/video" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Film size={14} /> Video (Instagram)</Link>
          </div>
          <div>
            <p className="text-[11px] text-white/45 mb-1.5">Sparade inlägg</p>
            {posts.isLoading ? <Loader2 className="animate-spin text-white/40" /> : (posts.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-white/35">Inga sparade än.</p>
            ) : (
              <ul className="space-y-1 max-h-60 lg:max-h-[60vh] overflow-y-auto">
                {posts.data!.map((p) => (
                  <li key={p.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${p.id === postId ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"}`}>
                    <button onClick={() => void open(p)} className="flex-1 min-w-0 text-left">
                      <p className="text-xs truncate">{p.title}</p>
                      <p className="text-[10px] text-white/35">{new Date(p.updatedAt).toLocaleString("sv-SE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</p>
                    </button>
                    <button onClick={() => { if (confirm(`Ta bort "${p.title}"?`)) { del.mutate({ id: p.id }); if (p.id === postId) setPostId(null); } }}
                      className="p-1 text-red-300/60 hover:text-red-300" aria-label="Ta bort"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Förhandsvisning och åtgärder */}
        <section className="space-y-2">
          <canvas ref={canvasRef} className="w-full h-auto rounded-xl shadow-2xl bg-black aspect-[4/5]" aria-label="Förhandsvisning" />
          <p className="text-[10px] text-white/35 text-center">4:5 (1080×1350) – samma format som matchrapporten.</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={download} disabled={!blob} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-sm disabled:opacity-40"><Download size={14} /> Ladda ned</button>
            <button onClick={() => void share()} disabled={!blob || !!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white text-sm font-semibold disabled:opacity-40">
              {busy === "share" ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Dela
            </button>
            <button onClick={() => void copy()} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-sm">{copied ? <Check size={14} /> : <Copy size={14} />} Text</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void doSave(false)} disabled={!!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {postId ? "Spara ändringar" : "Spara"}
            </button>
            <button onClick={() => void doSave(true)} disabled={!!busy || !postId} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/15 text-sm disabled:opacity-40"><Plus size={14} /> Spara som nytt</button>
          </div>
        </section>

        {/* Inställningar */}
        <section className="space-y-4">
          {s.kind === "result" && (
            <>
              <label className="block text-[11px] text-white/50">Match
                <select value={resultMatch?.id ?? ""} onChange={(e) => update({ matchId: Number(e.target.value) || null })} className={input}>
                  {resultMatches.map((m) => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
                </select>
              </label>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} placeholder={resultMatch?.report?.title || "Slutresultat"} className={input} /></label>
              <p className="text-[10px] text-white/35">Samma resultatbild som matchrapporten (Stars of the Game från rapporten), med vald bakgrund och överlägg.</p>
            </>
          )}
          {s.kind === "cards" && (
            <>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} className={input} /></label>
              <label className="block text-[11px] text-white/50">Underrubrik<input value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={60} placeholder="T.ex. Vecka 40" className={input} /></label>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Spelare (1–4, med sparade hockeykort) – {s.cardPlayers.length} valda</p>
                {cardPlayers.length === 0 ? <p className="text-xs text-white/35">Inga sparade hockeykort än – skapa dem i Hockeykort.</p> : (
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                    {cardPlayers.map((p) => {
                      const on = s.cardPlayers.includes(p.id);
                      return (
                        <button key={p.id} onClick={() => update({ cardPlayers: on ? s.cardPlayers.filter((x) => x !== p.id) : [...s.cardPlayers, p.id].slice(0, 4) })}
                          disabled={!on && s.cardPlayers.length >= 4} className={`${chip(on)} disabled:opacity-35`}>{p.name}</button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-white/35 mt-1">1 kort = stort, 2 = bredvid varandra, 3–4 = två rader. Korten får aktuell statistik.</p>
              </div>
            </>
          )}
          {s.kind === "stats" && (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Visa</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAT_CATEGORIES.map((c) => <button key={c.id} onClick={() => update({ statCategory: c.id, title: c.title })} className={chip(s.statCategory === c.id)}>{c.name}</button>)}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Period</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAT_PERIODS.map((p) => <button key={p.id} onClick={() => update({ statPeriod: p.id, subtitle: "" })} className={chip(s.statPeriod === p.id)}>{p.name}</button>)}
                </div>
              </div>
              {featuresM.opponents && (
                <button onClick={() => update({ statIncludeExternal: !s.statIncludeExternal })} className={chip(!!s.statIncludeExternal)}>
                  {s.statIncludeExternal ? "✓ " : ""}Inkl. externa matcher
                </button>
              )}
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-white/50">Antal</p>
                {[3, 5, 10].map((n) => <button key={n} onClick={() => update({ statLimit: n })} className={chip(s.statLimit === n)}>Topp {n}</button>)}
              </div>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} className={input} /></label>
              <label className="block text-[11px] text-white/50">Underrubrik<input value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={60} placeholder={range.label} className={input} /></label>
              {(statsQ.isLoading || awardsQ.isLoading) && <p className="text-[11px] text-white/40 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Hämtar statistik …</p>}
            </>
          )}
          {s.kind === "cards" || s.kind === "stats" || s.kind === "result" ? null : s.kind === "lineup" ? (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Lag</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={() => loadTeam("white")} className={chip(s.team === "white")}>{externalSides()?.white.name ?? teamName("white")}</button>
                  <button onClick={() => loadTeam("green")} className={chip(s.team === "green")}>{externalSides()?.green.name ?? teamName("green")}</button>
                  <button onClick={() => loadTeam(s.team, true)} className="flex items-center gap-1 text-[11px] text-sky-300/80 hover:text-sky-200 ml-auto"><RefreshCw size={12} /> Hämta aktuell uppställning</button>
                </div>
                <p className="text-[10px] text-white/35 mt-1">{s.groups.reduce((n, g) => n + g.players.length, 0)} spelare. Ett sparat inlägg behåller laget som det var – tryck Hämta för att uppdatera.</p>
              </div>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} className={input} /></label>
            </>
          ) : (
            <>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={60} placeholder="T.ex. Nu börjar serien" className={input} /></label>
              <label className="block text-[11px] text-white/50">Text<textarea value={s.body} onChange={(e) => update({ body: e.target.value })} rows={3} maxLength={400} className={input} /></label>
              <label className="block text-[11px] text-white/50">Info-rad (i färg)
                <div className="flex gap-2">
                  <input value={s.info} onChange={(e) => update({ info: e.target.value })} maxLength={40} placeholder="T.ex. Torsdag 18/12 · 19:00" className={input} />
                  <button onClick={() => { const l = eventLine(event.data); if (l) update({ info: l.replace(/ · [^·]*? (\d{1,2}:\d{2})$/, " · $1") }); else toast("Inget kommande evenemang hittades"); }}
                    title="Nästa träning från laget.se" className="shrink-0 px-2 rounded-lg bg-white/5 border border-white/10"><CalendarDays size={14} /></button>
                </div>
              </label>
            </>
          )}

          {s.kind !== "result" && (
          <label className="block text-[11px] text-white/50">Rad överst (datum/plats)
            <div className="flex gap-2">
              <input value={s.dateLine} onChange={(e) => update({ dateLine: e.target.value })} maxLength={60} className={input} />
              <button onClick={() => update({ dateLine: eventLine(event.data) })} title="Nästa träning från laget.se" className="shrink-0 px-2 rounded-lg bg-white/5 border border-white/10"><CalendarDays size={14} /></button>
            </div>
          </label>
          )}

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Bakgrund</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MEDIA_BACKGROUNDS.map((b) => (
                <button key={b.id} onClick={() => update({ background: b.id, useOwnPhoto: false })} title={b.name}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-[4/5] ${s.background === b.id && !ownActive ? "border-emerald-400" : "border-white/10 opacity-70 hover:opacity-100"}`}>
                  <img src={b.url} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 text-[10px] bg-black/60 text-white/85 py-0.5 text-center truncate px-1">{b.name}</span>
                </button>
              ))}
              {/* Egen bild: tom ruta med rött streck tills en bild valts */}
              <button onClick={() => (photo ? update({ useOwnPhoto: true }) : fileRef.current?.click())} title={photo ? "Egen bild" : "Välj en egen bild"}
                className={`relative rounded-lg overflow-hidden border-2 aspect-[4/5] bg-[#151515] ${ownActive ? "border-emerald-400" : "border-white/10 opacity-80 hover:opacity-100"}`}>
                {photo ? <img src={photo.src} alt="" className="w-full h-full object-cover" /> : (
                  <svg viewBox="0 0 40 50" preserveAspectRatio="none" className="absolute inset-0 w-full h-full"><line x1="2" y1="48" x2="38" y2="2" stroke="#ef4444" strokeWidth="1.5" /></svg>
                )}
                <span className="absolute inset-x-0 bottom-0 text-[10px] bg-black/60 text-white/85 py-0.5 text-center truncate px-1">Egen bild</span>
              </button>
            </div>
            {ownActive && (
              <div className="mt-2 space-y-1.5">
                <label className="block text-[11px] text-white/50">Mörka bilden
                  <input type="range" min={0} max={1} step={0.01} value={s.photoDim} onChange={(e) => update({ photoDim: Number(e.target.value) })} className="w-full accent-emerald-400" />
                </label>
                <div className="flex gap-3">
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white"><Upload size={12} /> Byt bild</button>
                  <button onClick={() => { setPhoto(null); setNewPhoto(null); update({ useOwnPhoto: false }); }} className="flex items-center gap-1 text-[11px] text-red-300/70"><X size={12} /> Ta bort bilden</button>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Överlägg</p>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_OVERLAYS.map((t) => <button key={t.id} onClick={() => update({ overlay: t.id })} className={chip(s.overlay === t.id)}>{t.name}</button>)}
            </div>
          </div>

          <label className="block text-[11px] text-white/50">Presenteras av
            <select value={s.sponsorName ?? ""} onChange={(e) => update({ sponsorName: e.target.value || null })} className={input}>
              <option value="" className="text-black">Ingen sponsor</option>
              {sponsors.filter((sp) => sp.active).map((sp) => <option key={sp.name} value={sp.name} className="text-black">{sp.name}</option>)}
            </select>
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="media-caption" className="text-[11px] text-white/50">Bildtext</label>
              {captionEdited && <button onClick={() => setCaptionEdited(false)} className="text-[10px] text-sky-300/80">Återställ</button>}
            </div>
            <textarea id="media-caption" value={caption} onChange={(e) => { setCaptionEdited(true); setCaption(e.target.value); }} rows={7}
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-3 py-2" />
            <p className="text-[10px] text-white/35 mt-1">Hashtags från Matchrapporten läggs till automatiskt. Texten kopieras när du delar.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
