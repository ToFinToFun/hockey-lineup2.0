// LongPressTooltip – visar tooltip vid lång tryckning på mobil
// Wraps children and shows a floating label on long press (500ms)

import { useState, useRef, useCallback, type ReactNode } from "react";

interface LongPressTooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function LongPressTooltip({ label, children, className = "" }: LongPressTooltipProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startPress = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setShow(true);
      // Auto-hide after 1.5s
      setTimeout(() => setShow(false), 1500);
    }, 400);
  }, []);

  const cancelPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
    >
      {children}
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[9999] pointer-events-none animate-in fade-in duration-150">
          <div className="glass-panel-strong text-white text-[10px] font-semibold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
