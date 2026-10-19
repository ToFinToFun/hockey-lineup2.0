/**
 * Delar av appen som kan ges till en medlem eller via en länk (Inställningar → Åtkomst).
 * Admin har allt. Borttagningar och inställningar kräver alltid Admin. Score Tracker är öppen för alla.
 */
export type AccessModule = "lineup" | "activities" | "score" | "media" | "cards" | "stats" | "players" | "matches" | "report";

export const ACCESS_MODULES: Array<{ id: AccessModule; name: string; hint: string; path: string }> = [
  { id: "lineup", name: "Lineup", hint: "Bygga laguppställningar", path: "/lineup" },
  { id: "activities", name: "Aktiviteter", hint: "Träningar och möten, anmälan, meddelanden", path: "/aktiviteter" },
  { id: "score", name: "Score Tracker", hint: "Föra matcher (när Score Tracker kräver inloggning)", path: "/score" },
  { id: "media", name: "Media", hint: "Bilder och video till Instagram, hashtaggar", path: "/media" },
  { id: "cards", name: "Hockeykort", hint: "Skapa och spara spelarkort", path: "/cards" },
  { id: "stats", name: "Statistik", hint: "All statistik (bara läsa)", path: "/stats" },
  { id: "players", name: "Spelare", hint: "Spelarregistret – lägga till och ändra (inte slå ihop)", path: "/players" },
  { id: "matches", name: "Matchhistorik", hint: "Alla matcher – granska och ändra (inte ta bort)", path: "/history" },
  { id: "report", name: "Matchrapport (senaste matchen)", hint: "Rapport och bilder för den senast sparade matchen", path: "/rapport" },
];

export const isAccessModule = (x: unknown): x is AccessModule => ACCESS_MODULES.some((m) => m.id === x);
