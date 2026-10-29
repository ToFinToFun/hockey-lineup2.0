/**
 * Delning av statistik som bild. StatsApp ger perioden ("Säsong 26/27"); varje
 * StatSection får en Dela-knapp när innehållet (t.ex. StatTable) har registrerat
 * vad som ska ritas.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ShareButton, ShareImageModal } from "@/components/stats/ShareImageModal";
import { renderStatsTable, type ShareTableData } from "@/lib/statsImages";
import type { ShareOptions } from "@/components/stats/ShareImageModal";

/** Vald period som text, t.ex. "Säsong 26/27" eller "Vecka 44". */
export const StatsPeriodContext = createContext<string>("");
export const useStatsPeriod = () => useContext(StatsPeriodContext);

type Builder = (opts: ShareOptions) => Promise<HTMLCanvasElement>;
const SectionShareContext = createContext<{ title: string; register: (b: Builder | null) => void } | null>(null);

/** Registrera en tabell för avsnittets Dela-knapp (data hämtas när man trycker). */
export function useShareTable(data: () => Omit<ShareTableData, "title" | "subtitle" | "format"> & { title?: string }, deps: unknown[]) {
  const ctx = useContext(SectionShareContext);
  const period = useStatsPeriod();
  useEffect(() => {
    if (!ctx) return;
    ctx.register(({ format, background }) => {
      const d = data();
      return renderStatsTable({ ...d, title: d.title ?? ctx.title, subtitle: period, format, background });
    });
    return () => ctx.register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, period, ...deps]);
}

/** Registrera en egen bild (t.ex. finalen). */
export function useShareImage(build: Builder | null, deps: unknown[]) {
  const ctx = useContext(SectionShareContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(build);
    return () => ctx.register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Dela-knappen och modalen för ett avsnitt. */
export function useSectionShare(title: string) {
  const builder = useRef<Builder | null>(null);
  const [has, setHas] = useState(false);
  const [open, setOpen] = useState(false);
  const period = useStatsPeriod();
  const register = useCallback((b: Builder | null) => {
    builder.current = b;
    setHas(!!b);
  }, []);
  const value = useRef({ title, register });
  value.current.title = title;
  const Provider = useCallback(({ children }: { children: ReactNode }) => <SectionShareContext.Provider value={value.current}>{children}</SectionShareContext.Provider>, []);
  const button = has ? <ShareButton onClick={() => setOpen(true)} /> : null;
  const modal = open && builder.current ? (
    <ShareImageModal title={title} fileName={slug(`${title}-${period}`) || "statistik"} build={(f) => builder.current!(f)} onClose={() => setOpen(false)} />
  ) : null;
  return { Provider, button, modal };
}

/** Innehåll som inte ska ta över avsnittets Dela-knapp (t.ex. små tabeller i ett kort). */
export function NoShare({ children }: { children: ReactNode }) {
  return <SectionShareContext.Provider value={null}>{children}</SectionShareContext.Provider>;
}

/** Registrerar en tabell utan att rita något (för avsnitt med egen layout). */
export function ShareTable({ data, deps }: { data: () => Omit<ShareTableData, "title" | "subtitle" | "format"> & { title?: string }; deps: unknown[] }) {
  useShareTable(data, deps);
  return null;
}
