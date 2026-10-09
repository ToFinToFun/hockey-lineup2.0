# Ändringslogg

Versionsnummer: `MAJOR.MINOR.PATCH`
- **PATCH** (2.0.1): buggfixar och småjusteringar
- **MINOR** (2.1.0): nya funktioner
- **MAJOR** (3.0.0): stora omtag som ändrar hur appen används

Versionen höjs i `package.json` vid varje deploy till `production`, och commiten taggas `vX.Y.Z` på GitHub. Versionen och byggdatumet visas diskret längst ner i appen och i `/api/health`.

## 2.71.1 – 2026-10-09

- Statistik → Speltid: sorteras på speltid per match (kolumnen "Tid/match").
- Mål per match (trend): luft ovanför staplarna så att antalet alltid syns.
- Rekorden (lagrekord, spelarrekord och övriga) går att klicka – öppnar matchen i matchhistoriken.
- Snabbaste målet: matcher där starttiden sattes från första målet (ingen träning hittades) räknas inte.

## 2.71.0 – 2026-10-09

Buggrättningar och förbättringar från veckans lista.

- Auto: alla anmälda placeras alltid ut (före andra regler) så länge lagen inte är fulla – säkerhetsnät som lägger den som blivit över på en ledig plats och utökar formationen vid behov; fler rena målvakter än målvaktsplatser spelar ute. Testas med 5 000 slumpade trupper.
- Matchens tid, plats och längd fylls i av servern när matchen sparas – även när den som sparar inte är inloggad (Score Tracker är öppen för alla och kunde inte läsa laget.se) eller sparar efter träningen. Servern minns de senaste evenemangen från laget.se. Score Tracker visar träningens tid och plats för alla.
- Statistik: målen räknades i fel ordning (de sparas med det senaste först) – Snabbaste målet, Största vändningen och matchens första/sista mål i Kul statistik är rättade.
- Kul statistik: matcher i mål räknas inte i utespelarnas sviter; ny kolumn "0 p nu" (pågående svit utan poäng). Mål utan namn räknas inte längre på spelare utan namn.
- Målvakter: nya sviter – flest matcher i rad med högst 1/2/3 insläppta, pågående svit och vinster i rad.
- Standardsortering: Speltid på P/60, Målvakter på insläppta/60.
- Mobil: svep i en tabell byter inte längre flik; namnkolumnen står kvar när en bred tabell scrollas.
- Media → Statistik: målvaktslistor (insläppta/60, vinster, nollor, svit ≤2 insläppta).
- Hockeykortet är spelarens bild: "Som profilbild" borttagen – ett sparat kort är alltid bilden och uppdateras automatiskt; utan sparat kort används standardkortet (även i Lineup och Video).
- Rubrikerna (Media, Spelare, Hockeykort, Matchhistorik, Statistik, Inställningar) går att klicka för att komma tillbaka.

## 2.70.0 – 2026-10-09

- Video: bilden från Media kan placeras Först (standard), Efter introt, Efter klippet eller Sist.
- Video: titelkortet (intro 2) kan stängas av.
- Video: välj ett sparat Media-inlägg direkt – Media ritar det i bakgrunden i båda formaten.
- Förhandsvisningen i Video visar delarna i rätt ordning och hela videons längd.
- Videons delar och längder räknas på ett ställe (shared/videoTimeline.ts) för både webbläsaren och servern.
- Versionstaggar sätts automatiskt av GitHub Actions för varje versionscommit.
- docs/PLAN-senare.md: idéer och saker att komma ihåg.

## 2.69.3 – 2026-10-09

- Säkerhet: nodemailer 6 → 10 (fem kända sårbarheter med hög allvarlighet). Säkerhetsgranskningen i CI går igenom igen.

## 2.69.2 – 2026-10-09

- Tester: delningslänk- och motståndartesterna förbereder själva uppställningen (vår spelare, tomt motståndarlag) i stället för att bero på vad databasen råkar innehålla – de föll på en tom databas i CI.

## 2.69.1 – 2026-10-09

- Tester: servertesterna körs en fil i taget (de delar databasen och Lineups dokument och kunde skriva över varandra i CI), "Ändrad"-testet tål att databasen avrundar till hela sekunder, CI låst till Ubuntu 24.04.

## 2.69.0 – 2026-10-09

- Media: alla mallar kan göras i både Flöde 4:5 och Story/Reel 9:16. I 9:16 fyller bakgrunden hela bilden och innehållet ligger inom Instagrams säkra yta. Valet sparas med inlägget.
- Media: ny mall "Bild" – valfri uppladdad bild i ram (som hockeykorten), fria rubriker och en info-rad under bilden.
- Media → Video: "Använd före ett videoklipp" lägger bilden mellan titelkortet och klippet. Bilden skickas i båda formaten, så rätt format väljs automatiskt. Visas 3,5 s (2–8 s). I Video kan man också ladda upp en valfri bild direkt.
- Videons maxlängd räknar med bilden (klippets maxlängd minskar i motsvarande grad).

## 2.68.2 – 2026-10-06

- Livesidan: "Nedslag om" heter nu "Nedsläpp om".

## 2.68.1 – 2026-10-06

- Media: nya inlägg (alla mallar) får en slumpad aktiv sponsor som standard – går fortfarande att byta eller välja "Ingen sponsor".
- Matchrapportens resultatbild: utan sponsor på målen väljs en slumpad sponsor.

## 2.68.0 – 2026-10-04

**Lineup**
- "Ändrad …" visar bara serverns tid, som sätts när en spelare faktiskt placeras, flyttas, tas ur laget eller läggs till i truppen. Tidigare räknade appen också själv och visade "nu" när sidan laddades eller synken hämtade laget på nytt.

**Media → Utmärkelse** (ny mall)
- Välj utmärkelse (Skyttekung, Poängkung, Mr. Clutch …, Bästa målvakt), period (säsong, slutspel, försäsong, månad, vecka, totalt) och vilka av topp tre som ska med. Bilden visar vinnarnas hockeykort (sparade eller standardkort) med placering och värde i en skylt, t.ex. "1:a · 93 GWG".

**Statistik → Spelare: Kul statistik**
- Matchens första mål, sista mål, sena mål (sista 10 minuterna), längsta och pågående måltorka och matcher utan poäng – sorterbart som övriga tabeller. Gemensam funktion: server/funStats.ts.

## 2.67.1 – 2026-10-04

- Hockeykort: "Ta bort kortet – återgå till standardkortet" (tydligare text och bekräftelse). Efter borttagningen visar förhandsvisningen standardkortet direkt. Egna kort görs som förut; standardkortet används bara för spelare utan sparat kort.

## 2.67.0 – 2026-10-04

**Hockeykort för alla spelare**
- Alla spelare har ett hockeykort: det sparade kortet, annars ett standardkort – retrostil i spelarens lag (Vita/Gröna, annars Svart) med namn, nummer, position, C/A och statistik, men tom fotoruta (ingen "Ladda upp ett foto").
- Korten visas i utmärkelserna (vinnarens kort), i spelarprofilerna (Spelare och statistikens profil) och i Media → Spelarkort, där alla aktiva spelare nu kan väljas.
- Gemensam kod: standardinställningen (defaultCardFor) och ritningen av spelarens kort (renderPlayerCard) används överallt, också i Hockeykort.

**Målvaktskort**
- GP, SO (hållna nollor), GAA, /60, W% – SO tillbaka i stället för PTS.

## 2.66.1 – 2026-10-04

**Statistik**
- Målvakter har en ny ikon (hockeymål med målgård) i fliken, rubrikerna, hallarna och utmärkelsen – inte masken.
- Utmärkelser: en egen ikon och emoji per utmärkelse (inga dubbletter). Vinnarens hockeykort visas i stället för ikonen när spelaren har ett sparat kort.
- Spelare: "Måltyper" borttaget.
- Översikt: "Månadens spelare och målvakt" – månadens målvakt (lägst insläppta/60, sedan vinster) på samma rad som månadens spelare.
- Rekord: flest mål av ett lag i en match, största vändningen, snabbaste målet, längsta vinstsvit per lag, flest hållna nollor och lägst insläppta/60 (målvakt).

**Hockeykort**
- Målvakter får GP, PTS, GAA, /60 och W% som standard – även målvakter som ännu inte stått i mål (position MV). /60 = insläppta per 60 minuter i mål (samma speltidsberäkning som statistiken); W% räknas på matcherna i mål.
- Speltidsberäkningen är en gemensam funktion (server/iceTimeStats.ts) som statistiken, hallarna och korten använder.

## 2.66.0 – 2026-10-04

**Statistiken – översyn**
- Flikar: Översikt, Spelare, Målvakter, Utmärkelser, Lag, Hallar, Motståndare – en ikon per sak (Målvakter en hockeymålvakt, inte samma som Lag).
- En gemensam tabell för alla listor: klicka på en kolumnrubrik för att sortera, igen för att vända ordningen; topp 10 visas, "Visa alla" fäller ut resten. Ettan, tvåan och trean markeras.
- Spelare: Poängliga (Sp, M, A, P, GWG, ★ i en sorterbar tabell i stället för separata kategoriknappar), Speltid, PIR för utespelare och måltyper.
- Målvakter: egen flik – vinster, tid i mål, insläppta, insläppta per 60, hållna nollor – och PIR för målvakter.
- Utmärkelser: egen flik med alla utmärkelser utfällda (även målvaktens) och 1:a, 2:a och 3:e plats. Bästa målvakt har ett hockeymål i stället för handskar.
- Hallar: bästa målvakt i varje hall och en sorterbar lista över alla poänggörare i hallen.
- Motståndare: listorna över poänggörare är sorterbara och visar alla.
- Lag: "Nollor" har målvaktsikonen.

## 2.65.2 – 2026-10-04

**Statistik → Spelare**
- Speltid är inte längre en egen huvudflik – den ligger under Spelare.
- Överst under Spelare: Utespelare / Målvakter, som gäller hela fliken.
  - Utespelare: topplistorna, Speltid, PIR för utespelare och utmärkelserna (utom målvakt).
  - Målvakter: egen topplista – vinster, insläppta per 60, hållna nollor, tid i mål och matcher (sortera på var och en), PIR för målvakter och målvaktsutmärkelsen.
- Målvakternas vinster räknas (målvaktens lag vann).

## 2.65.1 – 2026-10-04

- Livesidan, styrelsens rad: tydligt att det gäller sändningen, inte matchen. "Sändningen avslutas automatiskt om …" med Avsluta nu, och efter slut "Sändningen stängs om …" med Stäng nu. Avsluta nu stänger bara sändningen – den sparar ingen match; matchen i Score Tracker, matchhistoriken och statistiken påverkas inte.

## 2.65.0 – 2026-10-04

**Målvakter i Statistik → Speltid**
- Vyn Utespelare/Målvakter. Målvakter: matcher, tid i mål, insläppta, insläppta per 60 min i mål och hållna nollor. Delar två målvakter på matchen fördelas de insläppta målen efter tiden i mål (uppskattad som speltiden). Sortera på tid, insl./60, nollor eller matcher.
- Spelarprofilen: målvakter får även tid i mål, insläppta/60 och hållna nollor under Speltid.

**Livesidan för styrelsen**
- Raden "Styrelsen · avslutas automatiskt om …" under sändningen med knappen Avsluta nu (matchen sparas i matchhistoriken som ej avslutad om den inte redan sparats).
- Efter slut: "resultatet tas bort om …" med knappen Ta bort nu.
- Idag avslutas en sändning automatiskt 30 min efter sluttiden (eller efter 90 min utan uppdatering), och resultatet visas 30 min efter slut.

## 2.64.1 – 2026-10-04

- Speltid: matchens längd är den utsatta tiden – träningens längd på laget.se (start–slut), som sparas på matchen när den avslutas i Score Tracker (ny kolumn match_results.plannedMinutes). Tiden från start till att någon tryckte Avsluta används bara om laget.se saknar sluttid; annars 60 min.
- Matchhistoriken → Redigera: fältet "Matchlängd (min)" för matcher som redan är spelade.

## 2.64.0 – 2026-10-04

**Speltid i statistiken**
- Uppskattad speltid räknas på alla sparade matcher – även gamla – med samma regler som i Lineup, utifrån matchens uppställning och längd (start/slut i Score Tracker, annars 60 min).
- Ny flik Statistik → Speltid: total tid, snitt per match, fördelning per position (stapel MV/B/C/F) och poäng per 60 minuter (P/60). Sortera på tid, snitt, P/60 eller matcher; samma periodval som övrig statistik och "Inkl. externa matcher".
- Spelarprofilen: avsnittet Speltid – totalt, snitt/match, P/60 och tid per position.
- Statistikens flikar behåller sin bredd och går att svepa i sidled (lade sig över varandra på mobil).

## 2.63.6 – 2026-10-04

**Lineup**
- Matchtid från träningen: när anmälningarna hämtas från laget.se sätts matchtiden till träningens längd (start- och sluttid på Aktivitetsinfo, t.ex. 22:15–23:00 = 45 min). Visas som "från laget.se" i kugghjulsmenyn. Ändrar man matchtiden själv gäller den för den träningen och skrivs inte över.
- Auto frågar först när något ändras: "Auto kommer att: lägga till 2 spelare (…), ta bort 1 spelare (…), flytta 1 spelare till andra laget (…), flytta 3 spelare inom laget" – OK/Avbryt. Ändras ingenting visas bara "Klart! Inga förändringar gjordes."
- Beskedet efter Auto säger vad som hände, t.ex. "Klart! 2 spelare lades till, 1 spelare togs bort, 1 bytte lag." (med Ångra).

## 2.63.5 – 2026-10-04

