/**
 * Dela statistik som bild: förhandsvisning, 4:5 (flödet) eller 9:16 (Story),
 * dela via telefonens delningsmeny eller ladda ner.
 */
import { useEffect, useState } from "react";
import { Download, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import type { PostFormat } from "@/lib/matchReportImages";
import { MEDIA_BACKGROUNDS, dimFor, type MediaBackground } from "@/lib/mediaImages";
import type { ShareBackground } from "@/lib/statsImages";

export type ShareOptions = { format: PostFormat; background: ShareBackground };

const BG_KEY = "stats_share_bg";
const savedBg = (): MediaBackground => {
  try { return (localStorage.getItem(BG_KEY) as MediaBackground) || "arena"; } catch { return "arena"; }
};

export function ShareImageModal({ title, fileName, build, onClose, backgrounds = true }: {
  title: string;
  fileName: string;
  build: (opts: ShareOptions) => Promise<HTMLCanvasElement>;
  onClose: () => void;
  /** Bakgrundsval (av för bilder med egen bakgrund, t.ex. mästarbilden i guld) */
  backgrounds?: boolean;
}) {
  const [format, setFormat] = useState<PostFormat>("feed");
  const [bgId, setBgId] = useState<MediaBackground>(savedBg);
  const chooseBg = (id: MediaBackground) => {
    setBgId(id);
    try { localStorage.setItem(BG_KEY, id); } catch { /* inte viktigt */ }
  };
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBlob(null);
    const bg = MEDIA_BACKGROUNDS.find((b) => b.id === bgId) ?? MEDIA_BACKGROUNDS[0];
    build({ format, background: { url: bg.url, dim: dimFor(bg.id, 0.72) } })
      .then((c) => new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92)))
      .then((b) => {
        if (!alive || !b) return;
        setBlob(b);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      })
      .catch((e) => toast.error("Bilden kunde inte skapas", { description: (e as Error).message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, bgId]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const file = () => new File([blob!], `${fileName}${format === "story" ? "-story" : ""}.jpg`, { type: "image/jpeg" });
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare && !!blob && navigator.canShare({ files: [file()] });

  const download = () => {
    const a = document.createElement("a");
    a.href = url!;
    a.download = file().name;
    a.click();
    toast.success("Bilden sparad");
  };
  const share = async () => {
    setBusy(true);
    try {
      await navigator.share({ files: [file()] });
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") toast.error("Kunde inte dela", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#161616] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4 max-h-[94dvh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/85 truncate">Dela: {title}</h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 w-fit">
          {([["feed", "Inlägg 4:5"], ["story", "Story 9:16"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFormat(k)} className={`px-3 py-1 rounded-md text-xs font-medium ${format === k ? "bg-[#0a7ea4] text-white" : "text-white/50"}`}>{l}</button>
          ))}
        </div>
        {backgrounds && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Bakgrund">
            {MEDIA_BACKGROUNDS.map((b) => (
              <button key={b.id} onClick={() => chooseBg(b.id)} title={b.name}
                className={`shrink-0 w-12 h-14 rounded-md overflow-hidden border-2 ${bgId === b.id ? "border-sky-400" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <img src={b.url} alt={b.name} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className={`mx-auto rounded-lg overflow-hidden bg-black/40 flex items-center justify-center ${format === "story" ? "w-[62%] aspect-[9/16]" : "w-full aspect-[4/5]"}`}>
          {blob && url ? <img src={url} alt={title} className="w-full h-full object-contain" /> : <Loader2 className="animate-spin text-white/40" />}
        </div>
        <div className="flex gap-2">
          {canShare && (
            <button onClick={share} disabled={busy || !blob} className="flex-1 py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Dela
            </button>
          )}
          <button onClick={download} disabled={!blob} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ${canShare ? "border border-white/15 text-white/80" : "bg-[#0a7ea4] text-white"}`}>
            <Download size={15} /> Ladda ner
          </button>
        </div>
      </div>
    </div>
  );
}

/** Liten knapp "Dela" som öppnar modalen. */
export function ShareButton({ onClick, label = "Dela" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} title="Dela som bild" className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white px-2 py-1 rounded-md border border-white/10 hover:border-white/25">
      <Share2 size={12} /> {label}
    </button>
  );
}
