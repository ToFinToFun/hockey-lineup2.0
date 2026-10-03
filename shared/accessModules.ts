/**
 * Moduler som kan delas via en länk (Inställningar → Åtkomst). En länk ger
 * tillgång till de valda modulerna utan styrelselösenordet. Borttagningar och
 * inställningar kräver alltid styrelsen. Score Tracker är öppen för alla.
 */
export type AccessModule = "media" | "cards" | "stats" | "players" | "matches" | "report";

export const ACCESS_MODULES: Array<{ id: AccessModule; name: string; hint: string; path: string }> = [
  { id: "media", name: "Media", hint: "Bilder och video till Instagram, hashtaggar", path: "/media" },
  { id: "cards", name: "Hockeykort", hint: "Skapa och spara spelarkort", path: "/cards" },
  { id: "stats", name: "Statistik", hint: "All statistik (bara läsa)", path: "/stats" },
  { id: "players", name: "Spelare", hint: "Spelarregistret – lägga till och ändra (inte slå ihop)", path: "/players" },
  { id: "matches", name: "Matchhistorik", hint: "Alla matcher – granska och ändra (inte ta bort)", path: "/history" },
  { id: "report", name: "Matchrapport (senaste matchen)", hint: "Rapport och bilder för den senast sparade matchen", path: "/rapport" },
];

export const isAccessModule = (x: unknown): x is AccessModule => ACCESS_MODULES.some((m) => m.id === x);
