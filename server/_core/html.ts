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
