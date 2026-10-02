/**
 * Efter en deploy finns de gamla kodfilerna (/assets/*-hash.js) inte kvar på
 * servern. En sida som var öppen före deployen får då "Failed to fetch
 * dynamically imported module" när den byter vy. Då laddas sidan om en gång
 * (inte oftare än var 30:e sekund, så att ett riktigt fel inte ger en loop).
 */
const KEY = "chunk_reload_at";

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(msg);
}

/** Laddar om sidan om det inte redan gjorts nyss. Returnerar true om omladdning startades. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* utan sessionStorage: ladda om ändå */
  }
  window.location.reload();
  return true;
}

export function installChunkReload() {
  // Vite skickar den här händelsen när en dynamisk import misslyckas
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
}