- Media: vid byte av mall följer bakgrunden med – vald bakgrund, egen bild, mörkning och överlägg – i stället för att gå tillbaka till standardbilden.

## 2.63.4 – 2026-10-04

- Media: "Egen bild" är en ruta bland bakgrunderna (sist) och fungerar i alla mallar – uppställning, spelarkort, statistik, senaste resultat, nästa träning och text. Utan bild är rutan tom med ett rött streck; vald bild visas som miniatyr. Under rutorna: "Mörka bilden", "Byt bild" och "Ta bort bilden". Att välja en annan bakgrund låter bilden ligga kvar (kan väljas igen).
- Mallen "Text / egen bild" heter nu "Text".

## 2.63.3 – 2026-10-04

**Media**
- Nya bakgrunder: Pucken på isen, Målburen och Arenan på hösten.
- Arenans årstider står bredvid varandra i bakgrundsvalet: i snö, på hösten, på våren (snöslask) och på sommaren.
- Överläggen omgjorda:
  - Snö: mjuka flingor i flera storlekar och skärpor (djup), några stora oskarpa nära kameran och några snöstjärnor.
  - Löv: lövformer med nerver, färgskiftning och skugga.
  - Fyrverkerier: ljusa streck som tunnas och bleknar, glöd i mitten och fallande gnistor.
  - Ägg: skuggade ägg med mönsterband, något större.
  - Sol: varmt motljus med mjuka linsreflexer i stället för hårda strålar.

## 2.63.2 – 2026-10-04

- Media: två nya bakgrunder – Arenan i sommarkväll och Arenan i snöslask. Samma behandling som de övriga (4:5, lätt mjukade, något dämpad färg, anpassad mörkläggning).
- Test: uppdaterat ett inaktuellt test som förväntade att matcher mot andra lag var avstängt som standard (flaggan är borttagen).

## 2.63.1 – 2026-10-03

- /live tål många tittare: läget byggs högst var 2:a sekund och delas av alla (tidigare en full uppslagning – lag, motståndare i databasen, nästa evenemang – per tittare var 4:e sekund). Kommentarer, dolda kommentarer och nya mål syns direkt.
- Live: spärrarna för kommentarer och hjärtan nollställs vid varje ny sändning, så att minnet inte växer över tid.

## 2.63.0 – 2026-10-03

- Live som ingen avslutade sparas automatiskt i Matchhistorik när sändningen avslutas av sig själv: ställning, mål (skytt, assist, övrigt, sponsor), start, plats, uppställning, motståndare, tittare och hjärtan. Matchen markeras **EJ AVSLUTAD** (väntar) och avslutas med **Avsluta matchen** i matchhistoriken (godkänns då). Ingen sparning om matchen saknar mål.
- Telefonen som sände får en ruta om att matchen redan sparats (Nollställ här) och en varning om den ändå försöker spara samma match.

## 2.62.0 – 2026-10-03

- Live avslutas av sig själv om ingen gör det: 30 min efter sluttiden, eller efter 90 min utan uppdatering (ingen sluttid satt). Då visas resultatet en halvtimme till, antalet unika tittare sparas och de anonyma koderna raderas.
- Tittare och hjärtan sparas med matchen även när den sparas efter att live avslutats automatiskt (senaste sändningen inom 3 h).
- Startsidan: modulen **Live** högst upp, för alla. Under en sändning är den röd med "PÅGÅR".

## 2.61.1 – 2026-10-03

- Live, Ta över: den nya enheten hämtar matchen som den sänds (ställning, mål med skytt, assist, övrigt och sponsor, start- och sluttid) och fortsätter därifrån – i stället för att skriva över med sin egen. Har den egna mål frågar den först om de ska ersättas.
- Enheten som blev övertagen får en tydlig ruta ("Live har tagits över … sparas där") med Nollställ här / Behåll, och en varning om den ändå försöker spara matchen (annars blir det två matcher).

## 2.61.0 – 2026-10-03

**Live**
- Ny sida **/live**, öppen för alla och med fast adress: före matchen lagen (logga, namn), dag, tid, hall, nedräkning till nedslag och uppställningarna enligt publiceringsreglerna; under matchen ställning, mål (skytt, assist, ställning efter målet), poäng per spelare, målvakternas insläppta och tid kvar till sluttid; resultatet en halvtimme efter (inga stjärnor). Uppdateras var 4:e sekund. Fungerar även mot andra lag (deras logga, namn, färg och lista).
- Score Tracker (inloggade: styrelsen och Lineup-länkar): **Starta live** sänder ställning, mål och sluttid. Sänds det redan från en annan enhet kan man **Ta över**. Live avslutas när matchen sparas (eller med Avsluta).
- **Läktaren** (Inställningar → Live, av/på): hjärtan i lagens färger och korta kommentarer (max 140 tecken, valfritt namn som bara sparas på enheten). En kommentar per 10 s och max 50 per enhet och match, inget ordfilter. Kommentarerna raderas efter 24 h. I Score Tracker får den som är inloggad fliken Läktaren med röd siffra för nya kommentarer och kan dölja/visa kommentarer.
- **Unika tittare** räknas utan kakor (anonym kod per enhet och match som raderas när matchen är slut). "Tittar nu" visas live; antal unika tittare och hjärtan sparas med matchen och syns i Matchhistorik.
- laget.se-nyheten (även den automatiska) får raden "Följ matchen live: …/live".

## 2.60.5 – 2026-10-03

- Score Tracker: sidan ligger fast i fönstret (fixed) och webbläsarens/PWA:ns egen "dra ner för att uppdatera" är avstängd där. Tidigare kunde en sådan uppdatering ändra höjden så att menyn i botten trycktes ned och sidan gick att rulla. Uppställning-fliken har kvar sin egen dra-för-att-uppdatera.

## 2.60.4 – 2026-10-03

- Score Tracker (inloggad): när Lineup står på en extern match längre fram och dagens internmatch inte har någon sparad uppställning visas en förklaring ("Växla Lineup till Intern …") i stället för två tomma lag.

## 2.60.3 – 2026-10-03

- Score Tracker, välj målskytt vid match mot annat lag: rubrikerna visar lagens riktiga namn och färger (motståndarens namn och färg från registret, vårt lag i klubbens färg) i stället för "MOTSTÅNDARE" i grönt. Servern skickar också motståndarens namn som lagnamn, så att det stämmer även om uppställningen sparats med "Motståndare".

## 2.60.2 – 2026-10-03

- Score Tracker utan inloggning: innan laget är publicerat skickades ingen motståndare med – därför saknades motståndarens logga och spelare vid mål. Nu följer motståndarens namn, färg, logga och sparade spelare alltid med; bara vår uppställning döljs tills den publiceras.
- Lineup inställd på en extern match längre fram (egen dag efter laget.se:s nästa evenemang, t.ex. om en månad): laget.se:s evenemang gäller tills dess – för nyheten (även automatiska), Auto-lag, Score Tracker (75-minutersregeln) och matchens plats. Score Tracker visar då internmatchen (Vita–Gröna) med internmatchens sparade uppställning i stället för "Mot …". Samma dag eller utan egen dag gäller den externa matchen som förut.
- Delade modullänkar ser Score Trackers uppställning som alla andra (efter publicering), inte som styrelsen.

## 2.60.1 – 2026-10-03

- Startsidan: den som öppnat en delad länk ser länkens namn längst ner (i stället för "Styrelsen"), hur länge länken gäller ("tills vidare" eller sista dag) och Logga ut.

## 2.60.0 – 2026-10-03

**Inställningar i grupper**
- Raden med flikar är ersatt av en startsida i grupper (Klubb och lag, Match och data, Kopplingar, Åtkomst, Om) med en kort beskrivning per del. Varje del öppnas som en egen sida med tillbaka-pil; ?flik= fungerar som förut.

**Åtkomst: delade länkar med moduler**
- Inställningar → Åtkomst: skapa en länk med namn, moduler och giltighet (datum eller tills vidare). Ändra namn, moduler och giltighet i efterhand – gäller direkt utan ny länk. Stäng länken när som helst. Visar antal öppningar och senast använd.
- Moduler: Media (bilder, video, hashtaggar), Hockeykort, Statistik (läsa), Spelare (lägga till och ändra), Matchhistorik (granska och ändra) och Matchrapport för den senast sparade matchen (även ej godkänd) utan tillgång till övriga matcher.
- Den som öppnar länken (/a/…) ser bara sina moduler på startsidan, plus Score Tracker som alltid är öppen. Servern kontrollerar varje anrop.
- Kräver alltid styrelsen: ta bort matcher, slå ihop spelare, importera spelare, Lineup, inställningar och att skapa länkar. Knapparna för detta döljs för länkar.

## 2.59.0 – 2026-10-03

**Uppställningen per match**
- Internmatchen och varje motståndare har nu en egen sparad uppställning. När man växlar under Lineup → Match sparas den gamla matchens uppställning, och den nya matchens tas fram (vid internmatch båda lagen, mot motståndare vårt lag – deras sida sparas redan på laget). Övriga spelare går till truppen. Det går att köra internmatcher fram till en extern match utan att lagen blandas.
- Motståndarens länk visar vårt lag live när matchen är vald i Lineup, annars den uppställning som sparades för matchen mot dem – aldrig internmatchens.

**Ändra en skickad länk**
- Pennan vid en länk: ändra vad laget ser (Uppställning, Spelare, Dölj allt) och matchdagen. Samma länk fortsätter gälla – ingen ny behöver skickas.

## 2.58.0 – 2026-10-03

- Länk till motståndarlag: välj matchdag – länken slutar fungera ett dygn efter (vid midnatt efter dagen efter matchen). Förifylls när Lineup är inställd på matchen mot laget med egen dag. Utan matchdag gäller länken i 7 dagar som tidigare. Länklistan visar matchdag och sista giltiga dag.
- Hjälptexten förklarar att lagets ändringar syns direkt när matchen är vald i Lineup, annars sparas på laget och fylls i när laget väljs – internmatcher kan köras emellan.

## 2.57.1 – 2026-10-03

- Lineup: "Ändrad …" står i rubriken direkt efter klubbnamnet. Den uppdateras direkt när en spelare placeras, flyttas eller tas bort – här eller på en annan enhet – och servern frågas var 30:e sekund (tidigare varje minut).

## 2.57.0 – 2026-10-03

- Länk till motståndarlag: välj vad de ser av vårt lag – **Visa uppställning** (spelarna på sina platser), **Visa spelare** (bara vilka som spelar, utan platser; platserna skickas inte alls) eller **Dölj allt**. Länklistan visar valet. Äldre länkar fungerar som förut (visa = uppställning).

## 2.56.0 – 2026-10-03

- Motståndarens länk: laget väljer själv Platser eller Lista (bocka i vilka som spelar). Listan sparas på laget (migrering 0025, opponents.lineupList) och syns direkt i Lineup när matchen mot laget är vald; annars används den när laget väljs nästa gång. Listan som görs i Lineup sparas också på laget.
- Matchinställningen heter Intern och Extern (menyn visar INTERN/EXTERN).
- Lineup: kugghjulet och de andra verktygen står längst till höger i rubriken igen.
- "Ändrad …": saknas tidpunkten används senaste sparningen, så att etiketten alltid visas.
- Statistik: pallen visade ettan i silver och lägre än tvåan (färg och höjd var kopplade till visningsordningen i stället för placeringen). Nu är ettan högst och i guld, tvåan silver och trean brons – i alla kategorier.

## 2.55.0 – 2026-10-03

**Motståndaren som lista**
- I Lineup kan motståndarlaget (match mot annat lag) visas som **Platser** (som tidigare) eller **Lista**. I listläget bockar man bara i vilka av lagets sparade spelare som är med – ingen position eller kedja. Nya spelare (namn, nummer, position) läggs till direkt i listan och sparas på laget.
- Byte till Lista: de som stod på platser blir listan och platserna töms (går att ångra). Byte tillbaka: listan finns kvar, ingen placeras.
- Nyheten (bild och text, även den automatiska) visar listan sorterad Målvakter, Backar, Forwards med nummer.
- Score Tracker: vid motståndarens mål står de avbockade överst.
- Motståndarens egen länk fyller fortfarande i platser.

## 2.54.1 – 2026-10-03

- Lineup: "Ändrad …" står nu ovanför lagen (efter "Mot …" vid match mot annat lag) i stället för längst till höger i rubriken, där den klipptes av när hallens namn visas.
- Lineup: menyn under kugghjulet öppnas åt vänster och får plats på skärmen (rullar om den är högre än skärmen).

## 2.54.0 – 2026-10-03

**Matcher mot andra lag: alla deras spelare sparas**
- Namn som skrivs in för motståndarens mål eller assist i Score Tracker ("Lägg till …") sparas som lagets spelare när matchen sparas – och när en match redigeras i matchhistoriken. "Erik Lund #9" sparas med nummer 9. Redan sparade namn läggs inte till igen.
- Score Tracker: vid motståndarens mål listas lagets alla sparade spelare (inte vår trupp), även de som inte står i uppställningen.
- (Spelare som läggs till i Lineup, under Inställningar → Motståndare eller via motståndarens länk sparades redan.)

## 2.53.0 – 2026-10-03

