#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# QuantChat Azure VM Deployment Script
# Deploys the latest Nexus monorepo API Gateway to production
# Server: 20.249.208.224 (Ubuntu 24.04, Docker 29.4.2)
# ═══════════════════════════════════════════════════════════════

set -e

# --- Configuration ---
REMOTE_USER="kundan1792008"
REMOTE_HOST="20.249.208.224"
REMOTE_DIR="/home/${REMOTE_USER}/infinity-trinity/QuantChat"
CONTAINER_NAME="quant-api-gateway"
IMAGE_NAME="quantchat-nexus-api:latest"
APP_PORT=4000

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }
err() { echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; exit 1; }

echo "═══════════════════════════════════════════════════════════"
echo " QuantChat Nexus → Azure VM Deployment"
echo " Target: ${REMOTE_HOST}:${APP_PORT}"
echo "═══════════════════════════════════════════════════════════"

# --- Step 1: Prepare Deployment Package ---
log "Step 1/5: Preparing deployment package..."

# Create a clean deployment staging area
STAGING_DIR="/tmp/quantchat-deploy-$(date +%s)"
mkdir -p "${STAGING_DIR}/Nexus"

# Copy essential Nexus monorepo files (excluding node_modules, .next, etc)
cp -r Nexus/package.json Nexus/package-lock.json Nexus/turbo.json "${STAGING_DIR}/Nexus/"
cp -r Nexus/apps "${STAGING_DIR}/Nexus/"
cp -r Nexus/packages "${STAGING_DIR}/Nexus/"

# Remove node_modules and build artifacts from staging
find "${STAGING_DIR}" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find "${STAGING_DIR}" -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
find "${STAGING_DIR}" -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find "${STAGING_DIR}" -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true

# Copy the deployment Dockerfile
cp Dockerfile.deploy "${STAGING_DIR}/Dockerfile"

log "Staging area prepared at ${STAGING_DIR}"

# --- Step 2: Sync to Server ---
log "Step 2/5: Syncing to Azure VM..."

# Ensure remote directory exists
ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_DIR}"

# Rsync the deployment package
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='*.log' \
  "${STAGING_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

log "Code synced to ${REMOTE_HOST}:${REMOTE_DIR}"

# --- Step 3: Build Docker Image on Server ---
log "Step 3/5: Building Docker image on server..."

ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} << 'REMOTE_BUILD'
cd ~/infinity-trinity/QuantChat
echo "Building Docker image..."
docker build -t quantchat-nexus-api:latest -f Dockerfile . 2>&1
echo "BUILD_COMPLETE"
REMOTE_BUILD

log "Docker image built successfully"

# --- Step 4: Stop Old Container & Start New ---
log "Step 4/5: Replacing container..."

ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} << 'REMOTE_DEPLOY'
# Stop and remove old container
echo "Stopping old container..."
docker stop quant-api-gateway 2>/dev/null || true
docker rm quant-api-gateway 2>/dev/null || true

# Get the network name
NETWORK=$(docker network ls --format '{{.Name}}' | grep -i trinity | head -1)
if [ -z "$NETWORK" ]; then
  NETWORK="infinity-trinity_infinity-trinity"
  echo "Using default network: ${NETWORK}"
fi

# Start new container
echo "Starting new container..."
docker run -d \
  --name quant-api-gateway \
  --network "${NETWORK}" \
  --restart unless-stopped \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL="postgresql://infinity:infinity_secure_2024@quant-postgres:5432/infinity_trinity" \
  -e REDIS_URL="redis://:redis_secure_2024@quant-redis:6379" \
  -e JWT_SECRET="infinity-trinity-jwt-secret-2026" \
  -e CORS_ORIGINS="http://localhost:3000,http://20.249.208.224:3000,http://20.249.208.224:4000" \
  -e LOG_LEVEL=info \
  quantchat-nexus-api:latest

echo "DEPLOY_COMPLETE"
REMOTE_DEPLOY

log "New container deployed"

# --- Step 5: Health Check ---
log "Step 5/5: Running health checks..."

sleep 10

ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} << 'REMOTE_HEALTH'
echo "=== Container Status ==="
docker ps --filter name=quant-api-gateway --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Health Check ==="
curl -s http://localhost:4000/health 2>/dev/null || echo "Health endpoint not ready yet"

echo ""
echo "=== Last 15 Log Lines ==="
docker logs quant-api-gateway --tail 15 2>&1
REMOTE_HEALTH

# Cleanup
rm -rf "${STAGING_DIR}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " ✅ DEPLOYMENT COMPLETE!"
echo " API Gateway: http://20.249.208.224:4000"
echo " Health Check: http://20.249.208.224:4000/health"
echo "═══════════════════════════════════════════════════════════"
