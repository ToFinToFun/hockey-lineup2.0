# Sätta upp appen för en ny förening

Appen körs som **en installation per förening**: egen databas, egen adress och
egna inställningar. Koden är densamma – det som skiljer är klubbprofilen,
miljövariablerna och det som ställs in i appen.

Stålstadens SF är standard. Inget här behövs för Stålstadens egen installation.

---

## 1. Klubbprofil (standardvärden)

Skapa en fil i `shared/clubProfiles/`, t.ex. `shared/clubProfiles/minklubb.ts`,
med samma fält som `stalstadens.ts`:

| Fält | Exempel | Används till |
|---|---|---|
| `id` | `"minklubb"` | Väljs med `CLUB_PROFILE` |
| `name` / `shortName` / `fullName` | `"Min Klubb IF"` / `"MKIF"` / `"Min Klubb Idrottsförening"` | Bilder, kort, rubriker, hemskärmsnamn |
| `hubTitle` / `hubSubtitle` | `"Min Klubb"` / `"Idrottsförening"` | Startsidan |
| `logo` | `"/images/minklubb/logo.png"` | Klubbens logga |
| `crest` | `{ name: "Märket", url: … }` (valfritt) | Extra märke på hockeykorten |
| `teams.white` / `teams.green` | `{ name: "Röda", singular: "Röd", shortName: "RÖD", color: "#dc2626", accent: "#f87171", logo: … }` | De två interna lagen. Nycklarna white/green är bara lagring – namn och färger är det som visas |
| `homeTeamByWeekday` | `{ 2: "green", 4: "white" }` | Hemmalag i nyhetsbilden per veckodag (tomt = slumpas) |
| `hashtags` | `["#MinKlubb"]` | Matchrapport och Media |
| `laget.slug` | `"MinKlubb"` | Lagets adress: www.laget.se/**MinKlubb** |
| `appUrl` | `"https://app.minklubb.se"` | Länkar i mejl |
| `fileSlug` | `"minklubb"` | Början på filnamn vid nedladdning |

Lägg till profilen i `CLUB_PROFILES` i `shared/club.ts`. Loggorna läggs i
`client/public/images/…` – eller laddas upp i appen efteråt (se steg 4), då
behövs inga filer i koden.

## 2. Miljövariabler

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `DATABASE_URL` | ja | MySQL 8, t.ex. `mysql://user:pass@host:3306/minklubb` |
| `DATABASE_SSL` / `DATABASE_SSL_CA` | nej | `off` för lokal databas utan TLS |
| `JWT_SECRET` | ja | Lång slumpad sträng (sessioner) |
| `ADMIN_PASSWORD` | ja | Styrelsens lösenord |
| `CLUB_PROFILE` | nej | Profilens id (standard `stalstadens`) |
| `APP_URL` | nej | Appens adress (annars profilens `appUrl`) |
| `LAGET_SE_USERNAME` / `LAGET_SE_PASSWORD` | för laget.se | Ett konto med admin för laget på laget.se (helst ett gemensamt styrelsekonto) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` | för notiser | Utgående e-post |
| `TZ` | – | Sätts till `Europe/Stockholm` i Dockerfile |
| `PORT` | nej | Standard 3000 |

## 3. Driftsättning (Coolify)

1. Ny MySQL 8-databas (egen per förening) och en backup-plan.
2. Ny applikation från repot, byggs med `Dockerfile`, gren `production`.
3. Miljövariablerna ovan.
4. Domän, t.ex. `app.minklubb.se`.

Databasen skapas och uppgraderas automatiskt vid start (`scripts/migrate.mjs`).

## 4. I appen

Logga in som styrelse (`ADMIN_PASSWORD`) och gå till **Inställningar**:

- **Klubb** – namn, kortnamn, lagens namn/färger, hashtags, laget.se-adress.
  Ladda upp loggor (klubb, båda lagen, kortens märke). Tomma fält = profilens värde.
- **Perioder** – säsong, slutspel och försäsong.
- **laget.se** – automatisk nyhet m.m.
- **Notiser** – mottagare för e-post.
- **Spelare** – importera truppen (fil) eller lägg till spelare.

Matcher mot andra lag är beta och slås på under **Klubb**.

## 5. Kontroll

- `pnpm test` – inklusive kontrollbilderna (`test/golden`) och flödestestet.
- Öppna appen: startsidans rubrik, flikarna och en matchrapport ska visa klubbens namn och loggor.
- Tryck **Anmälda** i Lineup – nästa träning och platsen ska hämtas från laget.se.
