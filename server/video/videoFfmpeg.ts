/**
 * Media → Video: bygger ffmpeg-kommandot för en färdig Instagram-video.
 *
 *   intro 1 (alltid samma) ─fade→ intro 2 (titelkort) ─fade→ [bild från Media] ─fade→ klippet + overlay ─fade→ outro
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

import { INTRO_SECONDS } from "../../shared/videoIntro";

/** Längder i sekunder. Övergången (XFADE) äter av båda sidor. */
export const VIDEO_TIMING = {
  intro1: INTRO_SECONDS,
  intro2: 2.8,
  outro: 2.6,
  xfade: 0.4,
  /** Bild före klippet (från Media): standard och gränser */
  still: 3.5,
  stillMin: 2,
  stillMax: 8,
};

/** Bildens längd inom gränserna (0 = ingen bild) */
export function stillSeconds(sec: number | null | undefined): number {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return 0;
  return r(Math.min(VIDEO_TIMING.stillMax, Math.max(VIDEO_TIMING.stillMin, sec)));
}
/** Vad bilden lägger till (övergången borträknad) */
const stillAdds = (still: number) => (still > 0 ? still - VIDEO_TIMING.xfade : 0);

export interface FfmpegInputs {
  format: VideoFormat;
  clip: string;
  /** Klippets längd i sekunder (från ffprobe) */
  clipDuration: number;
  clipHasAudio: boolean;
  intro1: string;
  intro2: string;
  /** Intro 1 är ett videoklipp (puckflippen) */
  /** Overlay ovanpå klippet (PNG med genomskinlighet), valfri */
  overlay: string | null;
  outro: string;
  /** Bild före klippet (PNG i videons format), valfri */
  still?: string | null;
  /** Bildens längd i sekunder */
  stillSeconds?: number;
  output: string;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Total längd på den färdiga videon */
export function totalDuration(clipDuration: number, still = 0): number {
  const t = VIDEO_TIMING;
  return r(t.intro1 + t.intro2 + clipDuration + t.outro - 3 * t.xfade + stillAdds(still));
}

/** Hur mycket intro, intro 2, ev. bild och outro lägger till (övergångarna borträknade) */
export function addedDuration(still = 0): number {
  return r(totalDuration(0, still));
}

/** Längsta klippet som ryms när hela videon får vara maxTotal sekunder (hela sekunder nedåt) */
export function maxClipSeconds(maxTotal: number, still = 0): number {
  return Math.floor(maxTotal - addedDuration(still));
}

/** Var klippet börjar i den färdiga videon (för ljudet) */
export function clipStart(still = 0): number {
  const t = VIDEO_TIMING;
  return r(t.intro1 + t.intro2 - 2 * t.xfade + stillAdds(still));
}

export function buildFfmpegArgs(i: FfmpegInputs): string[] {
  const { w, h } = VIDEO_SIZES[i.format];
  const t = VIDEO_TIMING;
  const fps = VIDEO_FPS;
  const dur = r(i.clipDuration);

  const args = [
    "-hide_banner", "-y", "-nostdin",
    // Stillbilderna läses en gång och förlängs med tpad (att avkoda PNG:n för varje bildruta är långsamt)
    "-i", i.intro1, // 0 (klipp)
    "-i", i.intro2, // 1
    "-i", i.clip, // 2
    "-i", i.outro, // 3
  ];
  if (i.overlay) args.push("-i", i.overlay); // 4
  const stillSec = i.still ? stillSeconds(i.stillSeconds ?? VIDEO_TIMING.still) : 0;
  const stillIdx = i.overlay ? 5 : 4;
  if (stillSec) args.push("-i", i.still!); // 4 eller 5
  const still = (sec: number) => `fps=${fps},tpad=stop_mode=clone:stop_duration=${sec},trim=duration=${sec},setpts=PTS-STARTPTS`;

  const norm = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`;
  const f: string[] = [];
  f.push(`[0:v]trim=duration=${t.intro1},setpts=PTS-STARTPTS,${norm}[i1]`);
  f.push(`[1:v]${still(t.intro2)},${norm}[i2]`);
  if (stillSec) f.push(`[${stillIdx}:v]${still(stillSec)},${norm}[st]`);
  // Klippet: fyller rutan; om formatet inte stämmer fylls kanterna med en suddig kopia
  f.push(`[2:v]trim=duration=${dur},setpts=PTS-STARTPTS,fps=${fps},split[cbg][cfg]`);
  // Suddas i låg upplösning (mycket snabbare) och skalas sedan upp
  const sw = Math.round(w / 8 / 2) * 2, sh = Math.round(h / 8 / 2) * 2;
  f.push(`[cbg]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},boxblur=6:2,eq=brightness=-0.12,scale=${w}:${h}:flags=bilinear[bg]`);
  f.push(`[cfg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg]`);
  f.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[clipbase]`);
  if (i.overlay) {
    f.push(`[4:v]scale=${w}:${h},format=yuva420p,${still(dur)}[ov]`);
    f.push(`[clipbase][ov]overlay=0:0:format=yuv420:shortest=1,format=yuv420p[clip]`);
  } else {
    f.push(`[clipbase]null[clip]`);
  }
  f.push(`[3:v]${still(t.outro)},${norm}[out]`);

  const o1 = r(t.intro1 - t.xfade);
  f.push(`[i1][i2]xfade=transition=fade:duration=${t.xfade}:offset=${o1}[x1]`);
  let o2 = r(o1 + t.intro2 - t.xfade);
  let before = "x1";
  if (stillSec) {
    f.push(`[x1][st]xfade=transition=fade:duration=${t.xfade}:offset=${o2}[xs]`);
    o2 = r(o2 + stillSec - t.xfade);
    before = "xs";
  }
  const o3 = r(o2 + dur - t.xfade);
  f.push(`[${before}][clip]xfade=transition=fade:duration=${t.xfade}:offset=${o2}[x2]`);
  f.push(`[x2][out]xfade=transition=fade:duration=${t.xfade}:offset=${o3},format=yuv420p[v]`);

  // Ljud: tyst under intro/bild/outro, klippets ljud mitt i (med mjuk in- och uttoning)
  const total = totalDuration(dur, stillSec);
  const startMs = Math.round(clipStart(stillSec) * 1000);
  if (i.clipHasAudio) {
    f.push(`[2:a]atrim=duration=${dur},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=${t.xfade},afade=t=out:st=${r(Math.max(0, dur - t.xfade))}:d=${t.xfade},adelay=${startMs}|${startMs},apad=whole_dur=${total}[a]`);
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