**Matcher mot andra lag – ur beta**
- Flaggan "Beta: matcher mot andra lag" är borttagen; funktionen är alltid på.
- Matchtypen väljs inte längre i en rad ovanför lagen utan i Lineup → menyn → **Match** (styrelsen): Internmatch eller Mot annat lag, motståndare, vårt lags namn och logga. Menyn visar INTERN/MOT LAG; vid match mot annat lag står "Mot Kalix HC · lör 10/10 15:30 · Kalix ishall" ovanför lagen.
- Vårt lags logga: Gröna, Vita eller klubbmärket (Städet). Tidigare fanns klubbens logga två gånger (samma som Gröna).
- Egen **dag, tid och plats** för matcher mot andra lag (t.ex. bortamatch). Gäller i stället för laget.se-evenemangets för nyheten (även den automatiska), Score Tracker (75 min före start), matchens plats och Media. Anmälningarna hämtas fortfarande från laget.se.
- Lagnamnen går inte längre att ändra genom att klicka på dem i Lineup (risk för misstag). Lagens namn ställs in under Inställningar → Klubb, vårt namn mot andra lag under Match.

## 2.52.0 – 2026-10-03

**PIR (Inställningar → PIR)**
- "Ta fram förslag" svarar alltid: utan analyserade matcher förklaras varför, fel visas, och ett nytt tryck räknar om (tidigare visades det sparade resultatet eller ingenting alls).
- Ny ruta Gränser: betyg gäller efter (3), full säkerhet efter (10), nykomling i (10), träffsäkerhetens uppvärmning (5) och förslag kräver (6) matcher – med Spara och Återställ standard. Gäller beräkningen på servern och Lineup, prediktion och Auto i webbläsaren.
- Vikter: Återställ standard.

**Statistik**
- Matchens stjärnor per spelare: ny kategori Stjärnor under Spelare (★★★, ★★, ★ och totalt; sorterat på 3/2/1 poäng) och fördelningen i spelarprofilen. Samma stjärnor som i matchrapporterna – sparade om de finns, annars de automatiska.

## 2.51.0 – 2026-10-03

**Score Tracker: uppställningen för den som inte är inloggad**
- Publicerat lag visas med "Publicerat tis 18:30". En tidsinställd nyhet räknas från den inställda tiden, inte när man klickade; fram till dess står "Laget publiceras tis 18:30". När laget är publicerat visas inget annat lag.
- Ingen nyhet publicerad eller tidsinställd: från 75 min före matchstart visas uppställningen live från Lineup ("Live från Lineup – inget lag publicerat än").
- Tidigare än så: "Inget lag publicerat än" med när det visas – i stället för det felaktiga "Kontrollera din internetanslutning".
- Låset efter publicering sparar den inställda publiceringstiden.

**Auto-lag (Lineup → menyn)**
- Ny inställning med förklaring, på/av och tid före matchstart (standard 90 min) samt Återställ standard.
- Vid tiden jämförs uppställningen med anmälningarna på laget.se. Finns en avvikelse (anmälda som saknas, eller spelare i laget som inte är anmälda) och ingen nyhet är publicerad/tidsinställd, och Auto-lag är på → laget görs om helt: anmälningarna synkas och alla anmälda fördelas med Auto (position, lagfärg, PIR).
- Annars, vid avvikelse → mejl som listar vad som inte stämmer (ny notistyp). Auto-lag har en egen notistyp; förhandsvisnings- och publiceringsmejlen nämner när laget skapades automatiskt.
- Gäller internmatcher; matcher mot andra lag rörs inte.

**Spelare**
- Informationen i toppen är borttagen (återställda lag, texten om fast ID och Att se över). Slå ihop dubbletter finns kvar i spelarens redigeringsruta.

## 2.50.0 – 2026-10-02

**Media → Video: matcher mot andra lag**
- Puckflippen har klubbens logga på ena sidan och motståndarens på den andra och landar på valt lag (klubben eller motståndaren). Glöd, titelkort, overlay och outro får det lagets färg och logga. Saknar motståndaren logga ritas lagets initialer i lagets färg.
- Ny kategori Inför match ("Matchdag"): båda lagens loggor mot varandra, datum, tid och hall från nästa evenemang på laget.se. Motståndaren väljs i listan (eller internmatch Vita–Gröna) och förväljs om namnet står i evenemangets titel.
- Resultat visar lagens loggor mot varandra och siffrorna under.
- Spelare som inte finns i registret (t.ex. motståndarens målskytt) kan skrivas in med namn och nummer; fylls i automatiskt från målet eller stjärnan.

## 2.49.1 – 2026-10-02

- Media: knappen Video (Instagram) har samma utseende som de andra knapparna. Den gröna färgen fick den att se intryckt/vald ut fast den bara är en länk.

## 2.49.0 – 2026-10-02

**Media → Video**
- "Ingen match" i alla kategorier: inget fylls i automatiskt, statistiken väljs bland Säsong/Slutspel/Försäsong/Totalt och datumraden blir dagens datum (redigerbar). Mål, stjärnor och resultat fungerar också utan match (t.ex. "Säsongens snyggaste mål").
- Ny kategori Spelare: "Möt spelaren" med hockeykort/foto, position och säsongsstatistik – för presentationer och "Veckans spelare". Pucken landar på spelarens lag.
- Matcher mot andra lag: resultatraden och mållistan visar klubbens och motståndarens namn i stället för Vita/Gröna.

## 2.48.0 – 2026-10-02

**Media → Video**
- Val av statistik: Matchen, Säsong, Slutspel, Försäsong eller Totalt. Valet styr både statistikrutan och siffrorna på hockeykortet i videon (det sparade kortet ändras inte). Matchen är förvalt för mål, stjärnor och resultat, Säsong för intervju.
- Matchen: mål, assist och poäng (målvakt: insläppta och nolla), lagets resultat (V/F/O) och stjärnan om spelaren blev matchens ★★★/★★/★. Varnar om spelaren inte finns i matchens uppställning.
- Hjälptext om längder: Reel (max 3 min), Story (delas i bitar om 60 s) och flöde, samt riktmärken per kategori. Varning när en Reel/Story-video blir över 60 s.

## 2.47.1 – 2026-10-02

- En sida som var öppen före en deploy laddas om automatiskt (en gång) när den försöker hämta kodfiler som inte finns kvar, i stället för att visa "An unexpected error occurred – Failed to fetch dynamically imported module".

## 2.47.0 – 2026-10-02

**Övrigt i den här versionen**
- Alternativ position i spelarregistret (players.altPosition, migrering 0023): flyttas från den tidigare inställningen vid start och visas som Alt. pos på spelarsidan.
- Hockeykort: perioderna Slutspel och Försäsong samt valet Inkl. externa matcher.
- Media: mallarna Senaste resultat och Nästa träning.
- Statistik → Hallar: matcher, vinster per lag, mål per match och bästa poänggörare per hall.
- PIR-justeringar som sparats med spelarnamn kopplas till spelar-ID vid start.
- Ingen samtyckesfråga vid uppladdning av spelarfoto.

**Media → Video (Instagram)** – ny sida under Media → Video (/media/video)
- Välj klipp (laddas upp direkt medan resten fylls i), format (Reel/Story 9:16 eller flöde 4:5) och kategori: Mål, Intervju, Matchens stjärnor (en spelare per video), Resultat eller Fri.
- Mål, stjärnor och resultat fylls i från vald match (ställning efter målet, målskytt, assist, stjärnans siffror). Allt går att ändra: rubrik, stor rad, liten rad, datumrad och spelare.
- Pucken landar på: Gröna/Vita – förvalt efter målets lag, stjärnans lag eller spelarens lag, alltid valbart. Styr även färg och logga i titelkort, overlay och outro.
- Visa/dölj per del: intro 2 (kort/foto, statistik, datum, sponsor), klippet (namnlist, ställning, statistik, logga, sponsor) och outro (tack till sponsor). Hockeykortet används om spelaren har ett, annars fotot.
- Sponsorer: "Stolt sponsor" i intro 2 och "Tack till" i outron väljs var för sig, förvalda efter vem som visats minst i Media (ny räknare, sponsor_news.kind = media, migrering 0024). Knappar för Minst visade och Slumpa. Räknaren ökar när videon är klar.
- Förhandsvisning av intro 2, klippet med overlay (på en bildruta ur klippet) och outro. Overlayn hålls inom Instagrams säkra yta för Reels (14 % uppifrån, 35 % nerifrån, 6 % på sidorna); titelkorten går ner till 78 %.
- Färdig video: spela upp, ladda ned eller dela (bildtexten kopieras först). Bildtext med hashtags fylls i automatiskt.

**Media → Video, renderingsmotorn**
- ffmpeg i Docker-imagen. Servern sätter ihop intro 1 → intro 2 → klippet med overlay → outro, med mjuka övergångar, i Reel/Story (1080×1920) eller flöde (1080×1350). Klipp i fel format fylls ut med en suddig kopia av sig själv. Klipp utan ljud får ett tyst ljudspår.
- Spärrar: max 300 MB per klipp och max 180 s för hela videon inklusive intro och outro (Instagrams gräns för Reels), dvs. klippet får vara högst 174 s. Miljövariablerna VIDEO_MAX_MB och VIDEO_MAX_SECONDS. Storleken kontrolleras under uppladdningen, längden med ffprobe direkt efter.
- Uppladdningen strömmas till disk, en rendering i taget, allt raderas efter 24 h (och vid omstart). Bara styrelsen.
- Intro 1 är en puck med lagens loggor på var sida som flippar 1,5 varv och landar på valt lag (glöd i lagets färg), 1,6 s. Ritas på servern med samma ritkod som övriga bilder (shared/videoIntro.ts), sparas per format och sida och ritas om automatiskt när en logga eller lagfärg byts.
- Uppladdningar får ta 20 min (Nodes standard 5 min räcker inte på dålig täckning i hallen).

## 2.46.2 – 2026-10-02

- Platsen sparas på matchen när laget.se har ett evenemang samma dag (inom 12 timmar från matchstarten) – inte bara när starttiden togs från träningen. Avsluta-rutan visar platsen även när starttiden kommer från första målet eller är uppskattad.

## 2.46.1 – 2026-10-02

- Rättning: platsen för evenemanget lästes inte. På laget.se laddas fliken Aktivitetsinfo (med platsen, PlaceName) från en egen adress, /{lag}/Calendar/ManageEvent/{id}?siteType=Team – appen läste bara grundsidan Calendar/Edit/{id}, som innehåller deltagarlistan. Nu hämtas Aktivitetsinfo separat, både när evenemanget hittas i kalendern och via lagets startsida.
- Inga inbyggda hallnamn längre: reserven som letade efter "Coop Arena"/"Sunderby ishall" i sidans text och hallistan i klubbinställningarna är borttagna. Förslagen när platsen ändras i matchhistoriken kommer från platser som redan finns på sparade matcher.

## 2.46.0 – 2026-10-02

Klubbinställningar, lagen som begrepp och matcher mot andra lag (docs/PLAN-lag-och-motstandare.md, steg 0–7). För användarna ser allt ut som förut – det nya som syns är fliken Inställningar → Klubb. Matcher mot andra lag är beta och avstängt tills det slås på under Inställningar → Klubb.

**Steg 0 – skyddsnät**
- Kontrollbilder (test/golden): matchrapport, stjärnkort, nyhetsbild, alla hockeykortsstilar och alla Media-mallar ritas och jämförs med sparade fingeravtryck. Uppdatera avsiktliga ändringar med `UPDATE_GOLDEN=1`.
- Test av hela flödet: uppställning → match från Score Tracker → matchhistorik (med plats) → statistik.

**Steg 1 – klubbinställningar**
- Klubbprofil (shared/clubProfiles/stalstadens.ts) med alla standardvärden: namn, kortnamn, fullständigt namn, startsidans rubrik, loggor och märke, de två interna lagen (namn, kortnamn, färg, logga), hashtags, hallar, laget.se-adress, appens adress och filnamn. Profil väljs med CLUB_PROFILE (standard stalstadens) – en ny förening får en egen profilfil.
- Inställningar → Klubb: ändra värdena i appen (sparas i databasen, går före profilen; tomt = profilens värde).
- Hårdkodade "Stålstadens"/"STÅLSTADENS SF", loggsökvägar, hallar, hashtags, laget.se-adressen, appens adress och filnamn läses nu från klubben – i bilder (rapport, kort, nyhet, Media, utmärkelser), startsidan, Lineup, Score Tracker, statistik, sidans titel och hemskärmsnamnet (manifest).
- Kontrollbilderna är oförändrade: Stålstadens ser exakt ut som förut.

**Steg 2 – lagen som begrepp (ingen synlig ändring för Stålstadens)**
- 2a: En gemensam regel för vilket uppställningslag som är vilket (shared/teams) ersätter ~15 kontroller av "vit" i lagnamnet i statistik, PIR, historik, Score Tracker, stjärnor och Media. Standardnamnen för nya uppställningar kommer från klubben.
- 2b: Lagnamnen i hela gränssnittet från klubben (namn, singular "Vit"/"Grön", genitiv "Vitas", versaler).
- 2c: Lagens färger i bilderna från klubben (färg för matchrapport/Media, accent för nyhetsbilden).
- 2d: Loggor kan laddas upp under Inställningar → Klubb (klubbens logga, lagens loggor, kortens märke) och går före profilens filer; servern ritar med dem (profilkort, automatisk nyhet). Återställ ger profilens logga igen.
- Hemmalaget i nyhetsbilden per veckodag är en klubbinställning (Stålstadens: tisdag Gröna, torsdag Vita).
- Kontrollbilderna är oförändrade; provat i webbläsaren med en påhittad klubb (Röda/Blå) på alla sidor utan fel.

**Steg 3 – motståndarregister (beta, av som standard)**
- Funktionsflagga "Beta: matcher mot andra lag" under Inställningar → Klubb (app_config "features").
- Ny flik Inställningar → Motståndare (syns bara med flaggan på): skapa lag med namn, kortnamn, färg och logga; lägg till spelare med namn, nummer och position (Enter lägger till och hoppar tillbaka till namnet); ändra direkt i listan; arkivera eller ta bort lag.
- Databasen: nya tabeller opponents och opponent_players (bara tillägg). Loggan visas via /api/opponents/:id/logo och kan ritas på servern.
- Inget annat i appen påverkas än – uppställning, Score Tracker och bilder mot motståndare kommer i steg 4–6.

