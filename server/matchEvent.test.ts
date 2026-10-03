import { describe, expect, it } from "vitest";
import { applyExternalEvent } from "./matchEvent";
import { INTERNAL_SETUP } from "../shared/matchSetup";

const att = { eventTitle: "Träning", eventDate: "2026-10-06", eventTime: "20:00", eventLocation: "Coop Arena", registeredNames: ["A"] };
const ext = { mode: "external" as const, opponentId: 1, ourName: null, ourLogo: "club" as const };

describe("egen dag/tid/plats för matcher mot andra lag", () => {
  it("internmatch: laget.se gäller", () => {
    expect(applyExternalEvent(att, INTERNAL_SETUP, null)).toEqual(att);
  });
  it("bara egen plats: laget.se:s dag och tid behålls", () => {
    expect(applyExternalEvent(att, { ...ext, location: "Kalix ishall" }, "Kalix HC")).toMatchObject({ eventDate: "2026-10-06", eventTime: "20:00", eventLocation: "Kalix ishall", eventTitle: "Match mot Kalix HC" });
  });
  it("annan dag: laget.se:s tid och plats gäller inte", () => {
    expect(applyExternalEvent(att, { ...ext, date: "2026-10-10", time: "15:30" }, "Kalix HC")).toMatchObject({ eventDate: "2026-10-10", eventTime: "15:30", eventLocation: undefined, registeredNames: ["A"] });
  });
  it("ingen laget.se-händelse men egen dag → match finns", () => {
    expect(applyExternalEvent({ noEvent: true } as typeof att & { noEvent: boolean }, { ...ext, date: "2026-10-10", time: "15:30" }, null)).toMatchObject({ noEvent: false, eventDate: "2026-10-10" });
  });
});
