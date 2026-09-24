# Backlog – app.stalstadens.se

Prioriterad lista från genomgången 2026-09-24. Bocka av när klart.

## 1. Deploy
- [ ] Merga `main` → `production`. Live kör fortfarande gammal kod som länkar logotyper, bakgrund och favicon från Manus CDN (därav trasiga bilder).

## 2. Säkerhet
- [ ] Adminlösenordet ("Styrelsen") är hårdkodat i klientkoden (SettingsModal.tsx, MatchHistoryPage.tsx) och läsbart för alla. Flytta till miljövariabel i Coolify, kontrollera enbart på servern.
- [ ] Alla ~40 tRPC-endpoints är öppna. Skydda skrivande/raderande endpoints (radera matcher, sparade uppställningar, laget.se-inloggning) med admin-session.
- [ ] `JWT_SECRET` har en känd reservnyckel i server/crypto.ts. Appen ska vägra starta utan den i produktion.
- [ ] Railway-databasens root-lösenord finns i git-historiken. Radera Railway-projektet om det finns kvar.

## 3. Saknade filer (Jerry)
- [ ] Sponsorloggor: Polar, Lindströms Transport, Kirunabilfrakt, Ren → `client/public/images/sponsors/`
- [ ] Ljud: målljud Vita, målljud Gröna, slutsignal → `client/public/audio/`
- Filerna fanns på Manus CDN, se docs/ASSET-INVENTORY.md för filnamn.

## 4. Optimering och städning
- [ ] Koddela per delapp (lineup/score/stats/cards/history/icetime). JS-bundlen är 1,1 MB.
- [ ] Slå ihop README.md och DEPLOY.md (säger emot varandra om miljövariabler; DEPLOY nämner TiDB och LAGET_SE_* som inte längre behövs).
- [ ] Separera eller mocka de 9 tester som kräver databas.
- [ ] `start.sh` sväljer migreringsfel – ska avbryta start vid fel.
- [ ] Gå igenom oanvända komponenter och beroenden efter sammanslagningen av projekten.

## Klart
- [x] Återställd komplett pnpm-lock (Docker-bygget hade fallerat)
- [x] Manus-rester, gammal zip, package-lock.json och död ComponentShowcase borttagna
- [x] Anteckningar flyttade till docs/, logotyper krympta, SW cachar icetime-manifest
