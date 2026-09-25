# Backlog – app.stalstadens.se

Prioriterad lista från genomgången 2026-09-24. Bocka av när klart.

## 1. Deploy
- [x] Merga `main` → `production` (live länkade tidigare logotyper, bakgrund och favicon från Manus CDN).

## 2. Säkerhet
- [x] Behörighet på servern: publik score tracker, tillfälliga 24 h-länkar för uppställning, styrelseinloggning via ADMIN_PASSWORD. Hårdkodat "Styrelsen" borttaget.
- [x] Laget.se-formuläret borttaget; inloggningen ligger bara i Coolify.
- [x] Appen vägrar starta i produktion utan JWT_SECRET/ADMIN_PASSWORD/DATABASE_URL.
- [x] Railway: kontot borttaget, gamla uppgifter rensade ur git-historiken.

## 3. Saknade filer (Jerry)
- [ ] Sponsorloggor: Polar, Lindströms Transport, Kirunabilfrakt, Ren → `client/public/images/sponsors/`
- [ ] Ljud: målljud Vita, målljud Gröna, slutsignal → `client/public/audio/`
- Filerna fanns på Manus CDN, se docs/ASSET-INVENTORY.md för filnamn.

## 4. Optimering och städning
- [ ] Koddela per delapp (lineup/score/stats/cards/history/icetime). JS-bundlen är 1,1 MB.
- [x] README och DEPLOY sammanslagna (DEPLOY.md borttagen).
- [x] Tester: behörighetstester tillagda; laget.se-testet körs bara när inloggning finns. DB-testerna kräver en MySQL (DATABASE_URL).
- [ ] `start.sh` sväljer migreringsfel – ska avbryta start vid fel.
- [x] Död kod bort: ~45 oanvända UI-komponenter, AI-chatt, oanvända statistiksidor/hooks, 40 oanvända npm-paket.
- [x] Laget.se läses bara från miljövariabler (secretsDb/crypto borttagna).
- [ ] Migrering: ta bort tabellerna `users` och `app_secrets` (väntar på att migreringsstatus i produktion är kontrollerad).
- [ ] PWA: separat installerbar Score Tracker med egen ikon, offline-först (spelare cachade, matcher köas och synkas när nät finns). Hela sidan som egen PWA för styrelsen.

## Klart
- [x] Återställd komplett pnpm-lock (Docker-bygget hade fallerat)
- [x] Manus-rester, gammal zip, package-lock.json och död ComponentShowcase borttagna
- [x] Anteckningar flyttade till docs/, logotyper krympta, SW cachar icetime-manifest
