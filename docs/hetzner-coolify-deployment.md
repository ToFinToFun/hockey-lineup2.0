# Stålstadens Lineup — Hetzner/Coolify Deployment Guide

## Översikt

Denna guide beskriver hur du flyttar appen från Manus-plattformen till en Hetzner VPS med Coolify som deployment-plattform. Appen är en Node.js/Express-server med React-frontend, MySQL-databas och SSE-baserad realtidssynk.

---

## Arkitektur på Hetzner

```
┌──────────────────────────────────────────────┐
│  Hetzner VPS (CX22 eller liknande)           │
│                                              │
│  ┌──────────────┐   ┌────────────────────┐   │
│  │   Coolify     │   │   MySQL 8.0        │   │
│  │  (Docker)     │   │   (Docker/native)  │   │
│  │              │   │                    │   │
│  │  ┌────────┐  │   │                    │   │
│  │  │  App   │  │◄──┤                    │   │
│  │  │ :3000  │  │   │                    │   │
│  │  └────────┘  │   └────────────────────┘   │
│  │              │                            │
│  │  Traefik     │  ← HTTPS/SSL automatiskt   │
│  │  (reverse    │                            │
│  │   proxy)     │                            │
│  └──────────────┘                            │
└──────────────────────────────────────────────┘
```

---

## Steg 1: Förbered Hetzner VPS

**Rekommenderad server:** Hetzner CX22 (2 vCPU, 4 GB RAM, 40 GB disk) — ca 4 EUR/mån. Mer än tillräckligt för denna app.

1. Skapa en VPS i Hetzner Cloud Console med Ubuntu 22.04
2. Peka din domän (t.ex. `lineup.stalstaden.se`) mot serverns IP via DNS A-record
3. SSH in och installera Coolify:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

4. Öppna Coolify-webgränssnittet (port 8000) och slutför initial setup

---

## Steg 2: Skapa MySQL-databas i Coolify

1. I Coolify: **Resources → New → Database → MySQL**
2. Notera connection-strängen som Coolify genererar
3. Formatet blir: `mysql://user:password@host:port/database`

**Alternativ:** Om du planerar att slå ihop med en annan sida som redan har en MySQL-databas, kan du använda den befintliga databasen istället. Skapa bara de nya tabellerna (se Steg 5).

---

## Steg 3: Skapa Dockerfile

Appen behöver en Dockerfile. Skapa denna i projektets rot:

```dockerfile
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM deps AS build
COPY . .
RUN pnpm build

# Production
FROM base AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle.config.ts ./

# Drizzle CLI needs these at runtime for migrations
RUN pnpm install drizzle-kit --prod=false 2>/dev/null || true

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
```

---

## Steg 4: Konfigurera appen i Coolify

1. **Resources → New → Application**
2. Välj **GitHub** som källa (eller ladda upp via Git)
3. Ställ in:
   - **Build Pack:** Dockerfile
   - **Port:** 3000
   - **Domain:** `lineup.stalstaden.se` (eller din domän)

### Miljövariabler (Environment Variables)

Dessa **måste** sättas i Coolify:

| Variabel | Värde | Beskrivning |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@db:3306/lineup` | MySQL connection string (från Steg 2) |
| `JWT_SECRET` | (generera med `openssl rand -hex 32`) | Session cookie signing |
| `NODE_ENV` | `production` | Produktionsläge |
| `PORT` | `3000` | Server-port |
| `LAGET_SE_USERNAME` | (ditt laget.se-användarnamn) | För laget.se-integration |
| `LAGET_SE_PASSWORD` | (ditt laget.se-lösenord) | För laget.se-integration |

### Variabler som INTE behövs på Hetzner

Dessa är Manus-plattformsspecifika och används inte av appen:

| Variabel | Anledning |
|---|---|
| `BUILT_IN_FORGE_API_KEY` | Manus AI/Storage-proxy — appen använder inte LLM/bildgenerering/S3 |
| `BUILT_IN_FORGE_API_URL` | Samma som ovan |
| `OAUTH_SERVER_URL` | Manus OAuth — appen har ingen inloggning |
| `VITE_OAUTH_PORTAL_URL` | Manus OAuth frontend |
| `VITE_APP_ID` | Manus app-ID |
| `OWNER_OPEN_ID` | Manus ägar-ID |
| `OWNER_NAME` | Manus ägarnamn |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus frontend-proxy |
| `VITE_FRONTEND_FORGE_API_URL` | Manus frontend-proxy |
| `VITE_ANALYTICS_ENDPOINT` | Manus analytics |
| `VITE_ANALYTICS_WEBSITE_ID` | Manus analytics |

---

## Steg 5: Kör databasmigrering

Efter första deploy, kör Drizzle-migrering för att skapa tabellerna:

```bash
# Via Coolify terminal eller SSH
cd /app
DATABASE_URL="mysql://user:pass@db:3306/lineup" npx drizzle-kit generate
DATABASE_URL="mysql://user:pass@db:3306/lineup" npx drizzle-kit migrate
```

**Alternativt:** Kör SQL manuellt mot databasen:

```sql
CREATE TABLE IF NOT EXISTS lineup_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  players JSON NOT NULL,
  lineup JSON NOT NULL,
  teamAName VARCHAR(100) NOT NULL DEFAULT 'VITA',
  teamBName VARCHAR(100) NOT NULL DEFAULT 'GRÖNA',
  teamAConfig JSON,
  teamBConfig JSON,
  deletedPlayerIds JSON,
  version BIGINT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS lineup_operations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seq BIGINT NOT NULL,
  opType VARCHAR(50) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  payload JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_lineups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shareId VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  teamAName VARCHAR(100) NOT NULL,
  teamBName VARCHAR(100) NOT NULL,
  lineup JSON NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  savedAt BIGINT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Users table (behövs om du vill ha auth senare)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

