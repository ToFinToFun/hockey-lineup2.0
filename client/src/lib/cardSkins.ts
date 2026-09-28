/**
 * Stilar och lagmärken för hockeykorten. En ny stil = ett nytt objekt i
 * CARD_SKINS; ett nytt märke = ett nytt objekt i CARD_LOGOS.
 *
 *  - retro: matt, gammaldags samlarkort (pappersram, diagonala ränder, stjärnor,
 *    namnskylt och statistiktabell) – efter klubbens skisser
 *  - modern: foto över hela kortet med metallram och glans
 */
export interface CardLogo {
  id: string;
  name: string;
  url: string;
  /** diamond = svart bläck på genomskinligt, ritas i en ljus romb; round = rund logga */
  shape: "diamond" | "round";
}

export const CARD_LOGOS: CardLogo[] = [
  { id: "anvil", name: "Städet (est. 2012)", url: "/images/logo-anvil.png", shape: "diamond" },
  { id: "green", name: "Stålstadens grön", url: "/images/logo-green.png", shape: "round" },
  { id: "white", name: "Stålstadens vit", url: "/images/logo-white.png", shape: "round" },
];

export interface RetroColors {
  /** Ramens färg (det mörka fältet) */
  panel: string;
  /** Ränderna: den breda ljusa och den smala färgade */
  stripeA: string;
  stripeB: string;
  /** Papperet (ytterkant, namnskylt, värderad) */
  paper: string;
  /** Text och linjer på papperet */
  ink: string;
  /** Text och stjärnor på ramen */
  onPanel: string;
}

export interface CardSkin {
  id: string;
  name: string;
  layout: "retro" | "modern";
  /** Standardmärke för stilen (kan bytas i kortet) */
  logo: string;
  /** Färgtoning av fotot: skuggor → högdagrar, och hur mycket (0–1) */
  tint: { shadow: string; highlight: string; strength: number };
  /** Retro */
  retro?: RetroColors;
  /** Modern: ramens metallkänsla, detaljer och statistikruta */
  frame: string[];
  accent: string;
  panel: string;
  panelText: string;
  background: string;
}

const PAPER = "#ece3cf";
const INK = "#141414";

export const CARD_SKINS: CardSkin[] = [
  {
    id: "retro-gron", name: "Grön", layout: "retro", logo: "green",
    tint: { shadow: "#10261a", highlight: "#f1e9d6", strength: 0.26 },
    retro: { panel: "#1f5a2b", stripeA: PAPER, stripeB: "#5c9e5f", paper: PAPER, ink: INK, onPanel: PAPER },
    frame: [], accent: PAPER, panel: "", panelText: PAPER, background: "#1f5a2b",
  },
  {
    id: "retro-vit", name: "Vit", layout: "retro", logo: "white",
    tint: { shadow: "#1b1f24", highlight: "#f7f3ea", strength: 0.24 },
    retro: { panel: "#d9dcdf", stripeA: "#ffffff", stripeB: "#8f989f", paper: "#f3efe6", ink: INK, onPanel: INK },
    frame: [], accent: INK, panel: "", panelText: INK, background: "#d9dcdf",
  },
  {
    id: "retro-svart", name: "Svart", layout: "retro", logo: "anvil",
    tint: { shadow: "#0c0c0c", highlight: "#f3eee4", strength: 0.32 },
    retro: { panel: "#161616", stripeA: PAPER, stripeB: "#8a8a8a", paper: PAPER, ink: INK, onPanel: PAPER },
    frame: [], accent: PAPER, panel: "", panelText: PAPER, background: "#161616",
  },
  {
    id: "retro-svartgron", name: "Svart/grön", layout: "retro", logo: "green",
    tint: { shadow: "#0d1a10", highlight: "#f1e9d6", strength: 0.28 },
    retro: { panel: "#161616", stripeA: PAPER, stripeB: "#3f8a4a", paper: PAPER, ink: INK, onPanel: PAPER },
    frame: [], accent: PAPER, panel: "", panelText: PAPER, background: "#161616",
  },
  {
    id: "gron", name: "Grön", layout: "modern", logo: "green",
    frame: ["#123a13", "#56c653", "#1d4f1b", "#8fe38a", "#123a13"],
    accent: "#8fe38a", panel: "rgba(8,26,10,0.9)", panelText: "#ffffff",
    tint: { shadow: "#0b2a0e", highlight: "#eafbe8", strength: 0.38 }, background: "#0b1a0c",
  },
  {
    id: "vit", name: "Vit", layout: "modern", logo: "white",
    frame: ["#9aa4ad", "#ffffff", "#c9d1d8", "#ffffff", "#8a949e"],
    accent: "#e2e8f0", panel: "rgba(14,21,30,0.88)", panelText: "#ffffff",
    tint: { shadow: "#17212c", highlight: "#ffffff", strength: 0.32 }, background: "#10161d",
  },
  {
    // Mest svart med lite vitt (inte guld)
    id: "svart", name: "Svart", layout: "modern", logo: "anvil",
    frame: ["#050505", "#2b2b2b", "#0c0c0c", "#cfcfcf", "#050505"],
    accent: "#e6e6e6", panel: "rgba(6,6,6,0.92)", panelText: "#ffffff",
    tint: { shadow: "#050505", highlight: "#f2f2f2", strength: 0.5 }, background: "#050505",
  },
];

export const skinById = (id: string | undefined) => CARD_SKINS.find((s) => s.id === id) ?? CARD_SKINS[0];
export const logoById = (id: string | undefined) => CARD_LOGOS.find((l) => l.id === id) ?? null;

/** Märket som används: kortets val, "auto" = stilens standard, "none" = inget. */
export function resolveLogo(logo: string | undefined, skin: CardSkin): CardLogo | null {
  if (logo === "none") return null;
  return logoById(!logo || logo === "auto" ? skin.logo : logo);
}
