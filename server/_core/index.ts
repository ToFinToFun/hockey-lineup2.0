// Lokalt: läs .env om den finns (i Coolify kommer variablerna från miljön).
try {
  process.loadEnvFile();
} catch {
  /* ingen .env – helt normalt i produktion */
}
// Svensk tid för allt som räknas i lokal tid (träningstider, tidsinställda nyheter, säsonger)
process.env.TZ ||= "Europe/Stockholm";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { readSession } from "../auth";
import { getPlayerPhoto } from "../playerPhotos";
import { getCardSource, getCardMask } from "../playerCards";
import { startLiveProfileSchedule } from "../cardProfile";
import { runOneTimeFixes } from "../oneTimeFixes";
import { loadClub } from "../clubConfig";
import { getClubAsset } from "../clubAssets";
import { startAutoNewsSchedule } from "../autoNews";
import { getMediaPhoto } from "../mediaPosts";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sseManager } from "../sse";
import crypto from "crypto";
import { assertRequiredEnv } from "./env";
import { readFileSync } from "fs";
import path from "path";

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")).version;
  } catch {
    return "okänd";
  }
}
const APP_VERSION = readVersion();

async function startServer() {
  assertRequiredEnv();
  const app = express();
  // Bakom Traefik i Coolify: behövs för korrekt klient-IP och säkra cookies.
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Säkerhetsheaders (endast produktion – Vites dev-server behöver inline-skript).
  if (process.env.NODE_ENV === "production") {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            // wasm-unsafe-eval: friläggningsmodellen (WebAssembly) i Hockeykort
            scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            workerSrc: ["'self'"],
            manifestSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );
  }
  app.use(express.json({ limit: "8mb" })); // nyhetsbilden till laget.se skickas som base64
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // SSE endpoint for real-time lineup sync
  app.get("/api/sse/lineup", (req, res) => {
    // Use client-provided clientId so echo prevention works correctly.
    // The client sends the same clientId with saveState mutations.
    const clientId = (req.query.clientId as string) || crypto.randomUUID();
    const lastSeq = parseInt(req.query.lastSeq as string) || 0;
    sseManager.addClient(clientId, res, lastSeq);
    req.on("close", () => {
      // Client cleanup is handled in sseManager.addClient
    });
  });


  // Spelarbild – bara för inloggade (styrelsen/tillfällig länk). Hämtas först när
  // spelarkortet öppnas; ETag gör att webbläsaren återanvänder bilden tills den byts.
  app.get("/api/players/:id/photo", async (req, res) => {
    try {
      const session = await readSession(req);
      if (!session) return res.status(401).end();
      const photo = await getPlayerPhoto(String(req.params.id).slice(0, 64));
      if (!photo) return res.status(404).end();
      const etag = `"${photo.updatedAt.getTime()}"`;
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.type("image/jpeg").send(photo.image);
    } catch {
      res.status(500).end();
    }
  });

  // Hockeykortets originalfoto – bara styrelsen (hockeykorten är en styrelsemodul)
  app.get("/api/players/:id/card-source", async (req, res) => {
    try {
      const session = await readSession(req);
      if (session?.role !== "admin") return res.status(401).end();
      const src = await getCardSource(String(req.params.id).slice(0, 64));
      if (!src) return res.status(404).end();
      const etag = `"${src.updatedAt.getTime()}"`;
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.type("image/jpeg").send(src.image);
    } catch {
      res.status(500).end();
    }
  });

  // Hockeykortets friläggningsmask (gråskala-PNG) – bara styrelsen
  app.get("/api/players/:id/card-mask", async (req, res) => {
    try {
      const session = await readSession(req);
      if (session?.role !== "admin") return res.status(401).end();
      const m = await getCardMask(String(req.params.id).slice(0, 64));
      if (!m) return res.status(404).end();
      const etag = `"m${m.updatedAt.getTime()}"`;
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.type("image/png").send(m.image);
    } catch {
      res.status(500).end();
    }
  });

  // Klubbens uppladdade loggor – öppna för alla (visas på startsidan, delningslänkar, bilder)
  app.get("/api/club/logo/:key", async (req, res) => {
    try {
      const a = await getClubAsset(String(req.params.key).slice(0, 20));
      if (!a) return res.status(404).end();
      const etag = `"c${a.updatedAt.getTime()}"`;
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.type(a.mime).send(a.image);
    } catch {
      res.status(500).end();
    }
  });

  // Media: egen bild i ett sparat inlägg – bara styrelsen
  app.get("/api/media/:id/photo", async (req, res) => {
    try {
      const session = await readSession(req);
      if (session?.role !== "admin") return res.status(401).end();
      const p = await getMediaPhoto(Number(req.params.id));
      if (!p) return res.status(404).end();
      res.setHeader("Cache-Control", "private, no-cache");
      res.type("image/jpeg").send(p.image);
    } catch {
      res.status(500).end();
    }
  });

  // Health check endpoint for Coolify / Docker
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: APP_VERSION, timestamp: Date.now() });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  // Klubbens profil och inställningar innan något ritas eller hämtas från laget.se
  await loadClub().catch((err) => console.error("[klubb] kunde inte läsa inställningarna:", err));

  server.listen(port, () => {
    // Profilkort som följer statistiken: kontroll efter start och sedan var sjätte timme
    // Engångsrättning: återställ lag för spelarna från 29/9 (körs bara en gång)
    void runOneTimeFixes();
    startLiveProfileSchedule();
    // Automatisk nyhet till laget.se (gör bara något om den är påslagen)
    startAutoNewsSchedule();
    console.log(`Stålstadens v${APP_VERSION} kör på port ${port}`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
