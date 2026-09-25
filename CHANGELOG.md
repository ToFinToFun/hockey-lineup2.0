# Ändringslogg

Versionsnummer: `MAJOR.MINOR.PATCH`
- **PATCH** (2.0.1): buggfixar och småjusteringar
- **MINOR** (2.1.0): nya funktioner
- **MAJOR** (3.0.0): stora omtag som ändrar hur appen används

Versionen höjs i `package.json` vid varje deploy till `production`, och commiten taggas `vX.Y.Z` på GitHub. Versionen och byggdatumet visas diskret längst ner i appen och i `/api/health`.

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
