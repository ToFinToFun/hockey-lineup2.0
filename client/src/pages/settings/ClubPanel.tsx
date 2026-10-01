/**
 * Inställningar → Klubb: klubbens namn, de interna lagen, hallar, hashtags och
 * laget.se-adress. Tomt fält = profilens standardvärde (visas som förslag).
 * Loggor: profilens filer, eller uppladdade (PNG med genomskinlighet går bra).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ClubOverrides } from "@shared/club";

type Form = {
  name: string; shortName: string; fullName: string; hubTitle: string; hubSubtitle: string; appUrl: string;
  hashtags: string; venues: string; lagetSlug: string;
  whiteName: string; whiteShort: string; whiteColor: string;
  greenName: string; greenShort: string; greenColor: string;
};

const toForm = (o: ClubOverrides): Form => ({
  name: o.name ?? "", shortName: o.shortName ?? "", fullName: o.fullName ?? "", hubTitle: o.hubTitle ?? "", hubSubtitle: o.hubSubtitle ?? "", appUrl: o.appUrl ?? "",
  hashtags: (o.hashtags ?? []).join(" "), venues: (o.venues ?? []).join("\n"), lagetSlug: o.laget?.slug ?? "",
  whiteName: o.teams?.white?.name ?? "", whiteShort: o.teams?.white?.shortName ?? "", whiteColor: o.teams?.white?.color ?? "",
  greenName: o.teams?.green?.name ?? "", greenShort: o.teams?.green?.shortName ?? "", greenColor: o.teams?.green?.color ?? "",
});

const toOverrides = (f: Form): ClubOverrides => {
  const t = (v: string) => v.trim() || undefined;
  const list = (v: string, re: RegExp) => v.split(re).map((x) => x.trim()).filter(Boolean);
  return {
    name: t(f.name), shortName: t(f.shortName), fullName: t(f.fullName), hubTitle: t(f.hubTitle), hubSubtitle: t(f.hubSubtitle), appUrl: t(f.appUrl),
    hashtags: list(f.hashtags, /[\s,]+/).map((h) => (h.startsWith("#") ? h : `#${h}`)),
    venues: list(f.venues, /\n|;/),
    laget: { slug: t(f.lagetSlug) },
    teams: {
      white: { name: t(f.whiteName), shortName: t(f.whiteShort), color: t(f.whiteColor) },
      green: { name: t(f.greenName), shortName: t(f.greenShort), color: t(f.greenColor) },
    },
  };
};

/** Läs en bild, förminska till max 512 px och behåll genomskinlighet (PNG). */
export async function prepareLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
    const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1] ?? "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

function LogoRow({ k, label, src, uploaded }: { k: "club" | "white" | "green" | "crest"; label: string; src?: string; uploaded: boolean }) {
  const utils = trpc.useUtils();
  const done = () => { void utils.club.get.invalidate(); void utils.club.logos.invalidate(); };
  const set = trpc.club.setLogo.useMutation({ onSuccess: () => { toast.success(`${label}: ny logga sparad`); done(); }, onError: (e) => toast.error("Kunde inte spara loggan", { description: e.message }) });
  const reset = trpc.club.resetLogo.useMutation({ onSuccess: () => { toast.success(`${label}: profilens logga igen`); done(); } });
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
      <div className="w-10 h-10 rounded-md bg-black/40 flex items-center justify-center shrink-0">
        {src ? <img src={src} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-white/30">–</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80">{label}</p>
        <p className="text-[10px] text-white/35">{uploaded ? "Uppladdad" : "Från klubbprofilen"}</p>
      </div>
      <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] cursor-pointer">
        {set.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Byt
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { set.mutate({ key: k, base64: await prepareLogo(f) }); } catch (err) { toast.error((err as Error).message); }
        }} />
      </label>
      {uploaded && (
        <button onClick={() => reset.mutate({ key: k })} title="Tillbaka till profilens logga" className="p-1.5 rounded-lg text-white/50 hover:text-white"><RotateCcw size={13} /></button>
      )}
    </div>
  );
}

