# syntax=docker/dockerfile:1.7
#
# Eleanor API image. Railway builds this automatically because it sits at the
# repository root. Locally:  docker build -t eleanor-api . && docker run --env-file api/.env -p 3000:3000 eleanor-api
#
# The repo is an npm workspace (client + api) with one root lockfile, so the
# image installs only the @eleanor/api workspace from that lockfile. The
# client's package.json is copied solely so npm can validate the lockfile.

ARG NODE_VERSION=26

# ── 1. dependencies (dev included, for the TypeScript build) ────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY client/package.json client/package.json
RUN npm ci --workspace @eleanor/api --no-audit --no-fund

# ── 2. compile ──────────────────────────────────────────────────────────────
FROM deps AS build
COPY api/tsconfig.json api/tsconfig.json
COPY api/src api/src
RUN npm run build --workspace @eleanor/api

# ── 3. runtime (production dependencies only) ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY client/package.json client/package.json
RUN npm ci --workspace @eleanor/api --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /repo/api/dist api/dist
COPY api/migrations api/migrations

WORKDIR /repo/api
USER node
EXPOSE 3000

# Railway: set the pre-deploy command to  node dist/core/migrate.js
CMD ["node", "dist/server.js"]
