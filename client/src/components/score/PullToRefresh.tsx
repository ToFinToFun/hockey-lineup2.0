import { useRef, useState, useCallback, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => void;
  refreshing: boolean;
  children: ReactNode;
  /** Pull distance (px) required to trigger refresh */
  threshold?: number;
  className?: string;
}

/**
 * Pull-to-refresh wrapper for scrollable containers.
 * Wraps children in a scrollable div that detects pull-down gestures
 * at the top of the scroll area and triggers a refresh callback.
 */
export default function PullToRefresh({
  onRefresh,
  refreshing,
  children,
  threshold = 70,
  className = "",
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || refreshing) return;
    // Only start tracking if scrolled to top
    if (container.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startYRef.current === null || refreshing) return;
    const container = containerRef.current;
    if (!container) return;

    // Only pull if we're at the top
    if (container.scrollTop > 0) {
      startYRef.current = null;
      setPullDistance(0);
      setIsPulling(false);
      pullingRef.current = false;
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Apply resistance: the further you pull, the harder it gets
      const dampened = Math.min(diff * 0.5, threshold * 1.8);
      setPullDistance(dampened);
      setIsPulling(true);
      pullingRef.current = true;

      // Prevent default scroll when pulling down
      if (diff > 10) {
        e.preventDefault();
      }
    }
  }, [refreshing, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;

    if (pullDistance >= threshold && !refreshing) {
      onRefresh();
    }

    startYRef.current = null;
    setPullDistance(0);
    setIsPulling(false);
    pullingRef.current = false;
  }, [pullDistance, threshold, refreshing, onRefresh]);

  const isTriggered = pullDistance >= threshold;
  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorScale = 0.5 + Math.min(pullDistance / threshold, 1) * 0.5;
  const rotation = (pullDistance / threshold) * 180;

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: isPulling ? "none" : "auto" }}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{
          height: isPulling || refreshing ? Math.max(pullDistance, refreshing ? 48 : 0) : 0,
        }}
      >
        <div
          className="flex items-center gap-2 transition-transform"
          style={{
            opacity: refreshing ? 1 : indicatorOpacity,
            transform: `scale(${refreshing ? 1 : indicatorScale})`,
          }}
        >
          <RefreshCw
            size={18}
            className={`text-[#0a7ea4] transition-transform ${refreshing ? "animate-spin" : ""}`}
            style={{
              transform: refreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
          <span className="text-[11px] text-[#9BA1A6] font-medium">
            {refreshing
              ? "Uppdaterar..."
              : isTriggered
                ? "Släpp för att uppdatera"
                : "Dra ner för att uppdatera"}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}
