/**
 * Media → Video på servern: uppladdning, kö och städning.
 *
 * - Klippet strömmas direkt till disk (aldrig hela filen i minnet).
 * - Spärrar: VIDEO_MAX_MB (standard 300 MB) och VIDEO_MAX_SECONDS (standard 180 s =
 *   Instagrams maxlängd för Reels). Längden gäller hela videon, så klippet får vara
 *   180 s minus intro och outro.
 * - En rendering i taget, så att VPS:en inte överbelastas.
 * - Allt raderas efter 24 h, och vid start (filerna ligger i containerns /tmp).
 *
 * Bara styrelsen (admin) kommer åt routerna.
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { readSession, hasModule } from "../auth";
import { recordSponsorNews } from "../sponsorsDb";
import { buildFfmpegArgs, maxClipSeconds, totalDuration, type VideoFormat } from "./videoFfmpeg";
import { introClip, validCustom } from "./videoIntro";
import type { IntroSide } from "../../shared/videoIntro";

export const VIDEO_LIMITS = {
  maxBytes: Number(process.env.VIDEO_MAX_MB ?? 300) * 1024 * 1024,
  /** Hela videons maxlängd, med intro och outro */
  maxSeconds: Number(process.env.VIDEO_MAX_SECONDS ?? 180),
  /** Klippets maxlängd = hela videons minus intro och outro */
  get maxClipSeconds() {
    return maxClipSeconds(this.maxSeconds);
  },
  /** Hur länge uppladdningar och färdiga filer sparas */
  keepMs: 24 * 60 * 60 * 1000,
  /** Grafiken skickas som PNG i JSON (base64) */
  maxGraphicsJson: "30mb",
};

const DIR = process.env.VIDEO_DIR ?? path.join(os.tmpdir(), "media-video");
const ID_RE = /^[a-f0-9]{24}$/;
const newId = () => crypto.randomBytes(12).toString("hex");
const uploadPath = (id: string) => path.join(DIR, `${id}.upload`);
const jobDir = (id: string) => path.join(DIR, `job-${id}`);
const INTRO_DIR = path.join(DIR, "intro");

type JobStatus = "queued" | "rendering" | "done" | "failed";
interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  format: VideoFormat;
  duration: number;
  progress: number; // 0–1
  error?: string;
  fileName: string;
}
const jobs = new Map<string, Job>();
const queue: Array<() => Promise<void>> = [];
let running = false;

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const s = await readSession(req);
  if (!hasModule(s, "media")) {
    res.status(401).json({ error: "Bara styrelsen kan skapa videor" });
    return false;
  }
  return true;
}

