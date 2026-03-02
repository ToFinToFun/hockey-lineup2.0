// Hook för att detektera swipe-gester (vänster/höger)
// Använder native DOM event listeners i capture-fasen
// för att fånga events FÖRE dnd-kit
// Snabba swipes (< 400ms) triggar flikbyte
// Långsamma gester (> 500ms) lämnas till dnd-kit för drag

import { useRef, useEffect } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;    // Minsta horisontella distans (px)
  maxVertical?: number;    // Max vertikal rörelse (px)
  maxDuration?: number;    // Max tid (ms) för att räknas som swipe
  enabled?: boolean;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 40,
  maxVertical = 100,
  maxDuration = 400,
  enabled = true,
}: SwipeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Stabilisera callbacks med refs
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      tracking = true;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      const elapsed = Date.now() - startTime;

      // Bara snabba, horisontella gester
      if (elapsed > maxDuration) return;
      if (deltaY > maxVertical) return;
      if (Math.abs(deltaX) < minDistance) return;

      if (deltaX < 0) {
        onSwipeLeftRef.current?.();
      } else {
        onSwipeRightRef.current?.();
      }
    };

    // Capture-fas: fångar events innan de bubblar till dnd-kit
    el.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart, { capture: true });
      el.removeEventListener("touchend", handleTouchEnd, { capture: true });
    };
  }, [enabled, minDistance, maxVertical, maxDuration]);

  return containerRef;
}
