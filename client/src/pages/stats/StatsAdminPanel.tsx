/**
 * StatsAdminPanel – Admin settings for stats visibility
 */
import { useState, useEffect } from "react";
import { X, Settings, Eye, EyeOff, Shield, Save, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface StatsAdminPanelProps {
  open: boolean;
  onClose: () => void;
}

interface VisibilitySettings {
  overview: boolean;
  leaders: boolean;
  awards: boolean;
  players: boolean;
  teams: boolean;
  showPir: boolean;
  minMatchesForLeaders: number;
}

const SECTION_LABELS: Record<string, { label: string; description: string }> = {
  overview: { label: "Översikt", description: "Dashboard med nyckeltal, trender och senaste form" },
  leaders: { label: "Poängligan", description: "Skyttekung, assistkung, poängkung och GWG" },
  awards: { label: "Utmärkelser", description: "Säsongens utmärkelser och awards" },
  players: { label: "Spelare", description: "Spelarprofiler med detaljerad statistik" },
  teams: { label: "Lag", description: "Vita vs Gröna jämförelse" },
};

export default function StatsAdminPanel({ open, onClose }: StatsAdminPanelProps) {
  const [settings, setSettings] = useState<VisibilitySettings>({
    overview: true,
    leaders: true,
    awards: true,
    players: true,
    teams: true,
    showPir: true,
    minMatchesForLeaders: 3,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: serverSettings } = trpc.statsVisibility.get.useQuery();
  const mutation = trpc.statsVisibility.set.useMutation();

  useEffect(() => {
    if (serverSettings) {
      setSettings({
        overview: serverSettings.stats_overview !== "false",
        leaders: serverSettings.stats_leaders !== "false",
        awards: serverSettings.stats_awards !== "false",
        players: serverSettings.stats_players !== "false",
        teams: serverSettings.stats_teams !== "false",
        showPir: serverSettings.stats_show_pir !== "false",
        minMatchesForLeaders: parseInt(serverSettings.stats_min_matches || "3") || 3,
      });
    }
  }, [serverSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mutation.mutateAsync({
        stats_overview: String(settings.overview),
        stats_leaders: String(settings.leaders),
        stats_awards: String(settings.awards),
        stats_players: String(settings.players),
        stats_teams: String(settings.teams),
        stats_show_pir: String(settings.showPir),
        stats_min_matches: String(settings.minMatchesForLeaders),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save stats settings", e);
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[#0a7ea4]" />
            <h2 className="text-[#ECEDEE] font-bold text-base">Statistik-inställningar</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#687076] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Section visibility */}
          <div>
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-1 flex items-center gap-2">
              <Eye size={14} className="text-[#0a7ea4]" />
              Synlighet utan inloggning
            </h3>
            <p className="text-[#687076] text-[10px] mb-3">
              Välj vilka sektioner som ska vara synliga för alla besökare
            </p>

            <div className="space-y-2">
              {Object.entries(SECTION_LABELS).map(([key, { label, description }]) => {
                const enabled = settings[key as keyof VisibilitySettings] as boolean;
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setSettings((s) => ({ ...s, [key]: !enabled }))
                    }
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      enabled
                        ? "bg-[#0a7ea4]/5 border-[#0a7ea4]/20"
                        : "bg-[#1a1a1a] border-[#2a2a2a]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        enabled ? "bg-[#0a7ea4]/10" : "bg-[#2a2a2a]"
                      }`}
                    >
                      {enabled ? (
                        <Eye size={14} className="text-[#0a7ea4]" />
                      ) : (
                        <EyeOff size={14} className="text-[#687076]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#ECEDEE] text-xs font-medium">{label}</p>
                      <p className="text-[#687076] text-[10px]">{description}</p>
                    </div>
                    <div
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        enabled ? "bg-[#0a7ea4]" : "bg-[#2a2a2a]"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIR toggle */}
          <div>
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-1 flex items-center gap-2">
              <Shield size={14} className="text-amber-400" />
              PIR i statistiken
            </h3>
            <button
              onClick={() => setSettings((s) => ({ ...s, showPir: !s.showPir }))}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                settings.showPir
                  ? "bg-amber-500/5 border-amber-500/20"
                  : "bg-[#1a1a1a] border-[#2a2a2a]"
              }`}
            >
              <div className="flex-1">
                <p className="text-[#ECEDEE] text-xs font-medium">Visa PIR-rating</p>
                <p className="text-[#687076] text-[10px]">
                  Visa Player Impact Rating i spelarprofiler och listor
                </p>
              </div>
              <div
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  settings.showPir ? "bg-amber-500" : "bg-[#2a2a2a]"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.showPir ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Min matches */}
          <div>
            <h3 className="text-[#ECEDEE] text-sm font-semibold mb-1">
              Minsta antal matcher
            </h3>
            <p className="text-[#687076] text-[10px] mb-2">
              Minsta antal matcher för att visas i poängligan
            </p>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.minMatchesForLeaders}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  minMatchesForLeaders: Math.max(1, parseInt(e.target.value) || 1),
                }))
              }
              className="w-20 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#ECEDEE] text-sm text-center focus:outline-none focus:border-[#0a7ea4]/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2a2a2a] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[#687076] text-xs hover:text-white transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium transition-colors ${
              saved
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-[#0a7ea4] text-white hover:bg-[#0a7ea4]/80"
            }`}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <>✓ Sparat</>
            ) : (
              <>
                <Save size={14} /> Spara
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
