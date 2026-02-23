// ExportModal – Exportera uppställning som bild
// Två format: Social media (1080x1440) och A4-liknande

import { useRef, useState } from "react";
import { X, Download, Image as ImageIcon } from "lucide-react";
import type { Player } from "@/lib/players";
import type { Slot } from "@/lib/lineup";
import { groupSlots } from "@/lib/lineup";

interface ExportModalProps {
  onClose: () => void;
  teamAName: string;
  teamBName: string;
  teamALineup: Record<string, Player>;
  teamBLineup: Record<string, Player>;
  teamASlots: Slot[];
  teamBSlots: Slot[];
  logoGreen: string;
  logoWhite: string;
  bgUrl: string;
}

function getToday(): string {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

function TeamExportBlock({
  teamName,
  slots,
  lineup,
  logo,
  accentColor,
}: {
  teamName: string;
  slots: Slot[];
  lineup: Record<string, Player>;
  logo: string;
  accentColor: string;
}) {
  const goalkeeperSlots = slots.filter((s) => s.type === "goalkeeper");
  const defenseSlots = slots.filter((s) => s.type === "defense");
  const forwardSlots = slots.filter((s) => s.type === "forward");
  const defenseGroups = groupSlots(defenseSlots);
  const forwardGroups = groupSlots(forwardSlots);

  return (
    <div style={{ flex: 1, padding: "0 12px" }}>
      {/* Lag-header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <img src={logo} alt={teamName} style={{ width: 48, height: 48, objectFit: "contain" }} />
        <span style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 900,
          fontSize: 22,
          color: accentColor,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}>{teamName}</span>
      </div>

      {/* Målvakter */}
      <SectionBlock label="Målvakter" color="#f59e0b">
        {goalkeeperSlots.map((slot) => (
          <SlotRow key={slot.id} slot={slot} player={lineup[slot.id] ?? null} />
        ))}
      </SectionBlock>

      {/* Backar */}
      <SectionBlock label="Backar" color="#60a5fa">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {defenseGroups.map((group) => (
            <div key={group.groupLabel} style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(96,165,250,0.15)",
              borderRadius: 6,
              padding: "5px 7px",
            }}>
              <div style={{ fontSize: 9, color: "rgba(96,165,250,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                {group.groupLabel}
              </div>
              {group.slots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} player={lineup[slot.id] ?? null} compact />
              ))}
            </div>
          ))}
        </div>
      </SectionBlock>

      {/* Forwards */}
      <SectionBlock label="Forwards" color="#34d399">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {forwardGroups.map((group) => (
            <div key={group.groupLabel} style={{
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.15)",
              borderRadius: 6,
              padding: "5px 7px",
            }}>
              <div style={{ fontSize: 9, color: "rgba(52,211,153,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                {group.groupLabel}
              </div>
              {group.slots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} player={lineup[slot.id] ?? null} compact />
              ))}
            </div>
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}

function SectionBlock({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 2, marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SlotRow({ slot, player, compact = false }: { slot: Slot; player: Player | null; compact?: boolean }) {
  const fontSize = compact ? 10 : 11;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: compact ? "2px 0" : "3px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        padding: "1px 4px",
        borderRadius: 3,
        background: slot.role === "gk" || slot.role === "res-gk" ? "rgba(245,158,11,0.3)" :
                    slot.role === "def" ? "rgba(96,165,250,0.3)" :
                    slot.role === "c" ? "rgba(167,139,250,0.3)" : "rgba(52,211,153,0.3)",
        color: slot.role === "gk" || slot.role === "res-gk" ? "#f59e0b" :
               slot.role === "def" ? "#60a5fa" :
               slot.role === "c" ? "#a78bfa" : "#34d399",
        minWidth: 22,
        textAlign: "center",
      }}>
        {slot.shortLabel}
      </span>
      <span style={{
        fontSize,
        color: player ? "#ffffff" : "rgba(255,255,255,0.25)",
        fontStyle: player ? "normal" : "italic",
        flex: 1,
      }}>
        {player ? (player.number ? `#${player.number} ${player.name}` : player.name) : "—"}
      </span>
    </div>
  );
}

export function ExportModal({
  onClose,
  teamAName,
  teamBName,
  teamALineup,
  teamBLineup,
  teamASlots,
  teamBSlots,
  logoGreen,
  logoWhite,
  bgUrl,
}: ExportModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#0a0f0a",
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `stalstadens-lineup-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] w-full max-w-4xl overflow-hidden">
        {/* Modal-header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-white font-black text-base uppercase tracking-widest" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Exportera uppställning
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 disabled:opacity-50 transition-all uppercase tracking-wider"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exporterar..." : "Ladda ner bild"}
            </button>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Förhandsvisning */}
        <div className="flex-1 overflow-auto p-4">
          {/* Det som exporteras */}
          <div
            ref={printRef}
            style={{
              width: 900,
              minHeight: 560,
              background: "#0d1510",
              backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: 12,
              padding: 24,
              fontFamily: "system-ui, sans-serif",
              color: "#fff",
              boxSizing: "border-box",
            }}
          >
            {/* Export-header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 14 }}>
              <div>
                <div style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 900,
                  fontSize: 26,
                  color: "#fff",
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}>
                  Stålstadens <span style={{ color: "#34d399" }}>Lineup</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
                  A-lag Herrar · {getToday()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <img src={logoWhite} alt="Vita" style={{ width: 40, height: 40, objectFit: "contain" }} />
                <img src={logoGreen} alt="Gröna" style={{ width: 40, height: 40, objectFit: "contain" }} />
              </div>
            </div>

            {/* Lag-kolumner */}
            <div style={{ display: "flex", gap: 0 }}>
              {/* Vita */}
              <TeamExportBlock
                teamName={teamAName}
                slots={teamASlots}
                lineup={teamALineup}
                logo={logoWhite}
                accentColor="#e2e8f0"
              />

              {/* Separator */}
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 8px" }} />

              {/* Gröna */}
              <TeamExportBlock
                teamName={teamBName}
                slots={teamBSlots}
                lineup={teamBLineup}
                logo={logoGreen}
                accentColor="#34d399"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-2 border-t border-white/10 shrink-0">
          <p className="text-white/30 text-xs">Förhandsvisning av exporten. Klicka "Ladda ner bild" för att spara som PNG.</p>
        </div>
      </div>
    </div>
  );
}
