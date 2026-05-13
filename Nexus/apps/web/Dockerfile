# apps/web/Dockerfile
FROM node:22-alpine AS base

FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
RUN npx turbo prune web --docker

FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Build-time public env vars (baked into Next.js bundle)
ARG NEXT_PUBLIC_QUANTCHAT_API_URL=""
ARG NEXT_PUBLIC_WS_URL=""
ENV NEXT_PUBLIC_QUANTCHAT_API_URL=$NEXT_PUBLIC_QUANTCHAT_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PHASE=phase-production-build

RUN npx turbo run build --filter=web...

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
