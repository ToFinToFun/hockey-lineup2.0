// Lokalt: läs .env om den finns (i Coolify kommer variablerna från miljön).
try {
  process.loadEnvFile();
} catch {
  /* ingen .env – helt normalt i produktion */
}
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
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
            scriptSrc: ["'self'"],
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
  app.use(express.json({ limit: "2mb" }));
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

  server.listen(port, () => {
    console.log(`Stålstadens v${APP_VERSION} kör på port ${port}`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
