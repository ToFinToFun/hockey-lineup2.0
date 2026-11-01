/**
 * Media – kampanjmallen (t.ex. Mustaschkampen): tema, läge, texter och deltagarnas
 * bilder med beskärning. Temat (logga, bakgrund, färg, standardtexter) gäller
 * alla inlägg med temat och sparas direkt; resten sparas med inlägget.
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Palette, Plus, Trash2, Upload, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { themeLogoPath } from "@shared/campaign";
import { resizeToJpeg } from "@/lib/jpegResize";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { cropRect, modeTexts, isWinnersDefault, DEFAULT_CROP, MAX_PEOPLE, MODE_MAX, MODE_TAGS, type CampaignCrop, type CampaignMode } from "@/lib/campaignImages";
import { MEDIA_BACKGROUNDS } from "@/lib/mediaImages";
import { prepareSourcePhoto } from "@/lib/cardPhoto";

export interface CampaignPersonSetting { name: string; number?: string; playerId?: string; tag?: string; crop?: CampaignCrop }
/** En deltagarbild: bilden och om den redan finns sparad (keep) eller är ny (data) */
export interface CampaignPhoto { img: HTMLImageElement; src: { keep: number } | { data: string } }
export type CampaignTheme = inferRouterOutputs<AppRouter>["media"]["themes"]["list"][number];

export const CAMPAIGN_MODES: Array<{ id: CampaignMode; name: string; help: string }> = [
  { id: "news", name: "Nyhet", help: "Loggan stor med rubrik, text och slogan – t.ex. att kampanjen har startat." },
  { id: "people", name: "Deltagare", help: "1–9 bilder, lika stora i ram, med namn under. Rutnätet anpassar sig efter antalet." },
  { id: "beforeafter", name: "Före/efter", help: "Två bilder bredvid varandra – första och andra bilden i listan." },
  { id: "winners", name: "Vinnare", help: "Prispall för 1–3 vinnare (de tre första bilderna): ettan störst i mitten med guldmustasch, tvåan och trean på sidorna." },
];

/** Loggans adress: uppladdad logga, annars temats inbyggda (samma som modulen Mustaschkampen) */
export const themeLogoUrl = (t: CampaignTheme | null | undefined): string | null => themeLogoPath(t);
export function themePhotoUrl(t: CampaignTheme | null | undefined): string | null {
  return t?.hasPhoto ? `/api/media/themes/${t.id}/photo?v=${new Date(t.updatedAt).getTime()}` : null;
}

/** Deltagarbild: rätt vänd, högst 1080 px, JPEG under 650 000 tecken */
export const participantJpeg = async (f: File): Promise<string> => (await resizeToJpeg(f)).base64;

/** Loggan som PNG (behåller genomskinlig bakgrund), högst 900 px */
async function logoPng(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const sc = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const b64 = c.toDataURL("image/png").split(",")[1] ?? "";
  if (b64.length > 1_400_000) throw new Error("Loggan är för stor – prova en mindre bild");
  return b64;
}

export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = src; });

/**
 * Beskärning: dra i bilden för att flytta, reglaget zoomar. Samma uträkning
 * som när bilden ritas (cropRect), så det som syns här är det som kommer med.
 */
