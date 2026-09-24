// Core artwork is served by this app so Score Tracker, statistics, cards, and
// lineup views all use the same reliable assets in production.
export const IMAGES = {
  hockeyBackground: "/images/background.jpg",
  teamWhiteLogo: "/images/logo-white.png",
  teamGreenLogo: "/images/logo-green.png",
} as const;

export const SPONSORS = ["Polar", "lindstromstransport", "Kirunabilfrakt", "Ren"] as const;

export function getRandomSponsor(): string {
  const idx = Math.floor(Math.random() * SPONSORS.length);
  return SPONSORS[idx];
}

// Goal event type
export interface GoalEvent {
  team: "white" | "green";
  timestamp: string;
  scorer?: string;
  assist?: string;
  other?: string;
  sponsor?: string;
}

// Match state type
export interface MatchState {
  teamWhiteScore: number;
  teamGreenScore: number;
  goalHistory: GoalEvent[];
  matchStartTime?: string;
}

export const STORAGE_KEY = "stalstadens_match_state";

// Color theme matching the native app
export const COLORS = {
  primary: "#0a7ea4",
  background: "#1a1a1a",
  surface: "#2a2a2a",
  foreground: "#ECEDEE",
  muted: "#9BA1A6",
  border: "#3a3a3a",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;
