# Buggar att åtgärda

- [x] BUG 1: Spelare hamnar i målvakt-slot - FIXAD: Villkorlig rendering (isMobile) eliminerar dubbla droppables
- [x] BUG 2: Long-press hold-timer - FIXAD: Tog bort onPointerLeave, lade till 15px tolerans, fixade CSS animation
- [x] BUG 3: Scroll-problem i mobilvy - FIXAD: autoScroll aktiverat, touchAction: manipulation på slots, scroll-lock under drag

# Features

- [x] Grundläggande lineup-verktyg med drag-and-drop
- [x] Firebase realtidssynk
- [x] Exportera uppställning
- [x] Dela uppställning via länk
- [x] Spelartrupp header med antal spelare och anmälda
- [x] Hämta anmälningar från laget.se (hårdkodad lista)
- [x] Backend-integration med laget.se (live-hämtning via server-scraping)
- [x] Asynkron knapp med laddningsindikator för laget.se-hämtning
- [x] Visar event-titel och datum i resultmeddelandet
- [x] Felhantering med röd felindikator vid misslyckad hämtning
- [x] Ändra header till "Anmälda X/Y st" (X = anmälda kvar i truppen, Y = totalt anmälda)
- [x] Ändra spelarantal i header till "X/Y spelare" (X = kvar i listan, Y = totalt antal spelare)
