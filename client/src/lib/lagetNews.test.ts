import { describe, expect, it } from "vitest";
import {
  BAND_H,
  NEWS_IMAGE,
  buildNewsBody,
  computeNewsLayout,
  defaultHome,
  formatNewsTitle,
  shortDate,
  sponsorLogoPath,
  teamColumns,
  teamPanelHeight,
} from "./lagetNews";
import { createTeamSlots, MAX_TEAM_CONFIG } from "./lineup";
import type { Player } from "./players";

function fullTeam(teamId: string, count?: number): { slots: ReturnType<typeof createTeamSlots>; lineup: Record<string, Player> } {
  const slots = createTeamSlots(teamId, MAX_TEAM_CONFIG);
  const lineup: Record<string, Player> = {};
  slots.slice(0, count ?? slots.length).forEach((s, i) => {
    lineup[s.id] = { id: `${teamId}-${i}`, name: `Spelare ${i}`, number: String(i + 1) } as Player;
  });
  return { slots, lineup };
}

describe("rubrik och text", () => {
  it("kort datum från evenemanget", () => {
    expect(shortDate("2026-11-23")).toBe("23/11");
    expect(shortDate("2026-01-05")).toBe("5/1");
    expect(shortDate(undefined, new Date(2026, 8, 27))).toBe("27/9");
  });

  it("rubrik med plats och tid när de finns", () => {
    expect(formatNewsTitle({ date: "2026-11-23", location: "Luleå Energi Arena", time: "19:00" })).toBe(
      "Lagen 23/11 – Luleå Energi Arena 19:00"
    );
    expect(formatNewsTitle({ date: "2026-11-23", time: "19:00" })).toBe("Lagen 23/11 – 19:00");
    expect(formatNewsTitle({ date: "2026-11-23" })).toBe("Lagen 23/11");
  });

  it("sponsorraden först i brödtexten", () => {
    expect(buildNewsBody("Polar", "VITA\nMV  Carbin")).toBe("Dagens matchsponsor: Polar\n\nVITA\nMV  Carbin");
    expect(buildNewsBody("", "VITA")).toBe("VITA");
  });

  it("hemmalaget växlar varannan gång", () => {
    expect(defaultHome(null)).toBe("a");
    expect(defaultHome("a")).toBe("b");
    expect(defaultHome("b")).toBe("a");
  });

  it("sponsorloggans filnamn", () => {
    expect(sponsorLogoPath("Polar")).toBe("/images/sponsors/polar.png");
    expect(sponsorLogoPath("Lindström Transport AB")).toBe("/images/sponsors/lindstrom-transport-ab.png");
  });
});

describe("bildlayout", () => {
  it("matchbandet är 2:1 och ligger exakt i mitten, även när lagen är olika stora", () => {
    const a = fullTeam("team-a"); // 2 MV, 8 B, 12 F
    const b = fullTeam("team-b", 5);
    const hA = teamPanelHeight(teamColumns(a.slots, a.lineup));
    const hB = teamPanelHeight(teamColumns(b.slots, b.lineup));
    expect(hA).toBeGreaterThan(hB);

    const layout = computeNewsLayout(hA, hB);
    expect(layout.band.h).toBe(NEWS_IMAGE.WIDTH / 2);
    expect(layout.band.y + BAND_H / 2).toBe(layout.height / 2);

    // Panelerna ligger mot bandet och ryms i bilden
    expect(layout.panelA.y).toBeGreaterThanOrEqual(NEWS_IMAGE.PAD);
    expect(layout.panelA.y + layout.panelA.h).toBe(layout.band.y - NEWS_IMAGE.BAND_GAP);
    expect(layout.panelB.y).toBe(layout.band.y + BAND_H + NEWS_IMAGE.BAND_GAP);
    expect(layout.panelB.y + layout.panelB.h).toBeLessThanOrEqual(layout.height - NEWS_IMAGE.PAD);
  });

  it("fullt lag delas i två kolumner: målvakter+backar och forwards", () => {
    const a = fullTeam("team-a");
    const cols = teamColumns(a.slots, a.lineup);
    expect(cols.left.map((s) => s.kind)).toEqual(["goalkeeper", "defense"]);
    expect(cols.right.map((s) => s.kind)).toEqual(["forward"]);
    expect(cols.left[1].groups).toHaveLength(4);
    expect(cols.right[0].groups).toHaveLength(4);
  });

  it("tomt lag ger bara rubrikhöjd", () => {
    const slots = createTeamSlots("team-a", MAX_TEAM_CONFIG);
    const h = teamPanelHeight(teamColumns(slots, {}));
    expect(h).toBe(NEWS_IMAGE.PANEL_PAD * 2 + NEWS_IMAGE.HEADER_H);
  });
});
