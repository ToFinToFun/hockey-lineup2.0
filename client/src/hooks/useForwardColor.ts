import { useState, useEffect, useMemo } from "react";

export type ForwardColorTheme = "rose" | "cyan" | "lime";

const STORAGE_KEY = "stalstadens-forward-color";

/** All Tailwind class sets and canvas hex values for each forward color theme */
const COLOR_DEFS: Record<ForwardColorTheme, ForwardColors> = {
  rose: {
    name: "Rose",
    // Badge (solid)
    badgeBg: "bg-rose-500 text-rose-950",
    dot: "bg-rose-400",
    // Slot (LW/RW)
    slotBorder: "border-rose-400/40",
    slotBg: "bg-rose-950/20",
    slotLabel: "text-rose-300",
    slotEmpty: "text-rose-400/35",
    slotBadge: "bg-rose-500/20 text-rose-300",
    // TeamPanel section
    sectionHeader: "text-rose-300",
    sectionBorder: "border-rose-400/20",
    sectionBg: "bg-rose-950/10",
    // GroupCard (sub-section)
    groupHeader: "text-rose-400/60",
    groupBorder: "border-rose-400/15",
    groupBg: "bg-rose-950/15",
    // Canvas export (hex/rgba)
    canvasRoleBg: "rgba(251,113,133,0.6)",
    canvasRoleText: "#fda4af",
    canvasSectionLabel: "#fda4af",
    canvasGroupLabel: "rgba(251,113,133,0.6)",
  },
  cyan: {
    name: "Cyan",
    badgeBg: "bg-cyan-500 text-cyan-950",
    dot: "bg-cyan-400",
    slotBorder: "border-cyan-400/40",
    slotBg: "bg-cyan-950/20",
    slotLabel: "text-cyan-300",
    slotEmpty: "text-cyan-400/35",
    slotBadge: "bg-cyan-500/20 text-cyan-300",
    sectionHeader: "text-cyan-300",
    sectionBorder: "border-cyan-400/20",
    sectionBg: "bg-cyan-950/10",
    groupHeader: "text-cyan-400/60",
    groupBorder: "border-cyan-400/15",
    groupBg: "bg-cyan-950/15",
    canvasRoleBg: "rgba(34,211,238,0.6)",
    canvasRoleText: "#67e8f9",
    canvasSectionLabel: "#67e8f9",
    canvasGroupLabel: "rgba(34,211,238,0.6)",
  },
  lime: {
    name: "Lime",
    badgeBg: "bg-lime-500 text-lime-950",
    dot: "bg-lime-400",
    slotBorder: "border-lime-400/40",
    slotBg: "bg-lime-950/20",
    slotLabel: "text-lime-300",
    slotEmpty: "text-lime-400/35",
    slotBadge: "bg-lime-500/20 text-lime-300",
    sectionHeader: "text-lime-300",
    sectionBorder: "border-lime-400/20",
    sectionBg: "bg-lime-950/10",
    groupHeader: "text-lime-400/60",
    groupBorder: "border-lime-400/15",
    groupBg: "bg-lime-950/15",
    canvasRoleBg: "rgba(163,230,53,0.6)",
    canvasRoleText: "#bef264",
    canvasSectionLabel: "#bef264",
    canvasGroupLabel: "rgba(163,230,53,0.6)",
  },
};

export interface ForwardColors {
  name: string;
  badgeBg: string;
  dot: string;
  slotBorder: string;
  slotBg: string;
  slotLabel: string;
  slotEmpty: string;
  slotBadge: string;
  sectionHeader: string;
  sectionBorder: string;
  sectionBg: string;
  groupHeader: string;
  groupBorder: string;
  groupBg: string;
  canvasRoleBg: string;
  canvasRoleText: string;
  canvasSectionLabel: string;
  canvasGroupLabel: string;
}

export const ALL_FORWARD_THEMES: ForwardColorTheme[] = ["rose", "cyan", "lime"];

export function useForwardColor() {
  const [theme, setTheme] = useState<ForwardColorTheme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ForwardColorTheme;
      if (ALL_FORWARD_THEMES.includes(stored)) return stored;
    } catch {}
    return "rose";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const colors = useMemo(() => COLOR_DEFS[theme], [theme]);

  return { theme, setTheme, colors, allThemes: ALL_FORWARD_THEMES, allColors: COLOR_DEFS };
}
