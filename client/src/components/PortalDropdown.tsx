// PortalDropdown – renderar en panel via React Portal direkt i document.body,
// placerad vid ett ankarelement men alltid helt innanför skärmen.
//
// - Panelens verkliga storlek mäts efter rendering (ingen gissad bredd).
// - Smal skärm (mobil): centreras vågrätt.
// - Bredare skärm: högerkant mot ankaret, flyttas in om den skulle hamna utanför.
// - Får den inte plats under ankaret läggs den ovanför (eller så högt det går).

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Täckande bakgrund (spelarkortet) i stället för halvgenomskinlig. */
  solid?: boolean;
}

const MARGIN = 8;
const NARROW_SCREEN = 520;

export function PortalDropdown({ anchorRef, open, onClose, children, solid = false }: PortalDropdownProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const panel = dropdownRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = vw <= NARROW_SCREEN ? (vw - w) / 2 : a.right - w;
      left = Math.min(Math.max(left, MARGIN), vw - w - MARGIN);

      let top = a.bottom + 4;
      if (top + h > vh - MARGIN) {
        const above = a.top - h - 4;
        top = above >= MARGIN ? above : Math.max(MARGIN, vh - h - MARGIN);
      }
      setPos({ top: top + window.scrollY, left: left + window.scrollX });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    // Liten fördröjning så att klicket som öppnade inte stänger direkt
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Osynlig tills den mätts och placerats – ingen blinkning i hörnet
        visibility: pos ? "visible" : "hidden",
        zIndex: 99999,
        minWidth: 160,
        maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
      }}
      className={`glass-panel-strong rounded-lg shadow-2xl ${solid ? "panel-solid" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
