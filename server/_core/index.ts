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

  // TEMPORARY: Firebase sync endpoint (remove after migration)
  app.post("/api/sync-firebase", async (req, res) => {
    const SYNC_SECRET = "stalstaden-sync-2026";
    if (req.headers["x-sync-secret"] !== SYNC_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const { saveLineupState, createSavedLineup, deleteSavedLineup, getAllSavedLineups } = await import("../lineupDb");
      const { players, lineup, teamAName, teamBName, teamAConfig, teamBConfig, deletedPlayerIds, savedLineups: savedLineupsData } = req.body;

      // 1. Save lineup state
      if (players) {
        const result = await saveLineupState({
          players,
          lineup: lineup || {},
          teamAName: teamAName || "VITA",
          teamBName: teamBName || "GRÖNA",
          teamAConfig: teamAConfig || null,
          teamBConfig: teamBConfig || null,
          deletedPlayerIds: deletedPlayerIds || null,
        }, { opType: "firebaseSync", description: "Synced from Firebase" });
        console.log("[Sync] Lineup state saved, version:", result.version);
      }

      // 2. Delete old test/duplicate saved lineups and re-import
      if (savedLineupsData && savedLineupsData.length > 0) {
        // Delete all existing saved lineups first
        const existing = await getAllSavedLineups();
        for (const sl of existing) {
          await deleteSavedLineup(sl.id);
        }
        console.log(`[Sync] Deleted ${existing.length} existing saved lineups`);

        // Import from Firebase
        for (const sl of savedLineupsData) {
          await createSavedLineup({
            name: sl.name,
            teamAName: sl.teamAName || "VITA",
            teamBName: sl.teamBName || "GRÖNA",
            lineup: sl.lineup || {},
          });
        }
        console.log(`[Sync] Imported ${savedLineupsData.length} saved lineups from Firebase`);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      res.status(500).json({ error: err.message });
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
