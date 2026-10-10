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
import { defaultTeamNames, isTeamAWhite, teamColor, teamGenitive, teamName, teamSingular } from "@shared/teams";
import { club } from "@shared/club";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Download, Share2, Copy, Check, Save, Plus, Trash2, Loader2, RefreshCw, Upload, X, Users, Type, CalendarDays, IdCard, BarChart3, Trophy, Film, Award, ImageIcon, Clapperboard, Newspaper, Wand2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSponsors, logoForName, randomSponsorName } from "@/lib/sponsors";
import { createTeamSlots, groupSlots, type TeamConfig } from "@/lib/lineup";
import type { Player } from "@/lib/players";
import { prepareSourcePhoto } from "@/lib/cardPhoto";
import { renderMediaPages, MEDIA_OVERLAYS, MEDIA_BACKGROUNDS, overlayFromTheme, type MediaOverlay, type MediaBackground, type LineupGroup, type MediaPostData, type PostFormat, type PressPageData } from "@/lib/mediaImages";
import { setVideoStill, type VideoStill } from "@/lib/videoStill";
import { PRESS_NAME, issueOf, type BillStyle } from "@/lib/pressImages";
import { pressFacts, headlineSuggestions, articleText, cleanName, splitPasted, excerpt } from "@/lib/pressText";
import { type CardSettings } from "@shared/cardRender";
import { renderPlayerCard } from "@/lib/savedCardImage";
import { cellsFor, defaultStatsTitle } from "@shared/cardStats";
import { STAT_CATEGORIES, STAT_PERIODS, periodRange, statRows, goalieRows, isGoalieCategory, type StatCategory, type StatPeriod } from "./mediaStats";

type Kind = "lineup" | "text" | "cards" | "stats" | "result" | "award" | "image" | "bill" | "front" | "article" | "interview";
/** Stålbladet: löpsedeln och tidningssidorna */
const isPress = (k: Kind) => k === "bill" || isPressPage(k);
/** Tidningssidorna (förstasida, artikel, intervju) – fritext med tidningens rutor runt omkring */
const isPressPage = (k: Kind) => k === "front" || k === "article" || k === "interview";

/** Puff på förstasidan ("Läs mer på sid 4"), bilden sparas som liten JPEG */
interface TeaserSetting { kicker: string; title: string; sub: string; page: string; image?: string | null }
const EMPTY_TEASERS: TeaserSetting[] = [
  { kicker: "", title: "", sub: "", page: "Sid 4" },
  { kicker: "", title: "", sub: "", page: "Sid 6" },
  { kicker: "", title: "", sub: "", page: "Sid 8" },
];

interface Settings {
  kind: Kind;
  /** 4:5 (flödet, standard) eller 9:16 (Story/Reel) */
  format?: PostFormat;
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
  /** Utmärkelse: vilken (id från statistiken) och vilka placeringar */
  awardId?: string;
  awardPlaces?: Array<1 | 2 | 3>;
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
  // Stålbladet (löpsedel och artikel)
  pressStyle?: BillStyle;
  kicker?: string;
  byline?: string;
  /** Bild på löpsedeln/artikeln (egen bild eller vald bakgrund) */
  pressPhoto?: boolean;
  /** Löpsedeln: bild (av som standard, även när löpsedeln är första bild) och dess läge */
  billPhoto?: boolean;
  billPhotoY?: number;
  /** Äldre artiklar (v2.72) */
  pressFacts?: boolean;
  /** Tidningssidorna: citatrubrik, textrutans rubrik, citat i marginalen */
  quoteHead?: string;
  boxTitle?: string;
  pullQuote?: string;
  pullQuoteBy?: string;
  /** Rutor runt texten: senaste matchen, nästa match, resultatbörsen */
  pressLatest?: boolean;
  pressNext?: boolean;
  pressResults?: boolean;
  teasers?: TeaserSetting[];
  /** Andra annonsen i tidningen (första är vald sponsor) */
  sponsor2Name?: string | null;
  /** SHL från Inställningar → Externa källor */
  pressShlTable?: boolean;
  pressShlGames?: boolean;
  /** Luleå i SHL (senaste/nästa match, form och tabellplats) – på om inget annat valts */
  pressFocus?: boolean;
  /** Hockey i Norrbotten (Hockeyallsvenskan, SDHL) – på om inget annat valts */
  pressLocal?: boolean;
  /** Artikel/intervju: löpsedel eller förstasida som första bild (karusell) */
  pressCover?: "bill" | "front" | null;
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
  award: { ...BASE, kind: "award", title: "", awardId: "points_leader", awardPlaces: [1, 2, 3], statPeriod: "month" },
  image: { ...BASE, kind: "image", title: "" },
  bill: { ...BASE, kind: "bill", title: "", pressStyle: "yellow", kicker: "", pressPhoto: false },
  front: { ...BASE, kind: "front", title: "", kicker: "Lokalsport", pressPhoto: true, pressLatest: false, pressNext: true, pressResults: false, boxTitle: "", teasers: EMPTY_TEASERS, background: "omklad" },
  article: { ...BASE, kind: "article", title: "", kicker: "Lokalsport", pressPhoto: true, pressLatest: false, pressNext: true, background: "malburen" },
  interview: { ...BASE, kind: "interview", title: "", kicker: "Intervju", pressPhoto: true, pressLatest: false, pressNext: true, background: "omklad" },
};

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
/** Liten JPEG (data-URL) till puffarnas bilder – sparas direkt i inlägget */
async function smallJpeg(f: File, max = 320): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.78);
  } finally { URL.revokeObjectURL(url); }
}

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
  if (isPress(s.kind)) {
    // Tidningssidorna: hela texten i bildtexten (bilden är svår att läsa i telefonen).
    // Instagram tillåter 2 200 tecken – texten kortas med … om den inte ryms.
    const head = [s.title.replace(/\s*\n\s*/g, " "), s.quoteHead ? `”${s.quoteHead}”` : ""].filter(Boolean).join(" ");
    const body = isPressPage(s.kind) ? s.body.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
    const fixed = [head, s.subtitle, tagLine].filter(Boolean).join("\n\n");
    const room = 2200 - fixed.length - 4;
    const text = body.length > room ? `${body.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "")}…` : body;
    return [head, s.subtitle, text, tagLine].filter(Boolean).join("\n\n");
  }
  if (s.kind === "stats" || s.kind === "cards" || s.kind === "image") {
    return [s.title, s.subtitle, s.kind === "image" ? s.info : "", s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tagLine].filter(Boolean).join("\n\n");
  }
  return [s.title, s.body, s.info, s.sponsorName ? `Presenteras av ${s.sponsorName}` : "", tagLine].filter(Boolean).join("\n\n");
}

/**
 * renderPostId: dolt läge (används av Video) – öppnar det sparade inlägget,
 * väntar tills allt är hämtat och lämnar bilden i båda formaten till onRendered.
 */
