import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildFfmpegArgs, clipStart, maxClipSeconds, stillSeconds, totalDuration, VIDEO_TIMING } from "./videoFfmpeg";

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

  it("bild före klippet: längden läggs till (minus en övergång) och klippet börjar senare", () => {
    const t = VIDEO_TIMING;
    expect(totalDuration(10, 3.5)).toBeCloseTo(totalDuration(10) + 3.5 - t.xfade, 3);
    expect(clipStart(3.5)).toBeCloseTo(clipStart() + 3.5 - t.xfade, 3);
    expect(maxClipSeconds(180, 3.5)).toBe(Math.floor(180 - totalDuration(0, 3.5)));
    expect(totalDuration(maxClipSeconds(180, 8), 8)).toBeLessThanOrEqual(180);
  });

  it("bildens längd hålls inom 2–8 s, 0 = ingen bild", () => {
    expect(stillSeconds(undefined)).toBe(0);
    expect(stillSeconds(0)).toBe(0);
    expect(stillSeconds(1)).toBe(2);
    expect(stillSeconds(20)).toBe(8);
    expect(stillSeconds(3.5)).toBe(3.5);
  });

  it("bilden blir en egen ingång och sekvens mellan intro 2 och klippet", () => {
    const fc = buildFfmpegArgs({ ...base, format: "reel", still: "st.png", stillSeconds: 4 });
    expect(fc.filter((a) => a === "-i")).toHaveLength(6);
    const s = fc.join(" ");
    expect(s).toContain("[5:v]");
    expect(s).toContain("[x1][st]xfade");
    expect(s).toContain("[xs][clip]xfade");
    expect(s).toContain(`adelay=${Math.round(clipStart(4) * 1000)}`);
    const noOv = buildFfmpegArgs({ ...base, format: "reel", overlay: null, still: "st.png", stillSeconds: 4 }).join(" ");
    expect(noOv).toContain("[4:v]fps=");
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
    const args2 = buildFfmpegArgs({ format: "reel", clip: f("clip.mp4"), clipDuration: 2, clipHasAudio: false, intro1: f("i1.mp4"), intro2: f("i2.png"), overlay: null, outro: f("o.png"), still: f("st.png"), stillSeconds: 3, output: f("out2.mp4") });
    expect(spawnSync("ffmpeg", args2).status).toBe(0);
    const j2 = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", f("out2.mp4")], { encoding: "utf8" }).stdout);
    expect(j2.streams[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(Number(j2.format.duration)).toBeCloseTo(totalDuration(2, 3), 0);
    // Mitt i bildens sekvens är bilden röd
    const at = (VIDEO_TIMING.intro1 + VIDEO_TIMING.intro2 - 2 * VIDEO_TIMING.xfade + 1.5).toFixed(2);
    const px = spawnSync("ffmpeg", ["-v", "error", "-ss", at, "-i", f("out2.mp4"), "-frames:v", "1", "-vf", "crop=2:2:540:960,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout as Buffer;
    expect(px[0]).toBeGreaterThan(180);
    expect(px[1]).toBeLessThan(80);
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
