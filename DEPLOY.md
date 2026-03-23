# Stålstadens App — Deployment Guide (Coolify on Hetzner)

## Overview

This is a monorepo containing three sub-apps:

| Route | App | Description |
|-------|-----|-------------|
| `/` | Hub | Landing page with links to sub-apps |
| `/lineup` | Lineup | Drag-and-drop team formation tool |
| `/score` | Score Tracker | Live match scoring and statistics |
| `/icetime` | IceTime | Ice time calculator for player distribution |

All apps share the same MySQL database and are served from a single Express server.

## Domain Setup

Configure in Coolify:

- **Domain:** `app.stalstadens.se`
- **Port:** `3000` (or set via `PORT` env var)

## Environment Variables

Set these in Coolify's environment variables section:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/stalstadens` |

### Recommended

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Random string for session signing | `a1b2c3d4e5f6...` |
| `PORT` | Server port (default: 3000) | `3000` |

### Optional (Laget.se integration)

| Variable | Description |
|----------|-------------|
| `LAGET_SE_USERNAME` | Laget.se login email |
| `LAGET_SE_PASSWORD` | Laget.se login password |

### Optional (Manus APIs — only if using LLM/storage)

| Variable | Description |
|----------|-------------|
| `BUILT_IN_FORGE_API_URL` | Manus Forge API base URL |
| `BUILT_IN_FORGE_API_KEY` | Manus Forge API bearer token |
| `OWNER_OPEN_ID` | Owner identifier for admin operations |

## Build & Deploy

### Docker (recommended for Coolify)

The included `Dockerfile` handles everything:

1. Installs dependencies
2. Builds the Vite frontend + esbuild server bundle
3. Creates a slim production image
4. Runs database migrations on startup
5. Starts the Express server

Coolify will auto-detect the Dockerfile and build it.

### Manual Build

```bash
pnpm install
pnpm build
pnpm db:push
node dist/index.js
```

## Health Check

The app exposes `GET /api/health` which returns:

```json
{ "status": "ok", "timestamp": 1711234567890 }
```

Coolify's Docker health check is pre-configured to use this endpoint.

## Database

The app uses MySQL (tested with TiDB). On first startup, `start.sh` will:

1. Create the database if it doesn't exist
2. Run all Drizzle migrations
3. Start the server

Tables are created automatically via migrations in the `drizzle/` directory.

## GitHub Integration

The repo is at `ToFinToFun/hockey-lineup2.0`. Recommended workflow:

1. Push changes to `main` branch
2. When ready to deploy, merge `main` → `production`
3. Coolify watches the `production` branch and auto-deploys
