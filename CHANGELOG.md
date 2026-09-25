# Ändringslogg

Versionsnummer: `MAJOR.MINOR.PATCH`
- **PATCH** (2.0.1): buggfixar och småjusteringar
- **MINOR** (2.1.0): nya funktioner
- **MAJOR** (3.0.0): stora omtag som ändrar hur appen används

Versionen höjs i `package.json` vid varje deploy till `production`, och commiten taggas `vX.Y.Z` på GitHub. Versionen och byggdatumet visas diskret längst ner i appen och i `/api/health`.

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
