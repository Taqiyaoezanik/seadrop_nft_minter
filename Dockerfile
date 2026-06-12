# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY abis ./abis

RUN npm run build

# Production stage
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S botgroup && \
    adduser -u 1001 -S botuser -G botgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/abis ./abis

RUN mkdir -p /app/data /app/logs && \
    chown -R botuser:botgroup /app

USER botuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('fs').statSync('/app/data/bot.db')" || exit 1

CMD ["node", "dist/index.js"]
