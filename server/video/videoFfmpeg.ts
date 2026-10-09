/**
 * Media → Video: bygger ffmpeg-kommandot för en färdig Instagram-video.
 *
 *   [bild] → intro 1 (nedsläppet) → intro 2 (titelkort, valfritt) → [bild] → klippet + overlay → [bild] → outro → [bild]
 *   (bilden från Media ligger på ett av ställena; delarna och längderna i shared/videoTimeline.ts)
 *
 * Intro 1 (puckflippen) är ett färdigt klipp från servern (videoIntro.ts). Intro 2,
 * overlay och outro ritas som PNG i webbläsaren med samma kod som Media-bilderna;
 * servern sätter bara ihop dem med klippet. Ren funktion –
 * inga filer läses här, så den kan testas utan ffmpeg.
 */

export type VideoFormat = "reel" | "feed";

/** Reel/Story 9:16, flöde 4:5 (Instagrams största stående format i flödet) */
export const VIDEO_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  reel: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
};

export const VIDEO_FPS = 30;

import { VIDEO_TIMING, stillSeconds, videoTimeline, type StillPosition } from "../../shared/videoTimeline";
export { VIDEO_TIMING, stillSeconds, totalDuration, addedDuration, maxClipSeconds, clipStart } from "../../shared/videoTimeline";

export interface FfmpegInputs {
  format: VideoFormat;
  clip: string;
  /** Klippets längd i sekunder (från ffprobe) */
  clipDuration: number;
  clipHasAudio: boolean;
  /** Intro 1 är ett videoklipp (nedsläppet) */
  intro1: string;
  /** Titelkortet (PNG); null = utan titelkort */
  intro2: string | null;
  /** Overlay ovanpå klippet (PNG med genomskinlighet), valfri */
  overlay: string | null;
  outro: string;
  /** Bild från Media (PNG i videons format), valfri */
  still?: string | null;
  /** Bildens längd i sekunder */
  stillSeconds?: number;
  /** Var bilden ligger (standard först) */
  stillPosition?: StillPosition;
  output: string;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

export function buildFfmpegArgs(i: FfmpegInputs): string[] {
  const { w, h } = VIDEO_SIZES[i.format];
  const t = VIDEO_TIMING;
  const fps = VIDEO_FPS;
  const dur = r(i.clipDuration);
  const still = i.still ? stillSeconds(i.stillSeconds ?? t.still) : 0;
  const tl = videoTimeline(dur, { still, stillPosition: i.stillPosition, intro2: !!i.intro2 });

  // Ingångar: 0 intro 1, 1 klippet, 2 outro, sedan de valfria
  const args = ["-hide_banner", "-y", "-nostdin", "-i", i.intro1, "-i", i.clip, "-i", i.outro];
  let next = 3;
  const add = (file: string) => { args.push("-i", file); return next++; };
  const intro2Idx = i.intro2 ? add(i.intro2) : -1;
  const overlayIdx = i.overlay ? add(i.overlay) : -1;
  const stillIdx = still ? add(i.still!) : -1;

  // Stillbilderna läses en gång och förlängs med tpad (att avkoda PNG:n för varje bildruta är långsamt)
  const hold = (sec: number) => `fps=${fps},tpad=stop_mode=clone:stop_duration=${sec},trim=duration=${sec},setpts=PTS-STARTPTS`;
  const norm = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`;
  const f: string[] = [];
  f.push(`[0:v]trim=duration=${t.intro1},setpts=PTS-STARTPTS,${norm}[i1]`);
  if (intro2Idx >= 0) f.push(`[${intro2Idx}:v]${hold(t.intro2)},${norm}[i2]`);
  if (stillIdx >= 0) f.push(`[${stillIdx}:v]${hold(still)},${norm}[st]`);
  // Klippet: fyller rutan; om formatet inte stämmer fylls kanterna med en suddig kopia
  f.push(`[1:v]trim=duration=${dur},setpts=PTS-STARTPTS,fps=${fps},split[cbg][cfg]`);
  // Suddas i låg upplösning (mycket snabbare) och skalas sedan upp
  const sw = Math.round(w / 8 / 2) * 2, sh = Math.round(h / 8 / 2) * 2;
  f.push(`[cbg]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},boxblur=6:2,eq=brightness=-0.12,scale=${w}:${h}:flags=bilinear[bg]`);
  f.push(`[cfg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg]`);
  f.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[clipbase]`);
  if (overlayIdx >= 0) {
    f.push(`[${overlayIdx}:v]scale=${w}:${h},format=yuva420p,${hold(dur)}[ov]`);
    f.push(`[clipbase][ov]overlay=0:0:format=yuv420:shortest=1,format=yuv420p[clip]`);
  } else {
    f.push(`[clipbase]null[clip]`);
  }
  f.push(`[2:v]${hold(t.outro)},${norm}[out]`);

  // Delarna i ordning med övertoning emellan
  const label = { intro1: "i1", intro2: "i2", still: "st", clip: "clip", outro: "out" } as const;
  let prev: string = label[tl.parts[0].kind];
  tl.parts.slice(1).forEach((p, k) => {
    const out = k === tl.parts.length - 2 ? "vx" : `x${k + 1}`;
    f.push(`[${prev}][${label[p.kind]}]xfade=transition=fade:duration=${t.xfade}:offset=${p.start}[${out}]`);
    prev = out;
  });
  f.push(`[vx]format=yuv420p[v]`);

  // Ljud: tyst utom under klippet (med mjuk in- och uttoning)
  const total = tl.total;
  const startMs = Math.round(tl.clipStart * 1000);
  if (i.clipHasAudio) {
    f.push(`[1:a]atrim=duration=${dur},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=${t.xfade},afade=t=out:st=${r(Math.max(0, dur - t.xfade))}:d=${t.xfade},adelay=${startMs}|${startMs},apad=whole_dur=${total}[a]`);
  } else {
    f.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${total}[a]`);
  }

  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-t", String(total),
    "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart",
    "-threads", "2",
    i.output
  );
  return args;
}
