/**
 * SettingsModal – PIR (Player Impact Rating): vad som visas i Lineup.
 * Valen sparas på enheten (webbläsaren), så var och en väljer själv.
 * Öppnas via kugghjulsmenyn → "PIR".
 */
import React from "react";
import type { PirSettings } from "@/hooks/usePirEnabled";
import { X, TrendingUp, BarChart3, ArrowUpDown, Target, Scale } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  pirSettings: PirSettings;
  onPirSettingsChange: (settings: PirSettings) => void;
}

const TOGGLES: { key: keyof PirSettings; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  { key: "enabled", label: "PIR aktiverat", description: "Huvudbrytare för allt som visar PIR i Lineup.", icon: <TrendingUp className="w-3.5 h-3.5" />, color: "amber" },
  { key: "showRating", label: "Visa PIR-siffra", description: "Spelarens betyg på spelarkorten.", icon: <BarChart3 className="w-3.5 h-3.5" />, color: "sky" },
  { key: "showTrend", label: "Visa trendpil", description: "Om spelaren är i stigande eller fallande form.", icon: <ArrowUpDown className="w-3.5 h-3.5" />, color: "emerald" },
  { key: "showTeamStrength", label: "Visa lagstyrka", description: "Total PIR och snitt under Vitas och Grönas rubrik.", icon: <Target className="w-3.5 h-3.5" />, color: "purple" },
  { key: "showPrediction", label: "Visa matchprediktion", description: "Förväntad vinstchans överst (bara styrelsen).", icon: <Scale className="w-3.5 h-3.5" />, color: "rose" },
  { key: "useForBalance", label: "Använd för lagbalansering", description: "Auto fördelar efter PIR för jämna lag.", icon: <Scale className="w-3.5 h-3.5" />, color: "teal" },
];

export function SettingsModal({ open, onClose, pirSettings, onPirSettingsChange }: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel-strong panel-solid rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Player Impact Rating (PIR)
            </h2>
          </div>
          <button onClick={onClose} aria-label="Stäng" className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-3">
          <p className="text-[11px] text-white/40">
            Elo-baserat betyg som mäter spelarnas bidrag till lagets vinster, justerat för lag- och motståndarstyrka, tid och form.
            Valen sparas på den här enheten.
          </p>

          <div className="space-y-2">
            {TOGGLES.map((t) => {
              const isOn = pirSettings[t.key];
              const dependsOnMaster = t.key !== "enabled" && t.key !== "useForBalance";
              const disabled = dependsOnMaster && !pirSettings.enabled;
              return (
                <div
                  key={t.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                    isOn ? `bg-${t.color}-500/10 border-${t.color}-500/20` : "bg-white/3 border-white/8"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  <div className={`shrink-0 ${isOn ? `text-${t.color}-400` : "text-white/30"}`}>{t.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white/90">{t.label}</div>
                    <div className="text-[10px] text-white/40 leading-tight">{t.description}</div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={isOn}
                    aria-label={t.label}
                    onClick={() => onPirSettingsChange({ ...pirSettings, [t.key]: !isOn })}
                    disabled={disabled}
                    className={`shrink-0 w-10 h-5 rounded-full relative transition-all duration-200 ${isOn ? "bg-emerald-500/60" : "bg-white/10"} ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200" style={{ left: isOn ? "22px" : "2px" }} />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-white/30 italic">
            "Använd för lagbalansering" fungerar även när PIR inte visas. Övriga kräver att "PIR aktiverat" är på.
          </p>
        </div>
      </div>
    </div>
  );
}
