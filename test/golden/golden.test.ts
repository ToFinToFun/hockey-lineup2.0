/**
 * Kontrollbilder (steg 0 i docs/PLAN-lag-och-motstandare.md).
 *
 * Ritar matchrapport, stjärnkort, nyhetsbild, hockeykort (alla stilar) och
 * Media (alla mallar) med fasta data och jämför bildernas fingeravtryck med
 * test/golden/golden.json. Ändras en bild av misstag slår testet larm.
 *
 * Avsiktliga ändringar: kör `UPDATE_GOLDEN=1 pnpm vitest run test/golden` och
 * titta på PNG-filerna i test/golden/out/ innan golden.json checkas in.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const napi = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
const ROOT = path.resolve(__dirname, "../..");
const GOLDEN = path.join(__dirname, "golden.json");
const OUT = path.join(__dirname, "out");
const update = process.env.UPDATE_GOLDEN === "1";

type Canvasish = { toBuffer?: (t: string) => Buffer; getContext: (t: "2d") => { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } }; width: number; height: number };

function fingerprint(c: Canvasish): string {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  return createHash("sha256").update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest("hex").slice(0, 24);
}

const images: Record<string, Canvasish> = {};

beforeAll(async () => {
  const F = path.join(ROOT, "node_modules/@fontsource");
  for (const w of ["500", "600", "700"]) napi.GlobalFonts.registerFromPath(`${F}/oswald/files/oswald-latin-${w}-normal.woff2`, "Oswald");
  for (const w of ["400", "500", "600", "700"]) napi.GlobalFonts.registerFromPath(`${F}/inter/files/inter-latin-${w}-normal.woff2`, "Inter");
  const { setCanvasEnv } = await import("@shared/canvasEnv");
  setCanvasEnv({
    createCanvas: (w, h) => napi.createCanvas(w, h) as unknown as HTMLCanvasElement,
    loadImage: async (src) => (await napi.loadImage(src.startsWith("data:") ? Buffer.from(src.split(",")[1], "base64") : path.join(ROOT, "client/public", src))) as unknown as HTMLImageElement,
  });
  const photo = await napi.loadImage(path.join(ROOT, "client/public/images/background.jpg"));

  // Hockeykort – alla stilar
  const { renderCard, DEFAULT_SETTINGS } = await import("@shared/cardRender");
  const { CARD_SKINS } = await import("@shared/cardSkins");
  const cells = [{ label: "GP", value: "14" }, { label: "G", value: "9" }, { label: "A", value: "12" }, { label: "PTS", value: "21" }, { label: "W%", value: "64%" }];
  for (const skin of CARD_SKINS) {
    images[`kort-${skin.id}`] = (await renderCard({
      settings: { ...DEFAULT_SETTINGS, skin: skin.id, name: "Hampus Bergman Lahti", number: "16", position: "LW", captain: "C", statsMode: "season", statsTitle: "Säsong 2026/27", cells } as never,
      photo: photo as never, scale: 0.4,
    })) as unknown as Canvasish;
  }

  // Matchrapport
  const { renderResultImage, renderGoalsImage } = await import("@/lib/matchReportImages");
  const report = {
    whiteName: "Vita", greenName: "Gröna", whiteScore: 3, greenScore: 2, dateLine: "Tisdag 29/9 · Coop Arena C-Hallen", title: "",
    goals: [
      { team: "white", time: "22:20", minute: 5, scorer: "Johan Hellgren #12", assist: "Henrik Lahti" },
      { team: "green", time: "22:31", minute: 16, scorer: "Niklas Bergström" },
      { team: "white", time: "22:44", minute: 29, scorer: "Mikael Paasovaara", gwg: true },
    ],
    stars: [{ name: "Johan Hellgren #12", stat: "1G 0A 1TP", gwg: false }, { name: "Mikael Paasovaara", stat: "1G 0A 1TP", gwg: true }],
    sponsor: null, logoWhite: "/images/logo-white.png", logoGreen: "/images/logo-green.png", background: "/images/background.jpg",
  };
  images["rapport-resultat"] = (await renderResultImage(report as never)) as unknown as Canvasish;
  images["rapport-mal"] = (await renderGoalsImage(report as never)) as unknown as Canvasish;

  // Stjärnkort (guld)
  const { starCardSettings } = await import("@/lib/starCards");
  const star = starCardSettings({ number: "16" } as never, { key: "a", name: "Jerry Paasovaara", number: "63", team: "white", position: "LW", goals: 2, assists: 1, gwg: true, goalsAgainst: null, score: 1 } as never, 1, "Vita 3–2 Gröna · Tisdag 29/9", true);
  images["stjarnkort"] = (await renderCard({ settings: star, photo: photo as never, scale: 0.4 })) as unknown as Canvasish;

  // Nyhetsbild till laget.se
  const { renderNewsImage } = await import("@/lib/newsImage");
  const { createTeamSlots } = await import("@/lib/lineup");
  const p = (id: string, name: string, number: string) => ({ id, name, number, position: "F" });
  images["nyhet"] = (await renderNewsImage({
    teamA: { name: "VITA", slots: createTeamSlots("team-a"), lineup: { "team-a-gk-1": p("1", "Linus Carbin", "1"), "team-a-fwd-1-c": p("2", "Viktor Lindgren", "29") }, logoUrl: "/images/logo-white.png", accent: "#e2e8f0" },
    teamB: { name: "GRÖNA", slots: createTeamSlots("team-b"), lineup: { "team-b-gk-1": p("3", "Vide Rönnbäck", "30"), "team-b-def-1-1": p("4", "Jimmy Andersson", "84") }, logoUrl: "/images/logo-green.png", accent: "#34d399" },
    home: "green", dateLine: "Tisdag 29/9", placeLine: "Coop Arena C-Hallen 22:15", sponsor: undefined, backgroundUrl: "/images/background.jpg",
  } as never)) as unknown as Canvasish;

  // Media – alla mallar
  const { renderMediaPost } = await import("@/lib/mediaImages");
  const P = (pos: string, name: string, number?: string, captain?: string) => ({ pos, name, number, captain });
  const common = { overlay: "none", background: "arena", dateLine: "Tisdag 29/9", sponsor: null };
  images["media-lag"] = (await renderMediaPost({ ...common, kind: "lineup", team: "white", teamName: "Vita", title: "Dagens lag", groups: [
    { label: "Målvakt", players: [P("MV", "Linus Carbin", "1")] },
    { label: "Backpar 1", players: [P("B", "Ludwig Rydén", "43"), P("B", "Henrik Björling", "81", "A")] },
    { label: "1:a kedjan", players: [P("LW", "Hampus Bergman", "16", "C"), P("C", "Viktor Lindgren", "29"), P("RW", "Teddie Storm")] },
  ] } as never)) as unknown as Canvasish;
  images["media-text"] = (await renderMediaPost({ ...common, kind: "text", overlay: "snow", title: "Anmäl er till julmatchen!", body: "Glögg efteråt.", info: "Torsdag 18/12 · 19:00", photo: null, photoDim: 0.5 } as never)) as unknown as Canvasish;
  images["media-statistik"] = (await renderMediaPost({ ...common, kind: "stats", background: "ute", title: "Poängligan", subtitle: "Säsong 2026/27", valueLabel: "PTS", rows: [
    { rank: "1", name: "Hampus Bergman", sub: "8+6 · 12 matcher", value: "14" }, { rank: "2", name: "Viktor Lindgren", sub: "5+7 · 11 matcher", value: "12" },
  ] } as never)) as unknown as Canvasish;
  images["media-kort"] = (await renderMediaPost({ ...common, kind: "cards", title: "Veckans spelare", subtitle: "Vecka 40", cards: [images["kort-retro-svart"], images["kort-retro-gron"]] } as never)) as unknown as Canvasish;

  // Mot motståndare (steg 6): motståndaren utan logga (färgad cirkel) och med egen färg
  images["rapport-extern"] = (await renderResultImage({ ...report, whiteName: "Stålstadens SF", greenName: "Kalix HC", logoWhite: "/images/logo-green.png", logoGreen: null, colorGreen: "#dc2626", whiteScore: 2, greenScore: 4 } as never)) as unknown as Canvasish;
  images["rapport-mal-extern"] = (await renderGoalsImage({ ...report, whiteName: "Stålstadens SF", greenName: "Kalix HC", logoWhite: "/images/logo-green.png", logoGreen: null, colorGreen: "#dc2626" } as never)) as unknown as Canvasish;
  images["nyhet-extern"] = (await renderNewsImage({
    teamA: { name: "STÅLSTADENS SF", slots: createTeamSlots("team-a"), lineup: { "team-a-gk-1": p("1", "Linus Carbin", "1") }, logoUrl: "/images/logo-green.png", accent: "#e2e8f0" },
    teamB: { name: "KALIX HC", slots: createTeamSlots("team-b"), lineup: { "team-b-gk-1": p("opp-1", "Bertil Berg", "1") }, logoUrl: "", accent: "#dc2626" },
    home: "a", dateLine: "Torsdag 1/10", placeLine: "Coop Arena C-Hallen 20:00", sponsor: undefined, backgroundUrl: "/images/background.jpg",
  } as never)) as unknown as Canvasish;
  images["media-lag-extern"] = (await renderMediaPost({ ...common, kind: "lineup", team: "green", teamName: "Kalix HC", title: "Dagens lag", logo: null, accent: "#dc2626", groups: [
    { label: "Målvakt", players: [P("MV", "Bertil Berg", "1")] },
    { label: "1:a kedjan", players: [P("LW", "Anders Andersson", "9", "C")] },
  ] } as never)) as unknown as Canvasish;
}, 60_000);

describe("kontrollbilder", () => {
  it("ritas exakt som förut", () => {
    const actual = Object.fromEntries(Object.entries(images).map(([k, c]) => [k, fingerprint(c)]));
    if (update || !fs.existsSync(GOLDEN)) {
      fs.mkdirSync(OUT, { recursive: true });
      for (const [k, c] of Object.entries(images)) fs.writeFileSync(path.join(OUT, `${k}.png`), (c as unknown as { toBuffer: (t: string) => Buffer }).toBuffer("image/png"));
      fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
      return;
    }
    const expected = JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as Record<string, string>;
    expect(actual).toEqual(expected);
  });
});
