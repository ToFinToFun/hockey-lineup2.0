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
- [x] Koddelning per delapp.
- [x] README och DEPLOY sammanslagna (DEPLOY.md borttagen).
- [x] Tester: behörighetstester tillagda; laget.se-testet körs bara när inloggning finns. DB-testerna kräver en MySQL (DATABASE_URL).
- [x] Migreringsskript som avbryter vid fel och hanterar äldre databaser.
- [x] Död kod bort: ~45 oanvända UI-komponenter, AI-chatt, oanvända statistiksidor/hooks, 40 oanvända npm-paket.
- [x] Laget.se läses bara från miljövariabler (secretsDb/crypto borttagna).
- [x] Tabellerna `users` och `app_secrets` borttagna (migrering 0004).
- [x] PWA: Score Tracker som egen app med egen ikon (score-icon-*), hela sidan som egen app. Servern sätter rätt manifest/ikon/namn per del.
- [x] Offline: SW cachar Score Tracker vid installation, 3 s timeout vid dålig täckning, uppställningen sparas lokalt, matcher köas och skickas när nät finns.
- [x] Typsnitt lokalt (@fontsource) i stället för Google Fonts. Koddelning: huvudfilen 1,1 MB → 520 kB.

## Klart
- [x] Återställd komplett pnpm-lock (Docker-bygget hade fallerat)
- [x] Manus-rester, gammal zip, package-lock.json och död ComponentShowcase borttagna
- [x] Anteckningar flyttade till docs/, logotyper krympta, SW cachar icetime-manifest

## Framtiden
- [ ] Databasbackup i Coolify (schemalagd, gärna till extern lagring).
- [ ] TypeScript 7, framer-motion 13 och lucide-react 1.x – tas i designfasen (kräver UI-genomgång).