export default function MediaApp({ renderPostId, onRendered }: { renderPostId?: number; onRendered?: (still: VideoStill | null) => void } = {}) {
  const headless = renderPostId !== undefined;
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
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
  const [s, setS] = useState<Settings>(() => ({ ...NEW.lineup, sponsorName: randomSponsorName(sponsors) }));
  // Sponsorlistan kan komma efter första renderingen: ge ett nytt inlägg en slumpad sponsor en gång
  const sponsorDefaulted = useRef(s.sponsorName !== null);
  useEffect(() => {
    if (sponsorDefaulted.current || postId !== null) return;
    const name = randomSponsorName(sponsors);
    if (!name) return;
    sponsorDefaulted.current = true;
    setS((prev) => (prev.sponsorName === null ? { ...prev, sponsorName: name } : prev));
  }, [sponsors]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null | undefined>(undefined);
  // Egen bild används när en bild finns och den inte valts bort till förmån för en bakgrund
  const ownActive = !!photo && s.useOwnPhoto !== false;
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  /** Tidningssidor: sida 2 när texten inte får plats på en sida */
  const [extraBlobs, setExtraBlobs] = useState<Blob[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [previewPage, setPreviewPage] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));
  const tags = tagsQuery.data ?? [];

  // ─── Senaste resultat: matchrapportens resultatbild för en vald match ───
  const needsMatch = s.kind === "result" || isPress(s.kind);
  const matchesQ = trpc.score.match.list.useQuery(undefined, { enabled: needsMatch, staleTime: 60_000 });
  const opponentsForResult = trpc.opponents.list.useQuery({ includeArchived: true }, { enabled: needsMatch, staleTime: 5 * 60_000 });
  const resultMatches = useMemo(() => ((matchesQ.data ?? []) as unknown as ReportMatch[]).filter((m) => (m as { reviewStatus?: string }).reviewStatus !== "rejected").slice(0, 15), [matchesQ.data]);
  // Stålbladet: matchId 0 = ingen match (bara fritext)
  const resultMatch = isPress(s.kind) && s.matchId === 0 ? undefined : resultMatches.find((m) => m.id === s.matchId) ?? resultMatches[0];
  const reportData = useMemo(() => {
    if (!resultMatch) return null;
    const cands = starCandidates({ teamWhiteScore: resultMatch.teamWhiteScore, teamGreenScore: resultMatch.teamGreenScore, goalHistory: resultMatch.goalHistory, lineup: resultMatch.lineup });
    const saved = resultMatch.report?.stars?.filter((k) => cands.some((c) => c.key === k));
    const keys = saved && saved.length === 3 ? saved : autoStars(cands, resultMatch.id);
    const stars = keys.map((k) => cands.find((c) => c.key === k)).filter(Boolean) as StarCandidate[];
    const opp = resultMatch.opponentId ? opponentsForResult.data?.find((o) => o.id === resultMatch.opponentId) ?? null : null;
    return buildReportData(resultMatch, stars, null, resultMatch.report?.showStats ?? [true, true, true], (s.kind === "result" ? s.title : "") || resultMatch.report?.title || undefined, true, opp);
  }, [resultMatch, opponentsForResult.data, s.title, s.kind]);

  // ─── Stålbladet: rubrikförslag, artikeltext och matchfakta från matchen ───
  const press = useMemo(() => {
    if (!isPress(s.kind) || !reportData || !resultMatch) return null;
    const facts = pressFacts(reportData, (resultMatch as { plannedMinutes?: number | null }).plannedMinutes ?? null);
    const seed = resultMatch.id;
    const text = articleText(facts, { location: resultMatch.location ?? null, seed });
    const goals = reportData.goals;
    let w = 0, g = 0;
    const goalRows = goals.map((x) => { if (x.team === "white") w++; else g++; return `${w}–${g} ${cleanName(x.scorer) || "?"}${x.minute != null ? ` (${x.minute})` : ""}`; });
    const factRows = [
      `${reportData.whiteName}–${reportData.greenName} ${reportData.whiteScore}–${reportData.greenScore}`,
      ...(goalRows.length ? [`Mål: ${goalRows.join(", ")}`] : []),
      ...(reportData.stars.length ? [`Stjärnor: ${reportData.stars.map((x) => cleanName(x.name)).join(", ")}`] : []),
      ...(resultMatch.location ? [`Spelplats: ${resultMatch.location}`] : []),
    ];
    return { facts, suggestions: headlineSuggestions(facts, seed), text, factRows };
  }, [s.kind, reportData, resultMatch]);
  // Nytt inlägg: fyll i rubrik och text från matchen (en gång per match – allt går att ändra)
  const pressFilledFor = useRef<string>("");
  useEffect(() => {
    // Bara en tom löpsedel – skrivna texter (även från en annan stil) skrivs aldrig över
    if (!press || postId !== null || !resultMatch || s.kind !== "bill" || s.title.trim() || s.subtitle.trim()) return;
    const key = `${s.kind}:${resultMatch.id}`;
    if (pressFilledFor.current === key) return;
    pressFilledFor.current = key;
    const h = press.suggestions[0];
    update({ title: h?.headline ?? "", subtitle: h?.sub ?? "", kicker: h?.kicker ?? "SPORT", dateLine: s.dateLine || reportData?.dateLine.split(" · ")[0] || "" });
  }, [press, postId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Statistik ───
  const range = periodRange(s.statPeriod, periodsQ.data as never);
  const featuresM = useFeatures();
  const extInput = featuresM.opponents && s.statIncludeExternal ? { includeExternal: true } : {};
  const rangeInput = range.from ? { from: range.from, to: range.to, ...extInput } : { ...extInput };
  const goalieCat = s.kind === "stats" && isGoalieCategory(s.statCategory);
  const statsQ = trpc.scoreStats.seasonStats.useQuery(rangeInput, { enabled: s.kind === "stats" && s.statCategory !== "awards" && !goalieCat });
  const gkIceQ = trpc.scoreStats.iceTime.useQuery(rangeInput, { enabled: goalieCat });
  const gkFunQ = trpc.scoreStats.goalieFun.useQuery(rangeInput, { enabled: goalieCat && s.statCategory === "gk_streak" });
  const awardsQ = trpc.scoreStats.seasonAwards.useQuery(rangeInput, { enabled: (s.kind === "stats" && s.statCategory === "awards") || s.kind === "award" });

  // ─── Utmärkelse: vinnarnas hockeykort (sparade eller standardkort) ───
  const award = s.kind === "award" ? (awardsQ.data?.awards ?? []).find((a) => a.id === s.awardId) ?? null : null;
  const [awardCards, setAwardCards] = useState<Array<{ place: 1 | 2 | 3; name: string; value: string; card: HTMLCanvasElement | null }>>([]);
  const awardKey = award ? JSON.stringify([award.id, award.winner, award.runnerUp, award.third, award.value, s.awardPlaces]) : "";
  useEffect(() => {
    if (s.kind !== "award" || !award) { setAwardCards([]); return; }
    let cancelled = false;
    const bare = (n: string) => n.replace(/\s*#\d*\s*$/, "").trim().toLowerCase();
    const places = ([[1, award.winner, award.value], [2, award.runnerUp, award.runnerUpValue], [3, award.third, award.thirdValue]] as const)
      .filter(([pl, who]) => who && (s.awardPlaces ?? [1, 2, 3]).includes(pl));
    (async () => {
      const out: typeof awardCards = [];
      for (const [pl, who, val] of places) {
        const player = registry.data?.find((p) => bare(p.name) === bare(who!));
        const card = player ? savedCards.data?.find((c) => c.playerId === player.id) : undefined;
        const stats = player ? await utils.client.cards.stats.query({ playerId: player.id }).catch(() => undefined) : undefined;
        out.push({ place: pl, name: who!, value: (val ?? "").replace(/ \(.*\)$/, ""), card: player ? await renderPlayerCard(player, card, { stats, scale: 0.9 }) : null });
      }
      if (!cancelled) setAwardCards(out);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [awardKey, s.kind, registry.data, savedCards.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const statCat = STAT_CATEGORIES.find((c) => c.id === s.statCategory)!;
  const rows = useMemo(() => isGoalieCategory(s.statCategory)
    ? goalieRows(s.statCategory, gkIceQ.data as never, gkFunQ.data as never, s.statLimit)
    : statRows(s.statCategory, statsQ.data as never, awardsQ.data?.awards as never, s.statLimit), [s.statCategory, s.statLimit, statsQ.data, awardsQ.data, gkIceQ.data, gkFunQ.data]);

  // ─── Spelarkort: rita valda spelares sparade kort med aktuell statistik ───
  const [cardCanvases, setCardCanvases] = useState<HTMLCanvasElement[]>([]);
  const cardsKey = s.kind === "cards" ? s.cardPlayers.join("|") : "";
  useEffect(() => {
    if (s.kind !== "cards" || !savedCards.data) { setCardCanvases([]); return; }
    let cancelled = false;
    (async () => {
      const out: HTMLCanvasElement[] = [];
      for (const id of s.cardPlayers.slice(0, 4)) {
        // Alla spelare har ett kort: sparat, annars standardkortet (lagets färg, utan foto)
        const player = registry.data?.find((p) => p.id === id);
        if (!player) continue;
        const card = savedCards.data!.find((c) => c.playerId === id);
        const stats = await utils.client.cards.stats.query({ playerId: id, ...((card?.settings as Partial<CardSettings> | undefined)?.includeExternal ? { includeExternal: true } : {}) }).catch(() => undefined);
        out.push(await renderPlayerCard(player, card, { stats, scale: 0.9 }));
      }
      if (!cancelled) setCardCanvases(out);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [cardsKey, s.kind, savedCards.data, registry.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Alla aktiva spelare – de utan sparat kort får standardkortet
  const cardPlayers = (registry.data ?? []).filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, "sv"));

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

  // Stålbladet: bilden är den egna bilden eller vald bakgrund
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!isPress(s.kind)) return;
    const url = MEDIA_BACKGROUNDS.find((b) => b.id === s.background)?.url;
    if (!url) { setBgImg(null); return; }
    const i = new Image();
    i.onload = () => setBgImg(i);
    i.src = url;
  }, [s.kind, s.background]);
  const pressImg = ownActive ? photo : bgImg;

  // SHL-tabell och matcher (sparade på servern, hämtas med nyckel under Inställningar)
  const shlQ = trpc.external.shl.useQuery(undefined, { enabled: isPressPage(s.kind), staleTime: 5 * 60_000, retry: false });

  // Puffarnas bilder (sparade som små JPEG i inställningarna)
  const [teaserImgs, setTeaserImgs] = useState<Array<HTMLImageElement | null>>([]);
  const teaserKey = s.kind === "front" ? (s.teasers ?? []).map((t) => t.image ?? "").join("|") : "";
  useEffect(() => {
    if (s.kind !== "front") { setTeaserImgs([]); return; }
    let cancelled = false;
    void Promise.all((s.teasers ?? []).map((t) => new Promise<HTMLImageElement | null>((res) => {
      if (!t.image) return res(null);
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = t.image;
    }))).then((list) => { if (!cancelled) setTeaserImgs(list); });
    return () => { cancelled = true; };
  }, [teaserKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const teasersLoaded = s.kind !== "front" || teaserImgs.length === (s.teasers ?? []).length;

  // Resultatbörsen: de senaste matcherna (lagens namn som i matchrapporten)
  const pressResults = useMemo(() => {
    if (!isPressPage(s.kind)) return [];
    return resultMatches.slice(0, 5).map((m) => {
      const opp = m.opponentId ? opponentsForResult.data?.find((o) => o.id === m.opponentId) ?? null : null;
      const r = buildReportData(m, [], null, [false, false, false], undefined, true, opp);
      return { home: r.whiteName, away: r.greenName, score: `${r.whiteScore}–${r.greenScore}` };
    });
  }, [s.kind, resultMatches, opponentsForResult.data]);

  /**
   * Annonserna i tidningen: vald annons, annons 2 och sedan övriga sponsorer i
   * fast ordning per inlägg – så att varje sida (och första bilden) får en egen.
   */
  const adList = useMemo(() => {
    const toAd = (sp: (typeof sponsors)[number]) => ({ name: sp.name, logo: sp.logo ?? null, slogan: sp.slogan ?? null });
    const byName = (n: string | null | undefined) => (n ? sponsors.find((x) => x.name === n) : undefined);
    const first = [byName(s.sponsorName), byName(s.sponsor2Name)].filter(Boolean) as typeof sponsors;
    const seed = [...(s.title || "x")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const others = sponsors.filter((sp) => sp.active && !first.some((f) => f.name === sp.name))
      .map((sp) => ({ sp, k: [...sp.name].reduce((h, ch) => (h * 33 + ch.charCodeAt(0) + seed) >>> 0, 5) % 9973 }))
      .sort((a, b) => a.k - b.k).map((x) => x.sp);
    const unique = [...new Map([...first, ...others].map((sp) => [sp.name, sp])).values()];
    // "Ingen annons" = inga annonser alls i tidningen
    return s.sponsorName ? unique.slice(0, 4).map(toAd) : [];
  }, [sponsors, s.sponsorName, s.sponsor2Name, s.title]);

  /** Tidningssidan (förstasida, artikel, intervju) */
  const pageData = (format: PostFormat, adOffset = 0): PressPageData => {
    const ads = adList.slice(adOffset).concat(adList.slice(0, adOffset));
    const r = reportData;
    const latest = s.pressLatest && r && resultMatch ? {
      home: r.whiteName, away: r.greenName, homeScore: r.whiteScore, awayScore: r.greenScore,
      homeColor: r.colorWhite ?? teamColor("white"), awayColor: r.colorGreen ?? teamColor("green"),
      lines: [
        r.stars[0] ? `Matchens stjärna: ${cleanName(r.stars[0].name)}` : "",
        press?.facts.topScorer ? `Poängbäst: ${press.facts.topScorer.name} ${press.facts.topScorer.goals}+${press.facts.topScorer.assists}` : "",
        resultMatch.location ? `Plats: ${resultMatch.location}` : "",
      ].filter(Boolean),
    } : null;
    const ev = event.data;
    const next = s.pressNext && ev && !ev.noEvent && ev.eventDate ? {
      when: eventLine({ eventDate: ev.eventDate, eventTime: ev.eventTime }),
      what: [ev.eventTitle || "Träning", ev.eventLocation].filter(Boolean).join(" · "),
    } : null;
    const shlData = shlQ.data;
    const hhmm = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    // SHL är på som standard (även i äldre sparade sidor) när det finns data
    const shlTable = s.pressShlTable !== false && shlData?.table?.rows.length
      ? { source: shlData.source, updated: hhmm(shlData.table.fetchedAt), rows: shlData.table.rows.map((r) => ({ pos: r.pos, team: r.team, gp: r.gp, pts: r.pts })) } : null;
    const gamesToday = shlData?.today.length ? shlData.today : null;
    const gameRows = (gamesToday ?? shlData?.lastRound?.rows ?? []).map((m) => ({
      home: m.home, away: m.away,
      score: m.homeScore != null && m.status !== "scheduled" ? `${m.homeScore}–${m.awayScore}` : null, live: m.status === "live",
      time: new Date(m.date).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Stockholm" }),
    }));
    const shlGames = s.pressShlGames !== false && gameRows.length && shlData
      ? { title: gamesToday ? "SHL i dag" : "SHL senaste omgången", rows: gameRows, source: shlData.source, updated: hhmm(gamesToday ? shlData.todayFetchedAt ?? new Date().toISOString() : `${shlData.lastRound!.day}T22:00:00`) } : null;
    const f = shlData?.focus;
    const dayStr = (iso: string, time = false) => {
      const dt = new Date(iso);
      const wd = dt.toLocaleDateString("sv-SE", { weekday: "short", timeZone: "Europe/Stockholm" }).replace(".", "");
      const dm = dt.toLocaleDateString("sv-SE", { day: "numeric", month: "numeric", timeZone: "Europe/Stockholm" });
      return `${wd} ${dm}${time ? ` ${dt.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Stockholm" })}` : ""}`;
    };
    const focus = s.pressFocus !== false && f && shlData && (f.last || f.next) ? {
      team: f.team,
      last: f.last && f.last.homeScore != null ? { home: f.last.home, away: f.last.away, homeScore: f.last.homeScore, awayScore: f.last.awayScore ?? 0, live: f.last.status === "live", when: dayStr(f.last.date) } : null,
      next: f.next ? { home: f.next.home, away: f.next.away, when: dayStr(f.next.date, true) } : null,
      form: f.form, pos: f.pos, pts: f.pts, gp: f.gp,
      source: shlData.source, updated: hhmm(shlData.todayFetchedAt ?? shlData.seasonFetchedAt ?? shlData.table?.fetchedAt ?? new Date().toISOString()),
    } : null;
    // Hockey i Norrbotten: "Senast: 4–1 mot Mora (tor 8/10)" / "Nästa: AIK hemma, lör 15:00"
    const vs = (m: { home: string; away: string }, team: string) => (m.home === team ? `${m.away} hemma` : `${m.home} borta`);
    const local = s.pressLocal !== false && shlData?.local?.rows.length ? {
      source: shlData.source, updated: hhmm(shlData.local.fetchedAt),
      rows: shlData.local.rows.map((r) => {
        const last = r.last && r.last.homeScore != null ? (() => {
          const own = r.last.home === r.team ? r.last.homeScore! : r.last.awayScore!;
          const opp = r.last.home === r.team ? r.last.awayScore! : r.last.homeScore!;
          const tag = r.last.status === "live" ? "Pågår" : own > opp ? "Vinst" : own < opp ? "Förlust" : "Oavgjort";
          return `${tag} ${own}–${opp} mot ${r.last.home === r.team ? r.last.away : r.last.home}${r.last.status === "live" ? "" : ` (${dayStr(r.last.date)})`}`;
        })() : null;
        return { league: r.league, team: r.league === "SDHL" ? `${r.team} (dam)` : r.team, last, next: r.next ? `Nästa: ${vs(r.next, r.team)}, ${dayStr(r.next.date, true)}` : null };
      }),
    } : null;
    return {
      kind: s.kind as PressPageData["kind"], format, dateLine: s.dateLine, sponsor: null,
      kicker: s.kicker ?? "", headline: s.title, quoteHead: s.quoteHead ?? "", ingress: s.subtitle, body: s.body,
      boxTitle: s.boxTitle ?? "", caption: s.info, byline: s.byline ?? "", pullQuote: s.pullQuote ?? "", pullQuoteBy: s.pullQuoteBy ?? "",
      photo: s.pressPhoto !== false ? pressImg : null,
      backdrop: bgImg,
      teasers: s.kind === "front" ? (s.teasers ?? []).map((t, i) => ({ kicker: t.kicker, title: t.title, sub: t.sub, page: t.page, image: teaserImgs[i] ?? null })) : [],
      latest, next,
      results: s.pressResults ? pressResults : [],
      shlTable, shlGames, focus, local,
      ads, issue: issueOf(),
    };
  };

  // Löpsedeln: egen bildinställning (äldre sparade löpsedlar använde pressPhoto)
  const billPhotoOn = s.billPhoto ?? (s.kind === "bill" ? !!s.pressPhoto : false);
  const billPhotoControls = () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={() => update({ billPhoto: !billPhotoOn })} className={chip(billPhotoOn)}>{billPhotoOn ? "✓ " : ""}Bild på löpsedeln</button>
      {billPhotoOn && (
        <label className="flex-1 min-w-[160px] text-[11px] text-white/50">Bildens läge (upp–ner)
          <input type="range" min={0} max={1} step={0.05} value={s.billPhotoY ?? 0.3} onChange={(e) => update({ billPhotoY: Number(e.target.value) })} className="w-full accent-emerald-400" />
        </label>
      )}
    </div>
  );

  // Bilden som ska ritas (formatet kan väljas separat, t.ex. för videon)
  const buildData = (format: PostFormat): MediaPostData => {
      // Mallen Bild: den uppladdade bilden ritas i ramen, inte som bakgrund
      const common = { overlay: s.overlay, background: s.background, dateLine: s.dateLine, sponsor, photo: s.kind !== "image" && s.useOwnPhoto !== false ? photo : null, photoDim: s.photoDim, format };
      return s.kind === "lineup" ? { ...common, kind: "lineup", team: s.team, teamName: s.teamName, title: s.title, groups: s.groups, ...(s.teamLogo !== undefined ? { logo: s.teamLogo, accent: s.teamAccent } : {}) }
        : s.kind === "cards" ? { ...common, kind: "cards", title: s.title, subtitle: s.subtitle, cards: cardCanvases }
        : s.kind === "stats" ? { ...common, kind: "stats", title: s.title, subtitle: s.subtitle || range.label, valueLabel: statCat.valueLabel, rows }
        : s.kind === "award" ? { ...common, kind: "award", title: s.title || award?.title || "Utmärkelse", emoji: award?.emoji ?? "", subtitle: s.subtitle || range.label, places: awardCards }
        : s.kind === "result" ? (reportData ? { ...common, kind: "result", report: reportData } : { ...common, kind: "text", title: "Inga matcher än", body: "", info: "" })
        : s.kind === "image" ? { ...common, kind: "image", title: s.title, subtitle: s.subtitle, info: s.info, image: photo }
        : s.kind === "bill" ? { kind: "bill", format, dateLine: s.dateLine, sponsor, style: s.pressStyle ?? "yellow", kicker: s.kicker ?? "", headline: s.title, sub: s.subtitle, photo: billPhotoOn ? pressImg : null, photoY: s.billPhotoY }
        : isPressPage(s.kind) ? pageData(format)
        : { ...common, kind: "text", title: s.title, body: s.body, info: s.info };
  };
  const format: PostFormat = s.format ?? "feed";

  /** Löpsedel eller förstasida av samma text och bild, först i karusellen */
  const coverData = (fmt: PostFormat): MediaPostData | null => {
    if (!isPressPage(s.kind) || !s.pressCover) return null;
    if (s.pressCover === "bill") return { kind: "bill", format: fmt, dateLine: s.dateLine, sponsor: adList[0] ?? null, kicker: s.kicker ?? "", headline: s.title, sub: s.subtitle, photo: billPhotoOn ? pressImg : null, photoY: s.billPhotoY };
    return {
      // Förstasidan lockar: bara början av texten, resten i artikeln/intervjun på nästa bild.
      // Ytan som blir över fylls med Luleå i SHL, matcher, tabell och en annons.
      ...pageData(fmt), kind: "front", pullQuote: "", pullQuoteBy: "", teasers: [],
      body: excerpt(s.body, 380), readMore: `Läs hela ${s.kind === "interview" ? "intervjun" : "artikeln"} på nästa bild ›`,
    };
  };
  const renderAll = async (fmt: PostFormat) => {
    const cover = coverData(fmt);
    // Med första bild: artikeln börjar på nästa annons, så att ingen sida får samma
    const main = cover && isPressPage(s.kind) ? { ...pageData(fmt, 1) } : buildData(fmt);
    const [coverPages, pages] = await Promise.all([cover ? renderMediaPages(cover) : Promise.resolve([]), renderMediaPages(main)]);
    return [...coverPages.slice(0, 1), ...pages];
  };

  // Förhandsvisning
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const pages = await renderAll(format);
      if (cancelled || !canvasRef.current) return;
      setPageCount(pages.length);
      // Sida 2 och framåt (tidningssidor där texten fortsätter)
      void Promise.all(pages.slice(1).map((p) => new Promise<Blob | null>((res) => p.toBlob(res, "image/jpeg", 0.92)))).then((bs) => { if (!cancelled) setExtraBlobs(bs.filter(Boolean) as Blob[]); });
      const c = pages[Math.min(previewPage, pages.length - 1)];
      const first = pages[0];
      canvasRef.current.width = c.width;
      canvasRef.current.height = c.height;
      canvasRef.current.getContext("2d")!.drawImage(c, 0, 0);
      first.toBlob((b) => { if (!cancelled) setBlob(b); }, "image/jpeg", 0.92);
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s, photo, sponsor?.name, sponsor?.logo, cardCanvases, rows, range.label, reportData, awardCards, award?.title, bgImg, press, teaserImgs, pressResults, event.data, sponsors, shlQ.data, previewPage]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Byt tidningsstil: allt som skrivits följer med, nya fält får stilens standard */
  const DEFAULT_KICKERS = ["", "Lokalsport", "Intervju", "SPORT", "Matchreferat"];
  const switchStyle = (kind: Kind) => {
    setPreviewPage(0);
    setS((prev) => {
      const d = NEW[kind] as unknown as Record<string, unknown>;
      const fill = Object.fromEntries(Object.entries(d).filter(([k]) => (prev as unknown as Record<string, unknown>)[k] === undefined));
      const kicker = DEFAULT_KICKERS.includes(prev.kicker ?? "") ? (NEW[kind].kicker ?? "") : prev.kicker;
      return { ...prev, ...fill, kind, kicker, pressCover: isPressPage(kind) ? prev.pressCover ?? null : null } as Settings;
    });
  };

  const startNew = (kind: Kind) => {
    setPostId(null);
    setCaptionEdited(false);
    // Utseendet följer med till nästa mall: bakgrund, egen bild, mörkning och överlägg
    // (bilden i mallen Bild blir inte bakgrund i nästa mall)
    const look = { background: s.background, overlay: s.overlay, photoDim: s.photoDim, useOwnPhoto: s.kind === "image" ? false : s.useOwnPhoto, format: s.format };
    // Egen bild från ett öppnat inlägg: ta med den som ny bild så att den sparas med det nya inlägget
    if (photo && newPhoto === undefined) void currentPhotoBase64().then((b) => setNewPhoto(b)).catch(() => undefined);
    // Varje ny mall får en slumpad sponsor (kan ändras till "Ingen sponsor")
    const sponsorName = randomSponsorName(sponsors);
    const others = sponsors.filter((sp) => sp.active && sp.name !== sponsorName);
    const sponsor2Name = isPressPage(kind) && others.length ? others[Math.floor(Math.random() * others.length)].name : null;
    const today = new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    setS({ ...NEW[kind], ...look, sponsorName, sponsor2Name, dateLine: kind === "lineup" || kind === "text" ? eventLine(event.data) : isPressPage(kind) ? today.charAt(0).toUpperCase() + today.slice(1) : "" });
    if (kind === "lineup" && lineupState.data) {
      const { name, groups } = teamGroups(lineupState.data as never, "green");
      setS({ ...NEW.lineup, ...look, sponsorName, dateLine: eventLine(event.data), teamName: name, groups });
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

  const [photoLoading, setPhotoLoading] = useState(false);
  const open = async (p: NonNullable<typeof posts.data>[number]) => {
    setPostId(p.id);
    const saved = p.settings as Partial<Settings>;
    setS({ ...NEW[(p.type as Kind) ?? "text"], ...saved, overlay: saved.overlay ?? overlayFromTheme(saved.theme) });
    setCaption(p.caption ?? "");
    setCaptionEdited(!!p.caption);
    setNewPhoto(undefined);
    setPhoto(null);
    if (p.hasPhoto) {
      setPhotoLoading(true);
      const img = new Image();
      img.onload = () => { setPhoto(img); setPhotoLoading(false); };
      img.onerror = () => setPhotoLoading(false);
      img.src = `/api/media/${p.id}/photo?v=${new Date(p.updatedAt).getTime()}`;
    }
  };

  // ─── Dolt läge (Video): öppna inlägget och lämna bilden när allt är hämtat ───
  const openedRef = useRef(false);
  const renderedRef = useRef(false);
  useEffect(() => {
    if (!headless || openedRef.current || !posts.data) return;
    const p = posts.data.find((x) => x.id === renderPostId);
    if (!p) { renderedRef.current = true; toast.error("Inlägget finns inte längre"); onRendered?.(null); return; }
    openedRef.current = true;
    void open(p);
  }, [posts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const knownCardPlayers = s.cardPlayers.filter((id) => registry.data?.some((p) => p.id === id)).slice(0, 4).length;
  const headlessReady = headless && postId === renderPostId && !photoLoading && (
    s.kind === "cards" ? !!savedCards.data && !!registry.data && cardCanvases.length >= knownCardPlayers
    : s.kind === "stats" ? !statsQ.isFetching && !awardsQ.isFetching && !gkIceQ.isFetching && !gkFunQ.isFetching && !periodsQ.isLoading
    : s.kind === "award" ? awardsQ.isSuccess && !!registry.data && !!savedCards.data && (!award || awardCards.length > 0)
    : s.kind === "result" || isPress(s.kind) ? matchesQ.isSuccess && !opponentsForResult.isLoading && (!isPress(s.kind) || !!bgImg || ownActive) && teasersLoaded && (!isPressPage(s.kind) || !shlQ.isLoading)
    : true);
  useEffect(() => {
    if (!headless || renderedRef.current) return;
    // Säkerhetsnät: rita ändå efter 15 s om något aldrig blir klart
    const giveUp = setTimeout(() => void finishHeadless(), 15_000);
    if (!headlessReady) return () => clearTimeout(giveUp);
    const t = setTimeout(() => void finishHeadless(), 500);
    return () => { clearTimeout(t); clearTimeout(giveUp); };
  }, [headlessReady, s, photo, cardCanvases, rows, reportData, awardCards]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishHeadless = async () => {
    if (renderedRef.current || postId !== renderPostId) return;
    renderedRef.current = true;
    const [feed, reel] = await Promise.all([renderAll("feed").then((p) => p[0]), renderAll("story").then((p) => p[0])]);
    onRendered?.({ title: titleFor(), feed: feed.toDataURL("image/png"), reel: reel.toDataURL("image/png") });
  };

  const onFile = async (f: File) => {
    try {
      const { base64 } = await prepareSourcePhoto(f);
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = `data:image/jpeg;base64,${base64}`;
      setNewPhoto(base64);
      if (s.kind !== "image") update({ useOwnPhoto: true }); // vald bild används direkt
    } catch (e) {
      toast.error("Bilden kunde inte läsas", { description: (e as Error).message });
    }
  };

  const titleFor = () =>
    s.kind === "lineup" ? `${s.title || "Dagens lag"} – ${s.teamName}${s.dateLine ? ` (${s.dateLine.split(" · ")[0]})` : ""}`
    : s.kind === "stats" ? `${s.title || statCat.title} – ${s.subtitle || range.label}`
    : s.kind === "result" ? `Resultat – ${resultMatch?.name ?? ""}`
    : s.title.replace(/\s*\n\s*/g, " ") || "Inlägg utan rubrik";

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
  // Förstoring för korrläsning: alla sidor i full storlek
  const [zoomUrls, setZoomUrls] = useState<string[] | null>(null);
  const [zoomBig, setZoomBig] = useState(false);
  const openZoom = async () => {
    const list = allBlobs();
    if (list.length) setZoomUrls(list.map((b) => URL.createObjectURL(b)));
    else if (canvasRef.current) setZoomUrls([canvasRef.current.toDataURL("image/jpeg", 0.92)]);
  };
  const closeZoom = () => { zoomUrls?.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)); setZoomUrls(null); setZoomBig(false); };
  const allBlobs = () => (blob ? [blob, ...(pageCount > 1 ? extraBlobs : [])] : []);
  const pageName = (i: number, n: number) => (n > 1 ? fileName().replace(/\.jpg$/, `-${i + 1}.jpg`) : fileName());
  const download = () => {
    const list = allBlobs();
    list.forEach((b, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = pageName(i, list.length);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, i * 400));
  };
  const share = async () => {
    const list = allBlobs();
    if (!list.length) return;
    setBusy("share");
    try {
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      const files = list.map((b, i) => new File([b], pageName(i, list.length), { type: "image/jpeg" }));
      if (navigator.canShare?.({ files })) await navigator.share({ files, text: caption });
      else download();
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela");
    } finally {
      setBusy(null);
    }
  };
  /** Bild före klippet: rita bilden i båda formaten och öppna Video */
  const [toVideo, setToVideo] = useState(false);
  const useInVideo = async () => {
    setToVideo(true);
    try {
      const [feed, reel] = await Promise.all([renderAll("feed").then((p) => p[0]), renderAll("story").then((p) => p[0])]);
      setVideoStill({ title: titleFor(), feed: feed.toDataURL("image/png"), reel: reel.toDataURL("image/png") });
      navigate("/media/video");
    } catch (e) {
      toast.error("Kunde inte skapa bilden", { description: (e as Error).message });
    } finally {
      setToVideo(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(caption).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200" : "bg-white/5 border-white/10 text-white/60"}`;

  if (headless) return null;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}><Link href="/" title="Till startsidan">Media</Link></h1>
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
            <button onClick={() => startNew("award")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Award size={14} /> Utmärkelse</button>
            <button onClick={() => startNew("result")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Trophy size={14} /> Senaste resultat</button>
            <button onClick={() => startNew("image")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><ImageIcon size={14} /> Bild</button>
            <button onClick={startNextTraining} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><CalendarDays size={14} /> Nästa träning</button>
            <p className="col-span-2 lg:col-span-1 text-[11px] text-white/45 mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>{PRESS_NAME} <span className="font-sans text-white/30">– som i lokaltidningen</span></p>
            <button onClick={() => startNew("bill")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-300/10 border border-amber-300/30 text-sm"><Newspaper size={14} /> Löpsedel</button>
            <button onClick={() => startNew("front")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-300/10 border border-amber-300/30 text-sm"><Newspaper size={14} /> Förstasida</button>
            <button onClick={() => startNew("article")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-300/10 border border-amber-300/30 text-sm"><Newspaper size={14} /> Artikel</button>
            <button onClick={() => startNew("interview")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-300/10 border border-amber-300/30 text-sm"><Newspaper size={14} /> Intervju</button>
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
          <div className="flex gap-1.5 justify-center">
            <button onClick={() => update({ format: "feed" })} className={chip(format === "feed")}>Flöde 4:5</button>
            <button onClick={() => update({ format: "story" })} className={chip(format === "story")}>Story/Reel 9:16</button>
          </div>
          <canvas ref={canvasRef} onClick={() => void openZoom()} title="Klicka för att förstora" className={`cursor-zoom-in w-full h-auto rounded-xl shadow-2xl bg-black ${format === "story" ? "aspect-[9/16] max-w-[300px] mx-auto block" : "aspect-[4/5]"}`} aria-label="Förhandsvisning" />
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }, (_, i) => <button key={i} onClick={() => setPreviewPage(i)} className={chip(Math.min(previewPage, pageCount - 1) === i)}>Sida {i + 1}</button>)}
              <span className="text-[10px] text-amber-200/80 ml-1">{s.pressCover && isPressPage(s.kind) ? "Karusell" : "Texten fortsätter på sida 2"} – laddas ned och delas som karusell.</span>
            </div>
          )}
          {zoomUrls && (
            <div className="fixed inset-0 z-50 bg-black overflow-auto" onClick={closeZoom}>
              <div className="sticky top-0 flex items-center justify-between px-4 py-2 bg-black/80 text-xs text-white/70">
                <span>{zoomUrls.length > 1 ? `${zoomUrls.length} sidor · ` : ""}Tryck på bilden för dubbel storlek</span>
                <button onClick={closeZoom} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-white"><X size={14} /> Stäng</button>
              </div>
              <div className={`${zoomBig ? "w-[200%] max-w-[2160px]" : "max-w-[1080px] mx-auto"} p-2 space-y-3`}>
                {zoomUrls.map((u, i) => <img key={u} src={u} alt={`Sida ${i + 1}`} className={`w-full h-auto rounded-lg ${zoomBig ? "cursor-zoom-out" : "cursor-zoom-in"}`} onClick={(e) => { e.stopPropagation(); setZoomBig(!zoomBig); }} />)}
              </div>
            </div>
          )}
          <p className="text-[10px] text-white/35 text-center">Klicka på bilden för att förstora. {format === "story" ? "9:16 (1080×1920) – innehållet ligger inom Instagrams säkra yta för Story och Reels." : "4:5 (1080×1350) – samma format som matchrapporten."}</p>
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
          <button onClick={() => void useInVideo()} disabled={toVideo} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/15 text-sm disabled:opacity-40">
            {toVideo ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />} Använd före ett videoklipp
          </button>
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
          {isPress(s.kind) && (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Stil – samma text och bild</p>
                <div className="flex flex-wrap gap-1.5">
                  {([["bill", "Löpsedel"], ["front", "Förstasida"], ["article", "Artikel"], ["interview", "Intervju"]] as const).map(([k, name]) => (
                    <button key={k} onClick={() => switchStyle(k)} className={chip(s.kind === k)}>{name}</button>
                  ))}
                </div>
                {(s.kind === "article" || s.kind === "interview") && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[11px] text-white/50 mr-1">Första bild:</span>
                    {([[null, "Ingen"], ["bill", "Löpsedel"], ["front", "Förstasida"]] as const).map(([k, name]) => (
                      <button key={name} onClick={() => update({ pressCover: k })} className={chip((s.pressCover ?? null) === k)}>{name}</button>
                    ))}
                  </div>
                )}
                {(s.kind === "article" || s.kind === "interview") && s.pressCover === "bill" && <div className="mt-2">{billPhotoControls()}</div>}
                <p className="text-[10px] text-white/35 mt-1">Byt stil när du vill – texten och bilden följer med. Spara som nytt för att ha flera stilar av samma text. Första bild ger en karusell: löpsedeln eller förstasidan först, sedan {s.kind === "interview" ? "intervjun" : "artikeln"}.</p>
              </div>
              <label className="block text-[11px] text-white/50">Match
                <select value={s.matchId === 0 ? 0 : resultMatch?.id ?? ""} onChange={(e) => { pressFilledFor.current = ""; update({ matchId: Number(e.target.value) }); }} className={input}>
                  <option value={0} className="text-black">Ingen match – bara egen text</option>
                  {resultMatches.map((m) => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
                </select>
              </label>
              {s.kind === "bill" && press && press.suggestions.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/50 mb-1.5">Rubrikförslag från matchen</p>
                  <div className="flex flex-col gap-1">
                    {press.suggestions.map((h) => (
                      <button key={h.headline} onClick={() => update({ title: h.headline, kicker: h.kicker, subtitle: h.sub })}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs ${s.title === h.headline ? "bg-amber-300/15 border-amber-300/50" : "bg-white/5 border-white/10"}`}>
                        <span className="text-[10px] text-red-300/90 font-semibold mr-1.5">{h.kicker}</span>{h.headline}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {s.kind === "bill" && (
                <div>
                  <p className="text-[11px] text-white/50 mb-1.5">Löpsedel</p>
                  <div className="flex flex-wrap gap-1.5">
                    {billPhotoControls()}
                  </div>
                </div>
              )}
              <label className="block text-[11px] text-white/50">Etikett<input value={s.kicker ?? ""} onChange={(e) => update({ kicker: e.target.value })} maxLength={24} placeholder={s.kind === "bill" ? "T.ex. EXTRA, SPORT, VÄNDNINGEN" : "T.ex. Lokalsport, Intervju, Krönika"} className={input} /></label>
              {isPressPage(s.kind) && (
                <div className="rounded-lg border border-sky-400/25 bg-sky-500/5 p-2">
                  <button onClick={() => setPasteOpen(!pasteOpen)} className="text-[11px] text-sky-200/90 font-semibold">{pasteOpen ? "▾" : "▸"} Klistra in hela texten (t.ex. från ett mejl)</button>
                  {pasteOpen && (
                    <div className="mt-2 space-y-1.5">
                      <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder={"Rubrik\n\nIngress …\n\nFråga?\n– Svar …"} className={input} />
                      <p className="text-[10px] text-white/40">Första raden blir rubrik, nästa stycke ingress och resten text. Allt går att ändra efteråt.</p>
                      <button onClick={() => { const p = splitPasted(pasteText); update({ ...(p.headline ? { title: p.headline } : {}), ...(p.ingress ? { subtitle: p.ingress } : {}), body: p.body }); setPasteText(""); setPasteOpen(false); toast.success("Texten är fördelad i fälten"); }}
                        disabled={!pasteText.trim()} className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-semibold disabled:opacity-40">Fördela i fälten</button>
                    </div>
                  )}
                </div>
              )}
              <label className="block text-[11px] text-white/50">{s.kind === "interview" ? "Rubrik (t.ex. namnet)" : "Rubrik"} <span className="text-white/30">– Enter ger ny rad</span>
                <textarea value={s.title} onChange={(e) => update({ title: e.target.value })} rows={2} maxLength={140} placeholder={s.kind === "bill" ? "" : "T.ex. Kapten Bergman Lahti om frånvaron"} className={input} />
              </label>
              {isPressPage(s.kind) && (
                <label className="block text-[11px] text-white/50">Citatrubrik (valfri)<input value={s.quoteHead ?? ""} onChange={(e) => update({ quoteHead: e.target.value })} maxLength={80} placeholder="T.ex. Vi bygger något speciellt här" className={input} /></label>
              )}
              <label className="block text-[11px] text-white/50">{s.kind === "bill" ? "Underrubrik" : "Ingress"}
                <textarea value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} rows={2} maxLength={s.kind === "bill" ? 80 : 300} className={input} />
              </label>
              {isPressPage(s.kind) && (
                <>
                  {s.kind === "front" && (
                    <label className="block text-[11px] text-white/50">Textrutans rubrik<input value={s.boxTitle ?? ""} onChange={(e) => update({ boxTitle: e.target.value })} maxLength={60} placeholder="T.ex. Om säsongen, laget och framåt" className={input} /></label>
                  )}
                  <label className="block text-[11px] text-white/50">
                    <span className="flex items-center justify-between">{s.kind === "interview" ? "Frågor och svar" : "Brödtext"}
                      {s.kind === "article" && press && <button onClick={() => update({ subtitle: press.text.ingress, body: press.text.body })} className="flex items-center gap-1 text-[11px] text-sky-300/80"><Wand2 size={12} /> Utkast från matchen</button>}
                    </span>
                    <textarea value={s.body} onChange={(e) => update({ body: e.target.value })} rows={s.kind === "interview" ? 10 : 7} maxLength={3000} placeholder={s.kind === "interview" ? "Fråga som slutar med ?\nSvaret på nästa rad …" : "Skriv texten här …"} className={input} />
                    <span className="block text-[10px] text-white/35 mt-0.5">{s.kind === "article" ? "Tom rad = nytt stycke." : "Tom rad = nytt stycke. En rad som slutar med ? blir en fråga i fetstil."} Texten krymper för att få plats.</span>
                  </label>
                  <label className="block text-[11px] text-white/50">Citat i marginalen (valfritt)<textarea value={s.pullQuote ?? ""} onChange={(e) => update({ pullQuote: e.target.value })} rows={2} maxLength={160} className={input} /></label>
                  {!!s.pullQuote && <label className="block text-[11px] text-white/50">Vem sa det<input value={s.pullQuoteBy ?? ""} onChange={(e) => update({ pullQuoteBy: e.target.value })} maxLength={60} placeholder="T.ex. Hampus Bergman, lagkapten" className={input} /></label>}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] text-white/50">Bildtext<input value={s.info} onChange={(e) => update({ info: e.target.value })} maxLength={90} placeholder="Foto: …" className={input} /></label>
                    <label className="block text-[11px] text-white/50">Byline<input value={s.byline ?? ""} onChange={(e) => update({ byline: e.target.value })} maxLength={50} placeholder={`Av ${PRESS_NAME}s utsände`} className={input} /></label>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/50 mb-1.5">På sidan</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => update({ pressPhoto: s.pressPhoto === false })} className={chip(s.pressPhoto !== false)}>{s.pressPhoto !== false ? "✓ " : ""}Bild</button>
                      <button onClick={() => update({ pressLatest: !s.pressLatest })} disabled={!reportData} className={`${chip(!!s.pressLatest && !!reportData)} disabled:opacity-35`}>{s.pressLatest && reportData ? "✓ " : ""}Senaste internmatchen</button>
                      <button onClick={() => update({ pressNext: !s.pressNext })} className={chip(!!s.pressNext)}>{s.pressNext ? "✓ " : ""}Nästa match</button>
                      <button onClick={() => update({ pressResults: !s.pressResults })} className={chip(!!s.pressResults)}>{s.pressResults ? "✓ " : ""}Våra matcher</button>
                      {([
                        ["pressFocus", "Luleå i SHL", !!shlQ.data?.focus],
                        ["pressLocal", "Hockey i Norrbotten", !!shlQ.data?.local?.rows.length],
                        ["pressShlGames", "SHL-matcher", !!(shlQ.data?.today.length || shlQ.data?.lastRound)],
                        ["pressShlTable", "SHL-tabellen", !!shlQ.data?.table],
                      ] as const).map(([k, name, has]) => {
                        const on = s[k] !== false && has;
                        return <button key={k} onClick={() => update({ [k]: s[k] === false })} disabled={!has} className={`${chip(on)} disabled:opacity-35`}>{on ? "✓ " : ""}{name}</button>;
                      })}
                    </div>
                    <p className="text-[10px] text-white/35 mt-1">Texten går först – rutorna läggs i sidospalten i den här ordningen så långt plats finns, resten på sida 2. Senaste matchen = vald match ovan, nästa match från laget.se.{!shlQ.data?.configured ? " SHL kräver en API-nyckel under Inställningar → Externa källor." : ""}</p>
                  </div>
                  {s.kind === "front" && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/50">Puffar i sidospalten (tom rubrik = ingen puff)</p>
                      {(s.teasers ?? EMPTY_TEASERS).map((t, i) => {
                        const set = (patch: Partial<TeaserSetting>) => update({ teasers: (s.teasers ?? EMPTY_TEASERS).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                        return (
                          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
                            <div className="flex gap-1.5">
                              <input value={t.kicker} onChange={(e) => set({ kicker: e.target.value })} maxLength={20} placeholder="Etikett" className={`${input} !mt-0 w-1/3`} />
                              <input value={t.page} onChange={(e) => set({ page: e.target.value })} maxLength={10} placeholder="Sid 4" className={`${input} !mt-0 w-1/4`} />
                              <label className="shrink-0 flex items-center gap-1 px-2 rounded-lg bg-white/5 border border-white/10 text-[11px] cursor-pointer">
                                {t.image ? <img src={t.image} alt="" className="w-6 h-6 rounded object-cover" /> : <Upload size={12} />} Bild
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void smallJpeg(f).then((image) => set({ image })).catch(() => toast.error("Bilden kunde inte läsas")); e.target.value = ""; }} />
                              </label>
                              {t.image && <button onClick={() => set({ image: null })} className="text-red-300/70" aria-label="Ta bort bilden"><X size={12} /></button>}
                            </div>
                            <input value={t.title} onChange={(e) => set({ title: e.target.value })} maxLength={70} placeholder="Rubrik" className={`${input} !mt-0`} />
                            <input value={t.sub} onChange={(e) => set({ sub: e.target.value })} maxLength={70} placeholder="Kort text (valfri)" className={`${input} !mt-0`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <p className="text-[10px] text-white/35">{PRESS_NAME} är klubbens egen påhittade lokaltidning. Sponsorerna syns som vanliga annonser (annonstexten ändras under Sponsorer). Bilden väljs bland bakgrunderna nedan (eller egen bild).</p>
            </>
          )}
          {s.kind === "image" && (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Bild</p>
                <div className="flex items-center gap-2">
                  {photo && <img src={photo.src} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/15" />}
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Upload size={14} /> {photo ? "Byt bild" : "Ladda upp bild"}</button>
                  {photo && <button onClick={() => { setPhoto(null); setNewPhoto(null); }} className="flex items-center gap-1 text-[11px] text-red-300/70"><X size={12} /> Ta bort</button>}
                </div>
                <p className="text-[10px] text-white/35 mt-1">Valfri bild – visas hel i en ram, liggande eller stående.</p>
              </div>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} placeholder="T.ex. Tack för i år!" className={input} /></label>
              <label className="block text-[11px] text-white/50">Underrubrik<input value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={60} className={input} /></label>
              <label className="block text-[11px] text-white/50">Info-rad under bilden (i färg)<input value={s.info} onChange={(e) => update({ info: e.target.value })} maxLength={40} placeholder="T.ex. Lördag 12/12 · 18:00" className={input} /></label>
            </>
          )}
          {s.kind === "cards" && (
            <>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} className={input} /></label>
              <label className="block text-[11px] text-white/50">Underrubrik<input value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={60} placeholder="T.ex. Vecka 40" className={input} /></label>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Spelare (1–4) – {s.cardPlayers.length} valda. Spelare utan sparat kort får standardkortet i lagets färg.</p>
                {cardPlayers.length === 0 ? <p className="text-xs text-white/35">Inga spelare i registret.</p> : (
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
          {s.kind === "award" && (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Utmärkelse</p>
                <div className="flex flex-wrap gap-1.5">
                  {(awardsQ.data?.awards ?? []).map((a) => (
                    <button key={a.id} onClick={() => update({ awardId: a.id, title: "" })} className={chip(s.awardId === a.id)}>{a.emoji} {a.title}</button>
                  ))}
                  {awardsQ.isLoading && <span className="text-[11px] text-white/40 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Hämtar …</span>}
                  {!awardsQ.isLoading && !(awardsQ.data?.awards ?? []).length && <span className="text-[11px] text-white/40">Inga utmärkelser under perioden.</span>}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Period</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAT_PERIODS.map((p) => <button key={p.id} onClick={() => update({ statPeriod: p.id, subtitle: "" })} className={chip(s.statPeriod === p.id)}>{p.name}</button>)}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Placeringar</p>
                <div className="flex flex-wrap gap-1.5">
                  {([[1, award?.winner], [2, award?.runnerUp], [3, award?.third]] as const).map(([pl, who]) => {
                    const on = (s.awardPlaces ?? [1, 2, 3]).includes(pl);
                    return (
                      <button key={pl} disabled={!who} onClick={() => {
                        const cur = s.awardPlaces ?? [1, 2, 3];
                        const next = on ? cur.filter((x) => x !== pl) : [...cur, pl].sort();
                        if (next.length) update({ awardPlaces: next as Array<1 | 2 | 3> });
                      }} className={`${chip(on && !!who)} disabled:opacity-35`}>{pl === 1 ? "1:a" : pl === 2 ? "2:a" : "3:e"}{who ? ` – ${who}` : ""}</button>
                    );
                  })}
                </div>
              </div>
              <label className="block text-[11px] text-white/50">Rubrik<input value={s.title} onChange={(e) => update({ title: e.target.value })} maxLength={40} placeholder={award?.title ?? "Utmärkelse"} className={input} /></label>
              <label className="block text-[11px] text-white/50">Underrubrik<input value={s.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={60} placeholder={range.label} className={input} /></label>
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
              {(statsQ.isFetching || awardsQ.isFetching || gkIceQ.isFetching || gkFunQ.isFetching) && <p className="text-[11px] text-white/40 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Hämtar statistik …</p>}
            </>
          )}
          {s.kind === "cards" || s.kind === "stats" || s.kind === "result" || s.kind === "award" || s.kind === "image" || isPress(s.kind) ? null : s.kind === "lineup" ? (
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
            <p className="text-[11px] text-white/50 mb-1.5">{isPress(s.kind) ? "Bild" : "Bakgrund"}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MEDIA_BACKGROUNDS.map((b) => (
                <button key={b.id} onClick={() => update({ background: b.id, useOwnPhoto: false })} title={b.name}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-[4/5] ${s.background === b.id && (!ownActive || s.kind === "image") ? "border-emerald-400" : "border-white/10 opacity-70 hover:opacity-100"}`}>
                  <img src={b.url} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 text-[10px] bg-black/60 text-white/85 py-0.5 text-center truncate px-1">{b.name}</span>
                </button>
              ))}
              {/* Egen bild: tom ruta med rött streck tills en bild valts (inte i mallen Bild – där är bilden innehållet) */}
              {s.kind !== "image" && <button onClick={() => (photo && !ownActive ? update({ useOwnPhoto: true }) : fileRef.current?.click())} title={photo ? (ownActive ? "Byt bild" : "Egen bild") : "Välj en egen bild"}
                className={`relative rounded-lg overflow-hidden border-2 aspect-[4/5] bg-[#151515] ${ownActive ? "border-emerald-400" : "border-white/10 opacity-80 hover:opacity-100"}`}>
                {photo ? <img src={photo.src} alt="" className="w-full h-full object-cover" /> : (
                  <svg viewBox="0 0 40 50" preserveAspectRatio="none" className="absolute inset-0 w-full h-full"><line x1="2" y1="48" x2="38" y2="2" stroke="#ef4444" strokeWidth="1.5" /></svg>
                )}
                <span className="absolute inset-x-0 bottom-0 text-[10px] bg-black/60 text-white/85 py-0.5 text-center truncate px-1">{ownActive ? "Byt bild" : "Egen bild"}</span>
              </button>}
            </div>
            {ownActive && s.kind !== "image" && (
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

          {!isPress(s.kind) && (
          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Överlägg</p>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_OVERLAYS.map((t) => <button key={t.id} onClick={() => update({ overlay: t.id })} className={chip(s.overlay === t.id)}>{t.name}</button>)}
            </div>
          </div>
          )}

          <label className="block text-[11px] text-white/50">{isPress(s.kind) ? "Annons" : "Presenteras av"}
            <select value={s.sponsorName ?? ""} onChange={(e) => update({ sponsorName: e.target.value || null })} className={input}>
              <option value="" className="text-black">{isPress(s.kind) ? "Ingen annons" : "Ingen sponsor"}</option>
              {sponsors.filter((sp) => sp.active).map((sp) => <option key={sp.name} value={sp.name} className="text-black">{sp.name}</option>)}
            </select>
          </label>
          {isPressPage(s.kind) && (
            <label className="block text-[11px] text-white/50">Annons 2 {s.kind === "front" ? "(längst ner på sidan)" : "(i sidospalten om plats finns, annars sida 2)"}
              <select value={s.sponsor2Name ?? ""} onChange={(e) => update({ sponsor2Name: e.target.value || null })} className={input}>
                <option value="" className="text-black">Ingen annons</option>
                {sponsors.filter((sp) => sp.active).map((sp) => <option key={sp.name} value={sp.name} className="text-black">{sp.name}</option>)}
              </select>
            </label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="media-caption" className="text-[11px] text-white/50">Bildtext</label>
              {captionEdited && <button onClick={() => setCaptionEdited(false)} className="text-[10px] text-sky-300/80">Återställ</button>}
            </div>
            <textarea id="media-caption" value={caption} onChange={(e) => { setCaptionEdited(true); setCaption(e.target.value); }} rows={7}
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-3 py-2" />
            <p className={`text-[10px] mt-1 ${caption.length > 2200 ? "text-red-300" : "text-white/35"}`}>
              {caption.length > 2200 ? `${caption.length} av max 2 200 tecken – Instagram tar inte emot så lång text. Korta texten. ` : `${caption.length} / 2 200 tecken. `}
              Hashtags från Matchrapporten läggs till automatiskt. Texten kopieras när du delar.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
