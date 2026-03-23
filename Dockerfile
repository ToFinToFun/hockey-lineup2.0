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

# Production image
FROM node:22-slim AS production
WORKDIR /app

# Copy built artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/start.sh ./

# Install only production dependencies + drizzle-kit for migrations
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY --from=deps /app/patches ./patches
RUN pnpm install --frozen-lockfile --prod
RUN pnpm add drizzle-kit

# Make startup script executable
RUN chmod +x start.sh

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Port is configurable via PORT env var (default 3000)
EXPOSE 3000
ENV NODE_ENV=production

# Start with migration then server
CMD ["./start.sh"]
