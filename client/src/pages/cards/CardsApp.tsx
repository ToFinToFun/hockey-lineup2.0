/**
 * Hockeykort (styrelsen) – route /cards.
 *
 * Välj spelare → ladda upp ett foto → kortet blir klart direkt (autonivåer,
 * beskärning, stil efter spelarens lag, säsongens statistik). Allt går att
 * justera. "Spara på spelaren" sparar originalfotot och valen (max ett per
 * spelare) så att kortet kan byggas om med ny statistik eller stil senare.
 * Fler kort kan skapas och laddas ned utan att sparas.
 */
import { useFeatures } from "@/contexts/ClubContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Upload, Download, Share2, Save, Wand2, Loader2, Trash2, Search, Check, Scissors } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CARD_SKINS, cardLogos } from "@shared/cardSkins";
import { club } from "@shared/club";
import { renderCard, photoSourceRect, DEFAULT_SETTINGS, CARD_W, type CardSettings, type CardCell, defaultCardFor, CARD_POSITION } from "@shared/cardRender";
import { prepareSourcePhoto } from "@/lib/cardPhoto";
import { computeMask } from "@/lib/cutout";

import { cellsFor, defaultStatsTitle } from "@shared/cardStats";
export { cellsFor, defaultStatsTitle, currentSeasonLabel } from "@shared/cardStats";

/** Positioner på kortet (engelska, som på klassiska hockeykort) */
const POSITIONS = ["", "G", "D", "C", "LW", "RW", "F"];
/** Spelarregistrets positioner → kortets */

async function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Fotot kunde inte laddas"));
    i.src = src;
  });
}

