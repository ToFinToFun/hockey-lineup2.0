/**
 * Ritmiljön på servern (@napi-rs/canvas + klubbens typsnitt och bilder), för
 * hockeykort som profilbild och den automatiska nyheten till laget.se.
 */
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { setCanvasEnv } from "../shared/canvasEnv";
import { getClubAsset } from "./clubAssets";
import { getOpponentLogo } from "./opponents";

type Napi = typeof import("@napi-rs/canvas");
let napi: Napi | null = null;
let ready: Promise<Napi | null> | null = null;

/** Var klientens bilder (loggor) ligger: dist/public i produktion, client/public annars. */
function publicDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const dir of [path.resolve(here, "public"), path.resolve(here, "../dist/public"), path.resolve(here, "../client/public"), path.resolve(process.cwd(), "client/public")]) {
    if (fs.existsSync(path.join(dir, "images"))) return dir;
  }
  return path.resolve(process.cwd(), "client/public");
}

async function init(): Promise<Napi | null> {
  try {
    napi = await import("@napi-rs/canvas");
    const require = createRequire(import.meta.url);
    for (const [pkg, family, weights] of [["@fontsource/oswald", "Oswald", ["500", "600", "700"]], ["@fontsource/inter", "Inter", ["400", "500", "600", "700"]]] as const) {
      const base = path.dirname(require.resolve(`${pkg}/package.json`));
      for (const w of weights) {
        const file = path.join(base, "files", `${pkg.split("/")[1]}-latin-${w}-normal.woff2`);
        if (fs.existsSync(file)) napi.GlobalFonts.registerFromPath(file, family);
      }
    }
    const pub = publicDir();
    setCanvasEnv({
      createCanvas: (w, h) => napi!.createCanvas(w, h) as unknown as HTMLCanvasElement,
      loadImage: async (src) => {
        if (src.startsWith("data:")) return (await napi!.loadImage(Buffer.from(src.split(",")[1] ?? "", "base64"))) as unknown as HTMLImageElement;
        if (src.startsWith("/api/opponents/")) {
          const asset = await getOpponentLogo(Number(src.split("/")[3]));
          if (!asset) throw new Error(`Saknar logga ${src}`);
          return (await napi!.loadImage(asset.image)) as unknown as HTMLImageElement;
        }
        if (src.startsWith("/api/club/logo/")) {
          const asset = await getClubAsset(src.slice("/api/club/logo/".length).split("?")[0]);
          if (!asset) throw new Error(`Saknar logga ${src}`);
          return (await napi!.loadImage(asset.image)) as unknown as HTMLImageElement;
        }
        const file = src.startsWith("/") ? path.join(pub, src) : src;
        return (await napi!.loadImage(file)) as unknown as HTMLImageElement;
      },
    });
    return napi;
  } catch (err) {
    console.error("[serverCanvas] Kan inte rita på servern:", err);
    return null;
  }
}

/** Sätter upp ritmiljön (en gång) och returnerar @napi-rs/canvas, eller null om det inte går. */
export function serverCanvas(): Promise<Napi | null> {
  ready ??= init();
  return ready;
}