export function ClubPanel() {
  const utils = trpc.useUtils();
  const q = trpc.club.get.useQuery();
  const logos = trpc.club.logos.useQuery();
  const setFeatures = trpc.club.setFeatures.useMutation({ onSuccess: () => void utils.club.get.invalidate() });
  const save = trpc.club.set.useMutation({
    onSuccess: () => { toast.success("Klubbens inställningar sparade"); void utils.club.get.invalidate(); },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const [f, setF] = useState<Form | null>(null);
  useEffect(() => { if (q.data && !f) setF(toForm(q.data.overrides)); }, [q.data, f]);
  if (!q.data || !f) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const c = q.data.club;
  const set = (patch: Partial<Form>) => setF({ ...f, ...patch });
  const dirty = JSON.stringify(toOverrides(f)) !== JSON.stringify(toOverrides(toForm(q.data.overrides)));
  const input = "w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 placeholder:text-white/30";
  const field = (label: string, key: keyof Form, placeholder: string, max = 60) => (
    <label className="block text-[11px] text-white/50">{label}
      <input value={f[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} placeholder={placeholder} maxLength={max} className={input} />
    </label>
  );
  const team = (k: "white" | "green", label: string) => {
    const p = k === "white" ? "white" : "green";
    const name = `${p}Name` as keyof Form, short = `${p}Short` as keyof Form, color = `${p}Color` as keyof Form;
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <img src={c.teams[k].logo} alt="" className="w-7 h-7 object-contain" />
          <p className="text-xs font-semibold text-white/80">{label}</p>
        </div>
        <div className="grid grid-cols-[1fr_5rem_4.5rem] gap-2">
          {field("Namn", name, c.teams[k].name, 20)}
          {field("Kort", short, c.teams[k].shortName, 6)}
          <label className="block text-[11px] text-white/50">Färg
            <input type="color" value={f[color] || c.teams[k].color} onChange={(e) => set({ [color]: e.target.value } as Partial<Form>)} className="w-full h-[38px] rounded-lg bg-white/5 border border-white/10" />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">
        Standardvärdena kommer från klubbprofilen ({c.id}). Tomma fält = standard (visas i grått). Ändringar gäller hela appen och alla bilder.
      </p>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        {field("Klubbens namn (i bilder och kort)", "name", c.name)}
        {field("Kortnamn", "shortName", c.shortName, 10)}
      </div>
      {field("Fullständigt namn", "fullName", c.fullName, 100)}
      <div className="grid grid-cols-2 gap-2">
        {field("Startsidans rubrik", "hubTitle", c.hubTitle, 40)}
        {field("Startsidans underrad", "hubSubtitle", c.hubSubtitle, 40)}
      </div>

      <p className="text-[11px] text-white/50 pt-1">Loggor</p>
      <div className="space-y-1.5">
        <LogoRow k="club" label="Klubbens logga" src={c.logo} uploaded={!!logos.data?.club} />
        <LogoRow k="white" label={`Lag: ${c.teams.white.name}`} src={c.teams.white.logo} uploaded={!!logos.data?.white} />
        <LogoRow k="green" label={`Lag: ${c.teams.green.name}`} src={c.teams.green.logo} uploaded={!!logos.data?.green} />
        <LogoRow k="crest" label="Märke för hockeykorten" src={c.crest?.url} uploaded={!!logos.data?.crest} />
      </div>
      <p className="text-[10px] text-white/35">PNG med genomskinlig bakgrund blir snyggast. Bilden förminskas till max 512 px.</p>

      <p className="text-[11px] text-white/50 pt-1">Interna lag (internmatcher)</p>
      {team("white", "Lag 1")}
      {team("green", "Lag 2")}
      <p className="text-[10px] text-white/35">Lagens namn och färger används överallt i appen och bilderna. Färgen används i matchrapport, Media och nyhetsbilden.</p>

      <label className="block text-[11px] text-white/50">Hallar (en per rad – förslag och tolkning av platsen från laget.se)
        <textarea value={f.venues} onChange={(e) => set({ venues: e.target.value })} rows={3} placeholder={c.venues.join("\n")} className={input} />
      </label>
      <label className="block text-[11px] text-white/50">Standard-hashtags
        <input value={f.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder={c.hashtags.join(" ")} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {field("laget.se-lagets adress", "lagetSlug", c.laget.slug)}
        {field("Appens adress", "appUrl", c.appUrl, 200)}
      </div>
      <p className="text-[10px] text-white/35">laget.se-adressen är det som står efter www.laget.se/ (t.ex. {c.laget.slug}). Inloggningen till laget.se ställs in på servern.</p>

      <label className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/5 p-3 text-xs text-white/75">
        <input type="checkbox" className="mt-0.5" checked={!!q.data.features?.opponents} onChange={(e) => setFeatures.mutate({ opponents: e.target.checked })} />
        <span>
          <span className="block font-semibold text-amber-200">Beta: matcher mot andra lag</span>
          <span className="block text-[11px] text-white/45">Visar fliken Motståndare (lag, loggor och spelare). Uppställning, Score Tracker och bilder mot andra lag kommer i nästa steg.</span>
        </span>
      </label>

      <button onClick={() => save.mutate(toOverrides(f))} disabled={!dirty || save.isPending}
        className="w-full py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
        {save.isPending ? "Sparar…" : dirty ? "Spara" : "Sparat"}
      </button>
    </div>
  );
}
