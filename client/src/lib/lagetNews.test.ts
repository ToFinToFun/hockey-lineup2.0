import { describe, expect, it } from "vitest";
import {
  BAND_H,
  NEWS_IMAGE,
  buildNewsBody,
  computeNewsLayout,
  defaultHomeForDate,
  formatNewsTitle,
  defaultPublishAt,
  shortDate,
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

  it("fet sponsor och HTML-säkert namn", () => {
    expect(buildNewsBody("Polar & Co", "X", true)).toBe("Dagens matchsponsor: <b>Polar &amp; Co</b>\n\nX");
  });

  it("standardtid 21:15 på evenemangsdagen, annars direkt", () => {
    const now = new Date(2026, 8, 29, 16, 0);
    expect(defaultPublishAt("2026-09-29", now)).toEqual({ date: "2026-09-29", hour: "21", minute: "15" });
    expect(defaultPublishAt("2026-09-29", new Date(2026, 8, 29, 21, 30))).toBeNull();
    expect(defaultPublishAt(undefined, now)).toBeNull();
  });

  it("hemmalaget: tisdag Gröna, torsdag Vita, annars slump", () => {
    expect(defaultHomeForDate("2026-09-29")).toBe("b"); // tisdag: Gröna hemma
    expect(defaultHomeForDate("2026-10-01")).toBe("a"); // torsdag: Vita hemma
    expect(defaultHomeForDate("2026-10-03", () => 0.1)).toBe("a"); // lördag: slump
    expect(defaultHomeForDate("2026-10-03", () => 0.9)).toBe("b");
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

import { lineupStateToText } from "./lineupText";

describe("uppställningen med fet stil", () => {
  it("lagnamn, positioner och C/A blir feta, namn HTML-säkra", () => {
    const text = lineupStateToText(
      {
        teamAName: "Vita",
        teamBName: "Gröna",
        teamAConfig: MAX_TEAM_CONFIG,
        teamBConfig: MAX_TEAM_CONFIG,
        lineup: {
          "team-a-def-1-1": { id: "1", name: "Henrik <Björling>", number: "81", position: "B" } as never,
          "team-a-fwd-1-lw": { id: "2", name: "Hampus Bergman Lahti", number: "16", position: "F", captainRole: "C" } as never,
        },
      },
      { bold: true }
    );
    expect(text).toContain("<b>VITA</b>");
    expect(text).toContain("<b>B</b>    Henrik &lt;Björling&gt; #81");
    expect(text).toContain("<b>LW</b>   Hampus Bergman Lahti #16 <b>(C)</b>");
  });
});