export default function CardsApp() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const players = trpc.players.list.useQuery();
  const saved = trpc.cards.list.useQuery();
  const saveCard = trpc.cards.save.useMutation({ onSuccess: () => utils.cards.list.invalidate() });
  const deleteCard = trpc.cards.delete.useMutation({ onSuccess: () => utils.cards.list.invalidate() });

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const features = useFeatures();

  const [settings, setSettings] = useState<CardSettings>({ ...DEFAULT_SETTINGS, statsTitle: defaultStatsTitle("season") });
  const stats = trpc.cards.stats.useQuery({ playerId: playerId ?? "", ...(features.opponents && settings.includeExternal ? { includeExternal: true } : {}) }, { enabled: !!playerId });
  const [photo, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [newSource, setNewSource] = useState<string | null>(null); // uppladdat men inte sparat
  const [mask, setMask] = useState<HTMLImageElement | null>(null);
  // undefined = oförändrad sedan senast sparat, null = borttagen, sträng = ny mask
  const [newMask, setNewMask] = useState<string | null | undefined>(undefined);
  const [cutting, setCutting] = useState(false);
  const [loadedInfo, setLoadedInfo] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const savedIds = useMemo(() => new Set((saved.data ?? []).map((c) => c.playerId)), [saved.data]);
  const player = players.data?.find((p) => p.id === playerId) ?? null;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (players.data ?? [])
      .filter((p) => p.active !== false && (!q || p.name.toLowerCase().includes(q) || (p.number ?? "").includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [players.data, search]);

  const update = (patch: Partial<CardSettings>) => setSettings((s) => ({ ...s, ...patch }));

  // Välj spelare: sparat kort (foto + val) laddas, annars ett nytt kort med spelarens uppgifter
  const choosePlayer = useCallback(async (id: string) => {
    setPlayerId(id);
    setNewSource(null);
    setPhotoImg(null);
    setMask(null);
    setNewMask(undefined);
    setLoadedInfo(null);
    const p = players.data?.find((x) => x.id === id);
    const savedCard = saved.data?.find((c) => c.playerId === id);
    const base: CardSettings = defaultCardFor(p);
    if (savedCard) {
      setSettings({ ...base, ...(savedCard.settings as Partial<CardSettings>) });
      setLoadingPhoto(true);
      const v = new Date(savedCard.updatedAt).getTime();
      try {
        setPhotoImg(await loadImg(`/api/players/${encodeURIComponent(id)}/card-source?v=${v}`));
        setLoadedInfo(`Sparat kort laddat – senast sparat ${new Date(savedCard.updatedAt).toLocaleString("sv-SE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`);
        // Friläggningen (om den finns)
        try { setMask(await loadImg(`/api/players/${encodeURIComponent(id)}/card-mask?v=${v}`)); } catch { /* ingen mask */ }
      } catch {
        toast.error("Det sparade fotot kunde inte laddas");
      } finally {
        setLoadingPhoto(false);
      }
    } else {
      setSettings(base);
    }
  }, [players.data, saved.data]);

  // Listan över sparade kort kan komma efter att spelaren valts – ladda då kortet
  const autoLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (!playerId || photo || newSource || loadingPhoto) return;
    if (autoLoaded.current === playerId) return;
    if (saved.data?.some((c) => c.playerId === playerId)) {
      autoLoaded.current = playerId;
      void choosePlayer(playerId);
    }
  }, [saved.data, playerId, photo, newSource, loadingPhoto, choosePlayer]);

  // Statistiken uppdateras alltid från senaste matcherna (utom egna värden)
  useEffect(() => {
    if (!stats.data) return;
    setSettings((s) => {
      if (s.statsMode === "custom") return { ...s, form: stats.data!.form };
      const { title, cells } = cellsFor(s.statsMode, stats.data);
      // Egen rubrik står kvar; tom eller standardrubrik byts mot den aktuella
      const isDefault = !s.statsTitle || /^(Säsong|Slutspel|Försäsong) \d{4}\/\d{2}$/.test(s.statsTitle) || s.statsTitle === "Karriär" || s.statsTitle === "Totalt" || s.statsTitle === "Form";
      return { ...s, cells, statsTitle: isDefault ? title : s.statsTitle, form: stats.data!.form };
    });
  }, [stats.data, settings.statsMode]);

  const onFile = async (file: File) => {
    setLoadingPhoto(true);
    try {
      const { base64, auto } = await prepareSourcePhoto(file);
      setNewSource(base64);
      setPhotoImg(await loadImg(`data:image/jpeg;base64,${base64}`));
      // Ny bild – den gamla friläggningen gäller inte längre
      setMask(null);
      setNewMask(null);
      setLoadedInfo(null);
      update({ auto, photo: { zoom: 1, x: 0.5, y: 0.4 }, adjust: { brightness: 1, contrast: 1, saturation: 1, tint: 1 } });
    } catch (e) {
      toast.error("Fotot kunde inte läsas", { description: (e as Error).message });
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Rita förhandsvisningen (lite fördröjt så att reglagen känns lätta)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const c = await renderCard({ settings, photo, mask });
      if (cancelled || !canvasRef.current) return;
      const out = canvasRef.current;
      out.width = c.width;
      out.height = c.height;
      out.getContext("2d")!.drawImage(c, 0, 0);
    }, 60);
    return () => { cancelled = true; clearTimeout(t); };
  }, [settings, photo, mask]);

  // Dra i kortet för att flytta fotot, nyp med två fingrar (eller scrolla) för att zooma
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!photo) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { dist: dist(), zoom: settings.photo.zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!photo || !canvasRef.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const zoom = Math.min(3, Math.max(1, pinch.current.zoom * (dist() / Math.max(1, pinch.current.dist))));
      setSettings((s) => ({ ...s, photo: { ...s.photo, zoom } }));
      return;
    }
    if (!drag.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const r = photoSourceRect(photo.width, photo.height, CARD_W - 40, 1050 - 40, settings.photo);
    const dx = ((e.clientX - drag.current.x) / rect.width) * (r.sw / photo.width) * (CARD_W / (CARD_W - 40));
    const dy = ((e.clientY - drag.current.y) / rect.height) * (r.sh / photo.height) * (1050 / 1010);
    drag.current = { x: e.clientX, y: e.clientY };
    setSettings((s) => ({ ...s, photo: { ...s.photo, x: Math.min(1, Math.max(0, s.photo.x - dx)), y: Math.min(1, Math.max(0, s.photo.y - dy)) } }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y };
    } else if (pointers.current.size === 0) {
      drag.current = null;
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!photo) return;
    const zoom = Math.min(3, Math.max(1, settings.photo.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    update({ photo: { ...settings.photo, zoom } });
  };

  const fileBase = () => `hockeykort-${(settings.name || "spelare").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}`;
  const exportBlob = async (type: "image/png" | "image/jpeg", scale = 1, quality = 0.9) => {
    const c = await renderCard({ settings, photo, mask, scale });
    return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Kunde inte skapa bilden"))), type, quality));
  };

  const download = async () => {
    setBusy("download");
    try {
      const blob = await exportBlob("image/png");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const file = new File([await exportBlob("image/png")], `${fileBase()}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else await download();
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela");
    } finally {
      setBusy(null);
    }
  };

  const saveToPlayer = async () => {
    if (!playerId) return;
    if (!photo) return toast.error("Ladda upp ett foto först");
    setBusy("save");
    try {
      await saveCard.mutateAsync({ playerId, settings: settings as unknown as Record<string, unknown>, sourceBase64: newSource ?? undefined, maskBase64: newMask });
      setNewSource(null);
      setNewMask(undefined);
      toast.success("Kortet är sparat – det är nu spelarens bild", {
        description: "Används överallt och uppdateras automatiskt efter varje godkänd match.",
      });
    } catch (e) {
      toast.error("Kunde inte spara", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const removeSaved = async () => {
    if (!playerId || !confirm("Ta bort det egna kortet (fotot och valen)? Spelaren får standardkortet igen – lagets färg utan foto – i utmärkelser, profiler och Media.")) return;
    await deleteCard.mutateAsync({ playerId });
    toast.success("Kortet är borttaget – spelaren har standardkortet igen");
    // Visa standardkortet direkt
    setNewSource(null);
    setPhotoImg(null);
    setMask(null);
    setNewMask(undefined);
    setLoadedInfo(null);
    const p = players.data?.find((x) => x.id === playerId);
    setSettings(defaultCardFor(p));
  };

  const runCutout = async () => {
    if (!photo) return;
    setCutting(true);
    try {
      const m = await computeMask(photo as HTMLImageElement);
      setMask(m.image);
      setNewMask(m.base64);
      update({ cutout: { enabled: true, amount: 1 } });
      toast.success("Spelaren är frilagd", { description: "Dämpa med reglaget om kanterna blir fel." });
    } catch (e) {
      toast.error("Friläggningen misslyckades", { description: (e as Error).message });
    } finally {
      setCutting(false);
    }
  };
  const removeCutout = () => {
    setMask(null);
    setNewMask(null);
    update({ cutout: undefined });
  };

  const resetAuto = () => update({ photo: { zoom: 1, x: 0.5, y: 0.4 }, adjust: { brightness: 1, contrast: 1, saturation: 1, tint: 1 } });

  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-2.5 py-1.5";
  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <label className="block">
      <span className="flex justify-between text-[11px] text-white/50"><span>{label}</span><span className="tabular-nums">{Math.round(value * 100)}%</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-emerald-400" />
    </label>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/")} aria-label="Tillbaka" className="text-white/60 hover:text-white"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold flex-1 cursor-pointer" style={{ fontFamily: "'Oswald', sans-serif" }} onClick={() => setLocation("/")} title="Till startsidan">Hockeykort</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-5 lg:grid-cols-[260px_minmax(0,380px)_minmax(0,1fr)]">
        {/* Spelare */}
        <section className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-white/35" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök spelare" className={`${input} pl-8`} />
          </div>
          <ul className="max-h-48 lg:max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {list.map((p) => (
              <li key={p.id}>
                <button onClick={() => void choosePlayer(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${p.id === playerId ? "bg-emerald-500/15 text-white" : "text-white/75 hover:bg-white/[0.04]"}`}>
                  <span className="flex-1 min-w-0 truncate">{p.name}{p.number ? <span className="text-white/35"> #{p.number}</span> : null}</span>
                  {savedIds.has(p.id) ? (
                    <span title="Har eget kort (spelarens bild överallt)" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">Kort</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-white/35">Hockeykortet är spelarens bild överallt. "Kort" = eget kort med foto (uppdateras automatiskt efter varje godkänd match); övriga har standardkortet i lagets färg.</p>
        </section>

        {/* Förhandsvisning */}
        <section className="space-y-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className={`w-full h-auto rounded-[18px] shadow-2xl ${photo ? "cursor-grab active:cursor-grabbing touch-none" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              aria-label="Förhandsvisning av hockeykortet"
            />
            {loadingPhoto && <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[18px]"><Loader2 className="animate-spin" /></div>}
          </div>
          <p className="text-[10px] text-white/35 text-center">{photo ? "Dra för att flytta fotot, nyp med två fingrar (eller scrolla) för att zooma." : "Ladda upp ett foto för att börja."}</p>
          {loadedInfo && <p className="text-[10px] text-amber-200/80 text-center">{loadedInfo}</p>}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">
              <Upload size={14} /> {photo ? "Byt" : "Foto"}
            </button>
            <button onClick={resetAuto} disabled={!photo} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-sm disabled:opacity-40">
              <Wand2 size={14} /> Auto
            </button>
            <button onClick={() => void runCutout()} disabled={!photo || cutting} title="Ta bort bakgrunden i fotot"
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-sm disabled:opacity-40">
              {cutting ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />} Frilägg
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button onClick={() => void download()} disabled={!!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-sm disabled:opacity-40">
              {busy === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Ladda ned
            </button>
            <button onClick={() => void share()} disabled={!!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-sm disabled:opacity-40">
              {busy === "share" ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Dela
            </button>
            <button onClick={() => void saveToPlayer()} disabled={!playerId || !photo || !!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm disabled:opacity-40"
              title={playerId ? "Spara kortet på spelaren – det blir spelarens bild överallt (ersätter tidigare kort)" : "Välj en spelare först"}>
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Spara
            </button>
          </div>
          {playerId && savedIds.has(playerId) && (
            <button onClick={() => void removeSaved()} className="w-full flex items-center justify-center gap-1.5 text-[11px] text-red-300/70 hover:text-red-300 pt-1">
              <Trash2 size={12} /> Ta bort kortet – återgå till standardkortet
            </button>
          )}
        </section>

        {/* Inställningar */}
        <section className="space-y-4">
          <div className="space-y-2">
            {(["retro", "modern"] as const).map((layout) => (
              <div key={layout}>
                <p className="text-[11px] text-white/50 mb-1.5">{layout === "retro" ? "Retro (matt, klassiskt)" : "Modern (foto över hela kortet)"}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CARD_SKINS.filter((sk) => sk.layout === layout).map((sk) => {
                    const sw = sk.retro ? [sk.retro.panel, sk.retro.stripeB, sk.retro.paper] : sk.frame.slice(0, 3);
                    return (
                      <button key={sk.id} onClick={() => update({ skin: sk.id })}
                        className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs ${settings.skin === sk.id ? "border-white/60 bg-white/10" : "border-white/10 text-white/60"}`}>
                        <span className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0" style={{ background: `linear-gradient(135deg, ${sw.join(",")})` }} />
                        <span className="truncate">{sk.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <label className="block text-[11px] text-white/50">Lagmärke
            <select value={settings.logo ?? "auto"} onChange={(e) => update({ logo: e.target.value, showLogo: undefined })} className={input}>
              <option value="auto" className="text-black">Stilens standard</option>
              {cardLogos().map((l) => <option key={l.id} value={l.id} className="text-black">{l.name}</option>)}
              <option value="none" className="text-black">Inget</option>
            </select>
          </label>

          {photo && (
            <div className="space-y-2">
              <p className="text-[11px] text-white/50">Foto</p>
              {slider("Zoom", settings.photo.zoom, 1, 3, 0.02, (v) => update({ photo: { ...settings.photo, zoom: v } }))}
              {slider("Ljus", settings.adjust.brightness, 0.6, 1.5, 0.01, (v) => update({ adjust: { ...settings.adjust, brightness: v } }))}
              {slider("Kontrast", settings.adjust.contrast, 0.6, 1.6, 0.01, (v) => update({ adjust: { ...settings.adjust, contrast: v } }))}
              {slider("Färgmättnad", settings.adjust.saturation, 0, 1.6, 0.01, (v) => update({ adjust: { ...settings.adjust, saturation: v } }))}
              {mask && (
                <div className="rounded-lg border border-white/10 p-2 space-y-1">
                  {slider("Ersätt bakgrund", settings.cutout?.enabled ? settings.cutout.amount : 0, 0, 1, 0.01, (v) => update({ cutout: { enabled: v > 0, amount: v } }))}
                  <button onClick={removeCutout} className="text-[10px] text-red-300/70 hover:text-red-300">Ta bort friläggningen</button>
                </div>
              )}
              {cutting && <p className="text-[10px] text-white/40">Första gången laddas friläggningen (ca 6 MB), sedan går det fort.</p>}
              {slider("Färgtoning mot kortet", settings.adjust.tint ?? 1, 0, 2.5, 0.01, (v) => update({ adjust: { ...settings.adjust, tint: v } }))}
              <p className="text-[10px] text-white/35">Färgtoningen får fotot att smälta in i kortets färger. Höj om fotot sticker ut, sänk för mer naturliga färger.</p>
            </div>
          )}

          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="text-[11px] text-white/50">Namn<input value={settings.name} onChange={(e) => update({ name: e.target.value })} maxLength={40} className={input} /></label>
            <label className="text-[11px] text-white/50">Nummer<input value={settings.number} onChange={(e) => update({ number: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} inputMode="numeric" className={input} /></label>
            <label className="text-[11px] text-white/50">Position
              <select value={settings.position} onChange={(e) => update({ position: e.target.value })} className={input}>
                {POSITIONS.map((p) => <option key={p} value={p} className="text-black">{p || "– ingen –"}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-white/50">C/A
              <select value={settings.captain} onChange={(e) => update({ captain: e.target.value as CardSettings["captain"] })} className={input}>
                <option value="" className="text-black">–</option><option value="C" className="text-black">C</option><option value="A" className="text-black">A</option>
              </select>
            </label>
          </div>
          <label className="block text-[11px] text-white/50">Rad under namnet (retro)
            <input value={settings.subtitle ?? club().name} onChange={(e) => update({ subtitle: e.target.value })} maxLength={30} placeholder={club().name} className={input} />
          </label>

          <div className="space-y-2">
            <p className="text-[11px] text-white/50">Statistik</p>
            <div className="flex flex-wrap gap-1.5">
              {([["season", "Säsong"], ["playoff", "Slutspel"], ["preseason", "Försäsong"], ["career", "Totalt"], ["form", "Form"], ["custom", "Egen"], ["none", "Ingen"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => update({ statsMode: k, statsTitle: k === "custom" ? settings.statsTitle : defaultStatsTitle(k, stats.data) })}
                  className={`px-3 py-1 rounded-full text-xs border ${settings.statsMode === k ? "bg-white/15 border-white/40" : "border-white/10 text-white/55"}`}>{l}</button>
              ))}
              {features.opponents && (
                <button onClick={() => update({ includeExternal: !settings.includeExternal })} title="Ta med matcher mot andra lag i siffrorna"
                  className={`px-3 py-1 rounded-full text-xs border ${settings.includeExternal ? "bg-sky-500/20 border-sky-400/50 text-sky-100" : "border-white/10 text-white/55"}`}>
                  {settings.includeExternal ? "✓ " : ""}Inkl. externa
                </button>
              )}
            </div>
            {settings.statsMode !== "none" && settings.statsMode !== "form" && (
              <>
                <input value={settings.statsTitle} onChange={(e) => update({ statsTitle: e.target.value })} placeholder="Rubrik (t.ex. Säsong 2026/27)" className={input} />
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }, (_, i) => settings.cells[i] ?? { label: "", value: "" }).map((c, i) => (
                    <div key={i} className="space-y-1">
                      <input value={c.value} placeholder="–" onChange={(e) => {
                        const cells = Array.from({ length: 5 }, (_, k) => settings.cells[k] ?? { label: "", value: "" });
                        cells[i] = { ...cells[i], value: e.target.value.slice(0, 6) };
                        update({ cells: cells.filter((x) => x.label || x.value), statsMode: "custom" });
                      }} className={`${input} text-center px-1`} aria-label={`Värde ${i + 1}`} />
                      <input value={c.label} placeholder="Etikett" onChange={(e) => {
                        const cells = Array.from({ length: 5 }, (_, k) => settings.cells[k] ?? { label: "", value: "" });
                        cells[i] = { ...cells[i], label: e.target.value.slice(0, 7) };
                        update({ cells: cells.filter((x) => x.label || x.value), statsMode: "custom" });
                      }} className={`${input} text-center px-1 text-[11px]`} aria-label={`Etikett ${i + 1}`} />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/35">Säsong, Slutspel, Försäsong och Totalt räknas fram och uppdateras automatiskt. Ändrar du ett värde blir rutan "Egen" och står kvar som du skrev.</p>
              </>
            )}
          </div>
          {!playerId && <p className="text-[11px] text-white/40">Utan vald spelare kan du göra ett eget kort och ladda ned det, men inte spara det.</p>}
          {player && stats.isLoading && <p className="text-[11px] text-white/40 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Hämtar statistik …</p>}
        </section>
      </main>
    </div>
  );
}
