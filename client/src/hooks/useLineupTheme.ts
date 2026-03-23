import { useState, useEffect } from "react";

export type LineupTheme = "dark" | "light";

const STORAGE_KEY = "stalstadens-lineup-theme";

/**
 * Lineup-specific theme hook.
 * Manages dark/light theme for the Lineup sub-app independently.
 * Returns CSS class overrides and a toggle function.
 */
export function useLineupTheme() {
  const [theme, setTheme] = useState<LineupTheme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {}
    return "dark";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const isDark = theme === "dark";

  // Theme-aware CSS classes for Lineup
  const colors = isDark
    ? {
        // Dark theme (current default)
        bg: "bg-[#0d1a14]",
        bgGradient: "from-[#0d1a14] via-[#0d1a14] to-[#0a1510]",
        text: "text-white",
        textMuted: "text-white/40",
        textSubtle: "text-white/30",
        textLabel: "text-white/35",
        headerTitle: "text-white",
        headerAccent: "text-emerald-400",
        cardBg: "bg-white/5",
        cardBorder: "border-white/10",
        cardHover: "hover:bg-white/10",
        buttonBg: "bg-white/10",
        buttonBorder: "border-white/20",
        buttonText: "text-white/70",
        buttonHover: "hover:bg-white/20 hover:text-white",
        buttonDisabled: "bg-white/5 border-white/10 text-white/20",
        inputBg: "bg-white/5",
        inputBorder: "border-white/15",
        inputText: "text-white",
        overlayBg: "bg-black/60",
        selectBg: "#0d1a14",
      }
    : {
        // Light ice theme
        bg: "bg-[#f0f5f3]",
        bgGradient: "from-[#f0f5f3] via-[#f0f5f3] to-[#e8eeeb]",
        text: "text-gray-900",
        textMuted: "text-gray-500",
        textSubtle: "text-gray-400",
        textLabel: "text-gray-500",
        headerTitle: "text-gray-900",
        headerAccent: "text-emerald-600",
        cardBg: "bg-white",
        cardBorder: "border-gray-200",
        cardHover: "hover:bg-gray-50",
        buttonBg: "bg-gray-100",
        buttonBorder: "border-gray-300",
        buttonText: "text-gray-600",
        buttonHover: "hover:bg-gray-200 hover:text-gray-900",
        buttonDisabled: "bg-gray-50 border-gray-200 text-gray-300",
        inputBg: "bg-white",
        inputBorder: "border-gray-300",
        inputText: "text-gray-900",
        overlayBg: "bg-white/80",
        selectBg: "#f0f5f3",
      };

  return { theme, toggle, isDark, colors };
}
