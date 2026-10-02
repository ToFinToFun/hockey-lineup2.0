/**
 * Samtycke innan ett spelarfoto laddas upp: bilden kan synas i appen, på
 * hockeykort och i klubbens inlägg. Frågan ställs vid varje uppladdning.
 */
export const PHOTO_CONSENT_TEXT =
  "Har spelaren godkänt att bilden används i appen, på hockeykort och i klubbens inlägg (t.ex. Instagram och laget.se)?\n\nTryck OK bara om spelaren har sagt ja.";

export function confirmPhotoConsent(playerName?: string): boolean {
  return window.confirm(playerName ? `${playerName}: ${PHOTO_CONSENT_TEXT}` : PHOTO_CONSENT_TEXT);
}
