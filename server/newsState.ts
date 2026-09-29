/**
 * Senast publicerade nyheten från appen (manuellt eller automatiskt) – används
 * för att uppdatera en tidsinställd nyhet i stället för att skapa en ny.
 */
import { getConfigValue, setConfigValue } from "./scoreDb";

/** Senast publicerade nyheten (JSON: id, url, title, eventDate, publishedAt). */
export const NEWS_LAST_PUBLISHED_KEY = "laget_news_last_published";

export type PublishedNews = { id: number; url: string; title: string; eventDate: string | null; publishedAt: string; publishAt?: string | null };

export async function readLastPublished(): Promise<PublishedNews | null> {
  const raw = await getConfigValue(NEWS_LAST_PUBLISHED_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as PublishedNews; } catch { return null; }
}

export async function writeLastPublished(p: PublishedNews | null) {
  await setConfigValue(NEWS_LAST_PUBLISHED_KEY, p ? JSON.stringify(p) : "");
}
