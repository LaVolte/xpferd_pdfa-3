FROM node:24-alpine AS base
RUN apk add --no-cache python3 make g++
RUN corepack enable
WORKDIR /app

ARG VERSION=dev
ENV VERSION=${VERSION}

# Install all dependencies (including devDeps for build)
COPY package.json pnpm-lock.yaml pnpm.json .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build client and server
RUN node build-client.js
RUN npx tsc -p tsconfig.server.json

# Prune to production deps (native addons already compiled)
RUN CI=true pnpm prune --prod

# Production stage
FROM node:24-alpine AS production
# tini: init process  font-liberation: embedded fonts required for PDF/A-3b compliance
RUN apk add --no-cache tini font-liberation
WORKDIR /app

COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

ENV ENCRYPTION_KEY=""

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/index.js"]
