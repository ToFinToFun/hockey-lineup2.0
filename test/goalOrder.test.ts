/**
 * Målens ordning har vänts fram och tillbaka och tolkats på olika sätt. Regeln
 * (shared/goalOrder.ts): goalHistory sparas med det SENASTE målet först, och
 * all tidsordning går via goalsOldestFirst/firstGoal/lastGoal/winningGoalIndex.
 * Testet larmar om någon vänder eller plockar första/sista mål på egen hand.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { goalsOldestFirst, goalsForStorage, firstGoal, lastGoal, winningGoalIndex, storageIndex } from "../shared/goalOrder";

const ROOT = path.resolve(__dirname, "..");
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "dist" ? [] : files(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("målens ordning", () => {
  // Lagrat: senaste först
  const stored = [{ team: "white", n: 3 }, { team: "green", n: 2 }, { team: "green", n: 1 }];

  it("hjälpfunktionerna", () => {
    expect(goalsOldestFirst(stored).map((g) => g.n)).toEqual([1, 2, 3]);
    expect(goalsForStorage(goalsOldestFirst(stored))).toEqual(stored);
    expect(firstGoal(stored)?.n).toBe(1);
    expect(lastGoal(stored)?.n).toBe(3);
    expect(goalsOldestFirst(null)).toEqual([]);
    expect(storageIndex(3, 0)).toBe(2);
  });

  it("matchvinnande mål: vinnarlagets mål nummer förlorarens mål + 1, i tidsordning", () => {
    // Tidsordning: grön 1–0, grön 2–0, vit 2–1, vit 2–2, vit 2–3 (vinnande = vitas tredje)
    const s = goalsForStorage([{ team: "green" }, { team: "green" }, { team: "white" }, { team: "white" }, { team: "white" }]);
    expect(winningGoalIndex(s, 3, 2)).toBe(4);
    expect(winningGoalIndex(s, 2, 2)).toBe(-1);
    expect(winningGoalIndex(goalsForStorage([{ team: "Vita" }, { team: "Gröna" }, { team: "Vita" }]), 2, 1)).toBe(2);
  });

  it("ingen kod vänder goalHistory eller plockar första/sista mål på egen hand", () => {
    const bad: string[] = [];
    for (const f of [...files(path.join(ROOT, "server")), ...files(path.join(ROOT, "client/src")), ...files(path.join(ROOT, "shared"))]) {
      if (f.endsWith(path.join("shared", "goalOrder.ts"))) continue;
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/goal(History|s)\b[^;]*\.reverse\(\)/.test(line) || /goal(History|s)\)?\[(0|[^\]]*length\s*-\s*1)\]/.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad, "Använd shared/goalOrder.ts (goalHistory sparas med det senaste målet först)").toEqual([]);
  });
});
