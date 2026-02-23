// PortalDropdown – renderar dropdown via React Portal direkt i document.body
// Positioneras med getBoundingClientRect() för att alltid hamna ovanpå allt

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function PortalDropdown({ anchorRef, open, onClose, children }: PortalDropdownProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const dropdownWidth = 160;
    const viewportWidth = window.innerWidth;

    let left = rect.right - dropdownWidth;
    if (left < 4) left = rect.left;
    if (left + dropdownWidth > viewportWidth - 4) left = viewportWidth - dropdownWidth - 4;

    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: left + window.scrollX,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    // Slight delay to avoid closing immediately on open click
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        zIndex: 99999,
        minWidth: 160,
      }}
      className="bg-gray-900/98 border border-white/20 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