/** Kör ett program och samlar stdout; avvisar vid felkod. */
function run(cmd: string, args: string[], onStderr?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errTail = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      const s = String(d);
      errTail = (errTail + s).slice(-2000);
      onStderr?.(s);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} avslutades med ${code}: ${errTail.trim().split("\n").slice(-3).join(" | ")}`))));
  });
}

export interface ProbeResult { duration: number; hasVideo: boolean; hasAudio: boolean; width: number; height: number }

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]);
  const j = JSON.parse(out) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
  const v = j.streams?.find((s) => s.codec_type === "video");
  return {
    duration: Number(j.format?.duration ?? 0),
    hasVideo: !!v,
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
  };
}

async function cleanup(all = false) {
  try {
    await fsp.mkdir(DIR, { recursive: true });
    const now = Date.now();
    for (const name of await fsp.readdir(DIR)) {
      const p = path.join(DIR, name);
      const st = await fsp.stat(p).catch(() => null);
      if (!st) continue;
      if (all || now - st.mtimeMs > VIDEO_LIMITS.keepMs) await fsp.rm(p, { recursive: true, force: true });
    }
    for (const [id, j] of jobs) if (now - j.createdAt > VIDEO_LIMITS.keepMs) jobs.delete(id);
  } catch (err) {
    console.error("[video] städning misslyckades:", err);
  }
}

async function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  try {
    await next();
  } finally {
    running = false;
    void pump();
  }
}

function writePng(file: string, dataUrl: unknown): Promise<void> {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new Error("Grafiken saknas eller är inte PNG");
  return fsp.writeFile(file, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
}

export function registerVideoRoutes(app: Express) {
  void cleanup(true);
  setInterval(() => void cleanup(), 60 * 60 * 1000).unref();

  // Spärrarna, så att webbläsaren kan stoppa för stora filer innan uppladdningen
  app.get("/api/media/video/limits", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    res.json({ maxBytes: VIDEO_LIMITS.maxBytes, maxSeconds: VIDEO_LIMITS.maxSeconds, maxClipSeconds: VIDEO_LIMITS.maxClipSeconds });
  });

  // 1. Ladda upp klippet (rå kropp, strömmas till disk). Svarar med id och längd.
  app.post("/api/media/video/upload", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const declared = Number(req.headers["content-length"] ?? 0);
    const tooBig = () => `Filen är för stor (max ${Math.round(VIDEO_LIMITS.maxBytes / 1024 / 1024)} MB). Filma i 1080p eller korta klippet.`;
    if (declared > VIDEO_LIMITS.maxBytes) return res.status(413).json({ error: tooBig() });

    await fsp.mkdir(DIR, { recursive: true });
    const id = newId();
    const file = uploadPath(id);
    const out = fs.createWriteStream(file);
    let bytes = 0;
    let aborted = false;
    const fail = async (status: number, error: string) => {
      if (aborted) return;
      aborted = true;
      out.destroy();
      req.unpipe(out);
      req.resume();
      await fsp.rm(file, { force: true });
      if (!res.headersSent) res.status(status).json({ error });
    };
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > VIDEO_LIMITS.maxBytes) void fail(413, tooBig());
    });
    req.on("aborted", () => void fail(400, "Uppladdningen avbröts"));
    out.on("error", () => void fail(500, "Kunde inte spara filen"));
    out.on("finish", async () => {
      if (aborted) return;
      try {
        const p = await probe(file);
        if (!p.hasVideo || !(p.duration > 0)) return void fail(400, "Filen verkar inte vara en video");
        const maxClip = VIDEO_LIMITS.maxClipSeconds;
        if (p.duration > maxClip + 0.5) {
          return void fail(413, `Klippet är ${Math.round(p.duration)} s – max ${maxClip} s (${VIDEO_LIMITS.maxSeconds} s med intro och outro). Korta det i telefonen först.`);
        }
        res.json({ uploadId: id, duration: p.duration, width: p.width, height: p.height, hasAudio: p.hasAudio, bytes });
      } catch (err) {
        console.error("[video] ffprobe:", err);
        void fail(400, "Kunde inte läsa videon");
      }
    });
    req.pipe(out);
  });

  // 2. Starta renderingen: klippets id, vilken sida pucken landar på och grafiken
  //    (intro 2, overlay, outro) som PNG. Svarar med jobb-id.
  app.post("/api/media/video/render", express.json({ limit: VIDEO_LIMITS.maxGraphicsJson }), async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const b = req.body as { uploadId?: string; format?: string; introSide?: string; intro2?: string; overlay?: string | null; outro?: string; fileName?: string; sponsorIds?: number[]; introLogos?: unknown };
    if (!b.uploadId || !ID_RE.test(b.uploadId) || !fs.existsSync(uploadPath(b.uploadId))) return res.status(400).json({ error: "Klippet finns inte längre – ladda upp det igen" });
    const format: VideoFormat = b.format === "feed" ? "feed" : "reel";
    const introSide: IntroSide = b.introSide === "white" ? "white" : "green";
    // Matcher mot andra lag: egna loggor på pucken
    const introCustom = b.introLogos ? validCustom(b.introLogos) : null;
    if (b.introLogos && !introCustom) return res.status(400).json({ error: "Loggorna till introt är ogiltiga" });
    const id = newId();
    const dir = jobDir(id);
    try {
      await fsp.mkdir(dir, { recursive: true });
      await Promise.all([
        writePng(path.join(dir, "intro2.png"), b.intro2),
        writePng(path.join(dir, "outro.png"), b.outro),
        b.overlay ? writePng(path.join(dir, "overlay.png"), b.overlay) : Promise.resolve(),
      ]);
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      return res.status(400).json({ error: (err as Error).message });
    }

    const safeName = (b.fileName ?? "video").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "video";
    const job: Job = { id, status: "queued", createdAt: Date.now(), format, duration: 0, progress: 0, fileName: `${safeName}.mp4` };
    jobs.set(id, job);
    const uploadId = b.uploadId;
    const hasOverlay = !!b.overlay;
    // Sponsorerna i intro 2 och outro räknas i mediaräknaren när videon är klar
    const sponsorIds = (Array.isArray(b.sponsorIds) ? b.sponsorIds : []).filter((x) => Number.isInteger(x) && x > 0).slice(0, 2);

    queue.push(async () => {
      job.status = "rendering";
      try {
        const p = await probe(uploadPath(uploadId));
        job.duration = totalDuration(p.duration);
        const args = buildFfmpegArgs({
          format, clip: uploadPath(uploadId), clipDuration: p.duration, clipHasAudio: p.hasAudio,
          intro1: await introClip(INTRO_DIR, format, introSide, introCustom), intro2: path.join(dir, "intro2.png"),
          overlay: hasOverlay ? path.join(dir, "overlay.png") : null,
          outro: path.join(dir, "outro.png"), output: path.join(dir, "out.mp4"),
        });
        await run("ffmpeg", args, (s) => {
          const m = s.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (m && job.duration > 0) job.progress = Math.min(0.99, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / job.duration);
        });
        job.progress = 1;
        job.status = "done";
        for (const sid of sponsorIds) await recordSponsorNews(sid, "media").catch((err) => console.error("[video] sponsorräknare:", err));
      } catch (err) {
        console.error("[video] rendering misslyckades:", err);
        job.status = "failed";
        job.error = "Renderingen misslyckades";
      }
    });
    void pump();
    res.json({ jobId: id, position: queue.length });
  });

  // 3. Status (webbläsaren frågar varannan sekund)
  app.get("/api/media/video/jobs/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const job = jobs.get(String(req.params.id));
    if (!job) return res.status(404).json({ error: "Jobbet finns inte (videor sparas i 24 timmar)" });
    res.json({ status: job.status, progress: job.progress, error: job.error, fileName: job.fileName });
  });

  // 4. Hämta den färdiga filen
  app.get("/api/media/video/jobs/:id/file", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const job = jobs.get(String(req.params.id));
    const file = job ? path.join(jobDir(job.id), "out.mp4") : "";
    if (!job || job.status !== "done" || !fs.existsSync(file)) return res.status(404).end();
    res.setHeader("Cache-Control", "private, no-store");
    if (req.query.download) res.attachment(job.fileName);
    res.type("video/mp4").sendFile(file);
  });
}
