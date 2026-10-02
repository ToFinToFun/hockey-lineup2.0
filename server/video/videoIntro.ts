/**
 * Intro 1 (puckflippen) på servern: ritas med @napi-rs/canvas och kodas till ett
 * kort klipp per format och landningssida. Klippet sparas och återanvänds; när
 * en logga eller lagfärg byts blir nyckeln en annan och introt ritas om.
 */
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { serverCanvas } from "../serverCanvas";
import { canvasEnv } from "../../shared/canvasEnv";
import { teamLogo } from "../../shared/club";
import { teamColor } from "../../shared/teams";
import { drawIntroFrame, INTRO_SECONDS, type IntroSide } from "../../shared/videoIntro";
import { VIDEO_FPS, VIDEO_SIZES, type VideoFormat } from "./videoFfmpeg";

const BACKGROUND = "/images/background.jpg";
const pending = new Map<string, Promise<string>>();

function cacheKey(format: VideoFormat, land: IntroSide) {
  const src = JSON.stringify([format, land, teamLogo("green"), teamLogo("white"), teamColor("green"), teamColor("white"), BACKGROUND, INTRO_SECONDS, 1]);
  return crypto.createHash("sha1").update(src).digest("hex").slice(0, 16);
}

async function render(file: string, format: VideoFormat, land: IntroSide) {
  const napi = await serverCanvas();
  if (!napi) throw new Error("Kan inte rita på servern");
  const env = canvasEnv();
  const load = (src: string) => env.loadImage(src).catch(() => null);
  const [background, green, white] = await Promise.all([load(BACKGROUND), load(teamLogo("green")), load(teamLogo("white"))]);
  const assets = { background, logos: { green, white }, colors: { green: teamColor("green"), white: teamColor("white") } };

  const { w, h } = VIDEO_SIZES[format];
  const cnv = napi.createCanvas(w, h);
  const ctx = cnv.getContext("2d") as unknown as CanvasRenderingContext2D;
  const frames = Math.round(INTRO_SECONDS * VIDEO_FPS);
  const tmp = `${file}.tmp.mp4`;

  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner", "-v", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(VIDEO_FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(VIDEO_FPS),
      tmp,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d) => (err = (err + d).slice(-1000)));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (intro): ${err.trim()}`))));
    (async () => {
      for (let i = 0; i < frames; i++) {
        drawIntroFrame(ctx, w, h, i / VIDEO_FPS, land, assets);
        const buf = Buffer.from(ctx.getImageData(0, 0, w, h).data.buffer);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      }
      ff.stdin.end();
    })().catch(reject);
  });
  await fsp.rename(tmp, file);
}

/** Sökväg till ett färdigt intro 1 (ritas första gången det behövs) */
export function introClip(dir: string, format: VideoFormat, land: IntroSide): Promise<string> {
  const file = path.join(dir, `intro-${format}-${land}-${cacheKey(format, land)}.mp4`);
  if (fs.existsSync(file)) return Promise.resolve(file);
  let p = pending.get(file);
  if (!p) {
    p = fsp.mkdir(dir, { recursive: true }).then(() => render(file, format, land)).then(() => file).finally(() => pending.delete(file));
    pending.set(file, p);
  }
  return p;
}
