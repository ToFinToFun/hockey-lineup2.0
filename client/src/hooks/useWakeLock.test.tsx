// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock";

class Sentinel extends EventTarget {
  released = false;
  async release() { this.released = true; this.dispatchEvent(new Event("release")); }
}

describe("useWakeLock", () => {
  let locks: Sentinel[];
  let deny = false;
  beforeEach(() => {
    localStorage.clear();
    locks = [];
    deny = false;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: vi.fn(async () => { if (deny) throw new DOMException("x", "NotAllowedError"); const s = new Sentinel(); locks.push(s); return s; }) },
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("är på som standard och tar tillbaka låset när systemet släppt det", async () => {
    const { result } = renderHook(() => useWakeLock());
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => { await locks[0].release(); }); // appen lämnades
    expect(result.current.status).toBe("waiting");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(locks).toHaveLength(2);
  });

  it("nekat (iPhone utan tryckning) väntar och försöker igen vid tryck", async () => {
    deny = true;
    const { result } = renderHook(() => useWakeLock());
    await waitFor(() => expect(result.current.status).toBe("waiting"));
    deny = false;
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); });
    await waitFor(() => expect(result.current.status).toBe("on"));
  });

  it("av sparas på enheten", async () => {
    const { result, unmount } = renderHook(() => useWakeLock());
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => { result.current.toggle(); });
    expect(result.current.status).toBe("off");
    unmount();
    const again = renderHook(() => useWakeLock());
    expect(again.result.current.status).toBe("off");
  });
});
