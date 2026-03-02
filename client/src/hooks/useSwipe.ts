// Hook för att detektera swipe-gester (vänster/höger)
// Använder native DOM event listeners i capture-fasen
// med { capture: true } för att fånga events FÖRE dnd-kit.
//
// Nyckeln: vi lyssnar på touchstart/touchmove/touchend
// och om gesten är en snabb horisontell swipe (< maxDuration, > minDistance)
// anropar vi callback. Vi blockerar INTE events (passive: true)
// så dnd-kit kan fortfarande hantera drag efter sin delay.

import { useRef, useEffect, useCallback } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;    // Minsta horisontella distans (px)
  maxVertical?: number;    // Max vertikal rörelse (px) - om mer, det är scroll
  maxDuration?: number;    // Max tid (ms) för att räknas som swipe
  enabled?: boolean;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  maxVertical = 80,
  maxDuration = 350,
  enabled = true,
}: SwipeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Stabilisera callbacks med refs
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight });
  callbacksRef.current = { onSwipeLeft, onSwipeRight };

  useEffect(() => {
    if (!enabled) return;

    // Lyssna på DOCUMENT-nivå i capture-fasen
    // Detta fångar events innan de når DndContext
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let swipeTriggered = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Kolla om touchen startar inuti vår container
      const el = containerRef.current;
      if (!el) return;
      
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el.contains(target)) return;

      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      tracking = true;
      swipeTriggered = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking || swipeTriggered) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      const elapsed = Date.now() - startTime;

      // Om det gått för lång tid, sluta tracka (det är drag, inte swipe)
      if (elapsed > maxDuration) {
        tracking = false;
        return;
      }

      // Om vertikal rörelse är för stor, det är scroll
      if (deltaY > maxVertical) {
        tracking = false;
        return;
      }

      // Kolla om vi har tillräcklig horisontell rörelse
      if (Math.abs(deltaX) >= minDistance) {
        swipeTriggered = true;
        tracking = false;

        if (deltaX < 0) {
          callbacksRef.current.onSwipeLeft?.();
        } else {
          callbacksRef.current.onSwipeRight?.();
        }
      }
    };

    const handleTouchEnd = () => {
      tracking = false;
    };

    // Capture-fas på document - fångar events FÖRE alla barn
    document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart, { capture: true });
      document.removeEventListener("touchmove", handleTouchMove, { capture: true });
      document.removeEventListener("touchend", handleTouchEnd, { capture: true });
    };
  }, [enabled, minDistance, maxVertical, maxDuration]);

  return containerRef;
}
