/**
 * Profilbild i spelarkortet. Hämtas först när kortet öppnas (komponenten
 * monteras bara då). Tryck för att ladda upp; bilden förminskas i telefonen till ett stående 3:4-porträtt.
 */
import { confirmPhotoConsent } from "@/lib/photoConsent";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, UserRound, X, Download, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { processPlayerPhoto } from "@/lib/photoProcess";

export function PlayerPhoto({ playerId, width = 54, editable = true }: { playerId: string; width?: number; editable?: boolean }) {
  const height = Math.round((width * 4) / 3); // stående 3:4
  // version ändras efter uppladdning så att den nya bilden hämtas direkt
  const [version, setVersion] = useState(0);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const setPhoto = trpc.playerPhotos.set.useMutation();
  const deletePhoto = trpc.playerPhotos.delete.useMutation();

  const src = `/api/players/${encodeURIComponent(playerId)}/photo${version ? `?v=${version}` : ""}`;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const imageBase64 = await processPlayerPhoto(file);
      await setPhoto.mutateAsync({ playerId, imageBase64 });
      setHasPhoto(null);
      setVersion(Date.now());
    } catch (e) {
      toast.error("Bilden kunde inte sparas", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const blob = await (await fetch(src)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `spelarbild-${playerId}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      toast.error("Bilden kunde inte laddas ned");
    }
  };

  const remove = async () => {
    if (!confirm("Ta bort spelarens bild?")) return;
    setViewing(false);
    setBusy(true);
    try {
      await deletePhoto.mutateAsync({ playerId });
      setHasPhoto(false);
      setVersion(Date.now());
    } catch (e) {
      toast.error("Bilden kunde inte tas bort", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0" style={{ width, height }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy || (!editable && !hasPhoto)}
        onClick={(e) => {
          e.stopPropagation();
          // Finns en bild: visa den stor. Annars direkt till uppladdning.
          if (hasPhoto) setViewing(true);
          else if (editable && confirmPhotoConsent()) fileRef.current?.click();
        }}
        title={hasPhoto ? "Visa större" : editable ? "Lägg till bild" : undefined}
        className="group w-full h-full rounded-lg overflow-hidden border border-white/10 bg-white/[0.04] flex items-center justify-center"
      >
        {hasPhoto !== false && (
          <img
            key={src}
            src={src}
            alt=""
            className={`w-full h-full object-cover ${hasPhoto ? "" : "hidden"}`}
            onLoad={() => setHasPhoto(true)}
            onError={() => setHasPhoto(false)}
          />
        )}
        {!hasPhoto && !busy && (
          <span className="flex flex-col items-center text-white/25 group-hover:text-white/50">
            <UserRound style={{ width: width * 0.5, height: width * 0.5 }} />
            {editable && hasPhoto === false && <Camera className="w-3 h-3 -mt-0.5" />}
          </span>
        )}
        {busy && <Loader2 className="w-5 h-5 text-white/60 animate-spin absolute" />}
      </button>
      {viewing && hasPhoto && createPortal(
        <div
          data-keep-open
          className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-3"
          onClick={() => setViewing(false)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <img src={src} alt="" className="max-w-[92vw] max-h-[74vh] rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => void download()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-sm">
              <Download className="w-4 h-4" /> Spara
            </button>
            {editable && (
              <button onClick={() => { setViewing(false); if (confirmPhotoConsent()) fileRef.current?.click(); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-sm">
                <Upload className="w-4 h-4" /> Ladda upp ny
              </button>
            )}
            {editable && (
              <button onClick={() => void remove()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/40 text-red-200 text-sm">
                <Trash2 className="w-4 h-4" /> Ta bort
              </button>
            )}
            <button onClick={() => setViewing(false)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white/80 text-sm">
              <X className="w-4 h-4" /> Stäng
            </button>
          </div>
        </div>,
        document.body
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
      />
    </div>
  );
}
