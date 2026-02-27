import { describe, expect, it } from "vitest";
import { fetchAttendance } from "./lagetSe";

describe("laget.se integration", () => {
  it("should fetch attendance or report no event without error", async () => {
    const result = await fetchAttendance();

    // Log for debugging
    console.log("Event:", result.eventTitle);
    console.log("Date:", result.eventDate);
    console.log("Registered:", result.totalRegistered, "players");
    console.log("Names:", result.registeredNames.join(", "));
    console.log("noEvent:", result.noEvent);
    if (result.error) console.log("Error:", result.error);

    // Should not have a fatal error
    expect(result.error).toBeUndefined();

    if (result.noEvent) {
      // No upcoming event — valid response
      expect(result.registeredNames).toEqual([]);
      expect(result.totalRegistered).toBe(0);
      expect(result.noEvent).toBe(true);
    } else {
      // Event found — may or may not have registered players yet
      expect(result.eventTitle).toBeTruthy();
      expect(result.eventDate).toBeTruthy();
      expect(result.totalRegistered).toBe(result.registeredNames.length);

      // Names should be strings, not empty
      for (const name of result.registeredNames) {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(1);
        // Should not contain quotes (smeknamn should be stripped)
        expect(name).not.toContain('"');
      }
    }
  }, 30000); // 30s timeout for network requests

  it("should return proper structure even on error", async () => {
    // The result should always have the correct shape
    const result = await fetchAttendance();
    expect(result).toHaveProperty("eventTitle");
    expect(result).toHaveProperty("eventDate");
    expect(result).toHaveProperty("registeredNames");
    expect(result).toHaveProperty("totalRegistered");
    expect(Array.isArray(result.registeredNames)).toBe(true);
    expect(typeof result.totalRegistered).toBe("number");
  }, 30000);
});
