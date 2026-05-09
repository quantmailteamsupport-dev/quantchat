#!/bin/bash
# Docker Compose Deployment Script
# Usage: ./scripts/deploy-docker.sh

set -e

echo "🚀 QuantChat Docker Deployment"
echo "================================"

# Check for .env.docker file
if [ ! -f ".env.docker" ]; then
  echo "❌ Error: .env.docker file not found"
  echo "Please copy .env.docker and fill in the values"
  exit 1
fi

# Load environment variables
export $(cat .env.docker | grep -v '#' | xargs)

echo "📦 Building Docker image..."
docker-compose build

echo "🔄 Stopping existing containers..."
docker-compose down || true

echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

echo "✅ Running database migrations..."
docker-compose exec -T api-gateway npx prisma migrate deploy

echo "🧪 Health checks..."
docker-compose exec -T api-gateway curl -f http://localhost:3000/healthz || {
  echo "❌ Health check failed"
  docker-compose logs
  exit 1
}

echo ""
echo "✅ Deployment successful!"
echo ""
echo "Services:"
echo "  - API Gateway: http://localhost:3000"
echo "  - Postgres: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "View logs: docker-compose logs -f"
echo "Stop services: docker-compose down"
