/**
 * Mustaschkampen – route /mustaschkampen.
 *
 * Medlemmarna laddar upp egna bilder under november (+5 dagar), utan
 * inloggning. Man väljer sig själv i truppen (eller skriver sitt namn); en
 * inloggad medlem som är kopplad till en spelare väljs automatiskt. Bilden
 * skalas ned i telefonen och kodas om på servern (utan metadata). Enheten får
 * en egen hemlig nyckel så att man ser och kan ta bort sina egna bilder.
 * Styrelsen väljer bilderna i Media → Kampanj.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Loader2, Lock, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { resizeToJpeg } from "@/lib/jpegResize";

const DEVICE_KEY = "mustasch-device";
const WHO_KEY = "mustasch-who";

/** Enhetens hemliga nyckel (32 hex-tecken) – skapas första gången */
function deviceKey(): string {
  try {
    const old = localStorage.getItem(DEVICE_KEY);
    if (old && /^[a-f0-9]{32}$/.test(old)) return old;
  } catch { /* privat läge */ }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem(DEVICE_KEY, key); } catch { /* privat läge */ }
  return key;
}

/** Vem man valde förra gången (spelarens id, eller fritt namn) */
type Who = { playerId: string } | { name: string } | null;
function loadWho(): Who {
  try { return JSON.parse(localStorage.getItem(WHO_KEY) ?? "null") as Who; } catch { return null; }
}
function saveWho(w: Who) {
  try { localStorage.setItem(WHO_KEY, JSON.stringify(w)); } catch { /* privat läge */ }
}

const OTHER = "__other__";
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });

