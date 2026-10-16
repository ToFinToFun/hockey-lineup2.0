import { describe, expect, it } from "vitest";
import { dayMark } from "./holidays";

describe("svenska helgdagar", () => {
  it("julen: dagen före julafton gul, julafton röd", () => {
    expect(dayMark("2026-12-23")).toEqual({ kind: "eve", name: "Dagen före julafton" });
    expect(dayMark("2026-12-24")?.kind).toBe("red");
    expect(dayMark("2026-12-26")?.name).toBe("Annandag jul");
    expect(dayMark("2026-12-27")).toBeNull();
  });
  it("rörliga helger 2027 (påsk 28 mars)", () => {
    expect(dayMark("2027-03-26")?.name).toBe("Långfredagen");
    expect(dayMark("2027-03-25")).toEqual({ kind: "eve", name: "Dagen före långfredagen" });
    expect(dayMark("2027-03-27")).toEqual({ kind: "eve", name: "Påskafton" });
    expect(dayMark("2027-05-06")?.name).toBe("Kristi himmelsfärdsdag");
    expect(dayMark("2027-06-25")?.name).toBe("Midsommarafton");
    expect(dayMark("2027-06-24")?.kind).toBe("eve");
  });
  it("alla helgons dag och valborg 2026", () => {
    expect(dayMark("2026-10-31")?.name).toBe("Alla helgons dag");
    expect(dayMark("2026-10-30")?.name).toBe("Allhelgonaafton");
    expect(dayMark("2026-04-30")?.name).toBe("Valborgsmässoafton");
  });
});