function CropBox({ img, aspect, crop, onChange, width = 112 }: { img: HTMLImageElement; aspect: number; crop: CampaignCrop; onChange: (c: CampaignCrop) => void; width?: number }) {
  const h = width / aspect;
  const r = cropRect(img.naturalWidth || img.width, img.naturalHeight || img.height, aspect, crop);
  const scale = width / r.sw;
  const drag = useRef<{ x: number; y: number; r: typeof r } | null>(null);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  return (
    <div className="shrink-0 space-y-1" style={{ width }}>
      <div
        className="relative overflow-hidden rounded-lg border-2 border-white/80 cursor-grab active:cursor-grabbing bg-black"
        style={{ width, height: h, touchAction: "none" }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, r }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const sc = width / d.r.sw;
          const cx = d.r.sx + d.r.sw / 2 - (e.clientX - d.x) / sc;
          const cy = d.r.sy + d.r.sh / 2 - (e.clientY - d.y) / sc;
          // Håll mittpunkten där bilden fortfarande fyller rutan
          const next = cropRect(iw, ih, aspect, { ...crop, x: cx / iw, y: cy / ih });
          onChange({ ...crop, x: (next.sx + next.sw / 2) / iw, y: (next.sy + next.sh / 2) / ih });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        title="Dra för att flytta bilden"
      >
        <img src={img.src} alt="" draggable={false} className="absolute max-w-none select-none pointer-events-none"
          style={{ left: -r.sx * scale, top: -r.sy * scale, width: iw * scale, height: ih * scale }} />
      </div>
      <input type="range" min={1} max={3} step={0.05} value={crop.z} aria-label="Zoom"
        onChange={(e) => {
          const z = Number(e.target.value);
          const next = cropRect(iw, ih, aspect, { ...crop, z });
          onChange({ x: (next.sx + next.sw / 2) / iw, y: (next.sy + next.sh / 2) / ih, z });
        }} className="w-full accent-emerald-400" />
    </div>
  );
}

type Entry = inferRouterOutputs<AppRouter>["campaign"]["entries"][number];
const entryUrl = (id: number) => `/api/campaign/entries/${id}/photo`;
/** Bidragets bild som JPEG-base64 (sparas sedan med inlägget som de andra bilderna) */
async function entryPhoto(id: number): Promise<CampaignPhoto> {
  const blob = await (await fetch(entryUrl(id))).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = btoa(bin);
  return { img: await loadImg(`data:image/jpeg;base64,${data}`), src: { data } };
}
const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }).replace(".", "");

/**
 * Bidrag från modulen Mustaschkampen: Deltagare – bocka i bilder och lägg till;
 * Före/efter – välj en person, så läggs första och senaste bilden in.
 */
