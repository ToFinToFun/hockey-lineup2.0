// Hook för att detektera swipe-gester (vänster/höger)
// Använder native DOM event listeners (inte React synthetic events)
// för att undvika konflikter med dnd-kit som fångar touch-events

import { useRef, useEffect, useCallback } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;    // Minsta horisontella distans (px) för att räknas som swipe
  maxVertical?: number;    // Max vertikal rörelse (px) innan det räknas som scroll
  enabled?: boolean;       // Aktivera/inaktivera swipe (t.ex. under drag)
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  maxVertical = 80,
  enabled = true,
}: SwipeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const startTime = useRef(0);

  // Stabilisera callbacks med refs så att event listeners inte behöver uppdateras
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentX.current = touch.clientX;
      currentY.current = touch.clientY;
      startTime.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      currentX.current = touch.clientX;
      currentY.current = touch.clientY;
    };

    const handleTouchEnd = () => {
      const deltaX = currentX.current - startX.current;
      const deltaY = Math.abs(currentY.current - startY.current);
      const elapsed = Date.now() - startTime.current;

      // Ignorera om vertikal rörelse är för stor (scroll)
      if (deltaY > maxVertical) return;

      // Ignorera om horisontell rörelse är för kort
      if (Math.abs(deltaX) < minDistance) return;

      // Ignorera om gesten tog för lång tid (troligen drag, inte swipe)
      if (elapsed > 800) return;

      if (deltaX < 0) {
        onSwipeLeftRef.current?.();
      } else {
        onSwipeRightRef.current?.();
      }
    };

    // Använd capture phase för att fånga events FÖRE dnd-kit
    el.addEventListener("touchstart", handleTouchStart, { passive: true, capture: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: true, capture: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true, capture: false });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, minDistance, maxVertical]);

  return containerRef;
}
