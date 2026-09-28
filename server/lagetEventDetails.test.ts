import { describe, expect, it } from "vitest";
import { extractEventDetailsFromEditPage } from "./lagetSe";

describe("extractEventDetailsFromEditPage", () => {
  it("läser plats och starttid från formulärfält", () => {
    const html = `
      <form>
        <input type="hidden" name="LocationId" value="123">
        <input type="text" name="Location" value="Luleå  Energi Arena">
        <input type="text" name="StartTime" value="9:30">
      </form>`;
    expect(extractEventDetailsFromEditPage(html)).toEqual({ location: "Luleå Energi Arena", time: "09:30" });
  });

  it("returnerar tomt när fälten saknas eller är tomma", () => {
    expect(extractEventDetailsFromEditPage(`<input name="Location" value="">`)).toEqual({});
  });
});

import { parseNewsList, parseNewsForm, buildNewsFormFields } from "./lagetSe";

// Utdrag ur laget.se-admin (Nyheter), samma struktur som i inspelningen
const LIST_HTML = `<div id="news_container"><table class="default_list"><tbody>
<tr><td class="listNewsDataDate">2026-09-27 <i class="icon-time" title="Nyheten väntar på publicering"></i></td>
<td class="listNewsNameDesktop">
TEST Lagen 29/9 – 22:15                </td><td><div class='submitButton'><a href="/Stalstadens/NewsManagement/Delete/8164219/1">Ta bort</a></div>
<div class='submitButton'><a href="/Stalstadens/NewsManagement/Update/8164219">Redigera</a></div></td></tr>
<tr class="devider_tr"><td colspan="100"></td></tr>
<tr><td class="listNewsDataDate">2026-09-24</td><td class="listNewsNameDesktop">Lag idag</td>
<td><a href="/Stalstadens/NewsManagement/Update/8162730">Redigera</a></td></tr>
</tbody></table></div>`;

const FORM_HTML = `<form action="/Stalstadens/NewsManagement/Add" enctype="multipart/form-data" id="createNewsForm" method="post">
<input type="hidden" id="Id" name="Id" value="8164219" />
<input id="Picture_FileId" name="Picture.FileId" type="hidden" value="11986067" />
<input id="intTopNews" name="IsTopNews" type="checkbox" value="true" /><input name="IsTopNews" type="hidden" value="false" />
<input type='radio' name='WhoCanComment' value=None class='radio' />
<input type='radio' name='WhoCanComment' value=MembersOfSite class='radio' />
<input type='radio' name='WhoCanComment' value=LoggedInUsers class='radio' checked="true" />
</form>`;

describe("laget.se nyheter (adminformuläret)", () => {
  it("läser nyhetslistan", () => {
    expect(parseNewsList(LIST_HTML)).toEqual([
      { id: 8164219, title: "TEST Lagen 29/9 – 22:15", date: "2026-09-27", scheduled: true },
      { id: 8162730, title: "Lag idag", date: "2026-09-24", scheduled: false },
    ]);
  });

  it("läser befintliga värden vid uppdatering", () => {
    expect(parseNewsForm(FORM_HTML)).toEqual({ fileId: "11986067", whoCanComment: "LoggedInUsers", isTopNews: false });
  });

  it("tidsinställd ny nyhet skickar tid och avsändare som webbläsaren gör", () => {
    const f = buildNewsFormFields(
      { title: "Lagen 29/9", body: "a\n<b>b</b>", showPublisher: true, publishAt: { date: "2026-09-29", hour: "21", minute: "15" } },
      null
    );
    expect(f).toContainEqual(["Id", "0"]);
    expect(f).toContainEqual(["Picture.FileId", "0"]);
    expect(f).toContainEqual(["Body", "a\r\n<b>b</b>"]);
    expect(f).toContainEqual(["PublishNow", "false"]);
    expect(f).toContainEqual(["NewsTime", "2026-09-29"]);
    expect(f).toContainEqual(["PublishHourSelect", "21"]);
    expect(f).toContainEqual(["PublishMinuteSelect", "15"]);
    expect(f.filter(([k]) => k === "ShowPublisher").map(([, v]) => v)).toEqual(["true", "false"]);
    expect(f.filter(([k]) => k === "IsTopNews").map(([, v]) => v)).toEqual(["false"]);
  });

  it("direkt publicering skickar inga tidsfält; uppdatering behåller bild-id", () => {
    const f = buildNewsFormFields(
      { id: 8164219, title: "x", body: "y", showPublisher: false },
      { fileId: "11986067", whoCanComment: "MembersOfSite", isTopNews: true }
    );
    expect(f).toContainEqual(["PublishNow", "true"]);
    expect(f.some(([k]) => k === "NewsTime")).toBe(false);
    expect(f).toContainEqual(["Id", "8164219"]);
    expect(f).toContainEqual(["Picture.FileId", "0"]);
    expect(f).toContainEqual(["WhoCanComment", "MembersOfSite"]);
    expect(f.filter(([k]) => k === "ShowPublisher").map(([, v]) => v)).toEqual(["false"]);
    expect(f.filter(([k]) => k === "IsTopNews").map(([, v]) => v)).toEqual(["true", "false"]);
  });
});

