# Stålstadens App

Webbapp för Stålstadens SF på https://app.stalstadens.se: score tracker, laguppställningar med realtidssynk och laget.se-integration, matchhistorik, statistik, hockeykort och istidskalkylator.

---

## Teknikstack

| Lager | Teknik |
|---|---|
| Frontend | React 19, Tailwind CSS 4, dnd-kit, Framer Motion |
| Backend | Express 4, tRPC 11, SSE (Server-Sent Events) |
| Databas | MySQL 8 (via Drizzle ORM) |
| Hosting | Coolify på Hetzner VPS |
| Deploy | GitHub → Coolify (auto-deploy från `production`-branchen) |

---

## Funktioner

Appen hanterar laguppställningar för ishockeyträningar och matcher. Alla spelare kan dras mellan truppen och lagplatserna (Vita/Gröna). Ändringar synkroniseras i realtid mellan alla anslutna webbläsare via SSE.

Laget.se-integrationen hämtar anmälningsdata automatiskt och markerar vilka spelare som anmält sig. Inloggningsuppgifter konfigureras via kugghjulet i appen och lagras krypterat i databasen.

Sparade uppställningar, matchresultat och spelarkonfiguration lagras i en enda MySQL-databas.

---

## Lokal utveckling

```bash
# Klona repot
git clone <repo-url>
cd hockey-lineup

# Installera dependencies
pnpm install

# Skapa .env med databasanslutning
# DATABASE_URL=mysql://user:pass@localhost:3306/lineup
# JWT_SECRET=<generera med: openssl rand -hex 32>

# Kör databasmigrering
pnpm db:migrate

# Starta utvecklingsservern
pnpm dev
# → http://localhost:3000
```

---

## Miljövariabler

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `DATABASE_URL` | Ja | MySQL connection string, t.ex. `mysql://user:pass@host:3306/lineup` |
| `JWT_SECRET` | Ja | Signerar sessioner och länkar. Minst 32 tecken, generera med `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Ja | Styrelsens lösenord för inloggning i appen |
| `DATABASE_SSL` | Nej | `auto` (standard): krypterat om databasen kräver det. `on`/`off` tvingar |
| `DATABASE_SSL_CA` | Nej | Sökväg till CA-certifikat om certifikatet ska kontrolleras |
| `LAGET_SE_USERNAME` | Ja* | Laget.se-konto för anmälningssynk (*krävs för laget.se-funktionen) |
| `LAGET_SE_PASSWORD` | Ja* | Lösenord till laget.se-kontot |
| `NODE_ENV` | Ja | `production` i Coolify, `development` lokalt |
| `PORT` | Nej | Server-port (default: 3000) |

Appen startar inte i produktion om `JWT_SECRET`, `ADMIN_PASSWORD` eller `DATABASE_URL` saknas.

## Behörighet

| Roll | Hur | Får göra |
|---|---|---|
| Alla | Ingen inloggning | Score tracker: registrera mål, spara match, se uppställningen |
| Tillfällig länk | Styrelsen skapar länk på startsidan, giltig 24 h | Bygga uppställningar, synka laget.se |
| Styrelsen | `ADMIN_PASSWORD`, inloggad 30 dagar per enhet | Allt, inkl. statistik, historik, inställningar, radering |

"Återkalla alla" på startsidan gör alla utskickade länkar ogiltiga direkt. Behörigheten kontrolleras på servern (`server/_core/trpc.ts`).

---

## Deploy till Coolify

Appen deployas automatiskt via Coolify från `production`-branchen på GitHub.

### Steg-för-steg

1. **Skapa MySQL-databas i Coolify**
   - Resources → New → Database → MySQL 8
   - Notera connection-strängen (format: `mysql://user:pass@host:3306/dbname`)

2. **Skapa applikation i Coolify**
   - Resources → New → Application → GitHub
   - Välj repot och `production`-branchen
   - Build Pack: **Dockerfile**
   - Port: **3000**

