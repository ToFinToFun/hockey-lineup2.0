import { describe, expect, it } from "vitest";
import { attendanceAfterSync, type Player } from "./players";

const base = { id: "p1", name: "Test", number: "1", position: "C" } as Player;

describe("attendanceAfterSync – Kommer satt bara i appen", () => {
  it("står kvar när anmälningarna hämtas för samma evenemang", () => {
    const p = { ...base, isRegistered: true, registeredLocal: "2026-10-20" };
    expect(attendanceAfterSync(p, false, false, "2026-10-20")).toEqual({ isRegistered: true, isDeclined: false, registeredLocal: "2026-10-20" });
  });
  it("utan datum knyts den till evenemanget som hämtas", () => {
    const p = { ...base, isRegistered: true, registeredLocal: "" };
    expect(attendanceAfterSync(p, false, false, "2026-10-20").registeredLocal).toBe("2026-10-20");
  });
  it("försvinner vid nästa evenemang", () => {
    const p = { ...base, isRegistered: true, registeredLocal: "2026-10-20" };
    expect(attendanceAfterSync(p, false, false, "2026-10-27")).toEqual({ isRegistered: false, isDeclined: false, registeredLocal: undefined });
  });
  it("anmäld på laget.se ersätter den gula markeringen", () => {
    const p = { ...base, isRegistered: true, registeredLocal: "2026-10-20" };
    expect(attendanceAfterSync(p, true, false, "2026-10-20")).toEqual({ isRegistered: true, isDeclined: false, registeredLocal: undefined });
  });
  it("vanlig spelare som inte är anmäld blir inte svarat", () => {
    expect(attendanceAfterSync({ ...base, isRegistered: true }, false, false, "2026-10-20").isRegistered).toBe(false);
  });
});
