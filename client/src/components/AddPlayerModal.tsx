/**
 * Lägg till en spelare i truppen – samma ruta på mobil och desktop.
 * Spelaren hamnar i truppen och sparas i spelarregistret när uppställningen synkas.
 */
import { teamName, teamSingular, teamGenitive, defaultTeamNames } from "@shared/teams";
import { useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import type { Player, Position } from "@/lib/players";
import { positionName } from "@/lib/players";

const POSITIONS: Position[] = ["MV", "B", "C", "F", "IB"];

export function AddPlayerModal({ onAdd, onClose }: { onAdd: (p: Player) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState<Position>("F");
  const [teamColor, setTeamColor] = useState<"white" | "green" | null>(null);
  const [captainRole, setCaptainRole] = useState<"C" | "A" | null>(null);

  const add = () => {
    if (!name.trim()) return;
    onAdd({
      id: `custom-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`,
      name: name.trim(),
      number: number.trim(),
      position,
      teamColor,
      captainRole,
    });
    onClose();
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200" : "bg-white/5 border-white/10 text-white/60"}`;

  return createPortal(
    <div className="fixed inset-0 z-[100000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm glass-panel-strong panel-solid rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}>
            <UserPlus className="w-4 h-4 text-emerald-400" /> Lägg till spelare
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Namn" maxLength={60} className="rounded-lg bg-white/5 border border-white/15 text-white text-sm px-3 py-2" />
          <input value={number} onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} inputMode="numeric"
            placeholder="Nr" className="rounded-lg bg-white/5 border border-white/15 text-white text-sm px-3 py-2 text-center" />
        </div>
        <div>
          <p className="text-[11px] text-white/45 mb-1">Position</p>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map((p) => (
              <button key={p} onClick={() => setPosition(p)} title={positionName(p)} className={chip(position === p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-white/45 mb-1">Lag</p>
            <div className="flex gap-1.5">
              <button onClick={() => setTeamColor(null)} className={chip(teamColor === null)}>–</button>
              <button onClick={() => setTeamColor("white")} className={chip(teamColor === "white")}>{teamSingular("white")}</button>
              <button onClick={() => setTeamColor("green")} className={chip(teamColor === "green")}>{teamSingular("green")}</button>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-white/45 mb-1">C / A</p>
            <div className="flex gap-1.5">
              <button onClick={() => setCaptainRole(null)} className={chip(captainRole === null)}>–</button>
              <button onClick={() => setCaptainRole("C")} className={chip(captainRole === "C")}>C</button>
              <button onClick={() => setCaptainRole("A")} className={chip(captainRole === "A")}>A</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm">Avbryt</button>
          <button onClick={add} disabled={!name.trim()} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-emerald-950 text-sm font-bold disabled:opacity-40">Lägg till</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
