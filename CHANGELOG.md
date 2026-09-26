# Ändringslogg

Versionsnummer: `MAJOR.MINOR.PATCH`
- **PATCH** (2.0.1): buggfixar och småjusteringar
- **MINOR** (2.1.0): nya funktioner
- **MAJOR** (3.0.0): stora omtag som ändrar hur appen används

Versionen höjs i `package.json` vid varje deploy till `production`, och commiten taggas `vX.Y.Z` på GitHub. Versionen och byggdatumet visas diskret längst ner i appen och i `/api/health`.

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
