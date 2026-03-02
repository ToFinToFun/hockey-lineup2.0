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
- [x] Ta bort "spelare" efter antal och "st" efter anmälda i headern
- [x] Flytta knappen "Hämta anmälningar (laget.se)" till ovanför Sparade uppställningar
- [x] Flytta Hämta anmälningar-knappen till under Lägg till spelare men ovanför Sparade uppställningar
- [x] Ändra lagpanelernas header till "Antal spelare i laget / Anmälda spelare" istället för nuvarande format
- [x] Ändra lagpanel-header till att bara visa antal spelare i laget, t.ex. "11 Spelare"
- [x] BUGG: Delad skrivskyddad länk visar bara en målvakt, ett backpar och en kedja per lag istället för alla ifyllda
- [x] Ändra delad vy: rubrik till "Laguppställning [Veckodag] [dd/mm]", undertitel till "Delad [datum]"
- [x] Flytta C/A-badges till efter spelarnamn och nummer i delad vy
- [x] Ändra mobil-flikar till Lagnamn (utplacerade/anmälda) istället för nuvarande format
- [x] Hantera scenario när det inte finns någon aktivitet idag på laget.se — nollställ anmälningar
- [x] Ändra tillbaka så att backend alltid hittar nästa kommande träning (inte begränsat till idag/imorgon)
- [x] Ändra desktop lagpanel-header till "antal spelare/antal anmälda" som i mobilversionen
- [x] Desktop lagheader: byt ordning till "anmälda/totalt anmälda spelare" (t.ex. "6/11 anmälda spelare")
- [x] Mobil lagflikar: byt ordning till anmälda/totalt utan text
- [x] Desktop lagheader: ändra till "X anmälda av/Y spelare i laget"
- [x] Automatisk hämtning av anmälningar vid sidladdning
- [x] Netlify Function för laget.se-endpointen
