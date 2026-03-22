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
COPY --from=build /app/scripts ./scripts

# Install only production dependencies
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY --from=deps /app/patches ./patches
RUN pnpm install --frozen-lockfile --prod

# mysql2 is needed at runtime
# drizzle-kit is needed for migrations (optional at runtime)

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
