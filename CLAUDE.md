# Regler för den här kodbasen

- **Målens ordning:** `goalHistory` (databasen, Score Tracker, live, API) sparas med det **senaste målet först** (index 0). Behövs tidsordning, första/sista mål eller matchvinnande mål: använd `shared/goalOrder.ts` (`goalsOldestFirst`, `firstGoal`, `lastGoal`, `winningGoalIndex`, `goalsForStorage`). Vänd aldrig själv – `test/goalOrder.test.ts` larmar.
- **Version och deploy:** varje version committas som `vX.Y.Z: …` (taggen sätts automatiskt av GitHub Actions), CHANGELOG.md uppdateras, och `main` pushas även till `production`.
- **Kontrollbilder (test/golden):** fingeravtrycken gäller CI (Ubuntu 24.04). I andra miljöer: jämför före/efter lokalt med `UPDATE_GOLDEN=1` i stället.
