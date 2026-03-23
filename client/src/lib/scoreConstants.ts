// CDN URLs for images
export const IMAGES = {
  hockeyBackground: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/hockey-background_28b70dc4.jpg",
  teamWhiteLogo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/team-white-logo_4796bd85.png",
  teamGreenLogo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/team-green-logo_0c27fdbe.png",
  sponsorPolar: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/Polar_ec4fb3a1.png",
  sponsorLindstroms: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/lindstromstransport_97331e95.png",
  sponsorKirunabilfrakt: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/Kirunabilfrakt_0aecf52d.png",
  sponsorRen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/Ren_5427bd7a.jpg",
} as const;

// CDN URLs for sounds
export const SOUNDS = {
  slutsignal: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/slutsignal_38c70fd2.mp3",
  goalWhite: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/MålVita_c23702e7.mp3",
  goalGreen: "https://d2xsxph8kpxj0f.cloudfront.net/310519663363408929/PKtRPHEa7fsCMSzHJMpymq/MålGröna_940f09ff.mp3",
} as const;

export const SPONSORS = ["Polar", "lindstromstransport", "Kirunabilfrakt", "Ren"] as const;

export function getSponsorImage(sponsor: string): string {
  switch (sponsor) {
    case "Polar": return IMAGES.sponsorPolar;
    case "lindstromstransport": return IMAGES.sponsorLindstroms;
    case "Kirunabilfrakt": return IMAGES.sponsorKirunabilfrakt;
    case "Ren": return IMAGES.sponsorRen;
    default: return IMAGES.sponsorPolar;
  }
}

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
