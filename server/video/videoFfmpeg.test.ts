import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildFfmpegArgs, clipStart, maxClipSeconds, stillSeconds, totalDuration, VIDEO_TIMING } from "./videoFfmpeg";
import { videoSegments } from "../../shared/videoTimeline";

const base = { clip: "c.mp4", clipDuration: 10, clipHasAudio: true, intro1: "i1.mp4", intro2: "i2.png", overlay: "ov.png", outro: "o.png", output: "out.mp4" };

describe("videoFfmpeg", () => {
  it("räknar längden: intro 1 + intro 2 + klipp + outro minus tre övergångar", () => {
    const t = VIDEO_TIMING;
    expect(totalDuration(10)).toBeCloseTo(t.intro1 + t.intro2 + 10 + t.outro - 3 * t.xfade, 3);
    expect(clipStart()).toBeCloseTo(t.intro1 + t.intro2 - 2 * t.xfade, 3);
  });

  it("klippets maxlängd lämnar plats för intro och outro inom 180 s", () => {
    const max = maxClipSeconds(180);
    expect(max).toBe(174);
    expect(totalDuration(max)).toBeLessThanOrEqual(180);
  });

  it("Reel är 1080×1920 och flödet 1080×1350", () => {
    expect(buildFfmpegArgs({ ...base, format: "reel" }).join(" ")).toContain("pad=1080:1920");
    expect(buildFfmpegArgs({ ...base, format: "feed" }).join(" ")).toContain("pad=1080:1350");
  });

  it("utan overlay används ingen femte ingång", () => {
    const args = buildFfmpegArgs({ ...base, format: "reel", overlay: null });
    expect(args.filter((a) => a === "-i")).toHaveLength(4);
    expect(args.join(" ")).not.toContain("[4:v]");
  });

  it("klipp utan ljud får ett tyst ljudspår (Instagram vill ha ljud)", () => {
    const fc = buildFfmpegArgs({ ...base, format: "reel", clipHasAudio: false }).join(" ");
    expect(fc).toContain("anullsrc");
    expect(fc).not.toContain("[2:a]");
  });

  it("bilden: längden läggs till (minus en övergång) och klippet börjar senare när den ligger före", () => {
    const t = VIDEO_TIMING;
    expect(totalDuration(10, { still: 3.5 })).toBeCloseTo(totalDuration(10) + 3.5 - t.xfade, 3);
    expect(clipStart({ still: 3.5, stillPosition: "start" })).toBeCloseTo(clipStart() + 3.5 - t.xfade, 3);
    expect(clipStart({ still: 3.5, stillPosition: "afterIntro" })).toBeCloseTo(clipStart() + 3.5 - t.xfade, 3);
    expect(clipStart({ still: 3.5, stillPosition: "afterClip" })).toBeCloseTo(clipStart(), 3);
    expect(clipStart({ still: 3.5, stillPosition: "end" })).toBeCloseTo(clipStart(), 3);
    expect(maxClipSeconds(180, { still: 3.5 })).toBe(Math.floor(180 - totalDuration(0, { still: 3.5 })));
    expect(totalDuration(maxClipSeconds(180, { still: 8 }), { still: 8 })).toBeLessThanOrEqual(180);
  });

  it("bildens placering: standard först, annars efter introt, efter klippet eller sist", () => {
    expect(videoSegments({ still: 3 })).toEqual(["still", "intro1", "intro2", "clip", "outro"]);
    expect(videoSegments({ still: 3, stillPosition: "afterIntro" })).toEqual(["intro1", "intro2", "still", "clip", "outro"]);
    expect(videoSegments({ still: 3, stillPosition: "afterClip" })).toEqual(["intro1", "intro2", "clip", "still", "outro"]);
    expect(videoSegments({ still: 3, stillPosition: "end" })).toEqual(["intro1", "intro2", "clip", "outro", "still"]);
    expect(videoSegments({ still: 3, stillPosition: "afterIntro", intro2: false })).toEqual(["intro1", "still", "clip", "outro"]);
    expect(videoSegments({})).toEqual(["intro1", "intro2", "clip", "outro"]);
  });

  it("utan titelkort blir videon kortare och klippet börjar direkt efter nedsläppet", () => {
    const t = VIDEO_TIMING;
    expect(totalDuration(10, { intro2: false })).toBeCloseTo(totalDuration(10) - t.intro2 + t.xfade, 3);
    expect(clipStart({ intro2: false })).toBeCloseTo(t.intro1 - t.xfade, 3);
    const args = buildFfmpegArgs({ ...base, format: "reel", intro2: null }).join(" ");
    expect(args).not.toContain("[i2]");
    expect(args).toContain("[i1][clip]xfade");
  });

  it("bildens längd hålls inom 2–8 s, 0 = ingen bild", () => {
    expect(stillSeconds(undefined)).toBe(0);
    expect(stillSeconds(0)).toBe(0);
    expect(stillSeconds(1)).toBe(2);
    expect(stillSeconds(20)).toBe(8);
    expect(stillSeconds(3.5)).toBe(3.5);
  });

  it("bilden blir en egen ingång och sekvens på vald plats", () => {
    const first = buildFfmpegArgs({ ...base, format: "reel", still: "st.png", stillSeconds: 4 });
    expect(first.filter((a) => a === "-i")).toHaveLength(6);
    const s = first.join(" ");
    expect(s).toContain("[st][i1]xfade");
    expect(s).toContain(`adelay=${Math.round(clipStart({ still: 4 }) * 1000)}`);
    const after = buildFfmpegArgs({ ...base, format: "reel", still: "st.png", stillSeconds: 4, stillPosition: "afterClip" }).join(" ");
    expect(after).toContain("[x1][clip]xfade=transition=fade:duration=0.4:offset=3.6[x2]");
    expect(after).toContain("[x2][st]xfade");
    const last = buildFfmpegArgs({ ...base, format: "reel", still: "st.png", stillSeconds: 4, stillPosition: "end" }).join(" ");
    expect(last).toMatch(/\[x\d+\]\[st\]xfade/);
  });

  const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
  it.runIf(hasFfmpeg)("renderar en riktig video med rätt storlek och längd", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vtest-"));
    const f = (n: string) => path.join(dir, n);
    const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status).toBe(0);
    ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2", "-c:v", "libx264", f("clip.mp4"));
    ff("-f", "lavfi", "-i", "color=c=black:s=1080x1350:r=30", "-t", "2", "-c:v", "libx264", f("i1.mp4"));
    for (const n of ["i2", "o"]) ff("-f", "lavfi", "-i", "color=c=green:s=1080x1350", "-frames:v", "1", f(`${n}.png`));
    const args = buildFfmpegArgs({ format: "feed", clip: f("clip.mp4"), clipDuration: 2, clipHasAudio: false, intro1: f("i1.mp4"), intro2: f("i2.png"), overlay: null, outro: f("o.png"), output: f("out.mp4") });
    expect(spawnSync("ffmpeg", args).status).toBe(0);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", f("out.mp4")], { encoding: "utf8" });
    const j = JSON.parse(probe.stdout);
    expect(j.streams[0]).toMatchObject({ width: 1080, height: 1350 });
    expect(Number(j.format.duration)).toBeCloseTo(totalDuration(2), 0);
    // Med bild före klippet (Reel)
    ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920", "-frames:v", "1", f("st.png"));
    const args2 = buildFfmpegArgs({ format: "reel", clip: f("clip.mp4"), clipDuration: 2, clipHasAudio: false, intro1: f("i1.mp4"), intro2: f("i2.png"), overlay: null, outro: f("o.png"), still: f("st.png"), stillSeconds: 3, stillPosition: "afterIntro", output: f("out2.mp4") });
    expect(spawnSync("ffmpeg", args2).status).toBe(0);
    const j2 = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", f("out2.mp4")], { encoding: "utf8" }).stdout);
    expect(j2.streams[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(Number(j2.format.duration)).toBeCloseTo(totalDuration(2, { still: 3 }), 0);
    // Mitt i bildens sekvens är bilden röd
    const at = (VIDEO_TIMING.intro1 + VIDEO_TIMING.intro2 - 2 * VIDEO_TIMING.xfade + 1.5).toFixed(2);
    const px = spawnSync("ffmpeg", ["-v", "error", "-ss", at, "-i", f("out2.mp4"), "-frames:v", "1", "-vf", "crop=2:2:540:960,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout as Buffer;
    expect(px[0]).toBeGreaterThan(180);
    expect(px[1]).toBeLessThan(80);
    // Standard: bilden först, utan titelkort
    const args3 = buildFfmpegArgs({ format: "feed", clip: f("clip.mp4"), clipDuration: 2, clipHasAudio: false, intro1: f("i1.mp4"), intro2: null, overlay: null, outro: f("o.png"), still: f("st.png"), stillSeconds: 2, output: f("out3.mp4") });
    expect(spawnSync("ffmpeg", args3).status).toBe(0);
    const j3 = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", f("out3.mp4")], { encoding: "utf8" }).stdout);
    expect(Number(j3.format.duration)).toBeCloseTo(totalDuration(2, { still: 2, intro2: false }), 0);
    const px3 = spawnSync("ffmpeg", ["-v", "error", "-ss", "0.5", "-i", f("out3.mp4"), "-frames:v", "1", "-vf", "crop=2:2:540:675,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout as Buffer;
    expect(px3[0]).toBeGreaterThan(180);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});

import { validCustom } from "./videoIntro";
describe("egna loggor till introt", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  it("godtar PNG/JPEG-data och en färg", () => {
    expect(validCustom({ land: png, other: png, color: "#c8102e" })).not.toBeNull();
  });
  it("avvisar annat", () => {
    expect(validCustom({ land: "/api/x", other: png, color: "#c8102e" })).toBeNull();
    expect(validCustom({ land: png, other: png, color: "red" })).toBeNull();
    expect(validCustom(null)).toBeNull();
  });
});
