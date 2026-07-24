# Production image for the Echo web frontend.
#
# Multi-stage: build the Expo static web export with Node, then serve the
# resulting static site from nginx. Build context is the repo root:
#
#   docker build -f web/Dockerfile -t echo-frontend \
#     --build-arg EXPO_PUBLIC_SUPABASE_URL=... \
#     --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=... .
#
# EXPO_PUBLIC_* values are baked into the client bundle at build time (they
# are public by design — the anon key is RLS-protected). Pass them as build
# args so nothing secret is committed. docker-compose wires these from .env.

# ── Build stage ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# EXPO_PUBLIC_* must be present during `expo export` to be inlined.
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_SENTRY_DSN
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# App sources (node_modules/ios/android/dist excluded via .dockerignore).
COPY . .

# Produce the static web export at dist/web (app.json web.output = "static").
RUN npx expo export --platform web --output-dir dist/web

# ── Runtime stage ───────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# SPA-aware config (route .html fallbacks + long-cache hashed assets).
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
