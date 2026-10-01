import type { ClubProfile } from "../../shared/club";
/**
 * Anpassar index.html per del av appen så att rätt manifest, ikon och namn
 * finns i HTML:en direkt (krävs för att iPhone ska installera rätt app).
 */
export function isScorePath(url: string): boolean {
  return url === "/score" || url.startsWith("/score/") || url.startsWith("/score?");
}

export function applyAppHead(html: string, url: string): string {
  if (!isScorePath(url)) return html;
  return html
    .replace('href="/manifest.json"', 'href="/score-manifest.json"')
    .replace('href="/apple-touch-icon.png"', 'href="/score-apple-touch-icon.png"')
    .replace('href="/favicon-32.png"', 'href="/score-favicon-32.png"')
    .replace('name="apple-mobile-web-app-title" content="Stålstadens"', 'name="apple-mobile-web-app-title" content="Score"')
    .replace('<meta name="theme-color" content="#0a0a0a" />', '<meta name="theme-color" content="#1a1a1a" />')
    .replace("<title>Stålstadens App</title>", "<title>Stålstadens Score Tracker</title>");
}

/**
 * Klubbens namn i sidans titel och i manifesten (hemskärmsnamn). Filerna i
 * client/public har standardprofilens namn; de byts mot aktuell klubbs namn
 * när de skickas (oförändrat för Stålstadens).
 */
export function applyClubNames(text: string, from: ClubProfile, to: ClubProfile): string {
  if (from === to || (from.name === to.name && from.fullName === to.fullName && from.hubTitle === to.hubTitle)) return text;
  return text
    .split(from.fullName).join(to.fullName)
    .split(from.name).join(to.name)
    .split(from.hubTitle).join(to.hubTitle);
}
