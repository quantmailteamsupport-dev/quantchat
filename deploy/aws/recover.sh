#!/bin/bash
# QuantChat recovery script — for the docker-compose deploy.
# Run on the EC2 host: bash recover.sh
set -eu

cd /opt/quantchat

echo "==> docker compose ps"
docker compose ps

echo "==> Health check"
if curl -fsS http://localhost:3000/healthz; then
  echo "API gateway healthy"
else
  echo "API gateway unhealthy — printing last 100 lines of logs"
  docker compose logs --tail 100 api-gateway
fi

echo "==> Restarting stack"
docker compose down
docker compose pull
docker compose up -d

sleep 5
echo "==> Post-restart health"
docker compose ps
curl -fsS http://localhost:3000/healthz && echo "" && echo "API gateway healthy"
