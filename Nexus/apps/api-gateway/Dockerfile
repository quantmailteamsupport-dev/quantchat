# apps/api-gateway/Dockerfile
# Multi-stage Dockerfile optimized for Turborepo & Node.js Express Server
FROM node:20-alpine AS base

# 1. Prune the monorepo to extract only what is needed for api-gateway
FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
RUN npx turbo prune @repo/api-gateway --docker

# 2. Add lockfile and install dependencies
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the pruned lockfile
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Prisma requires generating the client in the build step heavily
RUN npx turbo run build --filter=@repo/api-gateway...

# 3. Final Production Runner Image
FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 expressgroup
RUN adduser --system --uid 1001 expressuser

# Copy over the built dist folder and pruned node_modules
# Prisma engine binary needs to be copied over safely
COPY --from=installer --chown=expressuser:expressgroup /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=installer --chown=expressuser:expressgroup /app/apps/api-gateway/package.json ./apps/api-gateway/package.json
COPY --from=installer --chown=expressuser:expressgroup /app/node_modules ./node_modules
COPY --from=installer --chown=expressuser:expressgroup /app/packages/database ./packages/database
COPY --from=installer --chown=expressuser:expressgroup /app/packages/database ./node_modules/@repo/database

USER expressuser

# Bind port
ENV PORT=4000
EXPOSE 4000

# Start the Gateway
CMD ["node", "apps/api-gateway/dist/index.js"]
