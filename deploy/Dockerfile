# syntax=docker/dockerfile:1
#
# Single service: Next.js standalone server + embedded SQLite (no separate DB container).
# All three stages use the same base image/Node version so better-sqlite3's native
# binding (built or downloaded in `deps`) stays ABI-compatible at runtime.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 ships prebuilt binaries for common platforms; these are a fallback in
# case none matches this image's arch/libc and it has to compile from source.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default, and the Next.js standalone server
# binds to $HOSTNAME — without this override it only listens on the container's own IP,
# never 127.0.0.1, which breaks the healthcheck below.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
