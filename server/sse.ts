import type { Response } from "express";

/**
 * SSE (Server-Sent Events) manager for real-time lineup sync.
 * 
 * Each connected client holds an open HTTP connection.
 * When a lineup change occurs, all clients are notified with the operation details.
 * The sender can be excluded via `excludeClientId` to prevent echo-back.
 */

interface SSEClient {
  id: string;
  res: Response;
  lastSeq: number;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send heartbeat every 15 seconds to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.broadcast(":heartbeat\n\n");
    }, 15_000);
  }

  /**
   * Add a new SSE client connection.
   */
  addClient(id: string, res: Response, lastSeq: number): void {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send initial connection event with the assigned clientId
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id, lastSeq })}\n\n`);

    this.clients.set(id, { id, res, lastSeq });

    // Clean up on disconnect
    res.on("close", () => {
      this.clients.delete(id);
    });
  }

  /**
   * Notify all connected clients about a state change.
   * @param excludeClientId - If provided, this client will NOT receive the event (prevents echo-back).
   */
  notifyStateChange(data: {
    version: number;
    opType: string;
    description: string;
    /** The full state is included so clients can update without a separate fetch */
    state?: any;
  }, excludeClientId?: string): void {
    const payload = JSON.stringify(data);
    const message = `event: stateChange\ndata: ${payload}\n\n`;
    this.broadcast(message, excludeClientId);
  }

  /**
   * Notify all clients about a saved lineups change (add/delete/toggle favorite).
   */
  notifySavedLineupsChange(data: {
    action: "created" | "deleted" | "favoriteToggled";
    shareId?: string;
    id?: number;
  }): void {
    const payload = JSON.stringify(data);
    const message = `event: savedLineupsChange\ndata: ${payload}\n\n`;
    this.broadcast(message);
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast a message to all clients, optionally excluding one.
   */
  private broadcast(message: string, excludeClientId?: string): void {
    const toRemove: string[] = [];
    this.clients.forEach((client, id) => {
      if (excludeClientId && id === excludeClientId) return;
      try {
        client.res.write(message);
      } catch {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => this.clients.delete(id));
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.clients.forEach(client => client.res.end());
    this.clients.clear();
  }
}

// Singleton instance
export const sseManager = new SSEManager();
