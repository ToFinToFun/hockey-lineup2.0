# Plan: klubbinställningar, lag som begrepp och matcher mot andra lag

Senast uppdaterad: 2026-09-30. Ägare: Jerry. Status: **steg 0–3 klara på main (ej driftsatta)**.

## Målbild

1. Appen kan sättas upp för en annan förening: klubbens namn, kortnamn (t.ex. "SSF"), loggor och lagfärger ställs in under Inställningar – inte i koden. Stålstadens ser exakt ut som idag efter varje steg.
2. En match kan vara **intern** (som idag: två egna lag, t.ex. Vita mot Gröna) eller **extern** (vårt lag mot en motståndare).
3. **Vårt lag** i en extern match har valbart namn och logga – klubben ("Stålstadens SF"/"SSF") eller ett av de interna lagen.
4. **Motståndare** sparas med namn, logga, färg och spelare (nummer, position). Nästa match mot samma lag är i stort sett förifylld – spelare dras in på platserna, nya läggs till direkt.
5. Motståndarläget fungerar i hela flödet: Lineup → Score Tracker → matchhistorik → matchrapport, nyhet och Media → statistik.

## Beslut (2026-09-30)

- **Statistik:** externa matcher räknas **inte** som standard. Ett val "Inkl. externa matcher" slår på dem.
- **PIR:** bara interna matcher.
- **Vårt lag i externa matcher:** namn och logga väljs per match (standard: klubbens namn och logga).
- **Motståndarnas spelare** får egen statistik mot oss, skild från vår statistik och vårt spelarregister.

## Principer så att inget går sönder

- **Små steg, en version per steg**, som var för sig kan driftsättas och rullas tillbaka.
- **Standardvärdena = dagens värden.** Steg 1–2 ska inte ge någon synlig skillnad för Stålstadens.
- **Kontrollbilder:** innan något ändras tas referensbilder (matchrapport, nyhetsbild, hockeykort, Media) och en test jämför att de ritas likadant efter varje steg.
- **Databas:** bara tillägg (nya tabeller/kolumner med standardvärden), inga ändringar eller borttagningar av befintliga data. Backup före varje migrering.
- **Motståndarläget ligger bakom en flagga** tills steg 6 är klart – syns inte för användarna under tiden.
- Befintliga tester ska passera i varje steg; nya tester för varje ny del.

## Steg

### Steg 0 – Skyddsnät (ingen synlig ändring) ✅
- Referensbilder och jämförelsetest för matchrapport (resultat, mål, stjärnkort), nyhetsbild, hockeykort (alla stilar) och Media (alla mallar).
- Test som kör hela flödet: uppställning → match i Score Tracker → matchhistorik → statistik.
- **Klart när:** testerna finns och är gröna på nuvarande kod.

### Steg 1 – Klubbinställningar (liten synlig ändring: ny flik) ✅
- Gjort: klubbprofil i shared/clubProfiles (standardvärden per förening, väljs med CLUB_PROFILE) + Inställningar → Klubb.
- Ny flik Inställningar → **Klubb**: klubbens namn, kortnamn, loggor (klubbens logga + en per internt lag), de interna lagens namn och färger (standard Vita/Gröna), hashtags, kända hallar, laget.se-lagets adress.
- Alla hårdkodade "Stålstadens"/"STÅLSTADENS SF", loggsökvägar och lagnamn läses från inställningarna (idag ~47 ställen i 23 filer + loggor på ~24 ställen).
- **Klart när:** referensbilderna är oförändrade och ändrat klubbnamn/logga slår igenom överallt.

### Steg 2 – Lag som begrepp (ingen synlig ändring) ✅
- Gjort: shared/teams (namn, färg, logga, regel för lag A/B), lagnamn och färger överallt, uppladdning av loggor, hemmalag per veckodag i profilen. Lagringen white/green och team-a/team-b är oförändrad.
- Varje sida i en match beskrivs som ett **lag**: namn, kortnamn, färg, logga och typ (internt lag / vår klubb / motståndare).
- Befintlig lagring (white/green, team-a/team-b) behålls – ett översättningslager gör om dem till lag. Inga befintliga data ändras.
- Ritkod (rapport, nyhet, kort, Media), Lineup, Score Tracker och statistik byts över till lag-begreppet (~100 ställen), del för del.
- **Klart när:** alla tester och referensbilder är oförändrade.

### Steg 3 – Motståndarregister (bakom flagga) ✅
- Gjort: flaggan "Beta: matcher mot andra lag" (Inställningar → Klubb), fliken Motståndare, tabellerna opponents/opponent_players.
- Nya tabeller: motståndare (namn, kortnamn, logga, färg) och deras spelare (namn, nummer, position).
- Sida för att skapa/redigera motståndare och deras spelare.
- **Klart när:** motståndare kan skapas, redigeras och tas bort; inget annat påverkas.

### Steg 4 – Lineup mot motståndare (bakom flagga)
- Val per uppställning: **Internmatch** / **Mot motståndare**.
- Mot motståndare: vår sida från hela truppen med valbart namn/logga (standard klubben), motståndarens sparade spelare dras in på platserna, nya läggs till direkt och sparas i registret.
- **Klart när:** en extern uppställning kan byggas, sparas och laddas igen; interna uppställningar fungerar som förut.

### Steg 5 – Score Tracker och sparade matcher (bakom flagga)
- Matchen sparas som intern/extern, med motståndare och vårt lags namn/logga.
- Målskytt/assist väljs från respektive lag; motståndarnas mål knyts till deras spelare.
- **Klart när:** en extern match kan spelas, sparas (även offline) och redigeras i matchhistoriken.

### Steg 6 – Bilder och nyheter (flaggan tas bort)
- Matchrapport, nyhet till laget.se, Media och stjärnkort visar motståndarens namn och logga.
- **Klart när:** alla bilder fungerar för både interna och externa matcher; flaggan tas bort.

### Steg 7 – Statistik
- Val **Inkl. externa matcher** (av som standard) i Statistik, spelarprofil, hockeykort och Media.
- Resultat mot varje motståndare (V/O/F, målskillnad, bästa målskytt mot dem) och motståndarspelarnas statistik mot oss.
- PIR räknar bara interna matcher (uttryckligt filter).
- **Klart när:** standardstatistiken är oförändrad och externa matcher syns när valet är på.

## Senare (efter målbilden)
- Installationsmall per förening (Coolify: egen databas och miljövariabler) och en guide för att sätta upp en ny klubb.
- Gränssnittets färger efter klubbens profil (idag ~316 hårdkodade gröna ställen – kan vänta).
- Statistik per hall (plats sparas redan per match).

## Öppna frågor
- Ska en extern match kunna ha fler än en egen målvakt/kedja än dagens max (6 backar, 12 forwards)? (Antas: samma max.)
- Ska motståndarnas spelare synas i Media-mallen Statistik (t.ex. "deras bästa målskytt mot oss")? (Antas: ja, i steg 7.)
