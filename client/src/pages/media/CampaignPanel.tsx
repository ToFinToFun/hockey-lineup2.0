/**
 * Media – kampanjmallen (t.ex. Mustaschkampen): tema, läge, texter och deltagarnas
 * bilder med beskärning. Temat (logga, bakgrund, färg, standardtexter) gäller
 * alla inlägg med temat och sparas direkt; resten sparas med inlägget.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Palette, Plus, Trash2, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { cropRect, DEFAULT_CROP, MAX_PEOPLE, type CampaignCrop, type CampaignMode } from "@/lib/campaignImages";
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
];

/** Loggans adress: uppladdad logga, annars temats inbyggda */
export function themeLogoUrl(t: CampaignTheme | null | undefined): string | null {
  if (!t) return null;
  if (t.hasLogo) return `/api/media/themes/${t.id}/logo?v=${new Date(t.updatedAt).getTime()}`;
  // ?v=3: ny version av loggan (2026-11-01) – ny adress så att telefonernas cache inte visar en äldre
  return t.builtin ? `/images/campaigns/${t.builtin}.png?v=4` : null;
}
export function themePhotoUrl(t: CampaignTheme | null | undefined): string | null {
  return t?.hasPhoto ? `/api/media/themes/${t.id}/photo?v=${new Date(t.updatedAt).getTime()}` : null;
}

/** Deltagarbild: rätt vänd, högst 1080 px, JPEG under 650 000 tecken */
export async function participantJpeg(f: File): Promise<string> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" }).catch(async () => {
    const url = URL.createObjectURL(f);
    try {
      return await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  });
  const sc = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.86, url = c.toDataURL("image/jpeg", q);
  while (url.length > 650_000 && q > 0.45) { q -= 0.08; url = c.toDataURL("image/jpeg", q); }
  return url.split(",")[1] ?? "";
}

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

  const aspect = p.mode === "beforeafter" ? 4 / 5 : 1;
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
        people.push({ name: "", crop: { ...DEFAULT_CROP }, ...(p.mode === "beforeafter" && i < 2 ? { tag: i === 0 ? "Före" : "Efter" } : {}) });
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
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= p.people.length) return;
    const people = [...p.people], photos = [...p.photos];
    [people[i], people[j]] = [people[j], people[i]];
    [photos[i], photos[j]] = [photos[j], photos[i]];
    p.update({ people }); p.setPhotos(photos);
  };
  const remove = (i: number) => {
    p.update({ people: p.people.filter((_, j) => j !== i) });
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
          <label className="block text-[11px] text-white/50">Rubrik (förval)<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} className={p.input} /></label>
          <label className="block text-[11px] text-white/50">Underrubrik (förval)<input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} maxLength={120} className={p.input} /></label>
          <label className="block text-[11px] text-white/50">Slogan (förval)<input value={draft.slogan} onChange={(e) => setDraft({ ...draft, slogan: e.target.value })} maxLength={80} className={p.input} /></label>
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
              // Före/efter: första två bilderna får etiketterna om de saknar egna – och de tas bort igen i de andra lägena
              const auto = (i: number) => (i === 0 ? "Före" : "Efter");
              const people = m.id === "beforeafter"
                ? p.people.map((x, i) => (i < 2 && !x.tag ? { ...x, tag: auto(i) } : x))
                : p.people.map((x, i) => (i < 2 && x.tag === auto(i) ? { ...x, tag: undefined } : x));
              p.update({ campaignMode: m.id, people });
            }} className={p.chip(p.mode === m.id)}>{m.name}</button>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-1">{CAMPAIGN_MODES.find((m) => m.id === p.mode)?.help}</p>
      </div>

      <label className="block text-[11px] text-white/50">Rubrik<input value={p.title} onChange={(e) => p.update({ title: e.target.value })} maxLength={60} placeholder={p.theme?.title || "T.ex. Mustaschkampen har startat"} className={p.input} /></label>
      <label className="block text-[11px] text-white/50">Underrubrik<input value={p.subtitle} onChange={(e) => p.update({ subtitle: e.target.value })} maxLength={80} placeholder={p.mode === "people" ? "T.ex. Vecka 2" : ""} className={p.input} /></label>
      {p.mode === "news" && (
        <label className="block text-[11px] text-white/50">Text under loggan (valfri)<textarea value={p.body} onChange={(e) => p.update({ body: e.target.value })} rows={3} maxLength={300} className={p.input} /></label>
      )}
      <label className="block text-[11px] text-white/50">Slogan (tom = ingen)<input value={p.slogan} onChange={(e) => p.update({ slogan: e.target.value })} maxLength={60} placeholder={p.theme?.slogan || ""} className={p.input} /></label>

      {p.mode !== "news" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-white/50">{p.mode === "beforeafter" ? "Bilder (de två första används)" : `Deltagare (${p.people.length} av ${max})`}</p>
            <button onClick={() => fileRef.current?.click()} disabled={adding || p.people.length >= max} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs disabled:opacity-40">
              {adding ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} Lägg till bilder
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {p.people.length === 0 && <p className="text-xs text-white/35">Välj en eller flera bilder (högst {max}).</p>}
          <div className="space-y-2">
            {p.people.map((person, i) => {
              const photo = p.photos[i];
              const unused = p.mode === "beforeafter" && i >= 2;
              return (
                <div key={i} className={`flex gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 ${unused ? "opacity-45" : ""}`}>
                  {photo ? <CropBox img={photo.img} aspect={aspect} crop={person.crop ?? DEFAULT_CROP} onChange={(crop) => setPerson(i, { crop })} width={p.mode === "beforeafter" ? 96 : 104} />
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
                    <input value={person.tag ?? ""} onChange={(e) => setPerson(i, { tag: e.target.value || undefined })} maxLength={16} placeholder="Etikett på bilden (valfri), t.ex. Dag 1" className={`${p.input} !py-1.5 !text-xs`} />
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
