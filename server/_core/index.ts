import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sseManager } from "../sse";
import crypto from "crypto";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // SSE endpoint for real-time lineup sync
  app.get("/api/sse/lineup", (req, res) => {
    const clientId = crypto.randomUUID();
    const lastSeq = parseInt(req.query.lastSeq as string) || 0;
    sseManager.addClient(clientId, res, lastSeq);
    req.on("close", () => {
      // Client cleanup is handled in sseManager.addClient
    });
  });


  // Proxy image endpoint for match report canvas export (avoids CORS tainting)
  app.get("/api/proxy-image", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).send("Missing url parameter");
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        res.status(response.status).send("Failed to fetch image");
        return;
      }
      const contentType = response.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      res.status(500).send("Proxy error");
    }
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
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