**Steg 4 – Lineup mot motståndare (beta)**
- 4a: Uppställningen har en matchtyp (intern / mot motståndare, sparas i lineup_state.matchSetup). Motståndarens spelare (id "opp-…") hamnar aldrig i vår trupp eller vårt spelarregister och räknas inte i vår statistik.
- 4b: Med flaggan på (styrelsen) finns raden Internmatch / Mot motståndare överst i Lineup: välj lag, vårt lags namn (standard klubbens namn) och logga (klubben, Vita eller Gröna). Vårt lag är lag A; lag B blir motståndarens panel där varje plats väljs bland lagets sparade spelare (rätt position först) eller en ny spelare läggs till direkt. Auto är avstängd mot motståndare. Byte tillbaka till internmatch tömmer motståndarens platser och ger lagen standardnamnen.
- 4c: Delningslänk till motståndaren (Inställningar → Motståndare → laget → Dela länk): laget fyller utan inloggning i namn, kortnamn, färg, logga och spelare och gör sin uppställning på /lag/<länk>. Val "Visa vårt lag". Länken gäller 7 dagar och kan stängas. Uppställningen sparas på laget och fylls i automatiskt när laget väljs i Lineup; är laget redan valt syns deras ändringar direkt.
## 2.45.4 – 2026-10-01

**Steg 5 – Score Tracker och sparade matcher mot motståndare (beta)**
- Score Tracker visar vårt lags logga och motståndarens logga (eller en färgplupp med kortnamn) både på matchsidan och i lagvyn.
- Matchen sparas med motståndaren (ny kolumn match_results.opponentId). Matchhistoriken visar lagens namn och loggor och "KALIX HC VANN" m.m.
- Statistik, PIR, utmärkelser, spelarprofiler och hockeykortens siffror räknar bara internmatcher (valet att ta med externa kommer i steg 7). Motståndarens spelare kommer aldrig in i vår statistik.
- När matchen sparas lagras motståndarens uppställning på laget – nästa match mot dem är förifylld.
- Prediktionen i Lineup döljs mot motståndare (PIR finns bara för våra spelare).

**Steg 6 – bilder och nyheter mot motståndare (beta)**
- Matchrapporten (resultat, mål, bildtext) visar vårt lag och motståndarens namn, logga och färg. Långa lagnamn krymps så att de ryms under loggan.
- Lag utan logga får en färgad cirkel med initialerna (t.ex. "KHC") – i matchrapporten, nyhetsbilden och Media.
- Stjärnkorten: vårt lags spelare får klubbens märke, motståndarens spelare inget märke.
- Nyheten till laget.se (manuell och automatisk): vårt lags logga och motståndarens logga och färg i bilden.
- Media → Lagets uppställning: knapparna visar vårt lags och motståndarens namn; bilden får lagets logga och färg.
- Nya kontrollbilder för matcher mot motståndare; alla tidigare kontrollbilder är oförändrade.

**Steg 7 – statistik med matcher mot andra lag (beta)**
- Valet "Inkl. externa matcher" (av som standard) i Statistik (Översikt/Spelare), spelarprofilen och Media → Statistik. Med valet på räknas våra spelares mål, assist och matcher även i matcher mot andra lag.
- Motståndarens mål räknas aldrig på någon av våra spelare; motståndarens spelare kommer inte in i våra profiler eller i kemin.
- Lagsiffror (Vitas/Grönas vinster, största vinster, målrikaste match), fliken Lag och PIR räknar alltid bara internmatcher.
- Ny flik Statistik → Motståndare: totalt mot andra lag och per lag – V/O/F, mål och målskillnad, senaste mötet, våra poänggörare mot laget och deras målskyttar/assist mot oss.
- Hockeykortens statistik räknar fortsatt bara internmatcher.

- Spelarkortet: "Alt" (alternativ position) ligger på samma rad som positionen, direkt efter positionsknapparna. Vad historiken säger visas när man håller över.

## 2.45.3 – 2026-10-01

- Lineup: positionsbrickan blir tvåfärgad när spelaren också brukar spela en annan position – t.ex. blå/lila för en back som ofta spelat center. Bokstaven är fortfarande spelarens position. Gäller MV, B, C och F (vänster/höger räknas som F). Hovra för förklaring ("spelar även Center (30 % av matcherna)").
- Gränsen ställs in i kugghjulsmenyn ("Alt. position": Av, 10–40 %, standard 20 %): den position spelaren spelat mest utöver sin egen visas om den står för minst så stor andel av matcherna (minst 5 matcher).
- Spelarkortet: "Alt. pos" för hybridspelare (MV/B/C/F). Den går före historiken i brickan och för Auto.
- Auto: saknas spelare till en plats väljs i första hand en hybridspelare med den positionen, sedan den som spelat den positionen enligt historiken, sist den vars vanligaste position den är. Sortering och allt annat är som förut.

## 2.45.2 – 2026-10-01

- Låsta lag efter publicering: när dagens lag publicerats som nyhet på laget.se (manuellt, tidsinställt eller automatiskt) låses uppställningen. Score Tracker – och därmed statistiken – använder det publicerade laget även om någon ändrar i Lineup efteråt (Score Tracker visar "🔒 Laget är låst sedan det publicerades …").
- Lineup fungerar som vanligt; ändras laget efter publiceringen visas ett besked i botten: "Lagen är låsta sedan publiceringen … Tryck för att låsa upp".
- Spärren släpps automatiskt efter 12 timmar eller när matchen sparas i Score Tracker (godkänd eller ej).

## 2.45.1 – 2026-09-30

- "Totalt" är samma val överallt för all statistik sedan starten (säsongen 2026/27): Statistik (förut "Alla"), Media → Statistik (förut "Alla"/"Alla matcher") och hockeykortens statistikruta (förut "Karriär"). Sparade kort med rubriken "Karriär" får "Totalt" automatiskt.

## 2.45.0 – 2026-09-30

**Plats från laget.se används där det finns datum och tid**
- Score Tracker: platsen sparas med matchen när starttiden kommer från träningen; Avsluta-rutan visar "Starttid från träningen på laget.se · Coop Arena C-Hallen".
- Matchhistoriken: platsen visas i matchens detaljvy (📍) och går att ändra/lägga till vid Redigera (förslag: Coop Arena C-Hallen, Sunderby ishall).
- Matchrapporten: datumraden på resultat- och målbilden blir t.ex. "Tisdag 29/9 · Coop Arena C-Hallen", med val "Visa plats". Stjärnkorten visar bara datum (plats får inte plats). Datumet räknas från starttiden.
- Lineup: raden under klubbnamnet visar "Träning · tors 1/10 20:00 · Coop Arena C-Hallen".
- (Redan: nyhetens rubrik och bild, den automatiska nyheten och Medias datumrad.)
- Backlog: statistik per hall.

## 2.44.7 – 2026-09-30

- Engångsrättning vid start: spelare som spelade 29/9 och saknar lag får tillbaka laget de spelade i den matchen. Spelare som redan har lag rörs inte. Körs en gång; resultatet visas på Spelare ("N spelare fick tillbaka sitt lag automatiskt … Visa vilka") och i serverloggen.

## 2.44.6 – 2026-09-30

- Spelarsidan: "Återställ lag" visas när aktiva spelare saknar lag. Förslaget är laget spelaren spelat i oftast de senaste 10 matcherna (minst 3 matcher, minst 70 %), eller från en äldre sparad uppställning med spelarens uppgifter. Kontrollera, kryssa ur de som ska vara Waivers och återställ med ett tryck.

## 2.44.5 – 2026-09-30

- Rättning (allvarlig): att ladda en tidigare uppställning (Sparade uppställningar / Senaste matcherna) kunde nollställa spelarnas lag (→ Waivers) och C/A i spelarregistret, eftersom den gamla kopian av spelaren saknade laget och servern tolkade det som "borttaget". Nu tas bara platsen från den laddade uppställningen – spelarens uppgifter är alltid de aktuella – och servern ändrar aldrig lag eller C/A för att ett fält saknas, bara när det uttryckligen satts (t.ex. Waivers i spelarkortet).

## 2.44.4 – 2026-09-30

- Plats och tid för evenemanget: läses från fältet "PlaceName" (fliken Aktivitetsinfo) och det dolda fältet "StartDateTime" på aktivitetens adminsida – verifierat mot en riktig sida (Coop Arena C-Hallen, 22:15). Orsaken till att platsen saknades: adminsidan har ingen deltagarlista, så hämtningen föll tillbaka till den publika listan och tappade platsen. Nu följer plats och tid med oavsett var deltagarna hämtas.

## 2.44.3 – 2026-09-30

- Rättning: ändra deltagarstatus för en spelare gav "Inget event hittades" när nästa träning låg i nästa månad (t.ex. i morgon den 1:a), medan hämtningen av anmälningar hittade den. Båda letar nu på samma sätt: adminkalendern för innevarande månad, annars lagets startsida.
- Hämtningen läser nu anmälningar och detaljer från evenemangets adminsida även när evenemanget hittades via startsidan (förut bara via den publika listan, utan plats).
- Plats: om formulärfältet inte går att läsa letar appen efter klubbens hallar i sidans text (Coop Arena C-Hallen, Coop Arena, Sunderby ishall).

## 2.44.2 – 2026-09-30

- Media: fem nya bakgrunder – Utomhusrinken, Klubblokalen, Gymmet, Skogsstigen och Vinterskogen. Samma behandling som de förra (4:5, lätt mjukade, något dämpad färg, anpassad mörkläggning). Bakgrundsvalet visas i fyra kolumner.

## 2.44.1 – 2026-09-30

- Media: välj bakgrund – Isen (som förut), Arenan i snö eller Omklädningsrummet. De nya bilderna är beskurna till 4:5, lätt mjukade (oskärpa och något dämpad färg) så att texten och innehållet syns, och mörkas mindre än isen eftersom de redan är mörka. Gäller alla mallar (text med egen bild använder sin bild).

## 2.44.0 – 2026-09-30

**Media**
- Lagets uppställning i ny layout efter skissen: ett kort med lagets logga och namn, målvakter och backar (per backpar) till vänster, forwards (per kedja) till höger. Raderna är tonade i positionens färg med färgad kant, positionsbricka, C/A före namnet och nummer i grått. Standardstorlek för upp till 2 målvakter, 3 backpar och 3 kedjor; med en fjärde kedja krymps innehållet så att allt får plats.
- Ny mall Spelarkort: välj 1–4 spelare med sparade hockeykort (med aktuell statistik). 1 kort blir stort, 2 står bredvid varandra, 3–4 i två rader. Rubrik och underrubrik ovanför.
- Ny mall Statistik: poäng, mål, assist, GWG, matcher, utmärkelser eller rekord för säsong, slutspel, försäsong, månad, vecka eller alla matcher – topp 3, 5 eller 10. Samma data som statistikmodulen (utom PIR). Bildtexten får listan.
- Teman ersatta av överlägg utan färgbyten: snöflingor, ägg, fyrverkerier, löv och sol – diskret, mest i kanterna. Äldre sparade inlägg får motsvarande överlägg.
- Egen text står i en mörk, halvgenomskinlig ruta med skugga och en accentlinje.

## 2.43.0 – 2026-09-29

**Media (ny bricka, styrelsen)** – egna Instagram-bilder i samma grafiska profil och format som matchrapporten (4:5, 1080×1350):
- Lagets uppställning: välj Vita eller Gröna – laget hämtas direkt från Lineup (målvakter, backpar, kedjor med positionsbrickor, nummer och C/A), datum/plats från laget.se.
- Text / egen bild: rubrik, text och en info-rad i färg (t.ex. nästa träning, hämtas med ett tryck), med arenan eller egen bild bakom (mörkläggning justerbar).
- Teman: Standard, Jul, Nyår, Påsk (accentfärg och dekor). Valfri sponsor ("Presenteras av").
- Bildtext förifylld med klubbens hashtags (samma som i matchrapporten), fritt redigerbar.
- Ladda ned, Dela (Instagram m.fl.; texten kopieras), Kopiera text. Spara som utkast, öppna och ändra igen, Spara som nytt, Ta bort.

## 2.42.2 – 2026-09-29

- Stars of the Game: namn och nummer är konsekventa i bildtext, resultatbild, stjärnkort och matchens detaljvy – "Namn #12" när spelaren har nummer, bara namnet annars. Rättat att en spelare utan nummer fick ett ensamt "#" efter namnet (från målskyttens etikett "Namn #"), och att numret saknades i texten. Stjärnkortet tar numret från det sparade kortet, annars från matchens uppställning.

## 2.42.1 – 2026-09-29

- Nyhet till laget.se: Spara bild laddar ned bilden direkt (öppnade delningsmenyn på Android).
- Waivers: W och kant i vitt eller grönt när spelaren oftast spelat i Vita respektive Gröna; annars grått.

## 2.42.0 – 2026-09-29

**Score Tracker – starttid**
- Matchens starttid tas från dagens träning på laget.se (om den startat inom 6 timmar), annars första målet eller en uppskattning. Namnet byggs av starttiden: "26-09-29 Tisdag 22:15 3-2" – rätt dag även om Avsluta trycks efter midnatt. Avsluta-rutan visar varifrån starttiden kommer.

**Matchrapport**
- Målbilden: två kolumner redan från 9 mål, tätare rader och större text, så att namnen får plats.
- Målens tid visas som minuter in i matchen ("12'") när starttiden är känd; klockslaget sparas som förut. Äldre matcher (starttid = första målet) visar klockslag.

