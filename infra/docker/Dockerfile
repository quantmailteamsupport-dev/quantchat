# QuantChat - Nexus Monorepo API Gateway Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY Nexus/ ./Nexus/
WORKDIR /app/Nexus

RUN npm ci --ignore-scripts || npm install --ignore-scripts
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/Nexus ./

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:3000/health || exit 1

CMD ["npm", "--workspace", "@repo/api-gateway", "start"]
