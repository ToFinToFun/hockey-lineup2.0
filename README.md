# Stålstadens Lineup

Formations-verktyg för Stålstadens Ishockey. Drag-and-drop-gränssnitt för att bygga laguppställningar med realtidssynkronisering, laget.se-integration och matchstatistik.

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
pnpm db:push

# Starta utvecklingsservern
pnpm dev
# → http://localhost:3000
```

---

## Miljövariabler

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `DATABASE_URL` | Ja | MySQL connection string, t.ex. `mysql://user:pass@host:3306/lineup` |
| `JWT_SECRET` | Ja | Session-signeringsnyckel. Generera med `openssl rand -hex 32` |
| `NODE_ENV` | Ja | `production` i Coolify, `development` lokalt |
| `PORT` | Nej | Server-port (default: 3000) |

Laget.se-uppgifter konfigureras via appens inställningar (kugghjulet) och lagras krypterat i databasen. De behöver inte sättas som miljövariabler.

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
| `lineup_state` | Aktuell uppställning (spelare, lag, konfiguration) |
| `lineup_operations` | Ändringslogg för SSE-synkronisering |
| `saved_lineups` | Sparade uppställningar |
| `match_results` | Matchresultat och statistik |
| `app_config` | Appkonfiguration |
| `app_secrets` | Krypterade inloggningsuppgifter (laget.se) |
| `users` | Användarkonton |

Migrering sköts av Drizzle ORM. Vid varje deploy körs `drizzle-kit migrate` automatiskt (idempotent — säkert att köra flera gånger).

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
  crypto.ts          ← Kryptering av credentials
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
| `pnpm db:push` | Generera och kör databasmigrering |
