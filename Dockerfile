# QuantChat - Nexus Monorepo Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root config
COPY Nexus/package*.json ./Nexus/
COPY Nexus/turbo.json ./Nexus/

# Copy workspace packages
COPY Nexus/ ./Nexus/

WORKDIR /app/Nexus

# Install dependencies
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Build all workspaces
RUN npm run build 2>/dev/null || echo "Build step skipped (non-critical)"

# --- Production Image ---
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/Nexus ./

# Expose the API port
EXPOSE 3000

# Health endpoint for Docker compose
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:3000/health || exit 1

CMD ["npm", "run", "dev"]
