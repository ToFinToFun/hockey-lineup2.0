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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Download, Share2, Copy, Check, Save, Plus, Trash2, Loader2, RefreshCw, Upload, X, Users, Type, CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSponsors, logoForName } from "@/lib/sponsors";
import { createTeamSlots, groupSlots, type TeamConfig } from "@/lib/lineup";
import type { Player } from "@/lib/players";
import { prepareSourcePhoto } from "@/lib/cardPhoto";
import { renderMediaPost, MEDIA_THEMES, type MediaTheme, type LineupGroup, type MediaPostData } from "@/lib/mediaImages";

type Kind = "lineup" | "text";

interface Settings {
  kind: Kind;
  theme: MediaTheme;
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
}

const NEW: Record<Kind, Settings> = {
  lineup: { kind: "lineup", theme: "standard", dateLine: "", sponsorName: null, team: "green", title: "Dagens lag", teamName: "Gröna", groups: [], body: "", info: "", photoDim: 0.5 },
  text: { kind: "text", theme: "standard", dateLine: "", sponsorName: null, team: "green", title: "", teamName: "", groups: [], body: "", info: "", photoDim: 0.5 },
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
  const aWhite = (doc.teamAName ?? "VITA").toLowerCase().includes("vit");
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
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase() : team === "white" ? "Vita" : "Gröna";
  return { name, groups: groups.filter((g) => g.players.length > 0) };
}

function defaultCaption(s: Settings, tags: string[]): string {
  const tagLine = tags.join(" ");
  if (s.kind === "lineup") {
    const lines = s.groups.map((g) => `${g.label}: ${g.players.map((p) => `${p.name}${p.number ? ` #${p.number}` : ""}`).join(", ")}`);
    return [`${s.title || "Dagens lag"} – ${s.teamName} ${s.team === "green" ? "💚" : "🤍"}`, s.dateLine, "", ...lines, s.sponsorName ? `\nPresenteras av ${s.sponsorName}` : "", "", tagLine].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
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

  const [postId, setPostId] = useState<number | null>(null);
  const [s, setS] = useState<Settings>(NEW.lineup);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null | undefined>(undefined);
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));
  const tags = tagsQuery.data ?? [];

  const loadTeam = (team: "white" | "green", announce = false) => {
    if (!lineupState.data) return;
    const { name, groups } = teamGroups(lineupState.data as never, team);
    update({ team, teamName: name, groups });
    if (announce) toast.success(`${name}s uppställning hämtad`, { description: `${groups.reduce((n, g) => n + g.players.length, 0)} spelare` });
  };

  // Nytt lag-inlägg: hämta laget och datumraden direkt
  useEffect(() => {
    if (postId === null && s.kind === "lineup" && s.groups.length === 0 && lineupState.data) loadTeam(s.team);
  }, [lineupState.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (postId === null && !s.dateLine && event.data) update({ dateLine: eventLine(event.data) });
  }, [event.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoCaption = useMemo(() => defaultCaption(s, tags), [s, tags]);
  useEffect(() => { if (!captionEdited) setCaption(autoCaption); }, [autoCaption, captionEdited]);

  const sponsor = s.sponsorName ? { name: s.sponsorName, logo: logoForName(sponsors, s.sponsorName) } : null;

  // Förhandsvisning
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const data: MediaPostData = s.kind === "lineup"
        ? { kind: "lineup", theme: s.theme, dateLine: s.dateLine, sponsor, team: s.team, teamName: s.teamName, title: s.title, groups: s.groups }
        : { kind: "text", theme: s.theme, dateLine: s.dateLine, sponsor, title: s.title, body: s.body, info: s.info, photo, photoDim: s.photoDim };
      const c = await renderMediaPost(data);
      if (cancelled || !canvasRef.current) return;
      canvasRef.current.width = c.width;
      canvasRef.current.height = c.height;
      canvasRef.current.getContext("2d")!.drawImage(c, 0, 0);
      c.toBlob((b) => { if (!cancelled) setBlob(b); }, "image/jpeg", 0.92);
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s, photo, sponsor?.name, sponsor?.logo]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = (kind: Kind) => {
    setPostId(null);
    setPhoto(null);
    setNewPhoto(undefined);
    setCaptionEdited(false);
    setS({ ...NEW[kind], dateLine: eventLine(event.data) });
    if (kind === "lineup" && lineupState.data) {
      const { name, groups } = teamGroups(lineupState.data as never, "green");
      setS({ ...NEW.lineup, dateLine: eventLine(event.data), teamName: name, groups });
    }
  };

  const open = async (p: NonNullable<typeof posts.data>[number]) => {
    setPostId(p.id);
    setS({ ...NEW[(p.type as Kind) ?? "text"], ...(p.settings as Partial<Settings>) });
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
    } catch (e) {
      toast.error("Bilden kunde inte läsas", { description: (e as Error).message });
    }
  };

  const titleFor = () => (s.kind === "lineup" ? `${s.title || "Dagens lag"} – ${s.teamName}${s.dateLine ? ` (${s.dateLine.split(" · ")[0]})` : ""}` : s.title || "Inlägg utan rubrik");

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

  const fileName = () => `stalstadens-${titleFor().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.jpg`;
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
            <button onClick={() => startNew("text")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"><Type size={14} /> Text / egen bild</button>
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
          {s.kind === "lineup" ? (
            <>
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Lag</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={() => loadTeam("white")} className={chip(s.team === "white")}>Vita</button>
                  <button onClick={() => loadTeam("green")} className={chip(s.team === "green")}>Gröna</button>
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
              <div>
                <p className="text-[11px] text-white/50 mb-1.5">Bild bakom</p>
                <div className="flex gap-2 items-center">
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs"><Upload size={13} /> {photo ? "Byt bild" : "Egen bild"}</button>
                  {photo && <button onClick={() => { setPhoto(null); setNewPhoto(null); }} className="flex items-center gap-1 text-[11px] text-red-300/70"><X size={12} /> Ta bort (arenan)</button>}
                </div>
                {photo && (
                  <label className="block mt-2 text-[11px] text-white/50">Mörka bilden
                    <input type="range" min={0} max={1} step={0.01} value={s.photoDim} onChange={(e) => update({ photoDim: Number(e.target.value) })} className="w-full accent-emerald-400" />
                  </label>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
              </div>
            </>
          )}

          <label className="block text-[11px] text-white/50">Rad överst (datum/plats)
            <div className="flex gap-2">
              <input value={s.dateLine} onChange={(e) => update({ dateLine: e.target.value })} maxLength={60} className={input} />
              <button onClick={() => update({ dateLine: eventLine(event.data) })} title="Nästa träning från laget.se" className="shrink-0 px-2 rounded-lg bg-white/5 border border-white/10"><CalendarDays size={14} /></button>
            </div>
          </label>

          <div>
            <p className="text-[11px] text-white/50 mb-1.5">Tema</p>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_THEMES.map((t) => <button key={t.id} onClick={() => update({ theme: t.id })} className={chip(s.theme === t.id)}>{t.name}</button>)}
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
