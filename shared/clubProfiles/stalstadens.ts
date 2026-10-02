/**
 * Klubbprofil: Stålstadens Sportförening (Luleå).
 *
 * En profil innehåller klubbens standardvärden. En annan förening får en egen
 * fil här (t.ex. shared/clubProfiles/minklubb.ts) och väljs med miljövariabeln
 * CLUB_PROFILE. Det som ändras under Inställningar → Klubb sparas i databasen
 * och går före profilens värden.
 */
import type { ClubProfile } from "../club";

export const stalstadens: ClubProfile = {
  id: "stalstadens",
  name: "Stålstadens SF",
  shortName: "SSF",
  fullName: "Stålstadens Sportförening",
  hubTitle: "Stålstadens",
  hubSubtitle: "Sportförening",
  logo: "/images/logo-green.png",
  crest: { name: "Städet (est. 2012)", url: "/images/logo-anvil.png" },
  teams: {
    white: { name: "Vita", singular: "Vit", shortName: "VIT", color: "#e2e8f0", accent: "#e2e8f0", logo: "/images/logo-white.png" },
    green: { name: "Gröna", singular: "Grön", shortName: "GRÖ", color: "#56c653", accent: "#34d399", logo: "/images/logo-green.png" },
  },
  // Tisdag Gröna hemma, torsdag Vita hemma
  homeTeamByWeekday: { 2: "green", 4: "white" },
  hashtags: ["#StålstadensSF", "#Gubbhockey"],
  laget: { slug: "Stalstadens" },
  appUrl: "https://app.stalstadens.se",
  fileSlug: "stalstadens",
};
