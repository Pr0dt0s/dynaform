# syntax=docker/dockerfile:1
#
# Single service: Next.js standalone server + embedded SQLite (no separate DB container).
# SQLite access is node:sqlite (built into Node 22+), not a native npm dependency, so
# there's no compiled binding to keep ABI-compatible across stages and no C++ toolchain
# needed here — that's the whole reason this replaced better-sqlite3.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
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
