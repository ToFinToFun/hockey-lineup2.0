/**
 * Profilbild i spelarkortet. Hämtas först när kortet öppnas (komponenten
 * monteras bara då). Tryck för att ladda upp; bilden förminskas i telefonen till ett stående 3:4-porträtt.
 */
import { useRef, useState } from "react";
import { Camera, Loader2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { processPlayerPhoto } from "@/lib/photoProcess";

export function PlayerPhoto({ playerId, width = 54, editable = true }: { playerId: string; width?: number; editable?: boolean }) {
  const height = Math.round((width * 4) / 3); // stående 3:4
  // version ändras efter uppladdning så att den nya bilden hämtas direkt
  const [version, setVersion] = useState(0);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
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

  const remove = async () => {
    if (!confirm("Ta bort spelarens bild?")) return;
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
        disabled={!editable || busy}
        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        title={editable ? (hasPhoto ? "Byt bild" : "Lägg till bild") : undefined}
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
      {editable && hasPhoto && !busy && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void remove(); }}
          aria-label="Ta bort bild"
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/80 border border-white/20 text-white/70 hover:text-white flex items-center justify-center"
        >
          <X className="w-2.5 h-2.5" />
        </button>
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
