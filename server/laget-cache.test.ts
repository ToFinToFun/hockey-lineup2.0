import { describe, expect, it, vi, beforeEach } from "vitest";

// Test the caching logic in client/src/lib/laget.ts
// We test the pure caching behavior by simulating the module

describe("attendance caching", () => {
  let cachedData: any = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION_MS = 5 * 60 * 1000;

  // Simulates the caching logic from laget.ts
  function shouldUseCachedData(forceRefresh: boolean): boolean {
    const now = Date.now();
    if (!forceRefresh && cachedData && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      return true;
    }
    return false;
  }

  beforeEach(() => {
    cachedData = null;
    cacheTimestamp = 0;
  });

  it("should not use cache when no data is cached", () => {
    expect(shouldUseCachedData(false)).toBe(false);
  });

  it("should use cache when data is fresh (< 5 min)", () => {
    cachedData = { eventTitle: "Träning", registeredNames: [] };
    cacheTimestamp = Date.now(); // just cached
    expect(shouldUseCachedData(false)).toBe(true);
  });

  it("should not use cache when data is stale (> 5 min)", () => {
    cachedData = { eventTitle: "Träning", registeredNames: [] };
    cacheTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
    expect(shouldUseCachedData(false)).toBe(false);
  });

  it("should not use cache when forceRefresh is true", () => {
    cachedData = { eventTitle: "Träning", registeredNames: [] };
    cacheTimestamp = Date.now(); // fresh data
    expect(shouldUseCachedData(true)).toBe(false);
  });

  it("should use cache at exactly 4:59 minutes", () => {
    cachedData = { eventTitle: "Träning", registeredNames: [] };
    cacheTimestamp = Date.now() - (4 * 60 * 1000 + 59 * 1000); // 4:59
    expect(shouldUseCachedData(false)).toBe(true);
  });

  it("should not use cache at exactly 5:01 minutes", () => {
    cachedData = { eventTitle: "Träning", registeredNames: [] };
    cacheTimestamp = Date.now() - (5 * 60 * 1000 + 1000); // 5:01
    expect(shouldUseCachedData(false)).toBe(false);
  });
});
