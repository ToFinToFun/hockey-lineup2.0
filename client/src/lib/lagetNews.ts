/**
 * Nyhet "Dagens lag" till laget.se – rena hjälpfunktioner (ingen canvas här).
 *
 * Bilden är hög: lag A överst, matchbandet i mitten, lag B underst.
 * laget.se beskär höga bilder till mitten i flödet (ca 2:1), så matchbandet
 * ligger alltid exakt i bildens mitt och är lika högt som halva bredden.
 * Båda lagens halvor får samma höjd (det största lagets), så bandet
 * hamnar i mitten oavsett antal spelare.
 */
import { club } from "@shared/club";
import { groupSlots, type Slot } from "@/lib/lineup";
import type { Player } from "@/lib/players";

export type TeamKey = "a" | "b";

// ─── Rubrik och text ─────────────────────────────────────────────────────────

/** "2026-11-23" → "23/11". Faller tillbaka på dagens datum om datumet saknas eller är ogiltigt. */
export function shortDate(isoDate: string | undefined, now: Date = new Date()): string {
  const m = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}`;
  return `${now.getDate()}/${now.getMonth() + 1}`;
}

/** "Lagen 23/11 – Luleå Energi Arena 19:00". Plats och tid tas med om de finns. */
export function formatNewsTitle(opts: { date?: string; location?: string; time?: string; now?: Date }): string {
  const base = `Lagen ${shortDate(opts.date, opts.now)}`;
  const extra = [opts.location?.trim(), opts.time?.trim()].filter(Boolean).join(" ");
  // laget.se tillåter högst 60 tecken i rubriken
  return (extra ? `${base} – ${extra}` : base).slice(0, 60).trimEnd();
}

/**
 * Brödtexten: sponsorraden först (syns under rubriken i flödet), sedan uppställningen.
 * Med bold blir sponsornamnet fett (<b>) – laget.se:s nyhetsformulär tar <b>-taggar.
 */
export function buildNewsBody(sponsor: string | undefined, lineupText: string, bold = false): string {
  const name = sponsor?.trim() ?? "";
  const shown = bold ? `<b>${name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>` : name;
  const sponsorLine = name ? `Dagens matchsponsor: ${shown}` : "";
  return [sponsorLine, lineupText.trim()].filter(Boolean).join("\n\n");
}

/**
 * Standard för hemmalaget utifrån matchdagen enligt klubbens inställning
 * (Stålstadens: tisdag Gröna = lag B, torsdag Vita = lag A), andra dagar slumpas.
 * Går alltid att ändra i rutan.
 */
export function defaultHomeForDate(isoDate: string | undefined, random: () => number = Math.random): TeamKey {
  const m = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const day = new Date(+m[1], +m[2] - 1, +m[3]).getDay(); // 0 = söndag
    const home = club().homeTeamByWeekday[day];
    if (home) return home === "white" ? "a" : "b";
  }
  return random() < 0.5 ? "a" : "b";
}

// ─── Bildlayout (pixlar i bildens egen upplösning) ───────────────────────────

export const NEWS_IMAGE = {
  WIDTH: 1080,
  PAD: 36, // yttre marginal
  PANEL_PAD: 28, // inre marginal i lagpanelen
  HEADER_H: 104, // logga + lagnamn
  COL_GAP: 20,
  SECTION_H: 46, // "Målvakter", "Backar", "Forwards"
  GROUP_H: 34, // "Backpar 1", "1:a kedjan"
  ROW_H: 58,
  ROW_GAP: 8,
  GROUP_GAP: 14,
  SECTION_GAP: 18,
  BAND_GAP: 28, // luft mellan lagpanel och matchband
} as const;

/** Matchbandet är 2:1 – samma form som flödets beskärning. */
export const BAND_H = NEWS_IMAGE.WIDTH / 2;

export interface NewsGroup {
  label?: string; // saknas för målvakter
  slots: Slot[];
}

export interface NewsSection {
  kind: "goalkeeper" | "defense" | "forward";
  title: string;
  groups: NewsGroup[];
}

export interface TeamColumns {
  left: NewsSection[]; // målvakter + backar
  right: NewsSection[]; // forwards
}

/** Plocka ut de platser som har en spelare, grupperade som i delad länk. */
export function teamColumns(slots: Slot[], lineup: Record<string, Player>): TeamColumns {
  const filled = (type: Slot["type"]) => slots.filter((s) => s.type === type && lineup[s.id]);
  const gk = filled("goalkeeper");
  const def = filled("defense");
  const fwd = filled("forward");

  const left: NewsSection[] = [];
  if (gk.length) left.push({ kind: "goalkeeper", title: "Målvakter", groups: [{ slots: gk }] });
  if (def.length) {
    left.push({
      kind: "defense",
      title: "Backar",
      groups: groupSlots(def).map((g) => ({ label: g.groupLabel, slots: g.slots })),
    });
  }
  const right: NewsSection[] = [];
  if (fwd.length) {
    right.push({
      kind: "forward",
      title: "Forwards",
      groups: groupSlots(fwd).map((g) => ({ label: g.groupLabel, slots: g.slots })),
    });
  }
  return { left, right };
}

/** Höjden på en kolumn med sektioner. */
export function columnHeight(sections: NewsSection[]): number {
  const L = NEWS_IMAGE;
  let h = 0;
  sections.forEach((section, si) => {
    if (si > 0) h += L.SECTION_GAP;
    h += L.SECTION_H;
    section.groups.forEach((group, gi) => {
      if (gi > 0) h += L.GROUP_GAP;
      if (group.label) h += L.GROUP_H;
      h += group.slots.length * L.ROW_H + Math.max(0, group.slots.length - 1) * L.ROW_GAP;
    });
  });
  return h;
}

/** Höjden på en lagpanel (rubrik + den högsta kolumnen). */
export function teamPanelHeight(cols: TeamColumns): number {
  const L = NEWS_IMAGE;
  const body = Math.max(columnHeight(cols.left), columnHeight(cols.right));
  return L.PANEL_PAD + L.HEADER_H + (body > 0 ? L.PANEL_PAD + body : 0) + L.PANEL_PAD;
}

export interface NewsLayout {
  width: number;
  height: number;
  /** Lag A: panelen ligger mot bandet (nederkant), tomrummet hamnar överst. */
  panelA: { y: number; h: number };
  band: { y: number; h: number };
  /** Lag B: panelen ligger mot bandet (överkant), tomrummet hamnar underst. */
  panelB: { y: number; h: number };
}

export function computeNewsLayout(heightA: number, heightB: number): NewsLayout {
  const L = NEWS_IMAGE;
  const half = Math.max(heightA, heightB);
  const bandY = L.PAD + half + L.BAND_GAP;
  const height = 2 * (L.PAD + half + L.BAND_GAP) + BAND_H;
  return {
    width: L.WIDTH,
    height,
    panelA: { y: bandY - L.BAND_GAP - heightA, h: heightA },
    band: { y: bandY, h: BAND_H },
    panelB: { y: bandY + BAND_H + L.BAND_GAP, h: heightB },
  };
}

/**
 * Standardtid för publicering: evenemangsdagen kl 21:15. Har den tiden redan
 * passerat (eller saknas evenemang) blir det "direkt" (null).
 */
export function defaultPublishAt(
  eventDate: string | undefined,
  now: Date = new Date(),
  time = { hour: "21", minute: "15" }
): { date: string; hour: string; minute: string } | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const [y, m, d] = eventDate.split("-").map(Number);
  const at = new Date(y, m - 1, d, Number(time.hour), Number(time.minute));
  return at.getTime() > now.getTime() ? { date: eventDate, ...time } : null;
}