function EntriesPicker({ mode, room, onAdd, onPair, onClose, chip }: {
  mode: CampaignMode; room: number;
  onAdd: (list: Array<{ entry: Entry; photo: CampaignPhoto }>) => void;
  onPair: (first: { entry: Entry; photo: CampaignPhoto }, last: { entry: Entry; photo: CampaignPhoto }) => void;
  onClose: () => void; chip: (on: boolean) => string;
}) {
  const utils = trpc.useUtils();
  const q = trpc.campaign.entries.useQuery(undefined, { staleTime: 10_000 });
  const del = trpc.campaign.delete.useMutation({ onSuccess: () => utils.campaign.entries.invalidate() });
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // En grupp per person (spelaren, annars namnet), bilderna i tidsordning
  const groups = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of q.data ?? []) {
      const k = e.playerId ?? `n:${e.name.toLowerCase()}`;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()].sort((a, b) => a[0].name.localeCompare(b[0].name, "sv"));
  }, [q.data]);
  const load = async (list: Entry[]) => Promise.all(list.map(async (entry) => ({ entry, photo: await entryPhoto(entry.id) })));
  const add = async () => {
    setBusy(true);
    try {
      const chosen = (q.data ?? []).filter((e) => sel.includes(e.id));
      onAdd(await load(chosen));
      onClose();
    } catch {
      toast.error("Några bilder kunde inte hämtas");
    } finally { setBusy(false); }
  };
  const pair = async (list: Entry[]) => {
    setBusy(true);
    try {
      const [a, b] = await load([list[0], list[list.length - 1]]);
      onPair(a, b);
      onClose();
    } catch {
      toast.error("Bilderna kunde inte hämtas");
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-emerald-200/90 font-semibold">Bidrag från medlemmarna ({q.data?.length ?? 0})</p>
        <button onClick={onClose} className="text-white/50" aria-label="Stäng"><X size={14} /></button>
      </div>
      {q.isLoading && <Loader2 size={14} className="animate-spin text-white/40" />}
      {!q.isLoading && !groups.length && <p className="text-xs text-white/40">Inga bidrag än. Medlemmarna laddar upp under Mustaschkampen på startsidan.</p>}
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {groups.map((list) => (
          <div key={list[0].id}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-white/80 truncate">{list[0].name}{list[0].number ? ` #${list[0].number}` : ""} <span className="text-white/35">· {list.length} {list.length === 1 ? "bild" : "bilder"}</span></p>
              {mode === "beforeafter" && <button onClick={() => void pair(list)} disabled={busy || list.length < 2} className={`${chip(false)} !py-1 disabled:opacity-35`} title={list.length < 2 ? "Behöver minst två bilder" : "Första och senaste bilden"}>Före/efter</button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {list.map((e) => {
                const on = sel.includes(e.id);
                return (
                  <div key={e.id} className="relative shrink-0">
                    <button onClick={() => mode !== "beforeafter" && setSel(on ? sel.filter((x) => x !== e.id) : sel.length < room ? [...sel, e.id] : sel)}
                      className={`block w-16 h-16 rounded-lg overflow-hidden border-2 ${on ? "border-emerald-400" : "border-white/10"}`}>
                      <img src={entryUrl(e.id)} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                    <span className="absolute left-0.5 bottom-0.5 text-[9px] bg-black/75 rounded px-0.5">{shortDate(e.createdAt)}</span>
                    {on && <Check size={12} className="absolute top-0.5 left-0.5 text-emerald-300 bg-black/70 rounded" />}
                    <button onClick={() => { if (confirm(`Ta bort bilden från ${e.name}? Den försvinner för alla.`)) del.mutate({ id: e.id }); }} className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-red-300/80" aria-label="Ta bort bidraget"><Trash2 size={10} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {mode !== "beforeafter" && groups.length > 0 && (
        <button onClick={() => void add()} disabled={busy || !sel.length} className="w-full py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold disabled:opacity-40">
          {busy ? "Hämtar …" : `Lägg till ${sel.length || ""} ${sel.length === 1 ? "bild" : "bilder"}`} {room < 9 ? `(plats för ${room})` : ""}
        </button>
      )}
      <p className="text-[10px] text-white/35">{mode === "beforeafter" ? "Före/efter tar personens första och senaste bild, med datumen som etiketter." : "Bocka i bilderna – namn och nummer fylls i."} Papperskorgen tar bort bidraget helt.</p>
    </div>
  );
}

interface Props {
  themes: CampaignTheme[];
  theme: CampaignTheme | null;
  loading: boolean;
  themeId: number | undefined;
  mode: CampaignMode;
  title: string; subtitle: string; body: string; slogan: string;
  people: CampaignPersonSetting[];
  photos: CampaignPhoto[];
  players: Array<{ id: string; name: string; number?: string | null }>;
  onTheme: (t: CampaignTheme) => void;
  update: (patch: { campaignMode?: CampaignMode; title?: string; subtitle?: string; body?: string; slogan?: string; people?: CampaignPersonSetting[] }) => void;
  setPhotos: (photos: CampaignPhoto[]) => void;
  input: string;
  chip: (on: boolean) => string;
}

export default function CampaignPanel(p: Props) {
  const utils = trpc.useUtils();
  const saveTheme = trpc.media.themes.save.useMutation({ onSuccess: () => utils.media.themes.list.invalidate() });
  const delTheme = trpc.media.themes.delete.useMutation({ onSuccess: () => utils.media.themes.list.invalidate() });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CampaignTheme | null>(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Bidrag från modulen finns bara för Mustaschkampen (inbyggt tema) */
  const hasEntries = p.theme?.builtin === "movember";
  const fromEntry = (x: { entry: Entry; photo: CampaignPhoto }, tag?: string): CampaignPersonSetting => ({
    name: x.entry.name, number: x.entry.number ?? undefined, playerId: x.entry.playerId ?? undefined, crop: { ...DEFAULT_CROP }, ...(tag ? { tag } : {}),
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const [newLogo, setNewLogo] = useState<string | null | undefined>(undefined);
  const [newBg, setNewBg] = useState<string | null | undefined>(undefined);

  const openEdit = () => {
    if (!p.theme) return;
    setDraft({ ...p.theme }); setNewLogo(undefined); setNewBg(undefined); setEditing(true);
  };

  const aspect = p.mode === "beforeafter" || p.mode === "winners" ? 4 / 5 : 1;
  const max = MAX_PEOPLE;

  const addFiles = async (files: FileList) => {
    const room = max - p.people.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast(`Högst ${max} bilder – ${files.length - list.length} togs inte med`);
    if (!list.length) return;
    setAdding(true);
    try {
      const people = [...p.people], photos = [...p.photos];
      for (const f of list) {
        const data = await participantJpeg(f);
        const img = await loadImg(`data:image/jpeg;base64,${data}`);
        const i = people.length;
        const tag = MODE_TAGS[p.mode]?.[i];
        people.push({ name: "", crop: { ...DEFAULT_CROP }, ...(tag ? { tag } : {}) });
        photos.push({ img, src: { data } });
      }
      p.update({ people });
      p.setPhotos(photos);
    } catch (e) {
      toast.error("Bilden kunde inte läsas", { description: (e as Error).message });
    } finally {
      setAdding(false);
    }
  };

  const setPerson = (i: number, patch: Partial<CampaignPersonSetting>) => p.update({ people: p.people.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  /**
   * Etiketterna hör till platsen, inte personen: efter flytt eller borttag får
   * platserna lägets förval igen (1:a Stålborsten, 2:a Snorbromsen, 3:e Dunläppen –
   * eller Före/Efter). Egna etiketter följer med personen.
   */
  const placeTags = (people: CampaignPersonSetting[]) => {
    const auto = MODE_TAGS[p.mode] ?? [];
    return people.map((x, i) => (!x.tag || auto.includes(x.tag) ? { ...x, tag: auto[i] } : x));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= p.people.length) return;
    const people = [...p.people], photos = [...p.photos];
    [people[i], people[j]] = [people[j], people[i]];
    [photos[i], photos[j]] = [photos[j], photos[i]];
    p.update({ people: placeTags(people) }); p.setPhotos(photos);
  };
  const remove = (i: number) => {
    p.update({ people: placeTags(p.people.filter((_, j) => j !== i)) });
    p.setPhotos(p.photos.filter((_, j) => j !== i));
  };

  const onLogo = async (f: File) => {
    try { setNewLogo(await logoPng(f)); } catch (e) { toast.error("Loggan kunde inte läsas", { description: (e as Error).message }); }
  };
  const onBg = async (f: File) => {
    try { const { base64 } = await prepareSourcePhoto(f); setNewBg(base64); } catch (e) { toast.error("Bilden kunde inte läsas", { description: (e as Error).message }); }
  };
  const commitTheme = async (asNew = false) => {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await saveTheme.mutateAsync({
        id: asNew ? undefined : draft.id, name: draft.name.trim() || "Tema", accent: draft.accent, title: draft.title, subtitle: draft.subtitle,
        slogan: draft.slogan, tags: draft.tags, background: draft.background, dim: draft.dim,
        ...(newLogo !== undefined ? { logo: newLogo } : {}), ...(newBg !== undefined ? { photo: newBg } : {}),
      });
      const list = await utils.media.themes.list.fetch();
      const saved = list.find((t) => t.id === res.id);
      if (saved) p.onTheme(saved);
      setEditing(false);
      toast.success(asNew ? "Nytt tema skapat" : "Temat är sparat – gäller alla inlägg med temat");
    } catch (e) {
      toast.error("Kunde inte spara temat", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const newTheme = () => {
    setDraft({ id: 0, name: "", builtin: null, hasLogo: false, hasPhoto: false, updatedAt: new Date(), title: "", subtitle: "", slogan: "", tags: "", accent: p.theme?.accent ?? "#2e9e44", background: "arena", dim: 55 } as CampaignTheme);
    setNewLogo(undefined); setNewBg(undefined);
    setEditing(true);
  };

  const draftLogo = newLogo ? `data:image/png;base64,${newLogo}` : newLogo === null ? null : draft?.id ? themeLogoUrl(draft) : null;
  const draftBg = newBg ? `data:image/jpeg;base64,${newBg}` : newBg === null ? null : draft?.id ? themePhotoUrl(draft) : null;

  return (
    <>
      <div>
        <p className="text-[11px] text-white/50 mb-1.5">Tema</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.loading && <Loader2 size={14} className="animate-spin text-white/40" />}
          {p.themes.map((t) => <button key={t.id} onClick={() => { p.onTheme(t); setEditing(false); }} className={p.chip(p.themeId === t.id)}>{t.name}</button>)}
          <button onClick={() => (editing && draft?.id ? setEditing(false) : openEdit())} disabled={!p.theme} className="flex items-center gap-1 text-[11px] text-sky-300/80 disabled:opacity-40 ml-1"><Palette size={12} /> {editing && draft?.id ? "Stäng" : "Ändra tema"}</button>
          <button onClick={newTheme} className="flex items-center gap-1 text-[11px] text-sky-300/80"><Plus size={12} /> Nytt tema</button>
        </div>
      </div>

      {editing && draft && (
        <div className="rounded-lg border border-sky-400/25 bg-sky-500/5 p-2.5 space-y-2">
          <p className="text-[11px] text-sky-200/90 font-semibold">{draft.id ? `Tema: ${draft.name}` : "Nytt tema"} <span className="font-normal text-white/40">– gäller alla inlägg med temat</span></p>
          <label className="block text-[11px] text-white/50">Namn<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="T.ex. Rosa bandet" className={p.input} /></label>
          <div className="flex items-start gap-3">
            <div>
              <p className="text-[11px] text-white/50 mb-1">Logga</p>
              <div className="w-20 h-20 rounded-lg border border-white/15 bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden">
                {draftLogo ? <img src={draftLogo} alt="" className="max-w-full max-h-full" /> : <span className="text-[10px] text-white/35">Ingen</span>}
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => logoRef.current?.click()} className="flex items-center gap-1 text-[11px] text-white/60"><Upload size={11} /> Byt</button>
                {draftLogo && !(draft.builtin && !draft.hasLogo && newLogo === undefined) && <button onClick={() => setNewLogo(null)} className="text-[11px] text-red-300/70">Ta bort</button>}
              </div>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLogo(f); e.target.value = ""; }} />
            </div>
            <div className="flex-1 space-y-2">
              <label className="block text-[11px] text-white/50">Färg
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} className="h-8 w-12 rounded bg-transparent border border-white/15" />
                  <span className="text-[11px] text-white/40">{draft.accent}</span>
                </div>
              </label>
              <p className="text-[10px] text-white/35">PNG med genomskinlig bakgrund blir snyggast. {draft.builtin && !draft.hasLogo ? "Inbyggd logga används tills en egen laddas upp." : ""}</p>
            </div>
          </div>
          <label className="block text-[11px] text-white/50">Rubrik i Nyhet<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} className={p.input} /></label>
          <label className="block text-[11px] text-white/50">Budskap – rubrik i bildinläggen, ramen i Nyhet<input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} maxLength={120} className={p.input} /></label>
          <label className="block text-[11px] text-white/50">Slogan – under rubriken<input value={draft.slogan} onChange={(e) => setDraft({ ...draft, slogan: e.target.value })} maxLength={80} className={p.input} /></label>
          <label className="block text-[11px] text-white/50">Hashtags i bildtexten<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} maxLength={200} placeholder="#mustaschkampen" className={p.input} /></label>
          <div>
            <p className="text-[11px] text-white/50 mb-1">Bakgrund</p>
            <div className="grid grid-cols-5 gap-1">
              {MEDIA_BACKGROUNDS.map((b) => (
                <button key={b.id} onClick={() => { setDraft({ ...draft, background: b.id }); if (draftBg) setNewBg(null); }} title={b.name}
                  className={`rounded overflow-hidden border-2 aspect-[4/5] ${draft.background === b.id && !draftBg ? "border-emerald-400" : "border-white/10 opacity-70"}`}>
                  <img src={b.url} alt={b.name} className="w-full h-full object-cover" />
                </button>
              ))}
              <button onClick={() => bgRef.current?.click()} title="Egen bild" className={`relative rounded overflow-hidden border-2 aspect-[4/5] bg-[#151515] ${draftBg ? "border-emerald-400" : "border-white/10"}`}>
                {draftBg ? <img src={draftBg} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={14} className="m-auto text-white/50" />}
              </button>
            </div>
            <input ref={bgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onBg(f); e.target.value = ""; }} />
            <label className="block text-[11px] text-white/50 mt-1.5">Mörka bakgrunden
              <input type="range" min={0} max={90} value={draft.dim} onChange={(e) => setDraft({ ...draft, dim: Number(e.target.value) })} className="w-full accent-emerald-400" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => void commitTheme()} disabled={busy} className="px-3 py-1.5 rounded-lg bg-[#0a7ea4] text-white text-xs font-semibold disabled:opacity-40">{busy ? "Sparar …" : draft.id ? "Spara temat" : "Skapa temat"}</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">Avbryt</button>
            {!!draft.id && p.themes.length > 1 && (
              <button onClick={() => { if (confirm(`Ta bort temat "${draft.name}"? Sparade inlägg med temat får ett annat tema när de öppnas.`)) { delTheme.mutate({ id: draft.id }); setEditing(false); } }}
                className="ml-auto flex items-center gap-1 text-[11px] text-red-300/70"><Trash2 size={12} /> Ta bort temat</button>
            )}
          </div>
          <p className="text-[10px] text-white/35">Förvalen fylls i på nya inlägg. Loggan och färgen ändras direkt i alla inlägg med temat, bakgrunden i de inlägg som använder temats bakgrund.</p>
        </div>
      )}

      <div>
        <p className="text-[11px] text-white/50 mb-1.5">Typ av inlägg</p>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_MODES.map((m) => (
            <button key={m.id} onClick={() => {
              // Etiketter: Före/Efter och vinnarnas (Stålborsten …) läggs på där det saknas egna,
              // och de automatiska tas bort igen i de andra lägena
              const autoOld = MODE_TAGS[p.mode] ?? [], autoNew = MODE_TAGS[m.id] ?? [];
              const people = p.people.map((x, i) => {
                const tag = x.tag && autoOld[i] === x.tag ? undefined : x.tag;
                return { ...x, tag: tag ?? autoNew[i] };
              });
              // Texterna: förvalen för det nya läget, om de inte ändrats
              const was = modeTexts(p.mode, p.theme, p.people.length), next = modeTexts(m.id, p.theme, Math.min(MODE_MAX[m.id] || 1, people.length));
              const isDefault = (v: string, def: string) => v === def || (p.mode === "winners" && isWinnersDefault(v));
              p.update({
                campaignMode: m.id, people,
                ...(isDefault(p.title, was.title) ? { title: next.title } : {}),
                ...(isDefault(p.subtitle, was.subtitle) ? { subtitle: next.subtitle } : {}),
                ...(isDefault(p.slogan, was.slogan) ? { slogan: next.slogan } : {}),
              });
            }} className={p.chip(p.mode === m.id)}>{m.name}</button>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-1">{CAMPAIGN_MODES.find((m) => m.id === p.mode)?.help}</p>
      </div>

      <label className="block text-[11px] text-white/50">Rubrik<input value={p.title} onChange={(e) => p.update({ title: e.target.value })} maxLength={60} placeholder={modeTexts(p.mode, p.theme, p.people.length).title || "T.ex. Mustaschkampen har startat"} className={p.input} /></label>
      <label className="block text-[11px] text-white/50">Underrubrik<input value={p.subtitle} onChange={(e) => p.update({ subtitle: e.target.value })} maxLength={80} placeholder={modeTexts(p.mode, p.theme, p.people.length).subtitle} className={p.input} /></label>
      {p.mode === "news" && (
        <label className="block text-[11px] text-white/50">Text under loggan (valfri)<textarea value={p.body} onChange={(e) => p.update({ body: e.target.value })} rows={3} maxLength={300} className={p.input} /></label>
      )}
      <label className="block text-[11px] text-white/50">I ramen nederst (tom = ingen)<input value={p.slogan} onChange={(e) => p.update({ slogan: e.target.value })} maxLength={60} placeholder={p.mode === "winners" ? "Vinnaren / Vinnarna 2026 efter antalet bilder" : modeTexts(p.mode, p.theme, p.people.length).slogan} className={p.input} /></label>

      {p.mode !== "news" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-white/50">{p.mode === "beforeafter" ? "Bilder (de två första används)" : p.mode === "winners" ? "Vinnarna (de tre första: 1:a, 2:a, 3:e)" : `Deltagare (${p.people.length} av ${max})`}</p>
            <button onClick={() => fileRef.current?.click()} disabled={adding || p.people.length >= max} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs disabled:opacity-40">
              {adding ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} Lägg till bilder
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {hasEntries && !picking && (
            <button onClick={() => setPicking(true)} className="w-full mb-2 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 text-xs font-semibold">
              <Users size={12} /> Hämta bidrag från medlemmarna
            </button>
          )}
          {hasEntries && picking && (
            <div className="mb-2">
              <EntriesPicker mode={p.mode} room={Math.max(0, (p.mode === "winners" ? MODE_MAX.winners : max) - p.people.length)} chip={p.chip} onClose={() => setPicking(false)}
                onAdd={(list) => { p.update({ people: [...p.people, ...list.map((x, j) => fromEntry(x, MODE_TAGS[p.mode]?.[p.people.length + j]))] }); p.setPhotos([...p.photos, ...list.map((x) => x.photo)]); }}
                onPair={(a, b) => { p.update({ people: [fromEntry(a, shortDate(a.entry.createdAt)), fromEntry(b, shortDate(b.entry.createdAt))] }); p.setPhotos([a.photo, b.photo]); }} />
            </div>
          )}
          {p.people.length === 0 && <p className="text-xs text-white/35">Välj en eller flera bilder (högst {max}).</p>}
          <div className="space-y-2">
            {p.people.map((person, i) => {
              const photo = p.photos[i];
              const unused = (p.mode === "beforeafter" || p.mode === "winners") && i >= MODE_MAX[p.mode];
              return (
                <div key={i} className={`flex gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 ${unused ? "opacity-45" : ""}`}>
                  {photo ? <CropBox img={photo.img} aspect={aspect} crop={person.crop ?? DEFAULT_CROP} onChange={(crop) => setPerson(i, { crop })} width={aspect < 1 ? 96 : 104} />
                    : <div className="w-[104px] h-[104px] rounded-lg bg-white/5 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-white/40" /></div>}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <select value={person.playerId ?? ""} onChange={(e) => {
                      const pl = p.players.find((x) => x.id === e.target.value);
                      setPerson(i, pl ? { playerId: pl.id, name: pl.name, number: pl.number || undefined } : { playerId: undefined });
                    }} className={`${p.input} !py-1.5 !text-xs`}>
                      <option value="" className="text-black">Välj spelare …</option>
                      {p.players.map((pl) => <option key={pl.id} value={pl.id} className="text-black">{pl.name}{pl.number ? ` #${pl.number}` : ""}</option>)}
                    </select>
                    <div className="flex gap-1.5">
                      <input value={person.name} onChange={(e) => setPerson(i, { name: e.target.value })} maxLength={40} placeholder="Namn under bilden" className={`${p.input} !py-1.5 !text-xs`} />
                      <input value={person.number ?? ""} onChange={(e) => setPerson(i, { number: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) || undefined })} inputMode="numeric" placeholder="#" className={`${p.input} !py-1.5 !text-xs !w-12 shrink-0`} />
                    </div>
                    <input value={person.tag ?? ""} onChange={(e) => setPerson(i, { tag: e.target.value || undefined })} maxLength={20} placeholder={p.mode === "winners" ? "Pris, t.ex. Stålborsten" : "Etikett på bilden (valfri), t.ex. Dag 1"} className={`${p.input} !py-1.5 !text-xs`} />
                    <div className="flex items-center gap-2 text-white/50">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-25" aria-label="Flytta upp"><ArrowUp size={13} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === p.people.length - 1} className="disabled:opacity-25" aria-label="Flytta ned"><ArrowDown size={13} /></button>
                      <button onClick={() => remove(i)} className="ml-auto flex items-center gap-1 text-[11px] text-red-300/70"><X size={12} /> Ta bort</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-white/35 mt-1.5">Dra i bilden för att flytta den, reglaget zoomar. Namnet kan skrivas över – kortare namn ger större text när det är många bilder.</p>
        </div>
      )}
    </>
  );
}
