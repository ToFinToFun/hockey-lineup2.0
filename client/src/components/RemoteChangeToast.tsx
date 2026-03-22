/**
 * RemoteChangeToast — Shows a brief notification when someone else changes the lineup.
 * Example: "Någon flyttade Spelare X till Kedja 2"
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface RemoteChangeToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function RemoteChangeToast({ message, onDismiss }: RemoteChangeToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // Wait for fade-out animation
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <div className="flex items-center gap-2 bg-blue-500/90 backdrop-blur-sm border border-blue-400/50 rounded-lg px-4 py-2.5 shadow-lg shadow-blue-500/20">
        <Users className="w-4 h-4 text-white shrink-0" />
        <span className="text-white text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
