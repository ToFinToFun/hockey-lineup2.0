/** Forward color: Cyan (locked in) */

export interface ForwardColors {
  name: string;
  badgeBg: string;
  dot: string;
  slotBorder: string;
  slotBg: string;
  slotLabel: string;
  slotEmpty: string;
  slotBadge: string;
  sectionHeader: string;
  sectionBorder: string;
  sectionBg: string;
  groupHeader: string;
  groupBorder: string;
  groupBg: string;
  canvasRoleBg: string;
  canvasRoleText: string;
  canvasSectionLabel: string;
  canvasGroupLabel: string;
}

const CYAN: ForwardColors = {
  name: "Cyan",
  badgeBg: "bg-cyan-500 text-cyan-950",
  dot: "bg-cyan-400",
  slotBorder: "border-cyan-400/40",
  slotBg: "bg-cyan-950/20",
  slotLabel: "text-cyan-300",
  slotEmpty: "text-cyan-400/35",
  slotBadge: "bg-cyan-500/20 text-cyan-300",
  sectionHeader: "text-cyan-300",
  sectionBorder: "border-cyan-400/20",
  sectionBg: "bg-cyan-950/10",
  groupHeader: "text-cyan-400/60",
  groupBorder: "border-cyan-400/15",
  groupBg: "bg-cyan-950/15",
  canvasRoleBg: "rgba(34,211,238,0.6)",
  canvasRoleText: "#67e8f9",
  canvasSectionLabel: "#67e8f9",
  canvasGroupLabel: "rgba(34,211,238,0.6)",
};

export function useForwardColor() {
  return { colors: CYAN };
}