import { extractAccountName } from "./lagetSe";

describe("laget.se kontonamn", () => {
  it("läser inloggade kontots namn", () => {
    expect(extractAccountName(`{"user":{"is_loggedin":true,"name":"Jerry Paasovaara","first_name":"Jerry"}}`)).toBe("Jerry Paasovaara");
    expect(extractAccountName(`{"user":{"is_loggedin":false}}`)).toBeNull();
  });
});

import { recentForm } from "./playerHistory";

describe("form senaste matcherna", () => {
  const m = (id: number, day: number, white: number, green: number, lineup: Record<string, { id: string }>) =>
    ({ id, teamWhiteScore: white, teamGreenScore: green, matchEndTime: new Date(2026, 8, day), lineup: { teamAName: "VITA", teamBName: "GRÖNA", lineup } }) as never;

  it("per spelare oavsett lag, äldst först; per lag", () => {
    const f = recentForm([
      m(2, 10, 1, 3, { "team-a-gk-1": { id: "p1" }, "team-b-gk-1": { id: "p2" } }),
      m(1, 3, 2, 2, { "team-b-def-1-1": { id: "p1" } }),
      m(3, 17, 4, 1, { "team-b-fwd-1-c": { id: "p1" } }),
    ]);
    expect(f.players.get("p1")?.join("")).toBe("OFF");
    expect(f.players.get("p2")?.join("")).toBe("V");
    expect(f.teams.white.join("")).toBe("OFV");
    expect(f.teams.green.join("")).toBe("OVF");
  });

  it("högst n matcher", () => {
    const many = Array.from({ length: 14 }, (_, i) => m(i + 1, i + 1, 1, 0, { "team-a-gk-1": { id: "p" } }));
    expect(recentForm(many, 10).players.get("p")).toHaveLength(10);
  });
});

import { recentWinners } from "./playerHistory";

describe("resultatraden", () => {
  it("vinnare äldst först, högst n", () => {
    const mk = (day: number, w: number, g: number) => ({ teamWhiteScore: w, teamGreenScore: g, matchEndTime: new Date(2026, 8, day) }) as never;
    const r = recentWinners([mk(3, 1, 2), mk(1, 3, 1), mk(2, 2, 2)], 2);
    expect(r.map((x) => x.winner)).toEqual(["O", "G"]);
    expect(r[1]).toMatchObject({ white: 1, green: 2 });
  });
});

import { normalizeGoalType } from "./playerHistory";

describe("måltyper i statistiken", () => {
  it("Straff behålls, äldre typer blir Övrigt, självmål räknas inte", () => {
    expect(normalizeGoalType("Straff")).toBe("Straff");
    expect(normalizeGoalType("Solo")).toBe("Övrigt");
    expect(normalizeGoalType(undefined)).toBe("Övrigt");
    expect(normalizeGoalType("Självmål")).toBeNull();
  });
});
