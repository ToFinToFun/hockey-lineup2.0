/**
 * Stilar för hockeykorten. En ny stil = ett nytt objekt här; ritningen i
 * cardRender.ts läser bara fälten nedan. Färgtoningen (tint) gör att foton med
 * olika ljus och färger ändå ser ut att höra till samma serie.
 */
export interface CardSkin {
  id: string;
  name: string;
  /** Ramens metallkänsla: färger från kant till kant */
  frame: string[];
  /** Tunn linje innanför ramen, etiketter och detaljer */
  accent: string;
  /** Namnskylt och statistikruta */
  panel: string;
  panelText: string;
  /** Färgtoning av fotot: skuggor → högdagrar, och hur mycket (0–1) */
  tint: { shadow: string; highlight: string; strength: number };
  /** Lagloggan i hörnet */
  logo: "white" | "green";
  /** Bakgrund om fotot inte täcker (visas knappt) */
  background: string;
}

export const CARD_SKINS: CardSkin[] = [
  {
    id: "gron",
    name: "Gröna",
    frame: ["#123a13", "#56c653", "#1d4f1b", "#8fe38a", "#123a13"],
    accent: "#8fe38a",
    panel: "rgba(8,26,10,0.9)",
    panelText: "#ffffff",
    tint: { shadow: "#0b2a0e", highlight: "#eafbe8", strength: 0.38 },
    logo: "green",
    background: "#0b1a0c",
  },
  {
    id: "vit",
    name: "Vita",
    frame: ["#9aa4ad", "#ffffff", "#c9d1d8", "#ffffff", "#8a949e"],
    accent: "#e2e8f0",
    panel: "rgba(14,21,30,0.88)",
    panelText: "#ffffff",
    tint: { shadow: "#17212c", highlight: "#ffffff", strength: 0.32 },
    logo: "white",
    background: "#10161d",
  },
  {
    id: "svart",
    name: "Svart",
    frame: ["#0a0a0a", "#3b3b3b", "#111111", "#d4af37", "#0a0a0a"],
    accent: "#d4af37",
    panel: "rgba(6,6,6,0.92)",
    panelText: "#f5e6c8",
    tint: { shadow: "#050505", highlight: "#f3e5c6", strength: 0.5 },
    logo: "white",
    background: "#050505",
  },
];

export const skinById = (id: string | undefined) => CARD_SKINS.find((s) => s.id === id) ?? CARD_SKINS[0];
