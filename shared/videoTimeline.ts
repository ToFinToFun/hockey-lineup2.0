/**
 * Media → Video: videons delar och längder – samma beräkning i webbläsaren
 * (förhandsvisning, maxlängd) och på servern (ffmpeg).
 *
 *   nedsläppet (intro 1) → titelkortet (intro 2, valfritt) → klippet → outro
 *
 * En bild från Media kan läggas in först, efter introt, efter klippet eller
 * sist. Mellan varje del tonas det över (XFADE), som äter av båda sidor.
 */
import { INTRO_SECONDS } from "./videoIntro";

/** Längder i sekunder */
export const VIDEO_TIMING = {
  intro1: INTRO_SECONDS,
  intro2: 2.8,
  outro: 2.6,
  xfade: 0.4,
  /** Bild från Media: standard och gränser */
  still: 3.5,
  stillMin: 2,
  stillMax: 8,
};

export type StillPosition = "start" | "afterIntro" | "afterClip" | "end";
export const STILL_POSITIONS: Array<{ id: StillPosition; name: string }> = [
  { id: "start", name: "Först" },
  { id: "afterIntro", name: "Efter introt" },
  { id: "afterClip", name: "Efter klippet" },
  { id: "end", name: "Sist" },
];
/** Standard: bilden först i videon */
export const DEFAULT_STILL_POSITION: StillPosition = "start";
export const isStillPosition = (x: unknown): x is StillPosition => STILL_POSITIONS.some((p) => p.id === x);

export type Segment = "intro1" | "intro2" | "still" | "clip" | "outro";

export interface TimelineOpts {
  /** Bildens längd (0/utelämnad = ingen bild) */
  still?: number;
  stillPosition?: StillPosition;
  /** Titelkortet (standard på) */
  intro2?: boolean;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Bildens längd inom gränserna (0 = ingen bild) */
export function stillSeconds(sec: number | null | undefined): number {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return 0;
  return r(Math.min(VIDEO_TIMING.stillMax, Math.max(VIDEO_TIMING.stillMin, sec)));
}

/** Delarna i ordning */
export function videoSegments(opts: TimelineOpts = {}): Segment[] {
  const intro: Segment[] = opts.intro2 === false ? ["intro1"] : ["intro1", "intro2"];
  const segs: Segment[] = [...intro, "clip", "outro"];
  if (!stillSeconds(opts.still)) return segs;
  const pos = opts.stillPosition ?? DEFAULT_STILL_POSITION;
  const at = pos === "start" ? 0 : pos === "afterIntro" ? intro.length : pos === "afterClip" ? intro.length + 1 : segs.length;
  segs.splice(at, 0, "still");
  return segs;
}

/** Varje dels start och längd, klippets start (för ljudet) och hela längden */
export function videoTimeline(clipDuration: number, opts: TimelineOpts = {}) {
  const t = VIDEO_TIMING;
  const len = (s: Segment) => (s === "intro1" ? t.intro1 : s === "intro2" ? t.intro2 : s === "outro" ? t.outro : s === "still" ? stillSeconds(opts.still) : clipDuration);
  let at = 0;
  const parts = videoSegments(opts).map((kind, i) => {
    const start = r(at);
    const duration = r(len(kind));
    at += duration - t.xfade;
    return { kind, start, duration, index: i };
  });
  const last = parts[parts.length - 1];
  return { parts, total: r(last.start + last.duration), clipStart: parts.find((p) => p.kind === "clip")!.start };
}

export function totalDuration(clipDuration: number, opts: TimelineOpts = {}): number {
  return videoTimeline(clipDuration, opts).total;
}

/** Vad intro, ev. titelkort, bild och outro lägger till (övergångarna borträknade) */
export function addedDuration(opts: TimelineOpts = {}): number {
  return totalDuration(0, opts);
}

/** Längsta klippet som ryms när hela videon får vara maxTotal sekunder (hela sekunder nedåt) */
export function maxClipSeconds(maxTotal: number, opts: TimelineOpts = {}): number {
  return Math.floor(maxTotal - addedDuration(opts));
}

/** Var klippet börjar i den färdiga videon (för ljudet) */
export function clipStart(opts: TimelineOpts = {}): number {
  return videoTimeline(0, opts).clipStart;
}
