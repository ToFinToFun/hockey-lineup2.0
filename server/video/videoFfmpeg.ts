/**
 * Media → Video: bygger ffmpeg-kommandot för en färdig Instagram-video.
 *
 *   intro 1 (alltid samma) ─fade→ intro 2 (titelkort) ─fade→ klippet + overlay ─fade→ outro
 *
 * Grafiken (intro 1/2, overlay, outro) ritas som PNG i webbläsaren med samma kod
 * som Media-bilderna; servern sätter bara ihop den med klippet. Ren funktion –
 * inga filer läses här, så den kan testas utan ffmpeg.
 */

export type VideoFormat = "reel" | "feed";

/** Reel/Story 9:16, flöde 4:5 (Instagrams största stående format i flödet) */
export const VIDEO_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  reel: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
};

export const VIDEO_FPS = 30;

/** Längder i sekunder. Övergången (XFADE) äter av båda sidor. */
export const VIDEO_TIMING = {
  intro1: 1.2,
  intro2: 2.8,
  outro: 2.6,
  xfade: 0.4,
};

export interface FfmpegInputs {
  format: VideoFormat;
  clip: string;
  /** Klippets längd i sekunder (från ffprobe) */
  clipDuration: number;
  clipHasAudio: boolean;
  intro1: string;
  intro2: string;
  /** Overlay ovanpå klippet (PNG med genomskinlighet), valfri */
  overlay: string | null;
  outro: string;
  output: string;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Total längd på den färdiga videon */
export function totalDuration(clipDuration: number): number {
  const t = VIDEO_TIMING;
  return r(t.intro1 + t.intro2 + clipDuration + t.outro - 3 * t.xfade);
}

/** Var klippet börjar i den färdiga videon (för ljudet) */
export function clipStart(): number {
  const t = VIDEO_TIMING;
  return r(t.intro1 + t.intro2 - 2 * t.xfade);
}

export function buildFfmpegArgs(i: FfmpegInputs): string[] {
  const { w, h } = VIDEO_SIZES[i.format];
  const t = VIDEO_TIMING;
  const fps = VIDEO_FPS;
  const dur = r(i.clipDuration);

  const args = [
    "-hide_banner", "-y", "-nostdin",
    // Stillbilderna läses en gång och förlängs med tpad (att avkoda PNG:n för varje bildruta är långsamt)
    "-i", i.intro1, // 0
    "-i", i.intro2, // 1
    "-i", i.clip, // 2
    "-i", i.outro, // 3
  ];
  if (i.overlay) args.push("-i", i.overlay); // 4
  const still = (sec: number) => `fps=${fps},tpad=stop_mode=clone:stop_duration=${sec},trim=duration=${sec},setpts=PTS-STARTPTS`;

  const norm = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`;
  const f: string[] = [];
  // Intro 1: zoomar in lätt från 104 % och tonar upp från svart
  f.push(`[0:v]${still(t.intro1)},${norm},scale=iw*1.04:ih*1.04,zoompan=z='max(1.04-0.04*on/${Math.round(t.intro1 * fps)},1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps},fade=t=in:st=0:d=0.25,setsar=1,format=yuv420p[i1]`);
  f.push(`[1:v]${still(t.intro2)},${norm}[i2]`);
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
  const o2 = r(o1 + t.intro2 - t.xfade);
  const o3 = r(o2 + dur - t.xfade);
  f.push(`[i1][i2]xfade=transition=fade:duration=${t.xfade}:offset=${o1}[x1]`);
  f.push(`[x1][clip]xfade=transition=fade:duration=${t.xfade}:offset=${o2}[x2]`);
  f.push(`[x2][out]xfade=transition=fade:duration=${t.xfade}:offset=${o3},format=yuv420p[v]`);

  // Ljud: tyst under intro/outro, klippets ljud mitt i (med mjuk in- och uttoning)
  const total = totalDuration(dur);
  const startMs = Math.round(clipStart() * 1000);
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
