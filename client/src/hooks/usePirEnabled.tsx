/**
 * PIR (Player Impact Rating) settings context.
 * Provides granular control over what PIR data is visible.
 * All components can check individual settings without prop-drilling.
 */
import React, { createContext, useContext } from "react";

export interface PirSettings {
  /** Master toggle — PIR system enabled */
  enabled: boolean;
  /** Show PIR rating number on player cards */
  showRating: boolean;
  /** Show trend arrow on player cards */
  showTrend: boolean;
  /** Show team strength in team panel headers */
  showTeamStrength: boolean;
  /** Show predicted match outcome */
  showPrediction: boolean;
  /** Use PIR for auto-balance (always true by default, separate from display) */
  useForBalance: boolean;
}

export const defaultPirSettings: PirSettings = {
  enabled: true,
  showRating: true,
  showTrend: true,
  showTeamStrength: true,
  showPrediction: true,
  useForBalance: true,
};

const PirSettingsContext = createContext<PirSettings>(defaultPirSettings);

export function PirSettingsProvider({ settings, children }: { settings: PirSettings; children: React.ReactNode }) {
  return (
    <PirSettingsContext.Provider value={settings}>
      {children}
    </PirSettingsContext.Provider>
  );
}

/** Get all PIR settings */
export function usePirSettings(): PirSettings {
  return useContext(PirSettingsContext);
}

/** Backward compat: simple boolean check if PIR is enabled */
export function usePirEnabled(): boolean {
  const settings = useContext(PirSettingsContext);
  return settings.enabled;
}

// ─── Sparas per enhet ────────────────────────────────────────────────────────
// Varje användare väljer själv vad som visas; valet sparas i webbläsaren.

const STORAGE_KEY = "stalstadens_pir_settings_v1";

export function loadPirSettings(): PirSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPirSettings, ...(JSON.parse(raw) as Partial<PirSettings>) };
  } catch {
    /* standard */
  }
  return defaultPirSettings;
}

export function savePirSettings(settings: PirSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* fullt lagringsutrymme – valet gäller bara den här sessionen */
  }
}
