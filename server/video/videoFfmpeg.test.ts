import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildFfmpegArgs, clipStart, maxClipSeconds, totalDuration, VIDEO_TIMING } from "./videoFfmpeg";

const base = { clip: "c.mp4", clipDuration: 10, clipHasAudio: true, intro1: "i1.png", intro2: "i2.png", overlay: "ov.png", outro: "o.png", output: "out.mp4" };

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

  const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
  it.runIf(hasFfmpeg)("renderar en riktig video med rätt storlek och längd", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vtest-"));
    const f = (n: string) => path.join(dir, n);
    const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status).toBe(0);
    ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2", "-c:v", "libx264", f("clip.mp4"));
    for (const n of ["i1", "i2", "o"]) ff("-f", "lavfi", "-i", "color=c=green:s=1080x1350", "-frames:v", "1", f(`${n}.png`));
    const args = buildFfmpegArgs({ format: "feed", clip: f("clip.mp4"), clipDuration: 2, clipHasAudio: false, intro1: f("i1.png"), intro2: f("i2.png"), overlay: null, outro: f("o.png"), output: f("out.mp4") });
    expect(spawnSync("ffmpeg", args).status).toBe(0);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", f("out.mp4")], { encoding: "utf8" });
    const j = JSON.parse(probe.stdout);
    expect(j.streams[0]).toMatchObject({ width: 1080, height: 1350 });
    expect(Number(j.format.duration)).toBeCloseTo(totalDuration(2), 0);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});
