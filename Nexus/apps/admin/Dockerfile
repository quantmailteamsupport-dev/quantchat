# apps/admin/Dockerfile
# Multi-stage Dockerfile optimized for Turborepo and Next.js admin app
FROM node:22-alpine AS base

FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
RUN npx turbo prune admin --docker

FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN npx turbo run build --filter=admin...

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 adminjs
RUN adduser --system --uid 1001 adminnext
USER adminnext

COPY --from=installer /app/apps/admin/next.config.ts .
COPY --from=installer /app/apps/admin/package.json .
COPY --from=installer --chown=adminnext:adminjs /app/apps/admin/.next/standalone ./
COPY --from=installer --chown=adminnext:adminjs /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=installer --chown=adminnext:adminjs /app/apps/admin/public ./apps/admin/public

EXPOSE 3000

CMD ["node", "apps/admin/server.js"]
