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

import { extractAuthToken, apiErrorMessage } from "./lagetSe";

describe("laget.se nyheter", () => {
  it("läser refId (auth-token) ur inloggad sida", () => {
    const html = `<script>var x = {"user":{"is_loggedin":true,"id":1,"refId":"123_abc-def","username":"X"}};</script>`;
    expect(extractAuthToken(html)).toBe("123_abc-def");
    expect(extractAuthToken("<html>utloggad</html>")).toBeNull();
  });

  it("felmeddelanden från api.laget.se", () => {
    expect(apiErrorMessage(400, { validationErrors: [{ message: "Rubrik saknas" }] })).toBe("laget.se: Rubrik saknas");
    expect(apiErrorMessage(401, null)).toMatch(/^AUTH_ERROR/);
    expect(apiErrorMessage(500, "x")).toBe("laget.se svarade med fel (500).");
  });
});
