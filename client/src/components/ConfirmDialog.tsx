// ConfirmDialog – In-app bekräftelsedialog (ersätter window.confirm)

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Bekräfta",
  cancelLabel = "Avbryt",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Fokusera bekräftelseknappen direkt
  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  // Stäng på Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="glass-panel-strong rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className={`w-4 h-4 shrink-0 ${danger ? "text-red-400" : "text-amber-400"}`} />
            <h2
              id="confirm-title"
              className="text-white font-black text-sm uppercase tracking-widest"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-white/30 hover:text-white transition-colors"
            aria-label="Stäng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p id="confirm-message" className="text-white/60 text-sm leading-relaxed">
            {message}
          </p>
        </div>

        {/* Knappar */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-white/15 text-white/50 text-xs font-bold uppercase tracking-wider hover:bg-white/5 hover:text-white/70 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              danger
                ? "bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/35"
                : "bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/35"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
