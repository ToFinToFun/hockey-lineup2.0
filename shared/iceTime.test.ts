import { describe, expect, it } from "vitest";
import { iceTimeBySlot, matchMinutes } from "./iceTime";
import { calculateSlotIceTimes } from "../client/src/lib/iceTimePerSlot";
import { createTeamSlots, MAX_TEAM_CONFIG } from "../client/src/lib/lineup";

describe("speltid i efterhand", () => {
  it("samma regler som i Lineup (före avrundning)", () => {
    const slots = createTeamSlots("team-a", MAX_TEAM_CONFIG);
    const filled = ["team-a-gk-1", "team-a-def-1-1", "team-a-def-1-2", "team-a-def-2-1", "team-a-fwd-1-c", "team-a-fwd-1-lw", "team-a-fwd-1-rw", "team-a-fwd-2-c", "team-a-fwd-2-lw", "team-a-fwd-2-rw", "team-a-fwd-3-lw"];
    const lineup = Object.fromEntries(filled.map((id) => [id, { id, name: id, number: "", position: "F" as const }]));
    const ui = calculateSlotIceTimes(slots, lineup, MAX_TEAM_CONFIG, 45);
    const ours = iceTimeBySlot(filled, 45);
    for (const id of filled) expect(Math.round(ours.get(id)!)).toBe(ui.get(id));
    expect(ours.get("team-a-def-1-1")).toBeCloseTo(30); // 2/3 × 45
    expect(ours.get("team-a-fwd-1-c")).toBeCloseTo(22.5); // 1/2 × 45
  });
  it("färre än 5 utespelare: hela matchen", () => {
    const m = iceTimeBySlot(["team-b-gk-1", "team-b-def-1-1", "team-b-fwd-1-c"], 60);
    expect([...m.values()]).toEqual([60, 60, 60]);
  });
  it("matchens längd", () => {
    expect(matchMinutes("2026-10-01T20:00:00Z", "2026-10-01T20:45:00Z")).toBe(45);
    expect(matchMinutes(null, null)).toBe(60);
    expect(matchMinutes("2026-10-01T20:00:00Z", "2026-10-01T20:05:00Z")).toBe(60);
  });
});
