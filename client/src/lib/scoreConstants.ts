import { teamLogo } from "@shared/club";
// Core artwork is served by this app so Score Tracker, statistics, cards, and
// lineup views all use the same reliable assets in production.
export const IMAGES = {
  hockeyBackground: "/images/background.jpg",
  /** Lagloggor från klubbens inställningar (teamLogo i @shared/club) */
  get teamWhiteLogo() { return teamLogo("white"); },
  get teamGreenLogo() { return teamLogo("green"); },
} as const;

// Goal event type
// ORDNING: goalHistory sparas och skickas alltid med SENASTE målet först (index 0),
// precis som Score Tracker visar det under matchen. Vyer som visar matchen i
// efterhand (detaljvy, redigering, matchrapport, statistik) vänder listan så att
// FÖRSTA målet kommer överst – och vänder tillbaka innan de sparar.
export interface GoalEvent {
  team: "white" | "green";
  timestamp: string;
  scorer?: string;
  /** Spelarens fasta ID (spelarregistret) */
  scorerId?: string;
  assist?: string;
  assistId?: string;
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
