/**
 * SettingsModal – laget.se-status och admin-funktioner som PIR (Player Impact Rating) med granulära toggles.
 * Öppnas via kugghjulsikon i headern.
 */
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import type { PirSettings } from "@/hooks/usePirEnabled";
import { X, Settings, CheckCircle2, XCircle, Loader2, TrendingUp, Lock, BarChart3, ArrowUpDown, Target, Scale, FlaskConical } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  pirSettings: PirSettings;
  onPirSettingsChange: (settings: PirSettings) => void;
  /** Demo settings */
  demoCount: number;
  onDemoCountChange: (count: number) => void;
  demoActive: boolean;
  onDemoToggle: () => void;
}

export function SettingsModal({ open, onClose, pirSettings, onPirSettingsChange, demoCount, onDemoCountChange, demoActive, onDemoToggle }: SettingsModalProps) {
  const { isAdmin } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  // PIR admin state
  const pirUnlocked = isAdmin;
  const [pirSaving, setPirSaving] = useState(false);
  const [pirResult, setPirResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const testMutation = trpc.settings.testLagetSeConnection.useMutation();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setTestResult(null);
      setPirResult(null);
    }
  }, [open]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync();
      if (result.success) {
        setTestResult({
          success: true,
          message: `Anslutning OK! ${result.eventTitle || "Event"} ${result.eventDate || ""} — ${result.totalRegistered || 0} anmälda`,
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || "Anslutning misslyckades",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Kunde inte testa anslutningen",
      });
    } finally {
      setTesting(false);
    }
  };

  const handlePirToggle = async (key: keyof PirSettings, value: boolean) => {
    setPirSaving(true);
    setPirResult(null);
    try {
      const res = await fetch("/api/trpc/settings.setPirSettings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: { [key]: value } }),
      });
      const json = await res.json();
      const data = json?.result?.data;
      const result = data?.json ?? data;
      if (result?.success) {
        const newSettings = { ...pirSettings, [key]: value };
        onPirSettingsChange(newSettings);
        setPirResult({ success: true, message: "Inställningen sparad!" });
      } else {
        setPirResult({ success: false, message: result?.error || "Kunde inte spara" });
      }
    } catch (err: any) {
      setPirResult({ success: false, message: err.message || "Okänt fel" });
    } finally {
      setPirSaving(false);
    }
  };

  if (!open) return null;

  const pirToggles: { key: keyof PirSettings; label: string; description: string; icon: React.ReactNode; color: string }[] = [
    {
      key: "enabled",
      label: "PIR aktiverat",
      description: "Master-toggle. Beräknar alltid i bakgrunden men styr om data visas.",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      color: "amber",
    },
    {
      key: "showRating",
      label: "Visa PIR-siffra",
      description: "Visar spelarens rating-siffra på spelarkorten.",
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      color: "sky",
    },
    {
      key: "showTrend",
      label: "Visa trend-pil",
      description: "Visar om spelaren är i stigande eller fallande form.",
      icon: <ArrowUpDown className="w-3.5 h-3.5" />,
      color: "emerald",
    },
    {
      key: "showTeamStrength",
      label: "Visa lagstyrka",
      description: "Visar total PIR-summa och snitt i lagheadern.",
      icon: <Target className="w-3.5 h-3.5" />,
      color: "purple",
    },
    {
      key: "showPrediction",
      label: "Visa matchprediktion",
      description: "Visar förväntad vinstprocent baserat på lagstyrka.",
      icon: <Scale className="w-3.5 h-3.5" />,
      color: "rose",
    },
    {
      key: "useForBalance",
      label: "Använd för lagbalansering",
      description: "Auto-fördelning använder PIR för att skapa jämna lag.",
      icon: <Scale className="w-3.5 h-3.5" />,
      color: "teal",
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md glass-panel-strong rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-white/60" />
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Inställningar
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-5">
          {/* Laget.se section */}
          <div>
            <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-1">
              Laget.se inloggning
            </h3>
            <p className="text-[11px] text-white/40 mb-3">
              Inloggningen till laget.se hanteras som miljövariabler (LAGET_SE_USERNAME / LAGET_SE_PASSWORD) i Coolify och kan inte ändras här.
            </p>

            {isAdmin && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-sm font-bold hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Testar...</span>
                  </>
                ) : (
                  "Testa anslutning"
                )}
              </button>
            )}

            {/* Test result */}
            {testResult && (
              <div className={`mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                testResult.success
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-white/8" />

          {/* PIR section */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">
                Player Impact Rating (PIR)
              </h3>
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              Elo-baserat ratingsystem som mäter spelarnas bidrag till lagets vinster.
              Justeras för lagstyrka, motståndarstyrka, tidsviktning och form.
            </p>

            {!pirUnlocked ? (
              <>
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40">
                  <Lock className="w-3.5 h-3.5" />
                  <span>PIR-inställningar kan bara ändras av styrelsen</span>
                </div>
              </>
            ) : (
              <>
                {/* Unlocked — show granular toggles */}
                <div className="space-y-2">
                  {pirToggles.map((toggle) => {
                    const isOn = pirSettings[toggle.key];
                    const isDisabled = pirSaving || (toggle.key !== "enabled" && toggle.key !== "useForBalance" && !pirSettings.enabled);
                    return (
                      <div
                        key={toggle.key}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                          isOn
                            ? `bg-${toggle.color}-500/10 border-${toggle.color}-500/20`
                            : "bg-white/3 border-white/8"
                        } ${isDisabled && toggle.key !== "enabled" && toggle.key !== "useForBalance" ? "opacity-40" : ""}`}
                      >
                        <div className={`shrink-0 ${isOn ? `text-${toggle.color}-400` : "text-white/30"}`}>
                          {toggle.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white/90">{toggle.label}</div>
                          <div className="text-[10px] text-white/40 leading-tight">{toggle.description}</div>
                        </div>
                        <button
                          onClick={() => handlePirToggle(toggle.key, !isOn)}
                          disabled={isDisabled && toggle.key !== "enabled" && toggle.key !== "useForBalance"}
                          className={`shrink-0 w-10 h-5 rounded-full relative transition-all duration-200 ${
                            isOn
                              ? "bg-emerald-500/60"
                              : "bg-white/10"
                          } ${isDisabled && toggle.key !== "enabled" && toggle.key !== "useForBalance" ? "cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                            isOn ? "left-5.5" : "left-0.5"
                          }`} style={{ left: isOn ? "22px" : "2px" }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Note about balance */}
                <p className="text-[10px] text-white/30 mt-2 italic">
                  "Använd för lagbalansering" fungerar oberoende av om PIR-data visas.
                  Övriga visnings-toggles kräver att "PIR aktiverat" är på.
                </p>

                {/* Result feedback */}
                {pirResult && (
                  <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                    pirResult.success
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}>
                    {pirResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{pirResult.message}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-white/8" />

          {/* Demo section */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">
                Demo-läge
              </h3>
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              Simulera anmälda spelare och kör auto-fördelning för att testa laguppställningen
              utan riktiga anmälningar.
            </p>

            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all bg-white/3 border-white/8">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/90">Antal spelare</div>
                <div className="text-[10px] text-white/40 leading-tight">Hur många spelare som ska simuleras som anmälda</div>
              </div>
              <input
                type="number"
                min={4}
                max={50}
                value={demoCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 99) onDemoCountChange(v);
                }}
                className="w-16 text-center px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-bold tabular-nums focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition-colors"
              />
            </div>

            <button
              onClick={() => { onDemoToggle(); if (!demoActive) onClose(); }}
              className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                demoActive
                  ? 'bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30'
                  : 'bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              {demoActive ? 'Avsluta demo' : `Starta demo (${demoCount} spelare)`}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-white/20 text-center">
          Uppgifterna krypteras med AES-256 och sparas i databasen
        </div>
      </div>
    </div>
  );
}
