import { describe, expect, it } from "vitest";
import { createTeamSlots, type TeamConfig } from "./lineup";
import { generateIceTimeSummary } from "./iceTimePerSlot";
import type { Player } from "./players";

function build(config: TeamConfig, def: number, c: number, w: number) {
  const slots = createTeamSlots("team-a", config);
  const lineup: Record<string, Player> = {};
  let n = 0;
  const put = (pred: (s: (typeof slots)[number]) => boolean, count: number) =>
    slots.filter(pred).slice(0, count).forEach(s => (lineup[s.id] = { id: `p${n}`, name: `P${n++}`, number: "", position: "F" } as Player));
  put(s => s.type === "defense", def);
  put(s => s.role === "c", c);
  put(s => s.role === "lw" || s.role === "rw", w);
  return { slots, lineup, config };
}

describe("speltidstext", () => {
  it("visar backar och forwards/centrar som byter med varandra", () => {
    const { slots, lineup, config } = build({ goalkeepers: 1, defensePairs: 2, forwardLines: 2 }, 4, 2, 3);
    const lines = generateIceTimeSummary(slots, lineup, config, 60)!;
    expect(lines[0]).toBe("Backar: 4 st · 30 min var");
    expect(lines[1]).toBe("Forwards/centrar: 5 st byter med varandra · 36 min var");
  });

  it("föreslår jämnare fördelning när tiderna skiljer mycket", () => {
    const { slots, lineup, config } = build({ goalkeepers: 1, defensePairs: 3, forwardLines: 2 }, 6, 2, 4);
    const lines = generateIceTimeSummary(slots, lineup, config, 60)!;
    expect(lines[0]).toBe("Backar: 6 st · 20 min var");
    expect(lines.some(l => l.startsWith("Jämnare speltid"))).toBe(true);
  });

  it("färre än 5 utespelare: alla spelar hela matchen", () => {
    const { slots, lineup, config } = build({ goalkeepers: 1, defensePairs: 1, forwardLines: 1 }, 2, 1, 1);
    expect(generateIceTimeSummary(slots, lineup, config, 60)).toEqual(["4 utespelare – alla spelar hela matchen. KÄMPA!"]);
  });
});
