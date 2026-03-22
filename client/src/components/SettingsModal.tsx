/**
 * SettingsModal – Dold inställningssida för att konfigurera laget.se-inloggning.
 * Öppnas via kugghjulsikon i headern.
 */
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { X, Settings, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch current laget.se info
  const lagetInfo = trpc.settings.getLagetSeInfo.useQuery(undefined, {
    enabled: open,
  });

  const saveMutation = trpc.settings.saveLagetSeCredentials.useMutation();
  const testMutation = trpc.settings.testLagetSeConnection.useMutation();

  // Pre-fill username when data loads
  useEffect(() => {
    if (lagetInfo.data?.configured && lagetInfo.data.username) {
      setUsername(lagetInfo.data.username);
    }
  }, [lagetInfo.data]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      setTestResult(null);
      setSaveResult(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) return;
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);
    try {
      await saveMutation.mutateAsync({ username: username.trim(), password: password.trim() });
      setSaveResult({ success: true, message: "Sparad!" });
      lagetInfo.refetch();
    } catch (err: any) {
      setSaveResult({ success: false, message: err.message || "Kunde inte spara" });
    } finally {
      setSaving(false);
    }
  };

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
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
              Ange inloggningsuppgifter för ett konto med admin-behörighet till Stålstadens SF på laget.se.
              Uppgifterna sparas krypterat i databasen.
            </p>

            {/* Status indicator */}
            {lagetInfo.data && (
              <div className={`flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded-lg ${
                lagetInfo.data.configured
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              }`}>
                {lagetInfo.data.configured ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Konfigurerad: <strong>{lagetInfo.data.username}</strong></span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Ej konfigurerad — ange inloggningsuppgifter nedan</span>
                  </>
                )}
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
                E-postadress
              </label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@stalstadens.se"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5 mb-4">
              <label className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
                Lösenord
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lagetInfo.data?.configured ? "••••••••  (lämna tomt för att behålla)" : "Ange lösenord"}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !username.trim() || !password.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-sm font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Spara"
                )}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-sm font-bold hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
            </div>

            {/* Save result */}
            {saveResult && (
              <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                saveResult.success
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {saveResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{saveResult.message}</span>
              </div>
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 text-[10px] text-white/20 text-center">
          Uppgifterna krypteras med AES-256 och sparas i databasen
        </div>
      </div>
    </div>
  );
}