3. **Sätt miljövariabler i Coolify**
   - `DATABASE_URL` → connection-strängen från steg 1
   - `JWT_SECRET` → generera med `openssl rand -hex 32`
   - `ADMIN_PASSWORD` → styrelsens lösenord
   - `LAGET_SE_USERNAME` / `LAGET_SE_PASSWORD` → laget.se-kontot
   - `NODE_ENV` → `production`

4. **Deploya** — Coolify bygger Docker-imagen och kör automatiskt databasmigrering vid startup via `start.sh`.

5. **Konfigurera domän** — Sätt din domän i Coolify (t.ex. `lineup.stalstaden.se`). Coolify/Traefik hanterar SSL automatiskt.

### Uppdateringsflöde

Arbeta på `main`-branchen. När du vill deploya, mergea `main` → `production`. Coolify detekterar pushen och bygger om automatiskt.

```bash
git checkout production
git merge main
git push origin production
```

### Versioner

Se `CHANGELOG.md`. Versionen höjs i `package.json` inför varje deploy, commiten taggas `vX.Y.Z`, och versionen visas längst ner i appen.

### Hälsokontroll

`GET /api/health` svarar `{"status":"ok"}`. Dockerfilen använder den som HEALTHCHECK.

### SSE och Traefik

Appen använder Server-Sent Events för realtidssynk. Coolify/Traefik respekterar `X-Accel-Buffering: no`-headern som appen skickar, så SSE fungerar utan extra konfiguration.

Om du upplever problem med SSE, lägg till denna custom label i Coolify (App → Advanced → Custom Labels):

```
traefik.http.middlewares.lineup-buffering.buffering.maxResponseBodyBytes=0
```

---

## Databasschema

| Tabell | Beskrivning |
|---|---|
| `players` | Spelarregistret – en rad per person med fast ID, medlemsflagga och tidigare namn |
| `lineup_state` | Aktuell uppställning (spelare, lag, konfiguration) |
| `lineup_operations` | Ändringslogg för SSE-synkronisering |
| `saved_lineups` | Sparade uppställningar |
| `match_results` | Matchresultat och statistik |
| `app_config` | Appkonfiguration |

Ändra schemat i `drizzle/schema.ts` och kör `pnpm db:generate` för att skapa en ny migrering. Vid varje uppstart kör `start.sh` → `scripts/migrate.mjs`, som applicerar nya migreringar. Misslyckas migreringen startar inte appen och Coolify behåller den tidigare versionen.

---

## Projektstruktur

```
client/src/          ← React-frontend
  pages/Home.tsx     ← Huvudsidan med drag-and-drop
  components/        ← UI-komponenter (PlayerList, TeamPanel, etc.)
  lib/               ← Klientlogik (laget.se-hämtning, spelardata)
server/              ← Express + tRPC backend
  routers.ts         ← tRPC-endpoints
  lineupDb.ts        ← Databasoperationer för uppställningar
  lagetSe.ts         ← Laget.se-integration (scraping)
  sse.ts             ← SSE-hantering för realtidssynk
  auth.ts            ← Styrelseinloggning, sessioner och tillfälliga länkar
drizzle/             ← Databasschema och migrationer
  schema.ts          ← Drizzle-schema
```

---

## Scripts

| Kommando | Beskrivning |
|---|---|
| `pnpm dev` | Starta utvecklingsserver |
| `pnpm build` | Bygg för produktion |
| `pnpm start` | Starta produktionsserver |
| `pnpm check` | TypeScript-typkontroll |
| `pnpm test` | Kör tester (Vitest) |
| `pnpm db:generate` | Skapa migrering från ändrat schema |
| `pnpm db:migrate` | Kör migreringar mot `DATABASE_URL` |
| `pnpm assets:audit` | Kontrollera att alla bilder/ljud finns lokalt |
