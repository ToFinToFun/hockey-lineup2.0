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