export default function MustaschApp() {
  const device = useMemo(deviceKey, []);
  const utils = trpc.useUtils();
  const status = trpc.campaign.status.useQuery({ device }, { staleTime: 30_000 });
  const upload = trpc.campaign.upload.useMutation();
  const delMine = trpc.campaign.deleteMine.useMutation();
  const d = status.data;
  const accent = d?.theme?.accent ?? "#60b8f8";

  // Vem: inloggad medlem → automatiskt; annars förra valet på enheten
  const [choice, setChoice] = useState<string>("");
  const [freeName, setFreeName] = useState("");
  useEffect(() => {
    if (!d) return;
    if (d.me) { setChoice(d.me.id); return; }
    const w = loadWho();
    if (w && "playerId" in w && d.roster.some((p) => p.id === w.playerId)) setChoice(w.playerId);
    else if (w && "name" in w) { setChoice(OTHER); setFreeName(w.name); }
  }, [d?.me?.id, d?.roster.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [file, setFile] = useState<{ base64: string; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (f: File) => {
    setReading(true);
    try {
      // Nedskalad redan i telefonen: snabb uppladdning, servern kodar om igen
      const { base64 } = await resizeToJpeg(f, 1080, 900_000);
      setFile({ base64, url: `data:image/jpeg;base64,${base64}` });
    } catch (e) {
      toast.error("Bilden kunde inte läsas", { description: (e as Error).message });
    } finally {
      setReading(false);
    }
  };

  const player = d?.roster.find((p) => p.id === choice) ?? null;
  const name = choice === OTHER ? freeName.trim() : player?.name ?? "";
  const ready = !!file && !!name && !upload.isPending;

  const send = async () => {
    if (!file || !name) return;
    try {
      await upload.mutateAsync({ device, playerId: player?.id ?? null, name, number: null, imageBase64: file.base64 });
      saveWho(player ? { playerId: player.id } : { name });
      setFile(null);
      toast.success("Tack! Bilden är uppladdad 🥸");
      void utils.campaign.status.invalidate();
    } catch (e) {
      toast.error("Kunde inte ladda upp", { description: (e as Error).message });
    }
  };
  const remove = async (id: number) => {
    if (!confirm("Ta bort bilden?")) return;
    try {
      await delMine.mutateAsync({ device, id });
      void utils.campaign.status.invalidate();
    } catch (e) {
      toast.error("Kunde inte ta bort", { description: (e as Error).message });
    }
  };

  const input = "w-full rounded-xl bg-white/5 border border-white/10 text-white px-3 py-3 text-base";

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/60 hover:text-white" aria-label="Tillbaka"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>{d?.theme?.name ?? "Mustaschkampen"}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-5">
        {status.isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>
        ) : !d?.theme ? (
          <p className="text-white/50 text-sm py-10 text-center">Kampanjen finns inte.</p>
        ) : !d.canUse ? (
          <div className="text-center py-10 space-y-3">
            {d.theme.logo && <img src={d.theme.logo} alt="" className="w-40 mx-auto opacity-60" />}
            <p className="flex items-center justify-center gap-2 text-white/70"><Lock size={16} /> Stängd just nu</p>
            <p className="text-sm text-white/45">Öppnar igen {fmtDate(d.dates.opens)}.</p>
          </div>
        ) : (
          <>
            <section className="text-center space-y-2">
              {d.theme.logo && <img src={d.theme.logo} alt={d.theme.name} className="w-44 mx-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]" />}
              {d.theme.slogan && <p className="text-sm font-bold tracking-wider uppercase" style={{ color: accent, fontFamily: "'Oswald', sans-serif" }}>{d.theme.slogan}</p>}
              <p className="text-sm text-white/65">Ladda upp en bild på din mustasch – gärna flera under månaden så att man ser hur den växer.</p>
              {!d.open && d.board && <p className="text-[11px] text-amber-200/80 bg-amber-300/10 border border-amber-300/25 rounded-lg px-2 py-1">Stängd för andra – öppen {fmtDate(d.dates.opens)}–{fmtDate(d.dates.closes)}. Du ser den som styrelsen.</p>}
            </section>

            <section className="space-y-2">
              <p className="text-xs text-white/50">1. Vem är du?</p>
              {d.me ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm"><Check size={14} className="inline mr-1" style={{ color: accent }} />{d.me.name}{d.me.number ? ` #${d.me.number}` : ""}</p>
              ) : (
                <>
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} className={input} aria-label="Välj dig själv">
                    <option value="" className="text-black">Välj ditt namn …</option>
                    {[...d.roster].sort((a, b) => a.name.localeCompare(b.name, "sv")).map((p) => (
                      <option key={p.id} value={p.id} className="text-black">{p.name}{p.number ? ` #${p.number}` : ""}</option>
                    ))}
                    <option value={OTHER} className="text-black">Jag finns inte i listan</option>
                  </select>
                  {choice === OTHER && <input value={freeName} onChange={(e) => setFreeName(e.target.value)} maxLength={60} placeholder="Ditt namn" className={input} autoComplete="name" />}
                </>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs text-white/50">2. Bilden</p>
              {file ? (
                <div className="relative">
                  <img src={file.url} alt="Vald bild" className="w-full max-h-[60vh] object-contain rounded-xl border border-white/10 bg-black" />
                  <button onClick={() => setFile(null)} className="absolute top-2 right-2 p-2 rounded-full bg-black/70 border border-white/20" aria-label="Byt bild"><X size={16} /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} disabled={reading}
                  className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-white/20 bg-white/[0.03] flex flex-col items-center justify-center gap-2 text-white/70">
                  {reading ? <Loader2 className="animate-spin" /> : <Camera size={32} style={{ color: accent }} />}
                  <span className="text-sm">Ta eller välj en bild</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
            </section>

            <button onClick={() => void send()} disabled={!ready}
              className="w-full py-3.5 rounded-xl font-bold text-base text-black disabled:opacity-35 flex items-center justify-center gap-2" style={{ background: accent }}>
              {upload.isPending ? <Loader2 size={18} className="animate-spin" /> : null} Skicka bilden
            </button>
            <p className="text-[11px] text-white/40 text-center">Bilden kan publiceras i klubbens kanaler. Bidragen raderas automatiskt efter tre månader.</p>

            {d.mine.length > 0 && (
              <section className="space-y-2 pt-2">
                <p className="text-xs text-white/50">Dina bilder från den här telefonen ({d.mine.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {d.mine.map((m) => (
                    <div key={m.id} className="relative">
                      <img src={`/api/campaign/entries/${m.id}/photo?device=${device}`} alt="" className="w-full aspect-square object-cover rounded-lg border border-white/10" loading="lazy" />
                      <span className="absolute left-1 bottom-1 text-[10px] bg-black/70 rounded px-1">{new Date(m.createdAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}</span>
                      <button onClick={() => void remove(m.id)} className="absolute top-1 right-1 p-1.5 rounded-full bg-black/70 text-red-300" aria-label="Ta bort"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
