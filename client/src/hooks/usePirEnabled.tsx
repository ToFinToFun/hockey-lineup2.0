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

const defaultSettings: PirSettings = {
  enabled: false,
  showRating: true,
  showTrend: true,
  showTeamStrength: true,
  showPrediction: true,
  useForBalance: true,
};

const PirSettingsContext = createContext<PirSettings>(defaultSettings);

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
