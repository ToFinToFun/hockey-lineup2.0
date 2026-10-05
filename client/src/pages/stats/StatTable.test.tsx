// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { StatTable } from "./StatTable";

type R = { id: string; name: string; g: number; ga60: number | null };
const rows: R[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Spelare ${i}`, g: i, ga60: i === 3 ? null : 12 - i }));

describe("statistikens tabell", () => {
  it("sorterar på rubriken, vänder vid nytt klick, topp 10 och Visa alla", () => {
    render(<StatTable rows={rows} rowKey={(r) => r.id} name={(r) => r.name} defaultSort="g"
      columns={[{ key: "g", label: "M", value: (r) => r.g }, { key: "ga60", label: "/60", value: (r) => r.ga60, lowerIsBetter: true }]} />);
    const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent);
    expect(names()).toHaveLength(10);
    expect(names()[0]).toBe("Spelare 11");
    fireEvent.click(screen.getByRole("button", { name: /^M/ }));
    expect(names()[0]).toBe("Spelare 0");
    // Lägre är bättre: första klicket stigande, saknat värde sist
    fireEvent.click(screen.getByRole("button", { name: /\/60/ }));
    expect(names()[0]).toBe("Spelare 11");
    fireEvent.click(screen.getByRole("button", { name: /Visa alla 12/ }));
    expect(names()).toHaveLength(12);
    expect(names()[11]).toBe("Spelare 3");
  });
});
