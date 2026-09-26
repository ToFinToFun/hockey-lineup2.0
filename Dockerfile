# ── Bygg ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Produktionsberoenden (utan dev-verktyg) ─────────────────────────────────
FROM node:22-slim AS prod-deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── Körbar image ────────────────────────────────────────────────────────────
FROM node:22-slim AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json start.sh ./
COPY scripts/migrate.mjs scripts/dataMigrations.mjs ./scripts/
RUN chmod +x start.sh

# Kör inte som root.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 3000
CMD ["./start.sh"]