**Inställningar**
- Flikarna är ikon med kort text under, så att de får plats på mobilen.
- Perioder anges som dag och månad och återkommer varje år (hockeyåret börjar med försäsongen). "Nu:" visar årets datum.

**Lineup**
- Waivers visas alltid som ett grått W; har spelaren oftast spelat i ett lag syns det som en tunn färgad kant.

## 2.41.2 – 2026-09-29

- Nyhet till laget.se: laget.se:s flöde tar bort radbrytningar i utdraget ("…JLcoVITAMV Vide…"). Första raden ("Dagens matchsponsor: …") fylls därför ut med mellanslag till 115 tecken när nyheten skickas, så att utdraget slutar efter sponsorn oavsett namnets längd. Syns inte i nyheten och inte i textrutan i appen. Gäller manuella och automatiska nyheter.

## 2.41.1 – 2026-09-29

- Score Tracker, Avsluta: tre tydliga val – Spara och avsluta, Avsluta utan att spara (med bekräftelse, nollställer matchen) och Avbryt – fortsätt matchen. Förut var "Nej" bara avbryt.
- Lineup, hämta anmälda: beskedet visar vad som ändrades ("Kalle: kommer ej") och vilka namn från laget.se som inte hittades i truppen, så att det syns om en spelares namn inte matchar. En spelare som står som både kommer och kommer ej räknas som kommer.

## 2.41.1 – 2026-09-29

- Score Tracker: Avsluta har tre val – Spara och avsluta, Avsluta utan att spara (med bekräftelse; nollställer matchen) och Fortsätt matchen. Förut fanns bara "Ja, spara" och "Nej" (som bara stängde rutan).
- Lineup, Anmälda: beskedet efter hämtningen visar vad som ändrades ("Kalle: kommer ej") och vilka namn från laget.se som inte hittades i truppen, plus vilket evenemang som hämtades. En spelare som står både som kommer och kommer ej räknas som kommer.

## 2.41.0 – 2026-09-29

**Lineup**
- Ny snabbknapp "Sparade" (bokmärke) till höger om Anmälda, på mobil och desktop – öppnar sparade uppställningar. Panelen längst ned på desktop och "Hämta anmälningar" i botten av spelarlistan är borttagna (finns som snabbknappar).
- Spara uppställning: namnet är förifyllt "Namn - 9 vs 10 - 14:32" (antal i Vita vs Gröna, 24-timmarsklocka) – ändra "Namn" eller tryck bara Spara.
- "Senaste matcherna": de tio senaste spelade matchernas uppställningar från Score Tracker, t.ex. "Lagen 29/9 – 20:00" med resultat, går att hämta direkt.
- Lägg till spelare: samma ruta på mobil (ny knapp i trupplistan) och desktop – namn, nummer, position, lag och C/A.

## 2.40.2 – 2026-09-29

- Lineup: truppens siffror är desamma på mobil och desktop – totalt i truppen, ✓ kommer (grönt), ✕ kommer ej (rött) och ! anmälda som inte är utplacerade (gult, bara när det finns några). Mobilens Trupp-knapp, trupplistan på mobilen (med förklaring) och Spelartrupp på desktop. Förklaring vid hovring och för skärmläsare.

## 2.40.1 – 2026-09-28

- Nyhet till laget.se: appen kontrollerar mot laget.se att den senaste nyheten finns kvar innan "Uppdatera befintlig nyhet" visas. Har den tagits bort där visas valet inte.
- Ta bort en nyhet som redan är borttagen på laget.se ger "Nyheten var redan borttagen" i stället för felet 500.
- Uppdatera en nyhet som inte längre finns skapar en ny i stället, med ett besked om det. Samma kontroll görs av den automatiska nyheten.

## 2.40.0 – 2026-09-28

**Lineup**
- Toppraden: loggan och "Stålstadens SF" leder till startsidan. Hem, anslutning och kugghjulet ligger till vänster intill loggan; "Ändrad …" i mitten. På desktop är raden lika bred som kolumnerna under.
- Kugghjulsmenyn: "Dela på laget.se" under Dela som text (styrelsen).
- Anmälda/placerade (t.ex. 4/8) står i lagets ruta bredvid rensa-knappen i stället för ovanför; rensa-knappen (✕) är lite större. Gäller desktop och mobil.
- Resultatraden: vinstsiffrorna ligger tätt intill blocken i stället för ute i kanterna.

**Matchrapport**
- Tryck på en bild för att se den större (med Ta med/Ta bort ur inlägget); bocken i hörnet väljer som förut.

- Backlog: Media/Nyheter-modul för egna Instagram-inlägg med teman (se docs/BACKLOG.md).

## 2.39.0 – 2026-09-28

**Automatisk nyhet till laget.se** (Inställningar → laget.se, av som standard)
- X minuter före evenemangets start (standard 45): en tidsinställd nyhet för dagen som inte gått ut uppdateras med aktuell uppställning; finns ingen nyhet publiceras dagens lag – om minst N anmälda spelare (standard 10) står i uppställningen. Redan publicerade nyheter rörs inte. Nyheten byggs på servern med samma kod som i Lineup (rubrik, sponsor som visats minst, hemmalag efter veckodag, dold avsändare).
- "Senast: …" visar vad som hände förra gången.