---

## Steg 6: Migrera Firebase-data

Kör migrationsskriptet för att flytta befintlig data:

```bash
# Installera mysql2 om det inte finns
npm install mysql2

# Dry run först (förhandsgranska utan att skriva)
DATABASE_URL="mysql://user:pass@db:3306/lineup" \
FIREBASE_DB_URL="https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app" \
DRY_RUN=1 \
node scripts/migrate-firebase-to-sql.mjs

# Kör på riktigt
DATABASE_URL="mysql://user:pass@db:3306/lineup" \
FIREBASE_DB_URL="https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app" \
node scripts/migrate-firebase-to-sql.mjs
```

---

## Steg 7: Verifiera

1. Öppna appen i webbläsaren — alla spelare ska visas
2. Dra en spelare till en slot — den ska sparas
3. Öppna i en andra flik — ändringar ska synas i realtid (SSE)
4. Testa "Sparade uppställningar" — alla migrerade uppställningar ska finnas
5. Testa laget.se-integration — anmälningslistan ska hämtas

---

## Vad som behöver ändras i koden

### Måste ändras

1. **Ta bort `vite-plugin-manus-runtime`** från vite.config.ts (Manus-specifik debug-plugin)

```diff
- import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
  ...
- const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
+ const plugins = [react(), tailwindcss(), jsxLocPlugin()];
```

2. **Ta bort `vitePluginManusDebugCollector`** (Manus-specifik logging-plugin) — eller behåll om du vill ha loggning lokalt.

3. **Ta bort `@builder.io/vite-plugin-jsx-loc`** om du inte behöver JSX source location tracking.

### Bör ändras (men fungerar utan)

4. **`server/_core/oauth.ts`** — OAuth-flödet pekar mot Manus. Om du inte behöver inloggning just nu, ignorera detta. När du vill ha auth senare, byt till en annan OAuth-provider (Google, GitHub, etc.).

5. **`server/storage.ts`** — Använder Manus S3-proxy. Appen använder inte filuppladdning just nu, men om du behöver det senare, byt till direkt S3-anslutning (t.ex. via MinIO på Hetzner eller AWS S3).

6. **`client/src/main.tsx`** — Har redirect-till-login vid 401-fel. Eftersom appen inte kräver auth, påverkar detta inte, men kan rensas bort.

### Kan ignoreras

Filerna under `server/_core/` (llm.ts, imageGeneration.ts, voiceTranscription.ts, notification.ts, map.ts, dataApi.ts) är Manus-plattformstjänster som appen **inte använder**. De finns där som boilerplate men anropas aldrig. De kan tas bort för att rensa koden, men de stör inte.

---

## Coolify-specifika inställningar

### SSE och Traefik

Coolify använder Traefik som reverse proxy. SSE kräver att buffring är avstängd. Lägg till i Traefik-konfigurationen (Coolify → App → Advanced → Custom Labels):

```yaml
traefik.http.middlewares.lineup-buffering.buffering.maxResponseBodyBytes: 0
```

Alternativt: appen skickar redan `X-Accel-Buffering: no` i SSE-headern, vilket Traefik respekterar.

### Health Check

Lägg till en health check-endpoint om Coolify kräver det:

```
GET /api/trpc/lineup.getState → 200 OK
```

---

## Framtida sammanslagning med annan sida

När du vill slå ihop med en annan sida:

1. **Databas:** Om den andra sidan redan har en MySQL-databas, skapa lineup-tabellerna i samma databas. Uppdatera `DATABASE_URL` att peka dit.

2. **Server:** Om den andra sidan har en egen Express/Node-server, kan du:
   - Importera lineup-routrarna som en sub-router
   - Eller köra lineup-appen som en separat tjänst bakom samma reverse proxy

3. **Auth:** Om den andra sidan har auth, kan du koppla lineup-appen till samma auth-system genom att uppdatera `server/_core/oauth.ts` och `protectedProcedure`.

4. **Tabellnamn:** Alla lineup-tabeller har prefixet `lineup_` eller `saved_lineups` — de kolliderar inte med vanliga tabellnamn.

---

## Sammanfattning av miljövariabler

| Variabel | Krävs | Källa |
|---|---|---|
| `DATABASE_URL` | Ja | Coolify MySQL-tjänst |
| `JWT_SECRET` | Ja | Generera: `openssl rand -hex 32` |
| `NODE_ENV` | Ja | `production` |
| `PORT` | Nej (default 3000) | Coolify sätter ofta denna |
| `LAGET_SE_USERNAME` | Ja (för laget.se) | Ditt konto |
| `LAGET_SE_PASSWORD` | Ja (för laget.se) | Ditt konto |
