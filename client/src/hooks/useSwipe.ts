// Hook för att detektera swipe-gester (vänster/höger)
// Ignorerar vertikala scrolls och korta swipes

import { useRef, useCallback } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;    // Minsta horisontella distans (px) för att räknas som swipe
  maxVertical?: number;    // Max vertikal rörelse (px) innan det räknas som scroll
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  maxVertical = 80,
}: SwipeOptions): SwipeHandlers {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const isSwiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentX.current = touch.clientX;
    currentY.current = touch.clientY;
    isSwiping.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    const touch = e.touches[0];
    currentX.current = touch.clientX;
    currentY.current = touch.clientY;
  }, []);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    isSwiping.current = false;

    const deltaX = currentX.current - startX.current;
    const deltaY = Math.abs(currentY.current - startY.current);

    // Ignorera om vertikal rörelse är för stor (scroll)
    if (deltaY > maxVertical) return;

    // Ignorera om horisontell rörelse är för kort
    if (Math.abs(deltaX) < minDistance) return;

    if (deltaX < 0) {
      // Swipe vänster → nästa flik
      onSwipeLeft?.();
    } else {
      // Swipe höger → föregående flik
      onSwipeRight?.();
    }
  }, [onSwipeLeft, onSwipeRight, minDistance, maxVertical]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