**Notiser via e-post** (Inställningar → Notiser)
- Mottagare och vilka notiser var och en vill ha: match väntar på godkännande, tidsinställd nyhet skapad, automatisk nyhet om 15 min (förhandsvisning med bild), automatisk nyhet kan inte gå ut (för få spelare), automatisk nyhet publicerad/uppdaterad. Testmejl per mottagare.
- Utgående konto via miljövariabler: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE (true för 465). APP_URL för länkar (standard https://app.stalstadens.se).

- Servern räknar i svensk tid (TZ=Europe/Stockholm).

## 2.38.1 – 2026-09-28

- Score Tracker, välj målskytt/assist: positionen visas som färgad bricka (M, B, C, F – samma färger som överallt) mellan bocken och namnet. Målvakter sist, i övrigt namnordning.

## 2.38.0 – 2026-09-28

- Lineup: "Ändrad idag 18:43" / "Ändrad torsdag 18:43" mitt i toppraden – senast en spelare placerades, flyttades, togs ur laget eller lades till i truppen (inte vid t.ex. hämtade anmälningar). 24-timmarsklocka. Uppdateras när ändringar synkas och varje minut.
- Lineup: Sparade uppställningar finns i kugghjulsmenyn (på mobilen fanns de inte alls; på desktop även under truppen som förut). Tider i listan i 24-timmarsformat.

## 2.37.1 – 2026-09-28

- Stars of the Game-kort: stjärnskylten ligger i ramen ovanför fotot (fotorutan börjar lägre) så att den aldrig hamnar över ansiktet.
- Stars of the Game-kort: märket i hörnet är laget spelaren spelade för i matchen (Vita/Gröna). Utan sparat kort visas städet stort på guldbakgrunden.

## 2.37.0 – 2026-09-28

**Matchrapport – Stars of the Game-kort**
- Matchens tre stjärnor får var sitt guldkort (4:5 för Instagram) att ta med i inlägget eller ladda ned, precis som Resultat och Målen.
- Kortet bygger på spelarens sparade hockeykort (foto, beskärning, friläggning) men i guldstil med folieglans, 3/2/1 guldstjärnor och "FIRST/SECOND/THIRD STAR" i toppen, och matchens siffror i stället för säsongens: G, A, PTS och GWG – målvakter GA, SO och resultat. Matchen står under tabellen.
- Saknar spelaren sparat kort får kortet klubbens märke i fotorutan (valbart, avmarkerat som standard) – inget behöver skapas från grunden.

## 2.36.2 – 2026-09-28

- Rättning: Hockeykort visade ingen bild eller ram sedan v2.34.0 – webbläsarens ritmiljö anropade sig själv i all oändlighet efter att ritkoden gjorts gemensam med servern. Nu verifierat i en riktig webbläsare (kort, foto och friläggning), plus ett test som fångar felet.
- Hockeykort: rubriken "Säsong …" står direkt även utan vald spelare.

## 2.36.1 – 2026-09-28

- Lineup: knappen "Ta ur laget" heter nu "Ta ur uppställningen".

## 2.36.0 – 2026-09-28

**Hockeykort – friläggning**
- Knappen Frilägg tar bort bakgrunden i fotot direkt i webbläsaren, så att spelaren står på en bakgrund i kortets färger (strålkastarljus med svaga diagonala linjer). Reglaget "Ersätt bakgrund" dämpar effekten (0–100 %) om kanterna blir fel; "Ta bort friläggningen" återställer.
- Modellen (MediaPipe Selfie Segmentation, Apache-2.0, ca 6 MB) ligger på vår egen server och laddas först när någon trycker Frilägg. Den är gjord för porträtt/överkropp.
- Masken sparas med kortet och används även när servern ritar om profilkort. Ett nytt foto tar bort den gamla masken.
- Säkerhetspolicyn tillåter WebAssembly ('wasm-unsafe-eval') för friläggningen.

**Hockeykort – sparade kort**
- När en spelare med sparat kort väljs laddas fotot, valen och friläggningen, med ett besked "Sparat kort laddat – senast sparat …". Om listan över sparade kort kommer efter att spelaren valts laddas kortet ändå.

## 2.35.0 – 2026-09-28

- Spelarkortet i Lineup: tryck på bilden för att se den stor, med Spara, Ladda upp ny, Ta bort och Stäng. Utan bild öppnas uppladdningen direkt.
- Spelarkortet i Lineup: tre knappar i stället för en – röd Ta bort (med bekräftelse), Ta ur laget (direkt tillbaka till truppen, bara för placerade spelare) och Stäng.
- Hockeykort: nyp med två fingrar för att zooma fotot direkt i kortet (scrolla på dator).
- Hockeykort: specialkort "Guld ★" – svart och guld med folieglans, för utmärkelser.

## 2.34.1 – 2026-09-28

- Hockeykort: nytt kort utan spelare är retro Svart; med spelare retro i spelarens lag (Grön/Vit), annars Svart.
- Nytt reglage "Färgtoning mot kortet" (0–250 %): hur mycket fotot tonas mot stilens färger så att det smälter in. 100 % = stilens standard.

## 2.34.0 – 2026-09-28

**Hockeykort som profilbild – uppdateras automatiskt**
- "Som profilbild" sparar kortet och gör det till spelarens profilbild. Servern ritar om det när statistiken ändrats: ~20 sekunder efter att en match sparats, godkänts, ändrats eller tagits bort (flera ändringar slås ihop), och en kontroll var sjätte timme (t.ex. nytt säsongsnamn).
- Inget ritas vid sidladdning: profilbilden är en vanlig liten bild som förut. Varje kort har ett fingeravtryck av det som syns – oförändrat = inget arbete. Korten ritas ett i taget i bakgrunden.
- Knappen visar "Profilbild ✓" när det är på; tryck igen för att sluta uppdatera (bilden står kvar). Spelarlistan märker "Profil" respektive "Kort".
- Ritkoden för korten är gemensam för webbläsaren och servern (shared/cardRender.ts), så profilbilden ser exakt ut som förhandsvisningen. Nytt beroende: @napi-rs/canvas (förkompilerat, ingen systemkomponent behövs).

## 2.33.1 – 2026-09-28

- Hockeykort: C/A står efter namnet, lite upphöjt och mindre (som på riktiga kort). Positionsrutan visar bara positionen.
- Statistikrutan får automatisk rubrik när läget väljs: "Säsong 2026/27", "Karriär" eller "Form". En egen rubrik står kvar tills man byter läge.

## 2.33.0 – 2026-09-28

**Hockeykort – retro efter klubbens skisser**
- Ny retrolayout (standard): matt pappersram, mörk ram med diagonala ränder och stjärnor, fotoruta med fasade hörn, namnskylt med klubbrad, nummer och position i egna rutor, statistiktabell (GP, G, A, PTS, W% – målvakt GP, GAA, SO, W%) och lätt slitage. Fotot tonas matt och lite avmättat.
- Retrostilar: Svart (städet som märke), Svart/grön, Grön och Vit. Standard efter spelarens lag.
- Lagmärket väljs separat på alla kort: Städet (est. 2012), Stålstadens grön, Stålstadens vit eller inget.
- Moderna Svart är nu svart med lite vitt (inte guld) och har städet som standardmärke.
- Raden under namnet ("Stålstadens SF") går att ändra. Positioner på engelska (G, D, C, LW, RW, F).

## 2.32.0 – 2026-09-28

**Hockeykort (ombyggd)**
- Klassiskt kortformat 5:7 (750×1050), ritat direkt som bild – skarpt och likadant på alla enheter.
- Välj spelare → ladda upp foto → kortet är klart: autonivåer (ljus/kontrast), beskärning mot överkroppen, stil efter spelarens lag, namn, nummer, position, C/A och säsongens statistik.
- Enhetligt utseende oavsett foto: fotot färgtonas mot stilen, vinjett, toning nertill, metallram och glans.
- Stilar: Gröna, Vita och Svart (extratröja). Nya stilar läggs till som en definition i cardSkins.ts.
- Justera: dra i kortet för att flytta fotot, zoom, ljus, kontrast, färg, Auto för att återställa. Namn, nummer, position, C/A, lagmärke.
- Statistikruta: Säsong (standard), Karriär, Form (senaste 10) eller Egen/Ingen. Målvakter får M, GAA, nollor och V%. Säsong/Karriär uppdateras automatiskt; ändrade värden blir "Egen" och står kvar.
- Spara på spelaren: originalfotot (utan ram) och valen sparas, max ett per spelare – kortet byggs om med senaste statistiken och kan få ny stil. Kort kan också bara laddas ned eller delas utan att sparas.
- Som profilbild: hela kortet sparas som spelarens profilbild.

## 2.31.1 – 2026-09-28

- Startsidan: raden om var tillfälliga länkar skapas borttagen.

## 2.31.0 – 2026-09-28

**Dela verktyg (styrelsen)**
- Tillfälliga länkar skapas nu i Lineup → kugghjulet → Dela verktyg (flyttat från startsidan). Rutan beskriver vad länken ger, listar aktiva länkar med namn, giltighet och antal öppningar, och varje länk kan delas/kopieras eller återkallas för sig. "Återkalla alla" finns kvar.
- Länken ger Lineup och Score Tracker i 24 timmar – inte statistik, PIR, spelarregistret, matchhistorik, inställningar eller publicering på laget.se.
- Länkanvändare ser ingen PIR i Lineup (betyg, formpil, lagstyrka, prediktion eller PIR-inställningar), men Auto balanserar ändå efter PIR i bakgrunden.
- Nyhet till laget.se och PIR per spelare kräver styrelsen även på servern.

## 2.30.1 – 2026-09-28

- Inställningar → PIR → Spelare: tydlig lista med sökfält (varje rad en knapp med betyg och pil) direkt under förklaringen. Tryck på en spelare för förklaring, utveckling och manuell justering (−/+ och Spara) – justeringen flyttad från tabellen in i spelarens vy.

## 2.30.0 – 2026-09-28

**Score Tracker**
- Skärm på: valet sparas på enheten och är på som standard. Låset tas tillbaka automatiskt när appen visas igen (förut försvann det tyst efter att man lämnat appen), och på iPhone vid nästa tryck på skärmen. Knappen visar Skärm på / Tryck (väntar) / Skärm av / Stöds ej. Kräver iOS 18.4 som hemskärmsapp, Chrome eller Firefox 126+.
- Ljud: hörs även i ljudlöst läge på iPhone (ljudsessionen sätts till uppspelning), väcks igen efter samtal/larm. Ljud av/på sparas på enheten.
- Mål utan målskytt visar "👆 Tryck för att ange målskytt / assist" tills något angetts.
- Måltyp: bara Straff (reglage). "Övrigt" visas eller väljs aldrig – gäller även redigering i matchhistoriken, spelarprofilen och statistiken.
- Sponsorer som bara är text syns i svart på Vitas vita målkort.
- Statistik, Återställ och Avsluta på en rad.
- Lineup: Uppdatera ger besked och uppdaterar "Senast synkad" (förut såg det ut som att inget hände). Texten "Stålstadens Score Tracker · A-lag Herrar" borttagen.
- Lägre bottenrad med ny flik Hjälp: korta instruktioner och versionsnumret (flyttat hit).

## 2.29.0 – 2026-09-28

**Inställningar (ny bricka på startsidan, bara styrelsen)**
- PIR: "Så fungerar PIR", träffsäkerhet, alla spelares betyg med manuell justering, vikter med förslag. Nytt: tryck på en spelare för att se varför betyget är som det är (lagresultat, egna insatser, justering) och en kurva över betyget efter de senaste 20 matcherna.
- Sponsorer: flyttade hit (gamla /sponsorer leder hit).
- Perioder: försäsong, säsong och slutspel för statistiken (flyttade från statistiken).
- laget.se: vilket konto som används, anslutningstest och länk till nyhetsadmin.
- Om appen: version och databasinfo.

**Statistik**
- Tre flikar: Översikt, Spelare och Lag. Spelare samlar topplistorna, en PIR-ranking (utespelare/målvakter) och utmärkelserna. Inga inställningar kvar i statistiken.

## 2.28.1 – 2026-09-28

- Startsidan: "Visa databasinfo" borttagen ur brickan längst ned (flyttas till kommande Inställningar).

## 2.28.0 – 2026-09-28

**Statistik – anpassad till hur appen ser ut nu (bara för styrelsen)**
- Fyra flikar som får plats: Översikt, Ligor (poängliga, GWG, straff och utmärkelser), Lag och PIR.
- Fliken Spelare borttagen: ett klick på en spelare var som helst öppnar samma spelarprofil som på spelarsidan (bild, form, rekord, kemi, matchlogg, PIR, jämförelse).
- Inställningarna (kugghjulet) ändrar nu det som faktiskt används: datum för försäsong, säsong och slutspel. "Synlighet utan inloggning", "Visa PIR-rating" och "Minsta antal matcher" borttagna – de påverkade ingenting.
- Översikten: sektionen Måltyper borttagen (bara Straff/Övrigt finns kvar och syns i Ligor).

## 2.27.2 – 2026-09-28

- Spelarsidan: position är valfri ("– Ingen –"). Spelare utan position visade Målvakt i listan och gick inte att spara utan att välja en; nu sparas de som de är. Positionerna visar sitt namn i listan.
- Spelarsidan: sortera på namn, nummer, position eller lag (tryck igen för omvänd ordning).
- Lineup: spelare utan position visas med "–" och fördelas som flexibla av Auto.

## 2.27.1 – 2026-09-28

- Målordningen är enhetlig: Score Tracker visar senaste målet överst under matchen; allt i efterhand (matchdetalj, redigering, matchrapport, statistik) visar första målet överst.
- Rättning: redigera match visade målen med senaste överst men numrerade dem som om de var i tidsordning, och nya mål hamnade som första målet. Nu redigeras i tidsordning med ställning och klockslag per mål, nya mål läggs sist, och ordningen vänds rätt när det sparas.
- Rättning: byta eller rensa målskytt/assist vid redigering behöll den tidigare spelaren (spelar-ID:t följde med). Nu sparas den nya spelaren, med ID när den väljs i listan.

## 2.27.0 – 2026-09-28

- Stars of the Game: matchvinnande mål (GWG) dubblar spelarens poäng i urvalet och visas som "GWG" (guld på bilden, "1G 2A 3TP GWG" i text och listor).
- Målbilden markerar det matchvinnande målet med GWG.
- Resultatbilden: loggorna längre ut och lite mindre, resultatet skalas så att det alltid ryms mellan dem (även tvåsiffrigt). Allt flyttat uppåt så att sponsorn får luft i nederkant, större sponsorlogga.

## 2.26.2 – 2026-09-28

- Matchrapport: egen rubrik på resultatbilden (t.ex. Match 1/5, Julmatchen; tomt = Slutresultat), sparas på matchen.
- Stars of the Game: namnen står centrerade oavsett om statistiken visas; stjärnorna till vänster, statistiken till höger.
- Bildtexten utan position. Målvakter visas som "0 GA" (inte Shutout).
- Meta Business Suite-knappen borttagen (Dela gör samma sak).

## 2.26.1 – 2026-09-28

- Matchrapport: Stars of the Game centrerade rad för rad, statistiken direkt efter namnet. Ingen position på bilden (finns kvar i listan och bildtexten).
- Välj per stjärna om statistiken ska visas (bock, standard på) – gäller bild och bildtext och sparas på matchen.
- Statistik på engelska: G, A, TP för utespelare; målvakter "Shutout" eller "2 GA".

## 2.26.0 – 2026-09-28

**Matchrapport**
- Stars of the Game (1:a–3:e stjärna) i stället för poängbäst – på resultatbilden, i bildtexten och i matchens detaljvy. Väljs automatiskt (mål 3, assist 2, matchvinnande mål +1, vinst +1; målvakt: vinst och få insläppta, hållen nolla ger alltid en stjärna; saknas poäng fylls det på slumpvis, samma för samma match). Kan ändras för hand; valet sparas på matchen.
- "Presenteras av": välj matchens sponsor (standard den som presenterade flest mål). Valet sparas på matchen.
- Bildtext enligt klubbens mall: Kvällens Stars of the Game (⭐⭐⭐/⭐⭐/⭐ med position och M/A/P eller insläppta), "Dagens mål presenterades av …" och hashtags. Går att skriva fritt; Återställ ger mallen igen.
- Hashtags sparas i databasen och läggs alltid till; lägg till och ta bort direkt i rutan (standard #StålstadensSF #Gubbhockey).
- Straff visas som "(straff)" efter målskytten i stället för en röd etikett.
- Meta Business Suite-knapp: på telefon öppnas delningsmenyn (välj Business Suite); på dator sparas bilderna, texten kopieras och Business Suite öppnas.
- Grönas färg i bilderna och matchhistoriken är nu klubbgrön i samma nyans som Grönas logga.

## 2.25.0 – 2026-09-28

**Matchhistorik**
- Rättning: appen kraschade ("Cannot read properties of undefined (reading 'team')") när man drog om ordningen på målen vid redigering.
- Ny matchrapport för Instagram i stället för den gamla exporten (A4 borttaget): två bilder i 4:5 (1080×1350) som karusell – Resultat (logotyper, stort resultat, vinnare, matchens poängbäst, sponsorer) och Målen (alla mål i tidsordning med ställning, målskytt, assist, straff och klockslag; två kolumner vid fler än 12 mål). Välj vilka bilder som ska med, redigera bildtexten, Dela öppnar telefonens delningsmeny (texten kopieras samtidigt), annars laddas bilderna ned.
- Samma positionsfärger som i Lineup (även i spelarprofilen och statistiken).
- "Avvisa från statistiken" är en riktig knapp.
- Utseende i linje med övriga appen: mörk bakgrund, rubrik i Oswald, kort och dialoger i samma stil, Gröna i samma gröna.

## 2.24.1 – 2026-09-28

- Nyhet till laget.se: Avbryt, Spara bild och Kopiera till vänster, Publicera/Tidsinställ/Uppdatera till höger på samma rad.

## 2.24.0 – 2026-09-28

- Statistik och PIR rättar uppställningen utifrån målen när en spelare bytt lag i sista stund: mål/assist bara för det andra laget → spelaren räknas till det laget (vinst/förlust, PIR, kemi, form). Mål/assist för båda lagen → målen räknas men matchen ger ingen vinst/förlust eller PIR för spelaren. Registrerad målskytt som saknas i uppställningen läggs till i målets lag. Den sparade matchen ändras inte.
- Score Tracker: besked efter uppladdning är kortare – "godkänd" eller "väntar på godkännande".

## 2.23.0 – 2026-09-27

- Statistik: bara måltyperna Straff och Övrigt. Ligorna för Skott, Styrning, Friläge, Solo och Självmål är borttagna; äldre mål med de typerna räknas som Övrigt (självmål räknas inte).
- Score Tracker, avsluta match: tydligt besked – "☁️ uppladdad" (godkänd direkt eller väntar på styrelsen) eller "📱 sparad lokalt".
- Lokalt sparade matcher: gul rad med antal och knappen Skicka nu. Uppladdning sker automatiskt var 30:e sekund, när nätet kommer tillbaka och när appen öppnas igen, med besked när den gått igenom.
- Rättning: en match som laddas upp senare får sin riktiga sluttid (inte tiden för uppladdningen). Tillfälliga serverfel och "för många anrop" behåller matchen i kön i stället för att den försvinner.
- Nyhet till laget.se: Kopiera och Spara är ikonknappar.

## 2.22.0 – 2026-09-27

- Laget.se-nyheten: hemmalaget väljs efter matchdagen – tisdag Gröna hemma, torsdag Vita hemma, andra dagar slumpas. Går att ändra i rutan.
- Score Tracker: måltyp är Övrigt (standard) eller Straff. Skott, Styrning, Friläge, Solo och Självmål är borttagna vid registrering och redigering; äldre mål behåller sin typ tills den ändras.
- Score Tracker: Kopiera på Laguppställning borttagen.
- Nya ljud: mål Vita = ljust pling, mål Gröna = tut-tut, slutsignal = utdraget horn (ca 2,5 s). Ljudet låses upp vid första tryck så att slutsignalen hörs även på mobil.

## 2.21.0 – 2026-09-27

- Rensa lag går att ångra och körs direkt (ingen varning). Notis "GRÖNA rensat" med Ångra i fem sekunder. Lagets storlek återställs också vid ångra.
- Resultatrad under prediktionen: ett litet block per match för de senaste 30 – vitt = Vita vann, grönt = Gröna vann, grått = oavgjort, tomma block för ännu ej spelade. Antal vinster per lag i kanterna, datum och resultat vid hovring. Ersätter formraden vid lagnamnen.
- Anmälda-kvittot: antal som tackat nej visas som röd siffra.

## 2.20.0 – 2026-09-27

- Auto går att ångra och körs direkt vid klick (ingen varning). En notis med "Ångra" visas i fem sekunder.
- Mer luft mellan snabbknapparna.
- Anmälda-knappen visar ett kvitto i fyra sekunder: grön med antal anmälda / tackat nej, eller röd vid fel.
- Kugghjulsmenyn: "Demoläge" som reglage (alltid 17 anmälda, varav 2 målvakter) och "Player Impact Rating" i stället för Fler inställningar.
- PIR-rutan innehåller bara PIR (testa anslutning och demo borttagna). Valen sparas på enheten; standard är allt på.
- Form visar streck när det inte finns några matcher (spelarkort och lag), och lagstyrkan visar streck i stället för att försvinna.

## 2.19.0 – 2026-09-27

**Lineup – städning**
- Toppen har bara Hem, anslutningsstatus och ett kugghjul. Kugghjulet öppnar menyn: matchtid, sidoläge (desktop), dela länk, dela som text, statistik, tema, demo och Fler inställningar. Samma på mobil och desktop.
- Nya snabbknappar där de används mest: Ångra, Auto, Nyhet (till laget.se) och Anmälda (hämta från laget.se). Mobil: mellan Trupp och lagräknarna. Desktop: ovanför lagen, mellan Vitas och Grönas räknare.
- Borttaget: Exportera (ersatt av dela länk/text och nyheten) och Slumpa.

## 2.18.0 – 2026-09-27

- Spelarprofilen: PIR som utespelare och/eller målvakt – betyg, formpil, placering bland alla med betyg i samma roll (t.ex. #5 av 48), antal matcher och säkerhet. Manuell justering visas om den finns.
- Jämförelsen visar även PIR ute/målvakt när båda spelarna har betyg.

## 2.17.0 – 2026-09-27

**Spelarsidan – profil**
- Spelarens ruta har flikarna Profil och Redigera (ny spelare öppnas direkt i Redigera).
- Profil: stående profilbild (samma som i Lineup, hämtas först när rutan öppnas), form senaste 10 matcherna och pågående svit.
- Sammanfattning totalt: matcher, mål, assist, poäng (per match) och vinstprocent (V-O-F).
- Rekord: bästa match (poäng, mål+assist, datum), längsta vinstsvit, längst obesegrad.
- Kemi: vinstprocent med kedjekamrater/backpartner (min 2 matcher; målvakter: hela laget), bäst och svårast med i laget (min 3), samt vinner oftast mot och svårast mot (min 3).
- Matchlogg: datum, lag, position, resultat, egna mål och assist – de 10 senaste, "Visa alla".
- Jämför med en annan spelare: sida vid sida (bäst markerat), form, samt hur det gått i samma lag och mot varandra.
- Historik per säsong finns kvar under profilen.

## 2.16.0 – 2026-09-27

- Form de senaste 10 matcherna: i spelarkortet (per spelare, oavsett lag) och bredvid lagnamnet för Vita och Gröna (så många som får plats, nyast till höger). V = vinst, O = oavgjort, F = förlust.
- Profilbilden är stående 3:4 (240×320 px) i stället för kvadratisk.
- Desktop: placerade spelare går att redigera igen genom att klicka på ikonerna, som i truppen.
- Hovring visar positionens namn (t.ex. IB = Ice Box, LW = Vänsterforward) på brickor, filter och val.

## 2.15.0 – 2026-09-27

**Spelarkortet**
- Spelarkortet (desktop och mobil) har nästan helt täckande bakgrund, så allt går att läsa oavsett vad som ligger bakom.
- Profilbild till vänster om statistiken. Tom diskret ruta tills någon laddar upp: tryck på rutan och välj bild. Bilden beskärs till kvadrat (lite ovanför mitten för stående bilder), förminskas till 320×320 px JPEG (oftast 15–40 kB) i telefonen och sparas i databasen. Liten × tar bort bilden.
- Bilden hämtas först när kortet öppnas (GET /api/players/:id/photo), aldrig i listor. ETag gör att webbläsaren återanvänder den tills den byts. Bara för inloggade (styrelsen/tillfällig länk) – visas inte i delade länkar.

## 2.14.0 – 2026-09-27

- Laget.se-nyheten: "Ta bort nyheten från laget.se" för nyheten som appen publicerat för samma dag, med bekräftelse. Samma borttagning som "Ta bort" i laget.se-admin; efteråt publiceras nästa nyhet som ny.

## 2.13.4 – 2026-09-27

- Rättning: publicering via laget.se-admin gav "The FileId field is required". Bild-id skickas nu som 0, precis som webbläsaren gör när en bild väljs (både ny och uppdaterad nyhet).
- Rubriken begränsas till 60 tecken (laget.se:s gräns).
- Diskret notis under länken till nyhetsadmin: kräver att du är admin för laget på laget.se.

## 2.13.3 – 2026-09-27

- Laget.se-nyheten: "Visa avsändare" visar kontots namn på laget.se (inte e-postadressen). Namnet hämtas vid inloggning och sparas i sex timmar; byts kontot i Coolify hämtas det nya namnet direkt.
- Länk till "Alla nyheter i laget.se-admin" (NewsManagement) för vidare administration.

## 2.13.2 – 2026-09-27

- Laget.se-nyheten: publiceringstid väljs i egna listor (datum, timme, minut) – alltid 24-timmarsformat oavsett webbläsarens språk.
- Tipset om fet stil står direkt under textfältet. "Visa avsändare" ligger sist och visar kontot från LAGET_SE_USERNAME.

## 2.13.1 – 2026-09-27

- Laget.se-nyheten: avsändaren (kontot som publicerar) visas inte som standard. Texten om öppen publicering borttagen.

## 2.13.0 – 2026-09-27

**Nyheten via laget.se-admin**
- Publiceringen går nu via adminformuläret (Nyheter → Lägg till nyhet) i stället för snabbrutan på lagsidan. Det ger tidsinställning, fet text och riktig uppdatering.
- Tidsinställd publicering: "Direkt" eller "Vid tid". Standard är evenemangsdagen kl 21:15; har den tiden passerat blir det Direkt.
- Fet stil (<b>) på sponsornamnet, lagnamnen, positionerna och C/A. Namn görs HTML-säkra. Egen fet text: omge med <b> och </b>.
- Finns redan en nyhet från appen för samma dag uppdateras den på plats (samma nyhet, ny bild och text) i stället för att tas bort och publiceras om.
- Återkopplingen visar Publicerad, Uppdaterad eller Tidsinställd med tid.

## 2.12.0 – 2026-09-27

**Publicera på laget.se**
- "Nyhet till laget.se" har nu knappen Publicera. Servern loggar in med föreningens konto och publicerar via samma väg som laget.se:s egen "Lägg till nyhet" på lagsidan (api.laget.se/v1/news): rubrik, text, bild och avsändare.
- Återkoppling i rutan: länk till den publicerade nyheten, eller felmeddelandet från laget.se.
- Val: visa avsändare (standard på). Om appen redan publicerat en nyhet för samma dag kan den ersättas – den nya publiceras och den gamla tas bort (via Nyheter i laget.se-admin), så den nya hamnar överst.
- Nyheter från den här vägen är alltid öppna; laget.se har inget val för dolda nyheter där.
- Spara bild och Kopiera text finns kvar för manuell publicering.
- Servern tar emot upp till 8 MB per anrop (bilden skickas som base64).

## 2.11.1 – 2026-09-27

- Laget.se-nyheten: matchbandets innehåll (datum, loggor, sponsor) hålls inom mittersta ca 2,4:1, så att även smalare listvyer och delningar visar allt. Sponsorloggan max 64 px hög.

## 2.11.0 – 2026-09-27

**Lineup – truppen och spelarkortet**
- Desktop: truppen visar en rad per spelare i stället för två. Ikonerna i samma ordning som i mobilen: C/A, lag, position, formpil (PIR-trend), speltid, PIR.
- Desktop: klicka på en tom plats i ett lag – platsen markeras och truppen sorteras som i mobilen (anmälda, rätt position, platsens lag, waivers, namn). Klicka på en spelare så hamnar den där och listan går tillbaka till vanlig sortering. Klicka på platsen igen, Avbryt eller Esc för att avbryta.
- Spelarkortet (desktop och mobil): ny statistikdel längst ner med matcher, mål, assist, poäng och vinstprocent – innevarande säsong och totalt (godkända matcher).
- Spelarkortet: "Spelat" (andel per position) står nu direkt vid positionsvalet.

## 2.10.0 – 2026-09-27

**Sponsorer**
- Ny sida för styrelsen: Sponsorer (från startsidan). Lägg till med namn och valfri logga – utan logga visas namnet som tidigare.
- Loggan bearbetas i webbläsaren: tomma kanter beskärs, bilden skalas (max 600×240) och sparas som PNG i databasen, så den följer med i backupen. Val: "Ta bort vit bakgrund" och "Gör loggan vit". Förhandsvisning på mörk bakgrund.
- Byt namn, byt/ta bort logga, pausa/aktivera, ändra ordning, ta bort. Vid namnbyte följer registrerade mål med.
- Den sponsor som visats minst väljs, med två räknare: mål i matcher (Score Tracker) och laguppställningar (nyheten till laget.se). Vid lika slumpas det. Räknarna nollas 1 juni; listan visar även förra säsongen.
- Score Tracker: sponsorlistan sparas i telefonen, så valet fungerar offline. Målhistoriken visar loggan när den finns.
- Matchrapporten och laget.se-nyheten använder registret. Nyheten visar hur många lagnyheter varje sponsor haft denna säsong i listan.
- De fyra tidigare hårdkodade sponsorerna läggs in automatiskt.

## 2.9.0 – 2026-09-27

**Nyhet till laget.se (steg 1 – manuell publicering)**
- Nytt val i Dela-menyn i Lineup: "Nyhet till laget.se". Öppnar en förhandsgranskning med bild, rubrik och text.
- Bilden har samma stil som delad länk (arenabakgrund, positionsbrickor, C/A). Vita överst, Gröna underst, matchbandet i mitten med lagloggor, datum, plats/tid och matchsponsor.
- Matchbandet ligger alltid exakt i bildens mitt och är 2:1 – det är den delen som syns i laget.se-flödet. Det mindre laget fylls ut så att mitten håller oavsett antal spelare.
- Hemmalag väljs med en knapp och står till vänster i matchbandet. Standard är motsatt mot förra nyheten (sparas i databasen).
- Rubrik "Lagen D/M – plats tid" från evenemanget på laget.se, går att ändra. Brödtexten börjar med "Dagens matchsponsor: …" följt av uppställningen som text.
- Spara bild (delningsmenyn på mobil, nedladdning på dator) och Kopiera text. Publicering direkt till laget.se kommer i nästa steg.
- laget.se-hämtningen läser nu också starttid och (om möjligt) plats från evenemanget.

## 2.8.2 – 2026-09-27

- Delad länk: samma positionsfärger som i Lineup och Score Tracker (MV orange, B blå, C lila, forwards turkos), samma radutseende och C/A-färger (C gul, A orange). Ingen PIR eller annan extra information.
- Positionsfärgerna ligger på ett ställe i koden och används av alla vyer.

## 2.8.1 – 2026-09-27

- Redigeringspanelen när man trycker på en spelare hamnar alltid helt innanför skärmen. På mobil centreras den vågrätt; får den inte plats under spelaren läggs den ovanför. Tidigare räknade panelen med fel bredd och kunde hamna delvis utanför till höger (särskilt för spelare i Gröna).

## 2.8.0 – 2026-09-27

**Anmälan synkas till laget.se igen – på mobil också**
- Samma tre knappar överallt när man trycker på en spelare: Kommer / Kommer inte / Ej svarat. Med laget.se-koppling uppdateras laget.se först och appen när det lyckats. Tidigare fanns synken bara i truppen på datorn; på mobilen och i uppställningen ändrades bara appen.

**Spelade positioner i procent**
- Andel matcher per position – MV, B, C, LW, RW – visas när man trycker på en spelare. Utan matcher: 0 % överallt.
- Säsongshistoriken på sidan Spelare visar LW och RW separat.

## 2.7.2 – 2026-09-27

- Tom plats → lagordningen ändrad: platsens lag först, sedan waivers, sist motståndarlaget. Tom back i Vita: vita backar, waiver-backar, gröna backar, vita forwards, waiver-forwards, gröna forwards (anmälda först, sedan ej svarat, sist kommer inte). Truppen: närvaro, sedan namn.

## 2.7.1 – 2026-09-27

- Tom plats → spelarmenyn sorteras: närvaro, passande position, lag (waivers först, sedan platsens lag, sist motståndarlaget), namn. Exempel för en tom back i Vita: waiver-backar, vita backar, gröna backar, waiver-forwards, vita forwards, gröna forwards.
- Namn i uppställningen: förnamn på första raden, efternamn på andra. Ord delas aldrig mitt i – blir en rad för lång kortas bara den med "…". Tröjnumret står efter förnamnet.

## 2.7.0 – 2026-09-27

**Lineup: en och samma spelarmeny**
- Tryck på en tom plats öppnar samma meny som "Trupp" – samma utseende, ikoner och funktioner. Rubriken visar vilken plats du väljer till (t.ex. "VITA · LW"), och ett tryck på en spelare placerar den direkt där.
- Den gamla separata platsväljaren är borttagen.
- Samma sortering överallt: anmälda först, sedan de som inte svarat, sist de som inte kommer, sedan namn. Från en plats: passande position först inom varje grupp (LW/RW → F, C → C, B → B, MV → MV). Samma ordning på datorn.

**Trend**
- Trendikonen står mellan position och PIR och visas alltid: ↑ stigande, ↗ svagt stigande, → stabil, ↘ svagt fallande, ↓ fallande, ? för lite data (färre än 3 matcher). Även i PIR-rutan i uppställningen.
- "Vanligaste position" visas nu i spelarens redigering ("spelat mest som B") i stället för i listan.

## 2.6.2 – 2026-09-27

**Lineup, uppställningen (mobil)**
- Högst 2×2 märken: lag och position överst, PIR under (dubbel bredd, visas alltid när PIR är påslaget i inställningarna, med trendpil).
- C/A visas inte i uppställningen – bara i truppen och när man trycker på spelaren.
- Speltiden står diskret under positionen i rutan till vänster (t.ex. LW / 60ʼ).
- Mer plats för namnet.

**Truppen (mobil)**
- Anmälan visas som färgad kant, samma som i uppställningen.
- C/A står först bland märkena, och rader utan "vanligaste position" får en tom plats – allt linjerar.
- Förklaring av färger och V/G/W överst i listan.

**Båda**
- Spelare utan lag visas med W (waivers) i stället för en tom grå ruta.

## 2.6.1 – 2026-09-26

**Lineup: spelarkort, omtag**
- Samma kort i truppen och i uppställningen: namnet till vänster (upp till två rader), märkena i två rader till höger.
  - Rad 1: C/A först, sedan lag och position – linjerar till höger på alla rader.
  - Rad 2: speltid, vanligaste position (bara om den skiljer sig) och PIR.
- Anmälan (färgad kant) visas nu även i truppen.
- Lagrutan har bokstav: V = tillhör Vita, G = tillhör Gröna. Tom ruta = inget lag.
- PIR visas bara för spelare med minst 3 matcher (eller manuell justering) – inga "1000" för alla.
- Mindre luft: kortet inne i en plats har ingen egen ruta.

## 2.6.0 – 2026-09-26

**Lineup: nya spelarkort**
- Anmälan visas som en färgad kant till vänster: grön = anmäld, röd = kommer inte, grå = inte svarat. Syns oavsett vilket lag spelaren är placerad i.
- Lagtillhörigheten (vit/grön ruta) visas alltid på kortet.
- Hela namnet får första raden. PIR flyttas till höger på andra raden.
- Förklaring av färgerna ovanför truppen (fungerar på mobil där det inte finns mouse-over).

**Score Tracker**
- Fliken "Uppställning" heter nu "Lineup".
- Samma positionsfärger som i Lineup (MV orange, B blå, C lila, forwards turkos). A-märket orange som i Lineup.

## 2.5.1 – 2026-09-26

- Lineup, truppen: ikonerna till höger linjerar nu på alla rader. Rader utan "vanligaste position" får en tom plats, och C/A står först.
- Lineup, korten i uppställningen: C/A visas före lagfärg och position.

## 2.5.0 – 2026-09-26

**Ny grund inför säsongen – all historik nollställd (beslut av styrelsen)**
- Gamla matcher, sparade uppställningar och dagens placeringar är borttagna. Spelarregistret är kvar. PIR och statistik börjar om från noll.
- Allt pekar nu på spelarens fasta ID, utan kopior och utan översättning av gammal data:
  - Uppställningen lagrar bara plats → spelar-ID och vem som anmält sig. Truppen är de aktiva spelarna i registret.
  - Matcher lagras i tre tabeller: matchen, vilka som spelade (lag, plats, position) och varje mål (målskytt/assist som ID). Gästspelare utan registrering sparas med namn.
  - Sparade uppställningar och delningslänkar lagrar spelar-ID.
  - Namn och nummer hämtas alltid från registret – ändringar slår igenom överallt direkt.
- Ihopslagning av dubbletter flyttar alla matcher och mål till den kvarvarande spelaren och tar bort dubbletten (inga alias eller kedjor längre).
- Borttaget: engångsmigreringen från v2.4, alias/tidigare namn, namnbaserad koppling av mål och PIR, kompatibiliteten för appversioner före 2.2.
- Index på matchdatum, granskningsstatus, deltagare och mål.

## 2.4.0 – 2026-09-26

**Spelarregister**
- Ny tabell `players`: en rad per person med fast ID. Namn, nummer, position, lag, C/A, medlem ja/nej, aktiv ja/nej, namn i laget.se, externt ID och tidigare namn (alias).
- Byggs automatiskt vid uppstart (engångsmigrering): nuvarande trupp blir aktiva medlemmar; spelare som bara finns i gamla matcher blir inaktiva och "ej medlem"; samma person med gammalt ID slås ihop; gamla namn/nummer sparas som alias; gamla mål och assist kopplas till spelar-ID; PIR-justeringar flyttas till spelar-ID.
- Registret och Lineup hålls i synk åt båda hållen, live. Ändringar i Lineup (namn, nummer, position, lag, C/A, nya och borttagna spelare) sparas i registret; ändringar i registret syns direkt i Lineup och Score Tracker. Nya spelare från Lineup blir "ej medlem" tills styrelsen ändrar.
- Statistik och PIR räknas per spelar-ID. Byter en spelare namn eller nummer följer hela historiken med. Nya mål sparas med målskyttens och assistens ID.
- Laget.se-anmälningar matchas även mot "namn i laget.se".

**Historik per säsong**
- Per spelare och säsong (1 aug–31 jul): matcher, vinst/oavgjort/förlust, mål, assist, antal matcher per position (MV/B/C/F) och i vilket lag. Räknas från godkända matchers sparade uppställningar och följer spelarens ID. Visas i spelardialogen.

**Ny sida: Spelare (styrelsen)**
- Lista med sök och filter (i truppen, inaktiva, ej medlemmar, alla), redigera, lägg till, slå ihop dubbletter.
- "Att se över": möjliga dubbletter och medlemmar utan nummer.
- Exportera till CSV (öppnas i Excel) och importera tillbaka med förhandsgranskning av nya, ändrade och saknade spelare. Valet "filen är hela medlemsregistret" flaggar saknade som ej medlem – ingen tas bort.

## 2.3.4 – 2026-09-26

- Databasanslutningen använder kryptering (TLS) automatiskt när MySQL kräver det (`require_secure_transport=ON`). v2.3.3 kunde inte starta av den anledningen. Styrs med `DATABASE_SSL` (auto/on/off) och valfritt `DATABASE_SSL_CA` för certifikatkontroll.

## 2.3.3 – 2026-09-25

- Ändringar gjorda direkt i databasen (t.ex. med ett databasverktyg) upptäcks inom ca 5 sekunder. Uppställningen laddas om och alla enheter hämtar det nya läget; matchcachen laddas om. Tidigare låg uppställning och matcher kvar i serverns minne tills appen startades om, och appen kunde skriva över en extern ändring.
- Startsidan (styrelsen): "Visa databasinfo" visar vilken databas appen använder, alla tabeller med antal rader (tabeller appen inte använder markeras) samt antal spelare och matcher.

## 2.3.2 – 2026-09-25

- Lineup: speltidstexten under varje lag är större och tydligare, en rad per grupp (backar, centrar, forwards). Backarna visas nu också.
- Lineup: ger ett förslag på jämnare fördelning (antal backar/centrar/forwards) när speltiden skiljer mycket mellan grupperna – samma beräkning som IceTime.
- Matchprediktionen: "(test)" borttaget ur rubriken.

## 2.3.1 – 2026-09-25

**Auto-fördelning**
- Alla anmälda placeras ut – formationen utökas vid behov så att ingen blir över (bara anmälda placeras).
- Lagfärg först. Blir antalet ojämnt fyller spelare utan lagfärg på det mindre laget; räcker de inte flyttas spelare med lagfärg från det större laget (de som bäst jämnar ut position och PIR).
- Lagkapten (C) och målvakter med lagfärg flyttas aldrig till fel lag – gäller även "Slumpa".

**PIR-förslag från början**
- Förslag tas fram redan från 6 matcher (tidigare 30). Med lite data dras förslaget mot standardvikterna i proportion till datamängden, så det hjälper tidigt utan att överreagera. Säkerheten (låg/medel/hög) visas.

## 2.3.0 – 2026-09-25

**PIR med individuella insatser**
- Mål och assist ger bonus, målvakter jämförs mot snittet av insläppta mål. Självmål ger inga poäng. Bonusarna jämnas ut inom varje match så att snittet stannar kring 1000.
- Vikterna (mål, assist, målvakt, halveringstid) kan ändras av styrelsen. Standard: 3 / 2 / 2 / 90 dagar.
- Manuell justering av en spelares PIR (t.ex. +50 för en ny stark spelare). Ligger ovanpå beräkningen och gäller även spelare med få matcher.

**Träffsäkerhet och förslag (Statistik → PIR)**
- Varje match förutsägs med bara det som var känt före den, och jämförs med utfallet: rätt vinnare, Brier-poäng, jämförelse med bara lagresultat och kalibrering.
- "Ta fram förslag" provar olika vikter och visar vilka som hade förutsagt historiken bäst. Rekommenderas bara när det finns minst 30 matcher och förbättringen är tydlig. Styrelsen godkänner.
- Testat på syntetiska säsonger: prognosen träffar lika ofta som om man visste spelarnas verkliga styrka, och individuella vikter förbättrar jämfört med bara lagresultat.

**Auto-fördelning**
- Ny ordning: lagfärg → jämnt antal spelare (inkl. målvakter) → jämnt antal backar/centrar/forwards → PIR-byten inom samma position tills lagen är så jämna som möjligt.
- Målvakt som även spelat ute placeras som utespelare när två rena målvakter finns.
- Rättat: en tredje målvakt fick aldrig någon plats (reservmålvaktsplatsen skapades inte).
- Prediktion och fördelning använder samma regel för spelarstyrka.

## 2.2.0 – 2026-09-25

**Ny live-synk för Lineup**
- Varje ändring skickas som en liten operation (flytta spelare, byt lagnamn, ändra formation) i stället för hela uppställningen. Servern tar dem i tur och ordning och skickar dem direkt till alla enheter.
- Två personer som flyttar olika spelare samtidigt skriver inte längre över varandra. Flyttar båda samma spelare vinner den sista – ingen spelare försvinner eller dubbleras.
- Ändringar visas direkt på den egna enheten och köas om nätet försvinner. De skickas automatiskt när anslutningen kommer tillbaka.
- Mobil: synkar direkt när appen öppnas igen efter att ha legat i bakgrunden.
- PIR och vanligaste position räknas lokalt och synkas inte (färre onödiga uppdateringar).
- Den gamla synkkoden med sina lager av lagningar är borttagen, liksom operationsloggen i databasen.
- Score Tracker uppdaterar uppställningen live när den ändras i Lineup.

**Delning**
- "Dela länk" skapar en öppen, skrivskyddad länk som gäller i 48 timmar och sedan tas bort. Delningslänkar syns inte bland sparade uppställningar.
- Delnings-ID:n skapas med kryptografisk slump.

**Matchprediktion (experimentell, endast styrelsen)**
- Visas ovanför lagen när PIR och "Visa matchprediktion" är påslagna. Vinstchans per lag från PIR per roll, och hur stor andel av spelarna som har tillräckligt med matchdata.

**Tester**
- Nya tester kör två simulerade enheter mot riktig server: samtidiga flyttar, krockar, snabba serier, formation och servern nere en stund.
- Röktest av hela Lineup-sidan: ingen återkopplingsloop och fjärrändringar syns live.

## 2.1.2 – 2026-09-25

- Lineup: "Dela" har nu två val – "Dela länk" och "Dela som text" (samma textformat som "Kopiera" i Score Tracker). På mobilen öppnas telefonens dela-meny.
- Inställningar: laget.se-delen visas bara för styrelsen och innehåller bara "Testa anslutning".

## 2.1.1 – 2026-09-25

- Score Tracker: knappen "Exportera" under Uppställning borttagen (samma innehåll som "Kopiera").
- IceTime: inställningspanelen ligger inte längre kvar över innehållet när man scrollar på mobilen (fast bara på större skärmar).
- IceTime: matchtiden kan nu sättas ned till 45 minuter (tidigare 50).

## 2.1.0 – 2026-09-25

**Granskning av matcher**
- Matcher som sparas i Score Tracker utan inloggning markeras "väntar" och räknas inte i statistiken förrän styrelsen godkänt dem. Ingen skillnad för den som använder Score Tracker.
- Styrelsen godkänner eller avvisar i Matchhistorik ("Godkänn alla" finns). Startsidan visar hur många som väntar.
- Styrelsens egna matcher godkänns direkt. Alla befintliga matcher räknas som godkända.

**Säkerhet**
- Alla beroenden uppdaterade: 57 kända sårbarheter (22 höga) → 0 i produktionsberoenden.
- Moderna ersättare: Express 5, Vite 8, Vitest 5, html2canvas-pro (underhållen fork), inbyggd `crypto.randomUUID` i stället för nanoid, Nodes inbyggda `.env`-läsning i stället för dotenv. Manus-patchen för wouter borttagen.
- Säkerhetsheaders (CSP, HSTS, skydd mot inbäddning m.m.).
- Öppna matchsparningen: max 20 per IP och timme, strikt validering av indata.

**Drift**
- Nytt migreringsskript: hanterar databaser utan migreringslogg, avbryter uppstart vid fel (Coolify behåller då gamla versionen).
- Docker-imagen kör som icke-root, innehåller bara produktionsberoenden och saknar byggverktyg.
- GitHub Actions kör typkontroll, migrering, tester och bygge vid varje push.
- Oanvända tabeller `users` och `app_secrets` borttagna.

**Prestanda**
- Matcher och PIR cachas i minnet och räknas om först när något ändras.

## 2.0.0 – 2026-09-25

Första versionen efter genomgången och städningen av det sammanslagna Manus-projektet.

**Säkerhet**
- Behörighet kontrolleras på servern. Score Tracker är öppen för alla, allt annat kräver inloggning.
- Styrelseinloggning med `ADMIN_PASSWORD` (30 dagar per enhet). Det hårdkodade lösenordet är borttaget.
- Tillfälliga länkar (24 h) för att bygga uppställningar, med möjlighet att återkalla alla.
- Laget.se-inloggningen finns bara som miljövariabler i Coolify.
- Appen startar inte utan `JWT_SECRET`, `ADMIN_PASSWORD` och `DATABASE_URL`.
- Railway-uppgifter rensade ur git-historiken.

**PWA och offline**
- Score Tracker är en egen installerbar app med egen ikon.
- Score Tracker fungerar offline: uppställningen sparas lokalt och matcher köas tills det finns nät.
- Typsnitt, bilder och ikoner ligger lokalt. Inga externa beroenden vid sidladdning.

**Städning och prestanda**
- Manus-rester, död kod, ~45 oanvända UI-komponenter och 40 oanvända paket borttagna.
- Koddelning per del av appen. Huvudfilen gick från 1,1 MB till 520 kB.
- Trasig lockfil lagad (Docker-bygget hade annars fallerat).
