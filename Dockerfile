# Sanctum Runtime API — single-stage Docker image
#
# Build:
#   docker build -t sanctum/runtime .
#
# Run (local dev):
#   docker run -p 3001:3001 --env-file .env sanctum/runtime
#
# Run (production with Supabase):
#   docker run -p 3001:3001 \
#     -e SUPABASE_URL=... \
#     -e SUPABASE_SERVICE_ROLE_KEY=... \
#     -e SUPABASE_ANON_KEY=... \
#     -e SANCTUM_API_KEY=... \
#     -e SANCTUM_API_KEY_PEPPER=... \
#     sanctum/runtime
#
# The API listens on HOST:PORT (defaults: 0.0.0.0:3001).
# Set PORT/HOST in environment to override.

FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/runtime-engine/package.json ./packages/runtime-engine/
COPY packages/policy-engine/package.json ./packages/policy-engine/
COPY services/risk-model/package.json ./services/risk-model/ 2>/dev/null || true

# Install all deps (including devDeps for build)
RUN npm ci --ignore-scripts

# Copy source
COPY apps/api ./apps/api
COPY packages/sdk ./packages/sdk
COPY packages/runtime-engine ./packages/runtime-engine
COPY packages/policy-engine ./packages/policy-engine
COPY services ./services
COPY scripts ./scripts

# Build the packages the API depends on
RUN npm run build -w @sanctum-runtime/sdk 2>/dev/null || true
RUN npm run build -w @sanctum/runtime-engine 2>/dev/null || true
RUN npm run build -w @sanctum/policy-engine 2>/dev/null || true

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# Copy only what the API needs at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/sdk ./packages/sdk
COPY --from=builder /app/packages/runtime-engine ./packages/runtime-engine
COPY --from=builder /app/packages/policy-engine ./packages/policy-engine
COPY --from=builder /app/services ./services
COPY --from=builder /app/scripts ./scripts
COPY package.json turbo.json tsconfig.json ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "--experimental-vm-modules", "apps/api/src/index.js"]
