/**
 * Rita en spelares sparade hockeykort – gemensamt för Media (Spelarkort),
 * utmärkelserna och andra ställen som visar kortet. Med stats fylls
 * statistikrutan med aktuella siffror (annars som det sparades).
 */
import { renderCard, defaultCardFor, DEFAULT_SETTINGS as CARD_DEFAULTS, type CardSettings } from "@shared/cardRender";
import { cellsFor, defaultStatsTitle, type CardStats } from "@shared/cardStats";

export interface SavedCardRef { playerId: string; settings: unknown; updatedAt: string | Date }

const load = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function renderSavedCard(card: SavedCardRef, opts: { scale?: number; stats?: CardStats } = {}): Promise<HTMLCanvasElement> {
  const id = encodeURIComponent(card.playerId);
  const v = new Date(card.updatedAt).getTime();
  const [photo, mask] = await Promise.all([load(`/api/players/${id}/card-source?v=${v}`), load(`/api/players/${id}/card-mask?v=${v}`)]);
  let settings: CardSettings = { ...CARD_DEFAULTS, ...(card.settings as Partial<CardSettings>) };
  const stats = opts.stats;
  if (stats && settings.statsMode !== "custom" && settings.statsMode !== "none") {
    const { cells } = cellsFor(settings.statsMode, stats);
    const ownTitle = settings.statsTitle && !/^(Säsong|Slutspel|Försäsong) \d{4}\/\d{2}$|^Karriär$|^Totalt$|^Form$/.test(settings.statsTitle);
    settings = { ...settings, cells, statsTitle: ownTitle ? settings.statsTitle : defaultStatsTitle(settings.statsMode, stats), form: stats.form };
  }
  return renderCard({ settings, photo, mask, scale: opts.scale ?? 0.9 });
}

export interface CardPlayer { id: string; name: string; number?: string | null; position?: string | null; teamColor?: string | null; captainRole?: string | null }

/**
 * Spelarens hockeykort: det sparade kortet om det finns, annars standardkortet
 * (retrostil i lagets färg, utan foto). Med stats fylls statistikrutan.
 */
export async function renderPlayerCard(player: CardPlayer, card: SavedCardRef | undefined, opts: { scale?: number; stats?: CardStats } = {}): Promise<HTMLCanvasElement> {
  if (card) return renderSavedCard(card, opts);
  let settings: CardSettings = { ...defaultCardFor(player), blankPhoto: true };
  const stats = opts.stats;
  if (stats) {
    const { cells } = cellsFor(settings.statsMode, stats);
    settings = { ...settings, cells, statsTitle: defaultStatsTitle(settings.statsMode, stats), form: stats.form };
  }
  return renderCard({ settings, photo: null, mask: null, scale: opts.scale ?? 0.9 });
}
